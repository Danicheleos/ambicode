import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NAKED, USAGE, buildNaked, checkArgs, childEnv, plan, runCase, withProgress } from './run.mjs';

describe('result copy', () => {
  const truth = { source: 'files-section', relevant: ['m/a/x.ts', 'm/b/y.ts'], allowed: [] };
  const answer = (text) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  it('each run leaves a copy with the metrics at <results>/<stamp>/aggregate-result.json, the bare arm under <results>/bare/', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-own-'));
    const result = path.join(root, 'plugin.json');
    const trace = path.join(root, 't.jsonl');
    writeFileSync(trace, answer('## Files\n- m/a/x.ts\n- m/b/y.ts\n'));
    const raw = { startedAt: '2026-10-19T19:36:32.539Z', cases: [{ name: 'fe-vs-6141-downstream', arms: { with: [{ graders: [], trace }] } }] };
    const own = path.join(root, '2026-10-19T19-36-32-539Z', 'aggregate-result.json');
    mkdirSync(path.dirname(own));
    const deps = { tracesRoot: path.join(root, 'traces'), harvest: () => {}, truthOf: () => truth, spawn: () => { writeFileSync(result, JSON.stringify(raw)); writeFileSync(own, JSON.stringify(raw)); return 0; } };
    runCase({ argv: [], env: {}, result, arm: 'plugin' }, deps);
    assert.deepEqual(JSON.parse(readFileSync(own, 'utf8')), JSON.parse(readFileSync(result, 'utf8')));
    assert.equal(JSON.parse(readFileSync(own, 'utf8')).cases[0].arms.with[0].metrics.recall, 1);
    rmSync(path.dirname(own), { recursive: true });
    runCase({ argv: [], env: {}, result, arm: 'bare' }, { ...deps, spawn: () => { writeFileSync(result, JSON.stringify(raw)); return 0; } });
    assert.equal(existsSync(own), false, 'the bare copy does not mix with the plugin runs');
    const bare = path.join(root, 'bare', '2026-10-19T19-36-32-539Z', 'aggregate-result.json');
    assert.equal(JSON.parse(readFileSync(bare, 'utf8')).cases[0].arms.with[0].metrics.recall, 1);
  });

});

describe('evals runner', () => {
  it('the plugin arm runs evals/cases against this repository at low effort by default, with filters passed through', () => {
    const { arm, argv, env } = plan(['--case', 'task-*', '--runs', '3']);
    assert.equal(arm, 'plugin');
    assert.equal(argv[3], '--eval-dir');
    assert.equal(argv[4], 'evals/cases');
    assert.deepEqual(env, { CLAUDE_CODE_EFFORT_LEVEL: 'low' });
    assert.equal(argv[argv.indexOf('--model') + 1], 'claude-sonnet-5-5');
    assert.equal(argv[argv.indexOf('--ablation') + 1], 'none');
    assert.equal(argv[argv.indexOf('--runs') + 1], '3');
    assert.equal(argv[argv.indexOf('--case') + 1], 'task-*');
    assert.ok(argv.includes('--scaffold') && argv.includes('--trust-plugin') && argv.includes('--no-publish'));
    assert.ok(!argv.includes('--tag'));
  });

  it('every selection runs one harness call at the parallel default', () => {
    const jobs = (args) => plan(args).argv[plan(args).argv.indexOf('-j') + 1];
    assert.equal(jobs(['--tag', 'gate']), '4');
    assert.equal(jobs(['--bare', '--tag', 'downstream']), '4');
    assert.equal(jobs([]), '4');
  });

  it('an unfiltered run lists every case tag; every selection keeps the shell grant', () => {
    const tags = (args) => plan(args).argv.flatMap((arg, at, all) => (all[at - 1] === '--tag' ? [arg] : []));
    assert.ok(tags([]).length > 0);
    assert.deepEqual(tags(['--tag', 'downstream']), ['downstream']);
    for (const args of [[], ['--tag', 'downstream'], ['--bare', '--tag', 'downstream']]) assert.ok(plan(args).argv.includes('--allow-tools'), args.join(' '));
  });

  it('the bare arm runs evals/bare against the empty plugin and writes its own result', () => {
    const { arm, argv } = plan(['--bare', '--effort', 'medium']);
    assert.equal(arm, 'bare');
    assert.equal(argv[2], NAKED);
    assert.equal(argv[4], 'evals/bare');
    assert.match(argv[argv.indexOf('--json') + 1], /bare\.json$/);
  });

  it('the empty plugin has a manifest and nothing else, and its scaffolds point at the repository by absolute path', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'evals-repo-'));
    mkdirSync(path.join(repo, 'evals', 'bare', 'suite', 'one'), { recursive: true });
    writeFileSync(path.join(repo, 'evals', 'bare', 'suite', 'one', 'scaffold.sh'), 'node "$(cd "$(dirname "$0")/../../../.." && pwd)/fixtures/materialize.mjs" x "$PWD/repo"\n');
    const naked = path.join(repo, '.tmp', 'naked');
    buildNaked(repo, naked);
    assert.equal(JSON.parse(readFileSync(path.join(naked, '.claude-plugin', 'plugin.json'), 'utf8')).name, 'naked');
    assert.equal(readFileSync(path.join(naked, 'evals', 'bare', 'suite', 'one', 'scaffold.sh'), 'utf8'), `node "${repo}/fixtures/materialize.mjs" x "$PWD/repo"\n`);
  });
});

describe('child environment', () => {
  it('drops the subagent model overrides and keeps the rest', () => {
    const env = childEnv({ PATH: '/bin', CLAUDE_CODE_SUBAGENT_MODEL: 'claude-sonnet-5-5', CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1' }, { CLAUDE_CODE_EFFORT_LEVEL: 'low' });
    assert.deepEqual(env, { PATH: '/bin', CLAUDE_CODE_EFFORT_LEVEL: 'low' });
  });
});

describe('series progress file', () => {
  const setup = () => {
    const results = mkdtempSync(path.join(tmpdir(), 'run-progress-'));
    return { results, file: path.join(results, 'running.json') };
  };
  const result = (name, scores) => ({ cases: [{ name, arms: { with: scores.map((score) => ({ score, costUsd: 0.1, judgeCostUsd: 0.01 })) } }] });
  const command = (results, args, outcome, seen = []) => {
    const argv = args.split(' ');
    const run = plan(argv, undefined, results);
    return withProgress(run, argv, () => {
      seen.push(JSON.parse(readFileSync(path.join(results, 'running.json'), 'utf8')));
      return outcome;
    }, { now: () => new Date('2026-10-23T10:00:00Z') });
  };
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

  it('starts a series with every case queued, marks the running one, then scores it', () => {
    const { results, file } = setup();
    const seen = [];
    command(results, '--series a,b --case a --runs 2', { status: 0, result: result('a', [1, 0.5]) }, seen);
    assert.deepEqual(seen[0].cases.map((c) => [c.name, c.state]), [['a', 'running'], ['b', 'queued']]);
    assert.equal(seen[0].current, 'a');
    const state = read(file);
    assert.deepEqual(state.cases, [{ name: 'a', state: 'done', score: 0.75, costUsd: 0.22 }, { name: 'b', state: 'queued', score: null, costUsd: null }]);
    assert.deepEqual([state.kind, state.arm, state.runsPerCase, state.total, state.done, state.current, state.costUsd, state.finishedAt], ['eval-series', 'plugin', 2, 2, 1, null, 0.22, null]);
    assert.match(state.series, /^[0-9a-f]{8}$/);
    assert.equal(state.startedAt, '2026-10-23T10:00:00.000Z');
  });

  it('a later command of the same series updates the file and the last one finishes it', () => {
    const { results, file } = setup();
    command(results, '--series a,b --case a', { status: 0, result: result('a', [1]) });
    const first = read(file);
    command(results, '--series a,b --case b', { status: 0, result: result('b', [0]) });
    const state = read(file);
    assert.equal(state.series, first.series);
    assert.equal(state.startedAt, first.startedAt);
    assert.deepEqual([state.done, state.total, state.costUsd, state.finishedAt], [2, 2, 0.22, '2026-10-23T10:00:00.000Z']);
  });

  it('a different series, the other arm or a finished file starts a new file', () => {
    const { results, file } = setup();
    command(results, '--series a,b --case a', { status: 0, result: result('a', [1]) });
    const old = read(file).series;
    command(results, '--series a,c --case a', { status: 0, result: result('a', [1]) });
    assert.notEqual(read(file).series, old);
    assert.deepEqual(read(file).cases.map((c) => c.name), ['a', 'c']);
    command(results, '--bare --series a,c --case a', { status: 0, result: result('a', [1]) });
    assert.equal(read(file).arm, 'bare');
    command(results, '--bare --series a --case a', { status: 0, result: result('a', [1]) });
    assert.notEqual(read(file).finishedAt, null);
    command(results, '--bare --series a --case a', { status: 0, result: result('a', [0]) });
    assert.equal(read(file).cases[0].score, 0, 'a finished series restarts instead of being updated');
  });

  it('a case with no result is failed with no score and still counts as done', () => {
    const { results, file } = setup();
    command(results, '--series a --case a', { status: 3, result: null });
    const state = read(file);
    assert.deepEqual(state.cases, [{ name: 'a', state: 'failed', score: null, costUsd: null }]);
    assert.deepEqual([state.done, state.current], [1, null]);
    assert.notEqual(state.finishedAt, null);
  });

  it('without --series a lone command is a one-case series, and the file has no schemaVersion', () => {
    const { results, file } = setup();
    command(results, '--case solo', { status: 1, result: result('solo', [0.5]) });
    const state = read(file);
    assert.deepEqual(state.cases.map((c) => [c.name, c.state, c.score]), [['solo', 'done', 0.5]]);
    assert.equal('schemaVersion' in state, false);
    assert.notEqual(state.finishedAt, null);
  });

  it('a progress file that cannot be written warns once and does not fail the command', () => {
    const { results } = setup();
    const blocked = path.join(results, 'blocked');
    writeFileSync(blocked, 'a file where the directory should be');
    const argv = ['--case', 'a'];
    const warnings = [];
    const original = console.warn;
    console.warn = (text) => warnings.push(text);
    try {
      const outcome = withProgress(plan(argv, undefined, results), argv, () => ({ status: 0, result: null }), { file: path.join(blocked, 'running.json') });
      assert.equal(outcome.status, 0);
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
  });
});

describe('downstream metrics', () => {
  it('a downstream case gets recall, precision and F1 from the Files section and truth.json', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-downstream-'));
    const result = path.join(root, 'r.json');
    const trace = path.join(root, 't.jsonl');
    writeFileSync(trace, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '## Files\n- m/a/x.ts\n- m/z/q.ts\n' }] } }));
    const truth = { source: 'files-section', relevant: ['m/a/x.ts', 'm/b/y.ts'], allowed: [] };
    const deps = { tracesRoot: root, harvest: () => {}, truthOf: () => truth, spawn: () => { writeFileSync(result, JSON.stringify({ cases: [{ name: 'fe-vs-6141-downstream', arms: { with: [{ graders: [], trace }] } }] })); return 0; } };
    runCase({ argv: [], env: {}, result, arm: 'plugin' }, deps);
    const metrics = JSON.parse(readFileSync(result, 'utf8')).cases[0].arms.with[0].metrics;
    assert.deepEqual([metrics.recall, metrics.precision, metrics.f1, metrics.contract], [0.5, 0.5, 0.5, true]);
  });

  it('the downstream tag keeps the shell grant of the plugin arm (the skill runs the CLI through Bash)', () => {
    assert.ok(plan(['--tag', 'downstream']).argv.includes('--allow-tools'));
  });
});

describe('delivery summary', () => {
  it('prints one delivery line per run, unknown when no transcript was kept', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-delivery-'));
    const result = path.join(root, 'r.json');
    const lines = [];
    const delivery = { status: 'delivered', chars: 8700, map: true, candidates: true, spill: false };
    const deps = { tracesRoot: root, log: (line) => lines.push(line), harvest: (r) => { r.cases[0].arms.with[0].delivery = delivery; r.cases[0].arms.with[1].delivery = { status: 'unknown' }; }, spawn: () => { writeFileSync(result, JSON.stringify({ cases: [{ name: 'x', arms: { with: [{}, {}] } }] })); return 0; } };
    runCase({ argv: [], env: {}, result, arm: 'plugin' }, deps);
    assert.deepEqual(lines, ['x-1: delivery=delivered chars=8700 map=true candidates=true spill=false', 'x-2: delivery=unknown']);
  });
});

describe('argument check', () => {
  it('accepts every documented flag, with values after the value flags', () => {
    assert.deepEqual(checkArgs(['--bare', '--case', 'a*', '--tag', 't', '--runs', '3', '--model', 'm', '--effort', 'low', '--max-cost-usd', '2', '--series', 'a,b', '--dry-run']), { action: 'run' });
    assert.deepEqual(checkArgs([]), { action: 'run' });
  });

  it('--help and -h print the usage and run nothing, even beside other flags', () => {
    for (const argv of [['--help'], ['-h'], ['--bare', '--help']]) assert.deepEqual(checkArgs(argv), { action: 'help', usage: USAGE });
  });

  it('an unknown flag, a stray word or a value flag with no value is rejected with the usage (exit 2), never run', () => {
    for (const argv of [['--hlep'], ['--runs=3'], ['stray'], ['--case'], ['--tag', 'x', '--bogus']]) {
      const out = checkArgs(argv);
      assert.equal(out.action, 'error', argv.join(' '));
      assert.match(out.message, /Usage: run\.mjs/);
    }
  });
});
