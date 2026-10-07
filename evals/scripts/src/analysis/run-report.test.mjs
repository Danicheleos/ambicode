import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildReport, callChain, findComparisons, findingsOf, layoutOf, proposalsOf, readOperands, readRequests, routeChain, toolFiles } from './run-report.mjs';

const jsonl = (events) => `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
const usage = (read, write, output) => ({ input_tokens: 2, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: output });
const assistant = (id, at, content, use = usage(100, 50, 5)) => ({ type: 'assistant', timestamp: at, message: { id, usage: use, content } });
const toolResult = (id, at, text, isError = false) => ({ type: 'user', timestamp: at, message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }], is_error: isError }] } });
const trace = [
  { type: 'system', subtype: 'init' },
  assistant('m1', '2026-01-01T00:00:02.000Z', [{ type: 'text', text: 'Looking.' }]),
  assistant('m1', '2026-01-01T00:00:02.100Z', [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/private/tmp/e-abc/home/cwd/repo/src/a.ts' } }], usage(100, 50, 9)),
  toolResult('t1', '2026-01-01T00:00:02.600Z', 'abcd'),
  assistant('m2', '2026-01-01T00:00:03.000Z', [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'cd repo && grep -rn cart src' } }]),
  toolResult('t2', '2026-01-01T00:00:03.500Z', 'denied', true),
  { type: 'result', duration_ms: 4000, duration_api_ms: 3000, usage: usage(200, 100, 14), modelUsage: { 'claude-test': {} } },
];
const ledger = [
  { id: 'r-1', at: '2026-01-01T00:00:01.000Z', kind: 'route', skill: 'investigate' },
  { id: 'r-2', at: '2026-01-01T00:00:01.500Z', kind: 'map', layers: [{ name: 'shortlist', ms: 400, hits: 3 }] },
  { id: 'r-3', at: '2026-01-01T00:00:01.600Z', kind: 'step', step: 'read', actor: 'model', status: 'delivered', bytes: 90 },
  { id: 'r-4', at: '2026-01-01T00:00:05.000Z', kind: 'exit', reason: 'done', complete: true },
];

describe('run-report: the chain of one run', () => {
  it('merges a streamed message into one call, with its tools, results, errors and offsets', () => {
    const { calls, result } = callChain(trace, '2026-01-01T00:00:00.000Z');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].text, ['Looking.']);
    assert.equal(calls[0].usage.output_tokens, 9);
    assert.equal(calls[0].context, 152);
    assert.equal(calls[0].offsetMs, 2000);
    assert.deepEqual([calls[0].tools[0].resultBytes, calls[0].tools[0].ms, calls[1].tools[0].error, calls[1].tools[0].class], [4, 500, true, 'grep']);
    assert.equal(result.duration_ms, 4000);
  });

  it('resolves the files a tool call names against the truth, the sandbox prefix dropped', () => {
    const truth = ['src/a.ts', 'src/b.ts'];
    assert.deepEqual(toolFiles({ name: 'Read', input: { file_path: '/private/tmp/e-abc/home/cwd/repo/src/a.ts' } }, truth, 'src'), ['src/a.ts']);
    assert.deepEqual(toolFiles({ name: 'Bash', input: { command: 'cd repo && sed -n 1,9p src/b.ts' } }, truth, 'src'), ['src/b.ts']);
  });

  it('reads the route from its ledger: signature, offsets, map layers and exit', () => {
    const route = routeChain([{ entries: ledger }]);
    assert.equal(route.signature, 'route > map > read:delivered > exit:done');
    assert.deepEqual(route.steps.map((s) => s.ms), [0, 500, 600, 4000]);
    assert.deepEqual([route.mapLayers[0].ms, route.exit.reason, route.deliveredAt], [400, 'done', ledger[2].at]);
    assert.equal(routeChain(null), null);
  });
});

describe('run-report: comparisons and findings', () => {
  const result = (startedAt, plugin, names, model = 'm') => ({ startedAt, suite: { modelOverride: model, plugins: [{ name: plugin }] }, cases: names.map((name) => ({ name })) });

  it('takes earlier plugin runs covering every case first, and never a naked run as the baseline', () => {
    const current = result('2026-01-05T00:00:00Z', 'ambicode', ['a', 'b']);
    const candidates = [
      { file: '/x/later.json', results: result('2026-01-06T00:00:00Z', 'ambicode', ['a', 'b']) },
      { file: '/x/probe.json', results: result('2026-01-04T00:00:00Z', 'ambicode', ['a']) },
      { file: '/x/full.json', results: result('2026-01-03T00:00:00Z', 'ambicode', ['a', 'b']) },
      { file: '/x/naked-other-model.json', results: result('2026-01-02T12:00:00Z', 'naked', ['a', 'b'], 'other') },
      { file: '/x/naked.json', results: result('2026-01-02T00:00:00Z', 'naked', ['a', 'b']) },
      { file: '/x/unrelated.json', results: result('2026-01-01T00:00:00Z', 'ambicode', ['z']) },
    ];
    const found = findComparisons(current, '/x/current.json', candidates, 2);
    assert.equal(found.baseline, undefined, 'the bare reference is the lock, not the newest naked run');
    assert.deepEqual(found.previous.map((p) => p.file), ['/x/full.json', '/x/probe.json']);
  });

  it('groups reads by the model call that asked for them, and counts bytes spent re-reading', () => {
    const read = (file, resultBytes = 100) => ({ name: 'Read', input: { file_path: `/private/tmp/e-x/home/cwd/repo/${file}` }, resultBytes });
    const grep = { name: 'Grep', input: { path: 'src/a.ts' }, resultBytes: 50 };
    const mixed = { name: 'Bash', input: { command: 'rg -n x src/z.ts && sed -n 1,9p src/c.ts; cat "src/d.ts" | head -5' }, resultBytes: 30 };
    const calls = [{ tools: [read('src/a.ts'), read('src/b.ts')] }, { tools: [grep] }, { tools: [read('src/a.ts', 70)] }, { tools: [mixed] }];
    assert.deepEqual(readOperands(mixed), ['src/c.ts', 'src/d.ts'], 'the grep target beside the reads is not a read');
    assert.deepEqual(readRequests(calls), { readRequests: 3, singleFileReads: 1, readPaths: 5, rereadBytes: 70 });
  });

  it('maps an iteration under outputs to the same path under reports', () => {
    const layout = layoutOf('/r/evals-assets/outputs/core/2026-01-01/01_0000_x/results/eval.json', { outputs: '/r/evals-assets/outputs', reports: '/r/evals-assets/reports' });
    assert.deepEqual([layout.type, layout.label, layout.reportDir], ['core', '01_0000_x', '/r/evals-assets/reports/core/2026-01-01/01_0000_x']);
  });

  it('flags a loss beyond the band, a saturated case, an open route and a map the answer ignored; proposals follow', () => {
    const row = (name, arm, run, recall, extra = {}) => ({ case: name, arm, run, kind: 'localize', recall, score: 1, costUsd: 0.1, absent: false, traced: true, truth: ['a/x.ts'], ...extra });
    const plugin = [
      row('lost', 'with', 0, 0.2, { route: { routes: 1, exit: null, signature: 'route > read:delivered', stopBlocked: 0 }, step: { text: 's', leads: ['a/x.ts'], feature: [] }, mapTrue: ['a/x.ts'], mapTrueMissed: ['a/x.ts'], trueOutsideMap: [] }),
      row('full', 'with', 0, 1, { route: { routes: 1, exit: { reason: 'done' }, signature: 'route > exit:done', stopBlocked: 0 } }),
    ];
    const bare = [row('lost', 'without', 0, 0.8), row('full', 'without', 0, 1)];
    const findings = findingsOf({ plugin, bare, previous: [], band: 0.1, servedPrompt: 'with', current: { suite: {} }, baselineResults: null });
    const codes = findings.map((f) => f.code);
    for (const code of ['quality-loss', 'saturated', 'route-open', 'map-missed']) assert.ok(codes.includes(code), code);
    assert.equal(findings[0].level, 'weak');
    assert.ok(proposalsOf(findings).some((p) => p.code === 'map-missed' && p.count === 1));
  });
});

describe('run-report: the files it writes', () => {
  it('writes report.md, chains.md and report.json for an iteration with its own without arm', () => {
    const top = mkdtempSync(path.join(tmpdir(), 'run-report-'));
    try {
      const outputs = path.join(top, 'outputs');
      const iteration = path.join(outputs, 'core', '2026-01-01', '01_0000_test');
      mkdirSync(path.join(iteration, 'results'), { recursive: true });
      mkdirSync(path.join(iteration, 'traces', 'ledgers', 'e-abc', 'repo'), { recursive: true });
      writeFileSync(path.join(iteration, 'traces', 'e-abc.jsonl'), jsonl(trace));
      writeFileSync(path.join(iteration, 'traces', 'ledgers', 'e-abc', 'repo', 'ledger.jsonl'), jsonl(ledger));
      const run = (id, score) => ({ score, passed: score === 1, costUsd: 0.2, turns: 2, durationSeconds: 10, startedAt: '2026-01-01T00:00:00.000Z', error: null, tracePath: `/private/tmp/${id}/out/trace.jsonl`, graders: [] });
      const results = { startedAt: '2026-01-01T00:00:00.000Z', claudeVersion: '1', costUsd: 0.4, durationSeconds: 20, suite: { modelOverride: 'claude-test', ablation: 'with-without', plugins: [{ name: 'ambicode' }], servedPrompt: 'with' }, cases: [{ name: 'synthetic-case', arms: { with: [run('e-abc', 1)], without: [run('e-none', 0.5)] } }] };
      writeFileSync(path.join(iteration, 'results', 'eval.json'), JSON.stringify(results));
      const { reportDir, findings } = buildReport(iteration, { outputs, reports: path.join(top, 'reports'), benchmarks: path.join(top, 'benchmarks') });
      assert.equal(reportDir, path.join(top, 'reports', 'core', '2026-01-01', '01_0000_test'));
      const report = readFileSync(path.join(reportDir, 'report.md'), 'utf8');
      assert.match(report, /Bare: this run's without arm, 1 runs/);
      assert.match(report, /\| harness score \| 1\.00 \| 0\.50 \| \+0\.50 \|/);
      assert.match(report, /route > map > read:delivered > exit:done/);
      assert.match(readFileSync(path.join(reportDir, 'chains.md'), 'utf8'), /\*\*Bash\*\* \[grep\] .* · \*\*error\*\*/);
      const json = JSON.parse(readFileSync(path.join(reportDir, 'report.json'), 'utf8'));
      assert.equal(json.plugin[0].calls, undefined);
      assert.equal(json.plugin[0].failedCalls, 1);
      assert.ok(findings.some((f) => f.code === 'failed-calls'));
      assert.ok(existsSync(path.join(reportDir, 'chains.md')));
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
  });
});
