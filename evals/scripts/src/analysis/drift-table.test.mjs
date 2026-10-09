import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BAND, driftTable, metricOf, renderDrift } from './drift-table.mjs';
import { analyzeResult, callChain, mechanicsOf } from './run-report.mjs';

const jsonl = (events) => `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
const usage = { input_tokens: 2, cache_read_input_tokens: 100, cache_creation_input_tokens: 50, output_tokens: 5 };
const call = (n, name, input, result, isError = false) => [
  { type: 'assistant', timestamp: `2026-01-01T00:00:0${n}.000Z`, message: { id: `m${n}`, usage, content: [{ type: 'tool_use', id: `t${n}`, name, input }] } },
  { type: 'user', timestamp: `2026-01-01T00:00:0${n}.500Z`, message: { content: [{ type: 'tool_result', tool_use_id: `t${n}`, content: [{ type: 'text', text: result }], is_error: isError }] } },
];
const NOT_FOUND = '== repo/src/ReportHelper.ts:130:260: not found ==\n== repo/src/a.ts: ambiguous: src/a.ts, lib/a.ts ==\n';
const events = [
  { type: 'system', subtype: 'init' },
  // zsh aborts the grep; the tool reports no error
  ...call(1, 'Bash', { command: 'grep -rn cart src --include=*.ts' }, '(eval):1: no matches found: --include=*.ts'),
  // host-capped output
  ...call(2, 'Bash', { command: 'grep -rn cart src | head -5000' }, '<persisted-output>\nOutput too large (46.8KB). Full output saved to: /tmp/x\n</persisted-output>'),
  // the `$N` form the command-text regex does not see; the operands are refused
  ...call(3, 'Bash', { command: 'N=/p/scripts/ambicode.mjs; node "$N" read --task T repo/src/ReportHelper.ts:130:260 repo/src/a.ts' }, NOT_FOUND),
  ...call(4, 'Read', { file_path: '/private/tmp/e-x/home/cwd/repo/src/a.ts' }, 'abc'),
  ...call(5, 'Bash', { command: 'cd repo && sed -n 1,40p src/a.ts && cat src/b.ts' }, 'code'),
  // a pipe's filter and a grep read nothing
  ...call(6, 'Bash', { command: 'grep -rn cart src | head -20' }, 'hits'),
  ...call(7, 'Bash', { command: 'node scripts/ambicode.mjs search x', }, 'out', true),
  { type: 'result', duration_ms: 4000, duration_api_ms: 3000, usage, modelUsage: { 'claude-test': {} } },
];
const receipts = [
  { kind: 'search', command: 'read', names: ['src/a.ts:1-9'], hits: 1, bytes: 120, truncated: 0 },
  { kind: 'search', command: 'read', names: ['src/b.ts:1-9'], hits: 1, bytes: 80, truncated: 0 },
];

describe('mechanicsOf: what the ruler counts in one run', () => {
  const tools = callChain(events).calls.flatMap((c) => c.tools);

  it('counts the zsh failure apart from the tool-reported failures and adds it to failedWithZsh', () => {
    const m = mechanicsOf(tools, receipts);
    assert.equal(m.zshGlob, 1);
    assert.equal(m.failedWithZsh, 2, 'one tool-reported error plus one zsh result that reported none');
  });

  it('counts a persisted output as host-capped', () => assert.equal(mechanicsOf(tools, receipts).hostCapped, 1));

  it('takes the read count from the ledger receipts, which see the `$N` form the command text hides', () => {
    const m = mechanicsOf(tools, receipts);
    assert.equal(m.readsVia.read, 2);
    assert.equal(m.servedBytes, 200);
    assert.deepEqual([m.readsVia.nativeRead, m.readsVia.bash], [1, 1], 'Read once; one Bash call with sed -n and cat; a grep|head and the CLI call are not reads');
    assert.equal(mechanicsOf(tools, null).readsVia.read, null, 'no ledger is unknown, not 0');
    assert.equal(mechanicsOf(tools, null).servedBytes, null);
  });

  it('counts not-found and ambiguous operand lines in read output', () => assert.equal(mechanicsOf(tools, receipts).operandRefusals, 2));

  it('reaches the run row through analyzeResult with the ledgers directory', () => {
    const top = mkdtempSync(path.join(tmpdir(), 'drift-table-'));
    try {
      const traces = path.join(top, 'traces');
      mkdirSync(path.join(top, 'ledgers', 'e-x', 'repo'), { recursive: true });
      mkdirSync(traces);
      writeFileSync(path.join(traces, 'e-x.jsonl'), jsonl(events));
      writeFileSync(path.join(top, 'ledgers', 'e-x', 'repo', 'ledger.jsonl'), jsonl([{ kind: 'route', at: '2026-01-01T00:00:00.000Z' }, ...receipts]));
      const results = { cases: [{ name: 'c', arms: { with: [{ tracePath: '/private/tmp/e-x/out/trace.jsonl', graders: [], turns: 7 }] } }] };
      const [row] = analyzeResult(results, { tracesDirs: [traces], cases: path.join(top, 'cases'), withChains: false, ledgersDir: path.join(top, 'ledgers') });
      assert.deepEqual([row.zshGlob, row.hostCapped, row.operandRefusals, row.servedBytes, row.readsVia.read], [1, 1, 2, 200, 2]);
      assert.equal(row.failedCalls, 1, 'failedCalls keeps its meaning');
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
  });
});

describe('driftTable: spreads and the absolute band', () => {
  const row = (name, run, o) => ({ case: name, arm: 'with', run, id: `e-${name}${run}`, absent: false, outcome: 'completed', recall: 1, precision: 1, f1: 1, agentCostUsd: 0.1, modelCalls: 5, toolCalls: 5, turns: 6, servedBytes: 1000, peakContext: 30000, wallS: 30, zshGlob: 0, hostCapped: 0, operandRefusals: 0, failedCalls: 0, failedWithZsh: 0, readsVia: { read: 1, nativeRead: 0, bash: 0 }, ...o });
  const rows = [
    row('steady', 0, {}), row('steady', 1, { agentCostUsd: 0.109, toolCalls: 5 }), row('steady', 2, { precision: 0.9, wallS: 33 }),
    row('wild', 0, { toolCalls: 4, precision: 1, zshGlob: 1 }), row('wild', 1, { toolCalls: 8, precision: 0.5, servedBytes: 0, zshGlob: 3, readsVia: { read: 0, nativeRead: 2, bash: 1 } }), row('wild', 2, { toolCalls: 6, precision: 0.75, hostCapped: 1 }),
    row('single', 0, {}),
  ];
  const table = driftTable(rows);
  const by = Object.fromEntries(table.cases.map((c) => [c.case, c]));

  it('lists a one-rep case as skipped and keeps the band the plan states', () => {
    assert.deepEqual(table.skipped, [{ case: 'single', arm: 'with', runs: 1 }]);
    assert.deepEqual(BAND, { quality: 0.9, resource: 1.1 });
  });

  it('puts values exactly on the edge in band: quality 0.9x best, resources 1.1x min', () => {
    assert.equal(by.steady.metrics.precision.inBand, true);
    assert.equal(by.steady.metrics.agentCostUsd.inBand, true);
    assert.equal(by.steady.metrics.wallS.inBand, true, '33 is 1.1 x 30');
  });

  it('reports spread per metric and flags the wild case out', () => {
    const w = by.wild.metrics;
    assert.deepEqual([w.toolCalls.min, w.toolCalls.max, w.toolCalls.spread, w.toolCalls.inBand], [4, 8, 1, false]);
    assert.deepEqual([w.precision.spread, w.precision.inBand], [0.5, false]);
    assert.equal(w.servedBytes.spread, null, 'a zero minimum has no ratio');
    assert.equal(w.servedBytes.inBand, false);
    assert.equal(w.recall.inBand, true);
    assert.deepEqual(by.wild.outOfBand, ['precision', 'toolCalls', 'servedBytes']);
  });

  it('carries the mechanics per rep and renders them', () => {
    assert.deepEqual(by.wild.mechanics.map((m) => [m.zshGlob, m.hostCapped]), [[1, 0], [3, 0], [0, 1]]);
    const text = renderDrift(table, 'fixture');
    assert.match(text, /## wild \(with, 3 reps\)/);
    assert.match(text, /\| toolCalls \| 4 \/ 8 \/ 6 \| 4 \| 8 \| 100\.0% \| OUT \|/);
    assert.match(text, /\| 1 \| e-wild1 \| 0\/2\/1 \| 3 \|/);
    assert.match(text, /Skipped \(fewer than 2 reps\): single\/with \(1\)/);
  });

  it('leaves an unmeasured value as n/a, never in band', () => {
    assert.equal(metricOf([1, null], 'resource').inBand, null);
    assert.equal(metricOf([0, 0], 'quality').inBand, true);
  });
});
