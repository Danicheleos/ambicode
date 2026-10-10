import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditRuns, callClass, readsFiles, sessionFacts, stopWrote, summarize, traceFacts } from './layer-audit.mjs';
import { SESSION_DIRECTORY } from './trace-analysis.mjs';

const jsonl = (events) => `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
const call = (message, ...tools) => ({ type: 'assistant', message: { id: message, content: tools.map(([id, name, input]) => ({ type: 'tool_use', id, name, input })) } });
const result = (id, text) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] } });
const trace = (selfHit) => [
  call('m1', ['t1', 'Bash', { command: 'cd repo && grep -rn cart src' }], ['t2', 'Read', { file_path: 'src/a.ts' }]),
  result('t1', selfHit ? '.ambicode/task/x/ledger.jsonl:1' : 'src/a.ts:1'),
  result('t2', 'abcd'),
  call('m2', ['t3', 'Bash', { command: 'sed -n 1,9p src/b.ts' }]),
  result('t3', 'xy'),
  { type: 'result', usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 } },
];
const step = (lead) => `[ambicode] investigate · task t-${lead}\nlayers: shortlist (default)\n${JSON.stringify({ terms: { pass1: ['cart'], pass2: [] }, candidates: [[`src/${lead}.ts`, 8, ['x']]], limitations: [] })}`;
const session = (lead, notices) => [
  { attachment: { type: 'hook_additional_context', hookEvent: 'UserPromptSubmit', content: [step(lead)] } },
  ...Array.from({ length: notices }, () => ({ attachment: { type: 'hook_additional_context', hookEvent: 'PostToolUse', content: ['AMBICODE: 12 tool turns'] } })),
  { attachment: { type: 'hook_success', hookEvent: 'PreToolUse', durationMs: 40 } },
];

describe('layer-audit: which calls read files', () => {
  it('counts a read inside mixed Bash, but not a filter on a pipe', () => {
    const bash = (command) => readsFiles('Bash', { command });
    assert.deepEqual([readsFiles('Read', {}), readsFiles('Grep', {}), bash('rg -n x src && sed -n 1,40p src/a.ts'), bash('rg -n x src | head -20'), bash('cat a.ts | grep y')], [true, false, true, false, true]);
    assert.deepEqual([bash('node "/p/scripts/ambicode.mjs" read src/a.ts src/b.ts'), bash('node "/p/scripts/ambicode.mjs" route next')], [true, false]);
  });
});

describe('layer-audit: what each run got from the layers', () => {
  it('03b-H6: tool turns count a message once; bytes by call class; self-hits; step and notices from the session', () => {
    assert.deepEqual([callClass('Bash', { command: 'cd x && rg y' }), callClass('Bash', { command: 'git ls-files' }), callClass('Grep', {})], ['grep', 'ls', 'Grep']);
    const facts = traceFacts(trace(true));
    assert.deepEqual([facts.toolTurns, facts.bytes, facts.selfHit, facts.tokens.cacheRead], [2, { grep: 31, Read: 4, cat: 2 }, true, 1000]);
    const s = sessionFacts(session('a', 1));
    assert.deepEqual([s.step, s.notices, s.durations], [step('a'), 1, { PreToolUse: [40] }]);
  });

  it('03b-H6: a step that differs within a case is a problem; the summary scores the answers against the map', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'layer-audit-'));
    try {
      const cases = path.join(dir, 'cases');
      const traces = path.join(dir, 'traces');
      mkdirSync(path.join(cases, 'c1'), { recursive: true });
      writeFileSync(path.join(cases, 'c1', 'truth.json'), JSON.stringify({ truth: ['src/a.ts', 'src/b.ts'] }));
      const runs = ['e-1', 'e-2'].map((id, index) => {
        mkdirSync(path.join(traces, SESSION_DIRECTORY, id), { recursive: true });
        writeFileSync(path.join(traces, `${id}.jsonl`), jsonl(trace(index === 0)));
        writeFileSync(path.join(traces, SESSION_DIRECTORY, id, 's.jsonl'), jsonl(session(index === 0 ? 'a' : 'b', index)));
        return { tracePath: `x/${id}/trace.jsonl`, costUsd: 0.2, graders: [{ name: 'names-a-true-file', evidence: '## Files to change\n- `src/a.ts`\n- `src/c.ts`\n' }] };
      });
      const { rows, problems } = auditRuns({ results: { cases: [{ name: 'c1', arms: { with: runs } }] }, tracesDirs: [traces], cases });
      assert.deepEqual(problems, ['01 with: 2 different steps']);
      assert.deepEqual(rows.map((row) => [row.toolTurns, row.selfHit, row.notices, row.leads]), [[2, true, 0, ['src/a.ts']], [2, false, 1, ['src/b.ts']]]);
      const [summary] = summarize(rows, () => ['src/a.ts', 'src/b.ts']);
      assert.deepEqual([summary.case, summary.runs, summary.recall, summary.precision, summary.fromMap], ['01', 2, 0.5, 0.5, 1]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('stopWrote', () => {
  const stop = (stderr) => ({ attachment: { hookEvent: 'Stop', stderr } });
  it('reads the entry count the Stop hook reported, the last report winning', () => {
    assert.equal(stopWrote([stop('ambicode stop: done, 12 ledger entries, output block\n'), stop('ambicode stop: done, 14 ledger entries, output none\n')]), 14);
  });
  it('is null when the hook said nothing about its write', () => {
    assert.equal(stopWrote([stop('')]), null);
    assert.equal(stopWrote([]), null);
  });
});
