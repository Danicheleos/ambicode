import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyzeResult, buildReport, callChain, fileStates, fileTruth, findComparisons, findingsOf, layoutOf, missingByExposure, proposalsOf, readOperands, readRequests, routeChain, toolFiles } from './run-report.mjs';

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

  it('keeps a truth list that holds a root file, and finds that root file in a tool call', () => {
    const truth = ['package.json', 'src/a.ts'];
    assert.deepEqual(fileTruth({ kind: 'localize', truth }), truth, 'a preset truth spans the whole tree');
    assert.deepEqual(fileTruth({ kind: 'localize', truth: ['not a path', 'src/a.ts'] }), []);
    assert.deepEqual(toolFiles({ name: 'Bash', input: { command: 'cd repo && cat package.json src/a.ts' } }, truth, 'src'), ['src/a.ts', 'package.json']);
    assert.deepEqual(toolFiles({ name: 'Bash', input: { command: 'cat apps/web/package.json' } }, truth, 'src'), ['apps/web/package.json'], 'a nested file of the same name is not the root one');
  });

  it('gives every truth file the furthest state the run reached, and the answer decision beside it', () => {
    const truth = ['app/read.ts', 'app/cat.ts', 'app/receipt.ts', 'app/grep-hit.ts', 'app/lead.ts', 'app/failed.ts', 'app/never.ts', 'app/new.ts', 'app/out.ts'];
    const { calls } = callChain([
      assistant('m1', '2026-01-01T00:00:01.000Z', [
        { type: 'tool_use', id: 'a', name: 'Read', input: { file_path: '/tmp/e-x/home/cwd/repo/app/read.ts' } },
        { type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'cd repo && cat app/cat.ts' } },
        { type: 'tool_use', id: 'c', name: 'Bash', input: { command: 'cd repo/app && grep -rln upload .' } },
        { type: 'tool_use', id: 'd', name: 'Read', input: { file_path: '/tmp/e-x/home/cwd/repo/app/failed.ts' } },
        { type: 'tool_use', id: 'e', name: 'Read', input: { file_path: '/tmp/e-x/home/cwd/repo/app/out.ts' } },
      ]),
      toolResult('a', '2026-01-01T00:00:02.000Z', '1\texport const a = 1;'),
      toolResult('b', '2026-01-01T00:00:02.000Z', 'export const b = 2;'),
      toolResult('c', '2026-01-01T00:00:02.000Z', './grep-hit.ts\n./elsewhere.ts'),
      toolResult('d', '2026-01-01T00:00:02.000Z', 'File does not exist.', true),
      toolResult('e', '2026-01-01T00:00:02.000Z', 'export const out = 0;'),
    ]);
    const states = fileStates({ truth, created: ['app/new.ts'], root: 'app', calls, receipts: ['app/receipt.ts:4-9'], leads: ['app/lead.ts'], named: ['app/read.ts', 'app/new.ts'], excluded: ['app/out.ts'] });
    assert.deepEqual(Object.fromEntries(states.map((s) => [s.file, `${s.exposure}/${s.decision}`])), {
      'app/read.ts': 'served/proposed', 'app/cat.ts': 'served/none', 'app/receipt.ts': 'served/none', 'app/grep-hit.ts': 'discovered/none',
      'app/lead.ts': 'discovered/none', 'app/failed.ts': 'discovered/none', 'app/never.ts': 'unseen/none', 'app/new.ts': 'future/proposed', 'app/out.ts': 'served/excluded',
    });
    assert.deepEqual(missingByExposure(states), { existing: 8, missing: 7, future: 1, futureMissing: 0, unknown: 0, unseen: 1, discovered: 3, served: 3, servedExcluded: 1, discoveredExcluded: 0 });
    assert.deepEqual(fileStates({ truth: ['app/a.ts'], root: 'app' }).map((s) => s.exposure), ['unknown'], 'no trace is unknown, not unseen');
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
      { file: '/x/other-model.json', results: result('2026-01-03T12:00:00Z', 'ambicode', ['a', 'b'], 'other') },
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

  it('compares with a previous run only on the cases and kinds both ran', () => {
    const row = (name, kind, recall) => ({ case: name, arm: 'with', run: 0, kind, recall, score: 1, costUsd: 0.1, absent: false });
    const plugin = [row('a', 'localize', 0.5), row('b', 'localize', 0.5)];
    const previous = [{ label: 'walk', rows: [row('a', 'localize', 0.5), row('c', 'task', 0.1), row('b', 'plan', 0.1)] }];
    const findings = findingsOf({ plugin, bare: [], previous, band: 0.1, servedPrompt: 'with', current: { suite: {} }, baselineResults: null });
    assert.ok(!findings.some((f) => ['improvement', 'regression'].includes(f.code)), JSON.stringify(findings.filter((f) => f.code === 'improvement')));
    const lower = [{ label: 'older', rows: [row('a', 'localize', 0.2), row('b', 'localize', 0.9)] }];
    const [found] = findingsOf({ plugin: [row('a', 'localize', 0.5)], bare: [], previous: lower, band: 0.1, servedPrompt: 'with', current: { suite: {} }, baselineResults: null }).filter((f) => f.code === 'improvement');
    assert.match(found.text, /0\.500 against 0\.200 in older on 1 shared case/);
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

  it('raises first-call context over 3,200 tokens as weak, over the 2,500 target as info, and under it not at all', () => {
    const row = (arm, firstContext) => ({ case: 'a', arm, run: 0, kind: 'localize', recall: 0.5, score: 1, costUsd: 0.1, absent: false, traced: true, firstContext });
    const level = (extra) => findingsOf({ plugin: [row('with', 16000 + extra)], bare: [row('without', 16000)], previous: [], band: 0.1, servedPrompt: 'with', current: { suite: {} }, baselineResults: null })
      .filter((f) => f.code.startsWith('context')).map((f) => [f.code, f.level]);
    assert.deepEqual(level(3300), [['context', 'weak']]);
    assert.deepEqual(level(2946), [['context-soft', 'info']]);
    assert.deepEqual(level(2400), []);
  });

  it('raises drift, a trace cost that disagrees, and reader receipts the command text missed', () => {
    const row = (run, recall, extra = {}) => ({ case: 'a', arm: 'with', run, kind: 'localize', recall, f1: recall, score: 1, costUsd: 0.11, agentCostUsd: 0.1, outcome: 'completed', absent: false, traced: true, toolCounts: {}, ...extra });
    const plugin = [row(0, 1), row(1, 0.5, { costMismatch: 0.002 }), row(2, 1, { readerReceipts: { calls: 1, spans: 5, bytes: 17071, truncated: 0 } })];
    const findings = findingsOf({ plugin, bare: [], previous: [], band: 0.1, servedPrompt: 'with', current: { suite: {} }, baselineResults: null });
    const of = (code) => findings.find((f) => f.code === code);
    assert.match(of('unstable-case').evidence[0], /^a: recall 0\.50 < 0\.9× best 1\.00/);
    assert.deepEqual(of('cost-mismatch').evidence, ['a run 1: 0.002000']);
    assert.deepEqual(of('helper-uncounted').evidence, ['a run 2: 1 receipts, 0 by command text'], 'a `node "$N" read` call is in the ledger, not in the command text');
  });

  it('compares per-case cost on agent cost, never on the judge-inclusive harness total', () => {
    const row = (arm, agent, total) => ({ case: 'a', arm, run: 0, kind: 'localize', recall: 0.5, score: 1, costUsd: total, agentCostUsd: agent, absent: false, traced: true });
    const findings = findingsOf({ plugin: [row('with', 0.1, 0.3)], bare: [row('without', 0.1, 0.11)], previous: [], band: 0.1, servedPrompt: 'with', current: { suite: {} }, baselineResults: null });
    assert.ok(!findings.some((f) => f.code === 'cost-case'), 'judging tripled the total, not the agent');
  });

  it('names trace-scored runs, blaming a skipped grader only when the run says it was skipped', () => {
    const row = (name, extra = {}) => ({ case: name, arm: 'with', run: 0, kind: 'localize', recall: 0.5, score: 1, costUsd: 0.1, absent: false, traced: true, ...extra });
    const plugin = [row('a', { answerFromTrace: true, skippedPaidGraders: true }), row('b', { answerFromTrace: true }), row('c')];
    const findings = findingsOf({ plugin, bare: [], previous: [], band: 0.1, servedPrompt: 'with', current: { suite: {} }, baselineResults: null });
    assert.deepEqual(findings.filter((f) => ['grader-skipped', 'answer-from-trace'].includes(f.code)).map((f) => [f.code, f.evidence]), [['grader-skipped', ['a run 0']], ['answer-from-trace', ['b run 0']]]);
  });

  it('gives a trace-scored run the answer and named files the scorer used', () => {
    const top = mkdtempSync(path.join(tmpdir(), 'run-report-'));
    try {
      const caseDir = path.join(top, 'benchmarks', 'SIDE', 'full', 'side-t-1');
      mkdirSync(caseDir, { recursive: true });
      writeFileSync(path.join(caseDir, 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts', 'app/b.ts'] }));
      const traces = path.join(top, 'traces');
      mkdirSync(traces);
      writeFileSync(path.join(traces, 'e-skip.jsonl'), jsonl([...trace.slice(0, -1), { ...trace.at(-1), subtype: 'success', is_error: false, result: '## Files\n- app/a.ts\n' }]));
      const results = { cases: [{ name: 'side-t-1', arms: { with: [{ tracePath: '/private/tmp/e-skip/out/trace.jsonl', graders: [], skippedPaidGraders: true, costUsd: 0.1, turns: 2 }] } }] };
      const [row] = analyzeResult(results, { tracesDirs: [traces], cases: path.join(top, 'benchmarks'), withChains: false });
      assert.deepEqual([row.absent, row.recall, row.answer, row.namedFiles, row.answerFromTrace, row.skippedPaidGraders], [false, 0.5, '## Files\n- app/a.ts\n', ['app/a.ts'], true, true]);
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
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

  it('reads each locked source\'s own traces, so a lock of several sources still measures the bare arm', () => {
    const top = mkdtempSync(path.join(tmpdir(), 'run-report-'));
    try {
      const outputs = path.join(top, 'outputs');
      const run = (id) => ({ score: 1, passed: true, costUsd: 0.2, turns: 2, durationSeconds: 10, startedAt: '2026-01-01T00:00:00.000Z', error: null, tracePath: `/private/tmp/${id}/out/trace.jsonl`, graders: [] });
      const iteration = (name, plugin, cases) => {
        const dir = path.join(outputs, 'core', '2026-01-01', name);
        mkdirSync(path.join(dir, 'results'), { recursive: true });
        mkdirSync(path.join(dir, 'traces'), { recursive: true });
        for (const [, id] of cases) writeFileSync(path.join(dir, 'traces', `${id}.jsonl`), jsonl(trace));
        const results = { startedAt: '2026-01-01T00:00:00.000Z', claudeVersion: '1', costUsd: 0.4, durationSeconds: 20, suite: { modelOverride: 'claude-test', ablation: 'none', plugins: [{ name: plugin }], servedPrompt: plugin === 'naked' ? 'naked' : 'with' }, cases: cases.map(([name, id]) => ({ name, promptMarkdown: 'find it', arms: { with: [run(id)] } })) };
        writeFileSync(path.join(dir, 'results', 'eval.json'), JSON.stringify(results));
        return path.join(dir, 'results', 'eval.json');
      };
      const first = iteration('01_0000_naked', 'naked', [['case-a', 'e-bare1']]);
      const second = iteration('02_0000_naked', 'naked', [['case-b', 'e-bare2']]);
      const current = iteration('03_0000_plugin', 'ambicode', [['case-a', 'e-plug1'], ['case-b', 'e-plug2']]);
      const sha = (file) => `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
      const lockFile = path.join(top, 'baseline.lock.json');
      const means = { recall: null, precision: null, costUsd: 0.2, turns: 2 };
      writeFileSync(lockFile, JSON.stringify({
        version: 2, model: 'claude-test', claudeVersion: '1', arm: 'with',
        sources: [[first, ['case-a']], [second, ['case-b']]].map(([source, cases]) => ({ source, sha256: sha(source), plugin: 'naked', startedAt: '2026-01-01T00:00:00.000Z', skills: [], cases })),
        cases: { 'case-a': { skill: null, prompt: null, truth: null, ...means }, 'case-b': { skill: null, prompt: null, truth: null, ...means } },
      }));
      const { reportDir } = buildReport(current, { lockFile, outputs, reports: path.join(top, 'reports') });
      const json = JSON.parse(readFileSync(path.join(reportDir, 'report.json'), 'utf8'));
      assert.deepEqual(json.bare.map((row) => [row.case, row.traced, row.firstContext]), [['case-a', true, 152], ['case-b', true, 152]]);
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
  });
});
