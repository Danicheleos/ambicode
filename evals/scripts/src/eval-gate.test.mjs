import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { gate, repetitionMeans } from './eval-gate.mjs';

const MODEL = 'claude-sonnet-5-5';
const ANSWER = { 1: '## Files\n- app/a.ts\n- app/b.ts\n', 0.5: '## Files\n- app/a.ts\n' };

describe('eval-gate', () => {
  let benchmarks;
  let tracesDir;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'eval-gate-'));
    mkdirSync(path.join(benchmarks, 'cases', 'side-t-1'), { recursive: true });
    writeFileSync(path.join(benchmarks, 'cases', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts', 'app/b.ts'] }));
    tracesDir = path.join(benchmarks, 'traces');
    mkdirSync(tracesDir);
  });
  after(() => rmSync(benchmarks, { recursive: true, force: true }));

  let traceId = 0;
  const run = (recall, { cost = 0.2, turns = 8, model = MODEL } = {}) => {
    const id = `e-${traceId++}`;
    writeFileSync(path.join(tracesDir, `${id}.jsonl`), JSON.stringify({ type: 'system', subtype: 'init', model }));
    return { graders: [{ name: 'names-a-true-file', passed: true, evidence: ANSWER[recall] }], costUsd: cost, turns, tracePath: `/tmp/${id}/out/trace.jsonl` };
  };
  const results = (withRuns, withoutRuns, extra = {}) => ({
    partial: false,
    suite: { modelOverride: MODEL },
    aggregates: { meanDelta: 0 },
    cases: [{ name: 'side-t-1', arms: { with: withRuns, without: withoutRuns } }],
    ...extra,
  });
  const failed = (verdict) => verdict.checks.filter((c) => !c.pass).map((c) => c.name);

  it('passes a pinned, repeated run whose plugin arm is no worse', () => {
    const verdict = gate(results([run(1), run(1), run(1)], [run(1), run(0.5), run(1)]), { benchmarks, tracesDir });
    assert.deepEqual(failed(verdict), []);
    assert.equal(verdict.pass, true);
  });

  it('fails a recall loss wider than the run-to-run noise, and forgives one inside it', () => {
    const beyond = gate(results([run(0.5), run(0.5), run(0.5)], [run(1), run(1), run(1)]), { benchmarks, tracesDir });
    assert.deepEqual(failed(beyond), ['localize: recall']);
    const within = gate(results([run(1), run(0.5), run(1)], [run(1), run(1), run(1)]), { benchmarks, tracesDir });
    assert.deepEqual(failed(within), [], 'a 0.5 swing between repetitions covers a 0.167 loss');
  });

  it('fails an unpinned model, a model the traces contradict, and a run with no trace to check', () => {
    const three = () => [run(1), run(1), run(1)];
    assert.deepEqual(failed(gate(results(three(), three(), { suite: {} }), { benchmarks, tracesDir })), ['pinned-model']);
    assert.deepEqual(failed(gate(results([run(1), run(1), run(1, { model: 'claude-opus-5-5' })], three()), { benchmarks, tracesDir })), ['pinned-model']);
    assert.deepEqual(failed(gate(results(three(), three()), { benchmarks, tracesDir: null })), ['pinned-model']);
  });

  it('fails a single run, a partial run, and cost or turns over budget', () => {
    assert.deepEqual(failed(gate(results([run(1)], [run(1)]), { benchmarks, tracesDir })), ['runs-per-case']);
    const three = (opts) => [run(1, opts), run(1, opts), run(1, opts)];
    assert.deepEqual(failed(gate(results(three(), three(), { partial: true }), { benchmarks, tracesDir })), ['complete']);
    assert.deepEqual(failed(gate(results(three({ cost: 0.3 }), three()), { benchmarks, tracesDir })), ['localize: cost']);
    assert.deepEqual(failed(gate(results(three({ turns: 11 }), three()), { benchmarks, tracesDir })), ['localize: turns']);
  });

  it('fails an arm whose runs mostly produced nothing to score, and a negative meanDelta beyond the noise', () => {
    const absent = { graders: [], costUsd: 0.2, turns: 8 };
    assert.ok(failed(gate(results([run(1), absent, absent], [run(1), run(1), run(1)]), { benchmarks, tracesDir })).includes('localize/with: absent'));
    const three = () => [run(1), run(1), run(1)];
    assert.deepEqual(failed(gate(results(three(), three(), { aggregates: { meanDelta: -0.01 } }), { benchmarks, tracesDir })), ['meanDelta']);
    assert.deepEqual(failed(gate(results(three(), three(), { aggregates: {} }), { benchmarks, tracesDir })), ['meanDelta'], 'an absent meanDelta is not a zero one');
  });

  it('reports the cost of an arm that replayed the reviewer as unmeasured, not as a pass', () => {
    const replayRun = (recall, cost) => {
      const id = `e-${traceId++}`;
      const lines = [
        { type: 'system', subtype: 'init', model: MODEL },
        { type: 'user', message: { content: [{ type: 'tool_result', content: 'reviewer ok — REPLAYED from a recording' }] } },
      ];
      writeFileSync(path.join(tracesDir, `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n'));
      return { ...run(recall, { cost }), tracePath: `/tmp/${id}/out/trace.jsonl` };
    };
    const verdict = gate(results([replayRun(1, 0.05), replayRun(1, 0.05), replayRun(1, 0.05)], [run(1), run(1), run(1)]), { benchmarks, tracesDir });
    assert.equal(verdict.pass, true);
    assert.equal(verdict.gaps, 1);
    assert.deepEqual(verdict.checks.filter((c) => c.status === 'gap').map((c) => c.name), ['localize: cost']);
  });

  it('reports the recall of an arm whose review hit replay-miss as unmeasured, not as a loss', () => {
    const missRun = () => {
      const id = `e-${traceId++}`;
      const lines = [
        { type: 'system', subtype: 'init', model: MODEL },
        { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'node "/p/scripts/ambicode.mjs" review --exclude "x/*.json"' } }] } },
        { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'review local_1 (error: replay-miss: no recording for snapshot working-4e4c' }] } },
      ];
      writeFileSync(path.join(tracesDir, `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n'));
      return { ...run(0.5), tracePath: `/tmp/${id}/out/trace.jsonl` };
    };
    const verdict = gate(results([missRun(), missRun(), missRun()], [run(1), run(1), run(1)]), { benchmarks, tracesDir });
    assert.deepEqual(failed(verdict), [], 'the same loss without a replay-miss fails the recall check');
    assert.deepEqual(verdict.checks.filter((c) => c.status === 'gap').map((c) => c.name), ['localize: recall']);
  });

  it('gates a plugin-only run against a cached no-plugin arm, and says that it did', () => {
    const baseline = { ...results([run(1)], [run(1), run(1), run(1)]), claudeVersion: '2.1.285', startedAt: '2026-09-28T00:00:00.000Z' };
    const current = { ...results([run(1), run(1), run(1)], undefined), claudeVersion: '2.1.285', startedAt: '2026-09-30T00:00:00.000Z', aggregates: {} };
    delete current.cases[0].arms.without;
    const verdict = gate(current, { benchmarks, tracesDir, baseline, baselinePath: 'b.json' });
    assert.deepEqual(failed(verdict), []);
    assert.deepEqual(verdict.checks.filter((c) => c.status === 'gap').map((c) => c.name), ['meanDelta'], 'the harness Δ needs both arms in one run');
    assert.ok(verdict.info.some((line) => line.includes('b.json') && line.includes('2.0 days')));
    const worse = { ...current, cases: [{ ...current.cases[0], arms: { with: [run(0.5), run(0.5), run(0.5)] } }] };
    assert.deepEqual(failed(gate(worse, { benchmarks, tracesDir, baseline, baselinePath: 'b.json' })), ['localize: recall']);
  });

  it('compares against another plugin\'s with arm when asked, the LSP-only control', () => {
    const control = { ...results([run(1), run(1), run(1)], [run(0.5), run(0.5), run(0.5)]), claudeVersion: '2.1.285', startedAt: '2026-10-02T00:00:00.000Z' };
    const current = { ...results([run(0.5), run(0.5), run(0.5)], undefined), claudeVersion: '2.1.285', startedAt: '2026-10-02T01:00:00.000Z', aggregates: {} };
    delete current.cases[0].arms.without;
    assert.deepEqual(failed(gate(current, { benchmarks, tracesDir, baseline: control, baselinePath: 'l.json' })), [], 'level with the naked arm');
    const verdict = gate(current, { benchmarks, tracesDir, baseline: control, baselinePath: 'l.json', baselineArm: 'with' });
    assert.deepEqual(failed(verdict), ['localize: recall'], 'below the control plugin');
    assert.ok(verdict.info.some((line) => line.includes('the with arm of cached baseline l.json')));
  });

  it('averages each repetition across cases, skipping absent runs', () => {
    const rows = [
      { run: 0, recall: 1 },
      { run: 0, recall: 0 },
      { run: 1, recall: 1 },
      { run: 1, absent: true },
    ];
    assert.deepEqual(repetitionMeans(rows, 'recall'), [0.5, 1]);
  });
});
