// Regression assertions moved intact from the approved harness suite.
import { describe, it, before, after } from 'node:test';
import { namedFiles, scoreAnswer, score, withBaseline } from './bench-score.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ticket, event } from '../testing/bench-test-fixtures.mjs';
import { PROMPT, ledgerMetrics, traceMetrics, harvestTraces, LEDGER_DIRECTORY, ledgersOf } from '../harness/evals-bench.mjs';

describe('evals-bench: scoring an answer', () => {
  const truth = ['app/orders/service.ts', 'app/orders/model.ts', 'app/routes/orders.ts'];

  it('reads the Files section only, so files named as out of scope do not count', () => {
    const message = [
      'The total lives in `app/orders/service.ts`.',
      '',
      '## Files',
      '- `app/orders/service.ts` — the arithmetic',
      '- `repo/app/orders/model.ts` — the shape',
      '- ./app/legacy/export.ts — mentioned',
      '',
      '## Not part of the work',
      '- `app/routes/orders.ts`',
    ].join('\n');
    const { named, sectioned } = namedFiles(message, truth, 'app');
    assert.equal(sectioned, true);
    assert.deepEqual(named, ['app/orders/service.ts', 'app/orders/model.ts', 'app/legacy/export.ts']);
    const s = scoreAnswer(message, truth, 'app');
    assert.equal(s.correct, 2);
    assert.equal(s.precision, 2 / 3);
    assert.equal(s.recall, 2 / 3);
    assert.equal(s.hit, 1);
  });

  it('matches a path written without the code root, and only when one true file ends that way', () => {
    assert.deepEqual(namedFiles('## Files\n- orders/service.ts\n', truth, 'app').named, ['app/orders/service.ts']);
    assert.deepEqual(namedFiles('## Files\n- `/abs/run/repo/app/routes/orders.ts:12`\n', truth, 'app').named, ['app/routes/orders.ts']);
  });

  it('03b-H8: matches a path relative to a feature directory when exactly one true path ends that way', () => {
    const deep = ['src/features/a/validators/a.validators.ts', 'src/features/a/index.ts', 'src/features/b/index.ts'];
    assert.deepEqual(namedFiles('## Files\n- validators/a.validators.ts — x\n', deep, 'src').named, ['src/features/a/validators/a.validators.ts']);
    assert.deepEqual(namedFiles('## Files\n- index.ts\n', deep, 'src').named, [], 'no directory: not a path');
    assert.deepEqual(namedFiles('## Files\n- a/index.ts\n- x/index.ts\n', deep, 'src').named, ['src/features/a/index.ts', 'x/index.ts']);
  });

  it('falls back to the whole message when there is no Files section, and says so', () => {
    const s = scoreAnswer('Touch app/orders/model.ts only.', truth, 'app');
    assert.equal(s.sectioned, false);
    assert.equal(s.correct, 1);
    assert.equal(s.precision, 1);
  });

  it('scores an answer that names nothing as zero precision, not as undefined', () => {
    const s = scoreAnswer('## Files\nNone found.', truth, 'app');
    assert.deepEqual([s.named, s.precision, s.recall, s.f1, s.hit], [0, 0, 0, 0, 0]);
  });
});

describe('evals-bench: fresh evidence between invocations', () => {
  it('rereads changed truth and harvested traces for the next score', () => {
    const benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-fresh-'));
    try {
      const dir = path.join(benchmarks, 'SIDE', 'full', 'fresh');
      const tracesDir = path.join(benchmarks, 'traces');
      mkdirSync(dir, { recursive: true });
      mkdirSync(tracesDir);
      const truthFile = path.join(dir, 'truth.json');
      const traceFile = path.join(tracesDir, 'e-fresh.jsonl');
      const truth = (file) => JSON.stringify({ side: 'SIDE', root: 'app', truth: [file] });
      writeFileSync(truthFile, truth('app/a.ts'));
      writeFileSync(traceFile, event('system', { subtype: 'init', model: 'first' }));
      const results = { cases: [{ name: 'fresh', arms: { with: [{ tracePath: '/tmp/e-fresh/out/trace.jsonl', graders: [{ name: 'names-a-true-file', evidence: '## Files\n- app/a.ts' }] }] } }] };
      const options = { cases: benchmarks, tracesDir };
      const first = score(results, options).runs[0];
      assert.equal(first.recall, 1);
      assert.equal(first.trace.model, 'first');
      writeFileSync(truthFile, truth('app/b.ts'));
      writeFileSync(traceFile, event('system', { subtype: 'init', model: 'second' }));
      const second = score(results, options).runs[0];
      assert.equal(second.recall, 0);
      assert.equal(second.trace.model, 'second');
    } finally { rmSync(benchmarks, { recursive: true, force: true }); }
  });

  it('rereads changed exports for the next reuse score', () => {
    const benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-reuse-fresh-'));
    try {
      const dir = path.join(benchmarks, 'SIDE', 'reuse', 'fresh');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'truth.json'), JSON.stringify({ kind: 'reuse', side: 'SIDE', root: 'app', truth: ['existing'] }));
      const exportsFile = path.join(benchmarks, 'SIDE', 'reuse', 'exports.json');
      writeFileSync(exportsFile, JSON.stringify({ existing: ['app/a.ts'] }));
      const results = { cases: [{ name: 'fresh', arms: { with: [{ graders: [{ name: 'names-a-true-file', evidence: '## Reuse\n- `existing` in `app/a.ts`\n## New\n- `duplicate`' }] }] } }] };
      assert.equal(score(results, { cases: benchmarks }).runs[0].dupes, 0);
      writeFileSync(exportsFile, JSON.stringify({ existing: ['app/a.ts'], duplicate: ['app/b.ts'] }));
      assert.equal(score(results, { cases: benchmarks }).runs[0].dupes, 1);
    } finally { rmSync(benchmarks, { recursive: true, force: true }); }
  });
});

describe('evals-bench: scoring a run', () => {
  let benchmarks;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-score-'));
    mkdirSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1'), { recursive: true });
    writeFileSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts', 'app/b.ts'] }));
  });
  after(() => rmSync(benchmarks, { recursive: true, force: true }));

  it('reports a run with no final message as absent, not as an answer that scored zero', () => {
    const graders = (evidence, fired) => [
      { name: 'names-a-true-file', passed: true, ...(evidence === undefined ? {} : { evidence }) },
      ...(fired === undefined ? [] : [{ name: 'plugin-fired', passed: fired }]),
    ];
    const results = {
      cases: [
        {
          name: 'side-t-1',
          arms: {
            with: [{ graders: graders('## Files\n- app/a.ts\n', true), costUsd: 0.2, turns: 5 }, { graders: graders(undefined, false), error: 'timeout' }],
            without: [{ graders: graders('## Files\n- app/a.ts\n- app/b.ts\n- app/c.ts\n'), costUsd: 0.1, turns: 3 }],
          },
        },
        { name: 'not-a-benchmark-case', arms: { with: [{ graders: [] }] } },
      ],
    };
    const { runs, arms } = score(results, { cases: benchmarks });
    assert.equal(runs.length, 3, 'a case with no truth.json is not a benchmark case');
    assert.deepEqual(runs.filter((r) => r.absent).map((r) => [r.arm, r.error]), [['with', 'timeout']]);
    const w = arms['localize/with'];
    assert.deepEqual([w.runs, w.scored, w.absent], [2, 1, 1]);
    assert.equal(w.recall, 0.5);
    assert.equal(w['plugin-fired'], 1);
    assert.equal(w.sectioned, 1, '03b-H7: sectioned answers are counted');
    assert.equal(arms['localize/without'].precision, 2 / 3);
    assert.equal(arms['localize/without'].recall, 1);
    assert.ok('localize/with/SIDE' in arms);
  });

  it('reports a run that died outside the arm as absent even with an answer, and keeps one that hit its turn limit', () => {
    const answered = (error) => ({ graders: [{ name: 'names-a-true-file', passed: true, evidence: '## Files\n- app/a.ts\n' }], error, costUsd: 0.1, turns: 1 });
    const results = {
      cases: [{ name: 'side-t-1', arms: { with: [answered("exit 1: You've hit your session limit"), answered('exit 1: Not logged in · Please run /login'), answered('exit 1: Reached maximum number of turns (40)')] } }],
    };
    const { runs } = score(results, { cases: benchmarks });
    assert.deepEqual(runs.map((r) => r.absent), [true, true, false]);
    assert.equal(runs[2].recall, 0.5);
  });
});

describe('evals-bench: a cached no-plugin arm', () => {
  const PROMPT = 'Which files?';
  const result = (arms, extra = {}) => ({
    partial: false,
    claudeVersion: '2.1.285',
    startedAt: '2026-09-30T00:00:00.000Z',
    suite: { modelOverride: 'claude-sonnet-5-5' },
    cases: [{ name: 'side-t-1', promptMarkdown: PROMPT, arms }],
    ...extra,
  });
  const withOnly = result({ with: [{ turns: 9 }] });
  const baseline = result({ with: [{ turns: 1 }], without: [{ turns: 7 }] }, { startedAt: '2026-09-29T00:00:00.000Z' });

  it('takes the without arm from the baseline, and keeps where it came from', () => {
    const merged = withBaseline(withOnly, baseline, { baselinePath: 'b.json' });
    assert.deepEqual(merged.cases[0].arms, { with: [{ turns: 9 }], without: [{ turns: 7 }] });
    assert.deepEqual(merged.baseline, { file: 'b.json', arm: 'without', startedAt: '2026-09-29T00:00:00.000Z', plugin: null, claudeVersion: '2.1.285' });
    assert.equal(withOnly.cases[0].arms.without, undefined, 'the run it was given is not modified');
  });

  it('refuses a baseline that differs in anything the no-plugin arm depends on', () => {
    const refuse = (b, pattern, r = withOnly) => assert.throws(() => withBaseline(r, b, { baselinePath: 'b.json' }), pattern);
    refuse({ ...baseline, suite: { modelOverride: 'claude-opus-5-5' } }, /model/);
    refuse({ ...baseline, claudeVersion: '2.1.300' }, /Claude Code version/);
    refuse({ ...baseline, partial: true }, /partial/);
    refuse({ ...baseline, cases: [{ ...baseline.cases[0], promptMarkdown: 'Other prompt' }] }, /prompt/);
    refuse({ ...baseline, cases: [] }, /side-t-1/);
    refuse({ ...baseline, cases: [{ ...baseline.cases[0], arms: { with: [] } }] }, /no without arm/);
    refuse(baseline, /its own without arm/, baseline);
  });

  it('takes the plugin arm of a naked-plugin baseline unless told otherwise', () => {
    const naked = result({ with: [{ turns: 4 }] }, { suite: { modelOverride: 'claude-sonnet-5-5', plugins: [{ name: 'naked' }] } });
    const merged = withBaseline(withOnly, naked, { baselinePath: 'n.json' });
    assert.deepEqual(merged.cases[0].arms.without, [{ turns: 4 }]);
    assert.equal(merged.baseline.arm, 'with');
    assert.throws(() => withBaseline(withOnly, naked, { baselinePath: 'n.json', arm: 'without' }), /no without arm/);
  });

  it('measures a case only against the same case: there is no twin to fall back to', () => {
    const twin = { ...withOnly, cases: [{ name: 'side-t-1-review-7-x-forced', promptMarkdown: PROMPT, arms: { with: [{ turns: 9 }] } }] };
    const cached = result({ without: [{ turns: 6 }] });
    cached.cases = [{ name: 'side-t-1-review-7-x', promptMarkdown: PROMPT, arms: cached.cases[0].arms }];
    assert.throws(() => withBaseline(twin, cached, { baselinePath: 'b.json' }), /no case side-t-1-review-7-x-forced/);
  });
});

describe('evals-bench: scoring a review run', () => {
  let benchmarks;
  before(() => {
    benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-review-score-'));
    mkdirSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1-review-7-x'), { recursive: true });
    writeFileSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1-review-7-x', 'truth.json'), JSON.stringify({ kind: 'review', side: 'SIDE', ticket: 'T-1', version: '7-x', root: 'app', threads: 2 }));
  });
  after(() => rmSync(benchmarks, { recursive: true, force: true }));

  it('scores recall against the human threads, and a run whose judges did not run as absent', () => {
    const raised = (a, b) => [{ name: 'raises-01', passed: a }, { name: 'raises-02', passed: b }];
    const results = {
      cases: [
        {
          name: 'side-t-1-review-7-x',
          arms: {
            with: [{ graders: raised(true, false) }, { graders: raised(false, false), skippedPaidGraders: true }],
            without: [{ graders: [{ name: 'raises-01', passed: true }] }],
          },
        },
      ],
    };
    const { arms } = score(results, { cases: benchmarks });
    assert.deepEqual([arms['review/with'].scored, arms['review/with'].absent, arms['review/with'].recall], [1, 1, 0.5]);
    assert.equal(arms['review/without'].absent, 1, 'a missing thread grader is not a thread the run failed to raise');
  });
});

describe('evals-bench: ledgers and route measures', () => {
  const route = { id: 'a1b2c3d4-1', kind: 'route', skill: 'investigate', channel: 'hook', trusted: true, session: 'a1b2c3d4' };
  const V6 = [
    route,
    { id: 'a1b2c3d4-2', kind: 'preanswer', gate: 'plan-accept', option: 'Accept', via: 'prompt', route: 'a1b2c3d4-1' },
    { id: 'a1b2c3d4-3', kind: 'step', step: 'ground', status: 'delivered', route: 'a1b2c3d4-1' },
    { id: 'a1b2c3d4-4', kind: 'map', layers: [{ name: 'shortlist', ms: 4, hits: 9 }, { name: 'harvest', ms: 2, hits: 5 }], terms: { 1: ['a', 'b'], 2: ['C', 'D', 'E'] } },
    { id: 'a1b2c3d4-5', kind: 'step', step: 'ground', status: 'completed' },
    { id: 'a1b2c3d4-6', kind: 'envelope', builtFrom: 'args', asked: [], missingAsked: [] },
    { id: 'a1b2c3d4-7', kind: 'gate', gate: 'plan-accept', class: 'declared', print: 1, object: { kind: 'note', value: 'plan-draft', id: 'a1b2c3d4-6', path: 'p.md', contentHash: 'h1' } },
    { id: 'a1b2c3d4-8', kind: 'acceptance', gate: 'plan-accept', instance: 'a1b2c3d4-7', answer: 'Accept', via: 'prompt', object: { kind: 'note', value: 'plan-draft', id: 'a1b2c3d4-6', path: 'p.md', contentHash: 'h1' } },
    { id: 'a1b2c3d4-9', kind: 'acceptance', gate: 'plan-accept', instance: 'a1b2c3d4-99', answer: 'Accept', via: 'hook', unbound: true, reason: 'instance' },
    { id: 'a1b2c3d4-10', kind: 'default-taken', gate: 'scope', instance: null, via: 'headless' },
    { id: 'a1b2c3d4-11', kind: 'revise', from: 'design', via: 'code', cycle: 1 },
    { id: 'a1b2c3d4-12', kind: 'revise', from: 'design', via: 'model', cycle: 1 },
    { id: 'a1b2c3d4-13', kind: 'check', route: 'a1b2c3d4-1', key: 'web/unit', only: ['a.spec.ts'], phase: 'red', exit: 1, summary: null },
    { id: 'a1b2c3d4-14', kind: 'check', route: 'a1b2c3d4-1', key: 'web/unit', only: ['a.spec.ts'], phase: 'red', exit: 1, summary: { ran: 0, failed: 0 } },
    { id: 'a1b2c3d4-15', kind: 'check', route: 'a1b2c3d4-1', key: 'web/unit', only: ['a.spec.ts'], phase: 'red', exit: 1, summary: { ran: 1, failed: 1 } },
    { id: 'a1b2c3d4-16', kind: 'check', route: 'a1b2c3d4-1', key: 'web/unit', only: ['a.spec.ts'], phase: 'green', exit: 0, summary: { ran: 1, failed: 0 } },
    { id: 'a1b2c3d4-17', kind: 'exit', route: 'a1b2c3d4-1', reason: 'blocked', code: 'permission-denied', detail: 'ask in headless' },
    { id: 'a1b2c3d4-18', kind: 'future-kind', x: 1 },
  ];
  const one = (entries) => [{ entries, unreadable: 0 }];

  it('reads the v6 measures from synthetic records, binding answers to their printed instance', () => {
    const m = ledgerMetrics(one(V6));
    assert.deepEqual(m.mapLayers, ['shortlist', 'harvest']);
    assert.equal(m.mapPass2, 3);
    assert.deepEqual(m.routeSteps, { delivered: 1, completed: 1, skipped: 0 });
    assert.deepEqual(m.revises, { gate: 0, code: 1, model: 1 });
    assert.deepEqual(m.gates, { prints: { declared: 1 }, answers: { prompt: 1, headless: 1 }, bound: 1, unbound: 1 });
    assert.equal(m.preanswers, 1);
    assert.equal(m.stopBlocked, 1);
    assert.equal(m.permissionDenied, 1);
    assert.deepEqual(m.checkRedGreen, { checks: 4, red: 1, green: 1, malformed: 2, unassociated: 0, proven: true });
    assert.equal(m.envelopeBuiltFrom, 'args');
    assert.equal(m.complete, true);
    assert.equal(m.noRouteMcpSpawns, null, 'spawns are not measured');
  });

  it('gives null, never an empty success, for what was not recorded', () => {
    assert.equal(ledgerMetrics(null), null);
    const bare = ledgerMetrics(one([{ id: 'x-1', kind: 'note', note: 'notes' }]), { mcpHookResponses: 2, mcpHookSpawns: null });
    for (const key of ['mapLayers', 'mapPass2', 'routeSteps', 'revises', 'gates', 'preanswers', 'stopBlocked', 'checkRedGreen', 'envelopeBuiltFrom', 'permissionDenied']) assert.equal(bare[key], null, key);
    assert.equal(bare.noRouteMcpSpawns, null, 'observed hook responses are not spawns');
    assert.equal(bare.mcpHookResponses, 2);
    assert.equal(ledgerMetrics(one([route, { kind: 'check', key: 'k', phase: 'green', exit: 0, summary: null }])).checkRedGreen.proven, false, 'an exit without a summary is no proof');
  });

  it('takes peak context from the trace usage, not from the ledger', () => {
    const usage = (input, read, write) => event('assistant', { message: { usage: { input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: write }, content: [] } });
    const hook = (name, hookEvent) => event('system', { subtype: 'hook_response', hook_name: name, hook_event: hookEvent });
    const m = traceMetrics([usage(10, 1000, 200), usage(5, 3000, 100), hook('SessionStart:startup', 'SessionStart'), hook('PostToolUse:mcp__jira__get', 'PostToolUse')].join('\n'));
    assert.equal(m.peakContext, 3105);
    assert.equal(m.mcpHookResponses, 1, 'an observed PostToolUse response for an mcp__ tool');
    assert.equal(m.mcpHookSpawns, null, 'not a process count');
  });

  it('copies each sandbox\'s task ledgers beside its trace, without two runs\' slugs meeting', () => {
    const sandboxRoot = mkdtempSync(path.join(tmpdir(), 'harvest-ledger-'));
    try {
      for (const [id, line] of [['e-one', '{"kind":"route","id":"a-1"}\n'], ['e-two', '{"kind":"route","id":"b-1"}\n']]) {
        const task = path.join(sandboxRoot, id, 'home', 'cwd', 'repo', '.ambicode', 'task', 'same-slug');
        mkdirSync(task, { recursive: true });
        writeFileSync(path.join(task, 'ledger.jsonl'), line);
        mkdirSync(path.join(sandboxRoot, id, 'out'), { recursive: true });
        writeFileSync(path.join(sandboxRoot, id, 'out', 'trace.jsonl'), '{}\n');
      }
      mkdirSync(path.join(sandboxRoot, 'e-none', 'home', 'cwd', 'repo'), { recursive: true });
      const outDir = path.join(sandboxRoot, 'kept');
      assert.equal(harvestTraces(outDir, { sandboxRoots: [sandboxRoot] }), 2, 'the return value still counts traces');
      const at = (id) => path.join(outDir, LEDGER_DIRECTORY, id, 'home', 'cwd', 'repo', '.ambicode', 'task', 'same-slug', 'ledger.jsonl');
      assert.equal(readFileSync(at('e-one'), 'utf8'), '{"kind":"route","id":"a-1"}\n');
      assert.equal(readFileSync(at('e-two'), 'utf8'), '{"kind":"route","id":"b-1"}\n');
      assert.ok(!existsSync(path.join(outDir, LEDGER_DIRECTORY, 'e-none')));
      assert.ok(!readdirSync(path.join(outDir, LEDGER_DIRECTORY), { recursive: true }).some((f) => String(f).endsWith('.tmp')));
    } finally {
      rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  it('attaches ledger measures to scored runs, and an infrastructure failure stays absent', () => {
    const benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-ledger-score-'));
    try {
      mkdirSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1'), { recursive: true });
      writeFileSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts'] }));
      const tracesDir = path.join(benchmarks, 'traces');
      for (const [id, tail] of [['e-ok', ''], ['e-dead', ''], ['e-torn', '{"kind":"exit","rea']]) {
        const dir = path.join(tracesDir, LEDGER_DIRECTORY, id, 'home', 'cwd', 'repo', '.ambicode', 'task', 's');
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'ledger.jsonl'), `${V6.map((e) => JSON.stringify(e)).join('\n')}\n${tail}`);
      }
      const graders = [{ name: 'names-a-true-file', passed: true, evidence: '## Files\n- app/a.ts\n' }];
      const results = {
        cases: [
          {
            name: 'side-t-1',
            arms: {
              with: [
                { graders, tracePath: '/private/tmp/e-ok/out/trace.jsonl' },
                { graders, error: 'exit 1: Not logged in · Please run /login', tracePath: '/private/tmp/e-dead/out/trace.jsonl' },
                { graders, tracePath: '/private/tmp/e-unharvested/out/trace.jsonl' },
                { graders, tracePath: '/private/tmp/e-torn/out/trace.jsonl' },
              ],
            },
          },
        ],
      };
      const { runs, arms } = score(results, { cases: benchmarks, tracesDir });
      assert.deepEqual(runs.map((r) => r.absent), [false, true, false, false]);
      assert.equal(runs[1].ledger.preanswers, 1, 'the ledger is read, and the classification is not overwritten');
      assert.equal(runs[2].ledger, null);
      assert.deepEqual([runs[3].ledger.complete, runs[3].ledger.unreadable, runs[3].ledger.stopBlocked], [false, 1, null], 'a torn ledger measures nothing');
      const w = arms['localize/with'];
      assert.deepEqual([w.ledgered, w['ledger-incomplete'], w.routed, w.preanswers, w['check-red-green'], w['stop-blocked'], w['permission-denied']], [3, 1, 2, 2, 2, 2, 2]);
      assert.deepEqual(w['envelope-built-from'], { args: 2 });
      assert.match(w['mcp-hook-spawns'], /^unmeasured/);
    } finally {
      rmSync(benchmarks, { recursive: true, force: true });
    }
  });
});

describe('evals-bench: scoring keeps unknown ledger measures unknown', () => {
  const route = { id: 'r-1', kind: 'route', skill: 'task' };
  const graders = [{ name: 'names-a-true-file', passed: true, evidence: '## Files\n- app/a.ts\n' }];
  const MEASURED = ['steps-completed', 'revises', 'preanswers', 'stop-blocked', 'permission-denied', 'check-red-green', 'envelope-built-from'];
  const scoreLedgers = (arms) => {
    const benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-ledger-unknown-'));
    try {
      mkdirSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1'), { recursive: true });
      writeFileSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts'] }));
      const tracesDir = path.join(benchmarks, 'traces');
      const cases = [{ name: 'side-t-1', arms: {} }];
      for (const [arm, ledgers] of Object.entries(arms))
        cases[0].arms[arm] = ledgers.map((entries, i) => {
          const id = `e-${arm}-${i}`;
          const dir = path.join(tracesDir, LEDGER_DIRECTORY, id, 'l');
          mkdirSync(dir, { recursive: true });
          writeFileSync(path.join(dir, 'ledger.jsonl'), `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`);
          return { graders, tracePath: `/tmp/${id}/out/trace.jsonl` };
        });
      return score({ cases }, { cases: benchmarks, tracesDir });
    } finally {
      rmSync(benchmarks, { recursive: true, force: true });
    }
  };
  const done = { kind: 'exit', route: 'r-1', reason: 'done' };
  const blocked = { kind: 'exit', route: 'r-1', reason: 'blocked', code: 'permission-denied' };

  it('averages and counts only the runs that recorded a measure, and says how many did', () => {
    const { runs, arms } = scoreLedgers({
      with: [
        [route, done, { kind: 'preanswer', gate: 'g', via: 'prompt' }, { kind: 'step', step: 'a', status: 'completed' }, { kind: 'step', step: 'b', status: 'completed' }],
        [route],
        [route, blocked, { kind: 'step', step: 'a', status: 'delivered' }],
      ],
    });
    assert.deepEqual([runs[1].ledger.preanswers, runs[1].ledger.stopBlocked, runs[1].ledger.routeSteps], [null, null, null]);
    const w = arms['localize/with'];
    assert.equal(w.routed, 3);
    assert.equal(w['steps-completed'], 1, 'runs one and three: 2 and 0, the route-only run is left out');
    assert.deepEqual([w.preanswers, w['stop-blocked'], w['permission-denied']], [1, 1, 1]);
    assert.deepEqual(w.measured, { 'steps-completed': 2, revises: 0, preanswers: 1, 'stop-blocked': 2, 'permission-denied': 2, 'check-red-green': 0, 'envelope-built-from': 0 });
    assert.equal(w.revises, null);
    assert.equal(w['check-red-green'], null, 'no checks recorded: unknown, not zero proofs');
    assert.equal(w['envelope-built-from'], null);
  });

  it('reports a recorded zero as zero and a missing measurement as null, in the same group', () => {
    const { arms } = scoreLedgers({ with: [[route, done, { kind: 'step', step: 'a', status: 'delivered' }]] });
    const w = arms['localize/with'];
    assert.deepEqual([w['stop-blocked'], w['permission-denied'], w['steps-completed']], [0, 0, 0]);
    assert.deepEqual([w.preanswers, w.revises], [null, null]);
    assert.equal(JSON.parse(JSON.stringify(w)).preanswers, null, 'null survives the JSON report');
  });

  it('leaves every measure of a group with no records unknown', () => {
    const { arms } = scoreLedgers({ without: [[route], [route]] });
    const g = arms['localize/without'];
    assert.equal(g.routed, 2);
    for (const key of MEASURED) assert.equal(g[key], null, key);
    assert.ok(Object.values(g.measured).every((n) => n === 0));
  });

  it('counts a proof only among the runs that recorded checks', () => {
    const check = (phase, failed) => ({ kind: 'check', route: 'r-1', key: 'k', phase, exit: failed ? 1 : 0, summary: { ran: 1, failed } });
    const { arms } = scoreLedgers({ with: [[route, check('red', 1), check('green', 0)], [route, check('green', 1)], [route]] });
    const w = arms['localize/with'];
    assert.deepEqual([w['check-red-green'], w.measured['check-red-green']], [1, 2]);
  });
});

describe('evals-bench: incomplete ledgers measure nothing', () => {
  const route = { id: 'r-1', kind: 'route', skill: 'task' };
  const complete = [route, { kind: 'step', step: 'a', status: 'completed' }];
  const measures = ['routes', 'routeSteps', 'revises', 'gates', 'preanswers', 'stopBlocked', 'checkRedGreen', 'permissionDenied'];

  it('turns a torn or unreadable line into null measures, not zeros', () => {
    const m = ledgerMetrics([{ entries: [route, { kind: 'check', key: 'k', phase: 'red', exit: 1, summary: { ran: 1, failed: 1 } }, { kind: 'check', key: 'k', phase: 'green', exit: 0, summary: { ran: 1, failed: 0 } }], unreadable: 1 }]);
    assert.deepEqual([m.complete, m.unreadable], [false, 1]);
    for (const key of measures) assert.equal(m[key], null, key);
  });

  it('reads a harvested ledger file line by line, counting what it cannot read', () => {
    const tracesDir = mkdtempSync(path.join(tmpdir(), 'bench-ledger-read-'));
    try {
      const write = (id, text) => {
        const dir = path.join(tracesDir, LEDGER_DIRECTORY, id, 'home', 'cwd', 'repo', '.ambicode', 'task', 's');
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'ledger.jsonl'), text);
        return { tracePath: `/tmp/${id}/out/trace.jsonl` };
      };
      const torn = ledgerMetrics(ledgersOf(write('e-torn', `${JSON.stringify(route)}\n{"kind":"exit","reason":"bl`), tracesDir));
      assert.deepEqual([torn.complete, torn.unreadable, torn.stopBlocked], [false, 1, null]);
      const scalar = ledgerMetrics(ledgersOf(write('e-scalar', `${JSON.stringify(route)}\n42\n`), tracesDir));
      assert.deepEqual([scalar.complete, scalar.unreadable], [false, 1], 'a line that parses but is no entry is unreadable too');
      const empty = ledgerMetrics(ledgersOf(write('e-empty', ''), tracesDir));
      assert.deepEqual([empty.complete, empty.empty, empty.routes], [false, 1, null]);
      const unknown = ledgerMetrics(ledgersOf(write('e-unknown', `${[...complete, { kind: 'future-kind', x: 1 }].map((e) => JSON.stringify(e)).join('\n')}\n`), tracesDir));
      assert.deepEqual([unknown.complete, unknown.routes, unknown.stopBlocked, unknown.permissionDenied], [true, 1, null, null], 'an unknown valid kind is skipped, and records no exit');
      assert.equal(ledgersOf({ tracePath: '/tmp/e-none/out/trace.jsonl' }, tracesDir), null);
    } finally {
      rmSync(tracesDir, { recursive: true, force: true });
    }
  });

  it('keeps an infrastructure failure absent whatever its ledger holds', () => {
    const benchmarks = mkdtempSync(path.join(tmpdir(), 'bench-ledger-infra-'));
    try {
      mkdirSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1'), { recursive: true });
      writeFileSync(path.join(benchmarks, 'SIDE', 'full', 'side-t-1', 'truth.json'), JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts'] }));
      const dir = path.join(benchmarks, 'traces', LEDGER_DIRECTORY, 'e-x', 'l');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'ledger.jsonl'), 'torn');
      const run = { graders: [{ name: 'names-a-true-file', passed: true, evidence: '## Files\n- app/a.ts\n' }], error: 'Not logged in', tracePath: '/tmp/e-x/out/trace.jsonl' };
      const [row] = score({ cases: [{ name: 'side-t-1', arms: { with: [run] } }] }, { cases: benchmarks, tracesDir: path.join(benchmarks, 'traces') }).runs;
      assert.deepEqual([row.absent, row.ledger.complete], [true, false]);
    } finally {
      rmSync(benchmarks, { recursive: true, force: true });
    }
  });
});
