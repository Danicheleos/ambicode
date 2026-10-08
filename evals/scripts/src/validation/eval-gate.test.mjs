import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { NAKED_EQUIVALENCE, builtinLines, gate, repetitionMeans } from './eval-gate.mjs';

const MODEL = 'claude-sonnet-5-5';
const ANSWER = { 1: '## Files\n- app/a.ts\n- app/b.ts\n', 0.5: '## Files\n- app/a.ts\n' };

describe('eval-gate', () => {
  let benchmarks;
  let tracesDir;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'eval-gate-'));
    mkdirSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1'), { recursive: true });
    writeFileSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts', 'app/b.ts'] }));
    mkdirSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1-review-7-x'), { recursive: true });
    writeFileSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1-review-7-x', 'truth.json'), JSON.stringify({ kind: 'review', side: 'SIDE', ticket: 'T-1', version: '7-x', root: 'app', threads: 1 }));
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
    const verdict = gate(results([run(1), run(1), run(1)], [run(1), run(0.5), run(1)]), { cases: benchmarks, tracesDir });
    assert.deepEqual(failed(verdict), []);
    assert.equal(verdict.pass, true);
  });

  it('fails a recall loss wider than the run-to-run noise, and forgives one inside it', () => {
    const beyond = gate(results([run(0.5), run(0.5), run(0.5)], [run(1), run(1), run(1)]), { cases: benchmarks, tracesDir });
    assert.deepEqual(failed(beyond), ['localize: recall']);
    const within = gate(results([run(1), run(0.5), run(1)], [run(1), run(1), run(1)]), { cases: benchmarks, tracesDir });
    assert.deepEqual(failed(within), [], 'a 0.5 swing between repetitions covers a 0.167 loss');
  });

  it('fails an unpinned model, a model the traces contradict, and a run with no trace to check', () => {
    const three = () => [run(1), run(1), run(1)];
    assert.deepEqual(failed(gate(results(three(), three(), { suite: {} }), { cases: benchmarks, tracesDir })), ['pinned-model']);
    assert.deepEqual(failed(gate(results([run(1), run(1), run(1, { model: 'claude-opus-5-5' })], three()), { cases: benchmarks, tracesDir })), ['pinned-model']);
    assert.deepEqual(failed(gate(results(three(), three()), { cases: benchmarks, tracesDir: null })), ['pinned-model']);
  });

  it('fails a single run, a partial run, and cost or turns over budget', () => {
    assert.deepEqual(failed(gate(results([run(1)], [run(1)]), { cases: benchmarks, tracesDir })), ['runs-per-case']);
    const three = (opts) => [run(1, opts), run(1, opts), run(1, opts)];
    assert.deepEqual(failed(gate(results(three(), three(), { partial: true }), { cases: benchmarks, tracesDir })), ['complete']);
    assert.deepEqual(failed(gate(results(three({ cost: 0.3 }), three()), { cases: benchmarks, tracesDir })), ['localize: cost']);
    assert.deepEqual(failed(gate(results(three({ turns: 11 }), three()), { cases: benchmarks, tracesDir })), ['localize: turns']);
  });

  it('fails an arm whose runs mostly produced nothing to score, and a negative meanDelta beyond the noise', () => {
    const absent = { graders: [], costUsd: 0.2, turns: 8 };
    assert.ok(failed(gate(results([run(1), absent, absent], [run(1), run(1), run(1)]), { cases: benchmarks, tracesDir })).includes('localize/with: absent'));
    const three = () => [run(1), run(1), run(1)];
    assert.deepEqual(failed(gate(results(three(), three(), { aggregates: { meanDelta: -0.01 } }), { cases: benchmarks, tracesDir })), ['meanDelta']);
    assert.deepEqual(failed(gate(results(three(), three(), { aggregates: {} }), { cases: benchmarks, tracesDir })), ['meanDelta'], 'an absent meanDelta is not a zero one');
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
    const verdict = gate(results([replayRun(1, 0.05), replayRun(1, 0.05), replayRun(1, 0.05)], [run(1), run(1), run(1)]), { cases: benchmarks, tracesDir });
    assert.equal(verdict.pass, true);
    assert.equal(verdict.gaps, 1);
    assert.deepEqual(verdict.checks.filter((c) => c.status === 'gap').map((c) => c.name), ['localize: cost']);
  });

  it('reports a gate the eval answers did not cover as a gap, naming it and its count', () => {
    const defaulted = () => {
      const row = run(1);
      const dir = path.join(tracesDir, 'ledgers', path.basename(path.dirname(path.dirname(row.tracePath))), 'l');
      mkdirSync(dir, { recursive: true });
      const entries = [{ id: 'x-0', kind: 'route', skill: 'investigate' }, { id: 'x-1', kind: 'default-taken', gate: 'scope', instance: null, via: 'headless' }];
      writeFileSync(path.join(dir, 'ledger.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
      return row;
    };
    const verdict = gate(results([defaulted(), defaulted(), run(1)], [run(1), run(1), run(1)]), { cases: benchmarks, tracesDir });
    assert.equal(verdict.pass, true);
    const gaps = verdict.checks.filter((c) => c.status === 'gap');
    assert.deepEqual(gaps.map((c) => c.name), ['localize: gate answers']);
    assert.match(gaps[0].detail, /scope ×2/);
  });

  it('counts a typed route started by the prompt hook as activation, apart from native Skill tool calls', () => {
    const routed = () => {
      const row = run(1);
      const dir = path.join(tracesDir, 'ledgers', path.basename(path.dirname(path.dirname(row.tracePath))), 'l');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'ledger.jsonl'), `${JSON.stringify({ id: 'x-0', kind: 'route', skill: 'investigate' })}\n`);
      return row;
    };
    const verdict = gate(results([routed(), routed(), run(1)], [run(1), run(1), run(1)]), { cases: benchmarks, tracesDir });
    const line = verdict.info.find((l) => l.startsWith('localize/with:'));
    assert.match(line, /route started 2\/3 \(ledger\), Skill tool 0\/3/);
    assert.doesNotMatch(line, /skill fired/);
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
    const verdict = gate(results([missRun(), missRun(), missRun()], [run(1), run(1), run(1)]), { cases: benchmarks, tracesDir });
    assert.deepEqual(failed(verdict), [], 'the same loss without a replay-miss fails the recall check');
    assert.deepEqual(verdict.checks.filter((c) => c.status === 'gap').map((c) => c.name), ['localize: recall']);
  });

  it('gates a plugin-only run against a cached no-plugin arm, and says that it did', () => {
    const baseline = { ...results([run(1)], [run(1), run(1), run(1)]), claudeVersion: '2.1.285', startedAt: '2026-09-28T00:00:00.000Z' };
    const current = { ...results([run(1), run(1), run(1)], undefined), claudeVersion: '2.1.285', startedAt: '2026-09-30T00:00:00.000Z', aggregates: {} };
    delete current.cases[0].arms.without;
    const verdict = gate(current, { cases: benchmarks, tracesDir, baseline, baselinePath: 'b.json' });
    assert.deepEqual(failed(verdict), []);
    assert.deepEqual(verdict.checks.filter((c) => c.status === 'gap').map((c) => c.name), ['meanDelta'], 'the harness Δ needs both arms in one run');
    assert.ok(verdict.info.some((line) => line.includes('b.json') && line.includes('2.0 days')));
    const worse = { ...current, cases: [{ ...current.cases[0], arms: { with: [run(0.5), run(0.5), run(0.5)] } }] };
    assert.deepEqual(failed(gate(worse, { cases: benchmarks, tracesDir, baseline, baselinePath: 'b.json' })), ['localize: recall']);
  });

  it('compares against another plugin\'s with arm when asked, the LSP-only control', () => {
    const control = { ...results([run(1), run(1), run(1)], [run(0.5), run(0.5), run(0.5)]), claudeVersion: '2.1.285', startedAt: '2026-10-02T00:00:00.000Z' };
    const current = { ...results([run(0.5), run(0.5), run(0.5)], undefined), claudeVersion: '2.1.285', startedAt: '2026-10-02T01:00:00.000Z', aggregates: {} };
    delete current.cases[0].arms.without;
    assert.deepEqual(failed(gate(current, { cases: benchmarks, tracesDir, baseline: control, baselinePath: 'l.json' })), [], 'level with the naked arm');
    const verdict = gate(current, { cases: benchmarks, tracesDir, baseline: control, baselinePath: 'l.json', baselineArm: 'with' });
    assert.deepEqual(failed(verdict), ['localize: recall'], 'below the control plugin');
    assert.ok(verdict.info.some((line) => line.includes('the with arm of cached baseline l.json')));
  });

  const nakedBaseline = (cases) => ({ partial: false, suite: { modelOverride: MODEL, plugins: [{ name: 'naked' }] }, claudeVersion: '2.1.289', startedAt: '2026-10-04T19:44:56.791Z', cases });
  const pluginRun = (cases) => ({ partial: false, suite: { modelOverride: MODEL, plugins: [{ name: 'ambicode' }], servedPrompt: 'with' }, claudeVersion: '2.1.289', startedAt: '2026-10-05T00:00:00.000Z', aggregates: {}, cases });
  const reviewRun = () => ({ graders: [{ name: 'raises-01', passed: true }], costUsd: 0.2, turns: 8 });

  it('says naked/without equivalence is unverified against a naked baseline, and names the reference it used', () => {
    const baseline = nakedBaseline([{ name: 'side-t-1', promptMarkdown: 'P', arms: { with: [run(1), run(1), run(1)] } }]);
    const verdict = gate(pluginRun([{ name: 'side-t-1', promptMarkdown: 'P', pluginPromptMarkdown: '/ambicode:investigate --headless P', arms: { with: [run(1), run(1), run(1)] } }]), { cases: benchmarks, tracesDir, baseline, baselinePath: 'n.json' });
    assert.deepEqual(failed(verdict), []);
    assert.ok(verdict.info.includes(NAKED_EQUIVALENCE));
    assert.match(NAKED_EQUIVALENCE, /^naked\/without equivalence unverified/);
    assert.ok(verdict.info.some((line) => line.includes('the with arm of cached baseline n.json (plugin naked, Claude Code 2.1.289)')));
    assert.ok(verdict.info.some((line) => /^served prompt: with \(prompt\.with\.md/.test(line)));
  });

  it('claims no equivalence for an ordinary baseline with its own without arm', () => {
    const baseline = { ...results([run(1)], [run(1), run(1), run(1)]), claudeVersion: '2.1.285', startedAt: '2026-09-28T00:00:00.000Z' };
    const current = { ...results([run(1), run(1), run(1)], undefined), claudeVersion: '2.1.285', startedAt: '2026-09-30T00:00:00.000Z', aggregates: {} };
    delete current.cases[0].arms.without;
    const verdict = gate(current, { cases: benchmarks, tracesDir, baseline, baselinePath: 'b.json' });
    assert.ok(!verdict.info.some((line) => line.includes('equivalence')));
    assert.ok(verdict.info.some((line) => line.includes('served prompt: unrecorded')));
  });

  it('gates a localize-only run against a baseline holding review cases too, on localize checks only', () => {
    const baseline = nakedBaseline([
      { name: 'side-t-1', promptMarkdown: 'P', arms: { with: [run(1), run(1), run(1)] } },
      { name: 'side-t-1-review-7-x', promptMarkdown: 'R', arms: { with: [reviewRun(), reviewRun(), reviewRun()] } },
    ]);
    const verdict = gate(pluginRun([{ name: 'side-t-1', promptMarkdown: 'P', arms: { with: [run(1), run(1), run(1)] } }]), { cases: benchmarks, tracesDir, baseline, baselinePath: 'n.json' });
    const kinds = new Set(verdict.checks.filter((c) => c.name.includes(':')).map((c) => c.name.split(/[:/]/)[0]));
    assert.deepEqual([...kinds], ['localize']);
    assert.deepEqual(failed(verdict), []);
  });

  it('still refuses a baseline of another version, model or prompt', () => {
    const baseline = nakedBaseline([{ name: 'side-t-1', promptMarkdown: 'P', arms: { with: [run(1), run(1), run(1)] } }]);
    const current = pluginRun([{ name: 'side-t-1', promptMarkdown: 'P', arms: { with: [run(1), run(1), run(1)] } }]);
    assert.throws(() => gate({ ...current, claudeVersion: '2.1.287' }, { cases: benchmarks, tracesDir, baseline, baselinePath: 'n.json' }), /version 2\.1\.289, this run on 2\.1\.287/);
    assert.throws(() => gate({ ...current, suite: { modelOverride: 'claude-opus-5-5' } }, { cases: benchmarks, tracesDir, baseline, baselinePath: 'n.json' }), /model/);
    assert.throws(() => gate({ ...current, cases: [{ ...current.cases[0], promptMarkdown: '/ambicode:investigate --headless P' }] }, { cases: benchmarks, tracesDir, baseline, baselinePath: 'n.json' }), /prompt differs/);
  });

  it('03b-H3: reports the built-in plugins each arm loaded and warns when they differ, deciding nothing', () => {
    const traced = (names) => ({ trace: { builtinPlugins: names } });
    const same = builtinLines('localize', [traced(['a'])], [traced(['a'])]);
    assert.deepEqual(same, ['localize: built-in plugins a with 1/1 without 1/1']);
    const differ = builtinLines('localize', [traced(['a', 'sec']), traced(['a', 'sec'])], [traced(['a']), traced(['a']), traced(['a'])]);
    assert.match(differ[0], /sec with 2\/2 without 0\/3/);
    assert.match(differ[1], /WARNING .*\(sec\)/);
    assert.match(builtinLines('localize', [{ trace: null }], [traced(['a'])])[0], /unmeasured/);
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
