import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NAKED, buildNaked, childEnv, plan, recallOfGraders, runCase, withProgress } from './run.mjs';

describe('navigator metrics', () => {
  const truth = { relevant: ['m/a/x.ts', 'm/b/y.ts'], allowed: [], ancestorShare: 0.5, ancestors: {} };
  const answer = (text) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  const run = (traceText, graders) => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-metrics-'));
    const result = path.join(root, 'r.json');
    const trace = path.join(root, 't.jsonl');
    writeFileSync(trace, traceText);
    const deps = { tracesRoot: root, harvest: () => {}, truthOf: () => truth, spawn: () => { writeFileSync(result, JSON.stringify({ cases: [{ name: 'fe-vs-6141-navigator', arms: { with: [{ graders, trace }] } }] })); return 0; } };
    runCase({ argv: [], env: {}, result, arm: 'plugin' }, deps);
    return JSON.parse(readFileSync(result, 'utf8')).cases[0].arms.with[0].metrics;
  };
  const graders = (...passed) => passed.map((ok, i) => ({ name: `recall-0${i + 1}-f`, passed: ok }));

  it('writes recall, precision, F1 and the folder lists from the answer and truth.json; recall equals the graders', () => {
    const metrics = run(answer('```files\nm/a/x.ts\nm/z/q.ts\n```'), graders(true, false));
    assert.deepEqual(metrics, { recall: 0.5, precision: 0.5, f1: 0.5, missed: ['m/b'], extra: ['m/z'], contract: true });
  });

  it('a computed recall that differs from the graders writes the grader recall and flags the mismatch', () => {
    const metrics = run(answer('```files\nm/a/x.ts\n```'), graders(true, true));
    assert.equal(metrics.mismatch, true);
    assert.equal(metrics.recall, 1);
    assert.equal(metrics.precision, 1);
  });

  it('each run leaves a copy with the metrics at <results>/<stamp>/aggregate-result.json, the bare arm under <results>/bare/', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-own-'));
    const result = path.join(root, 'plugin.json');
    const trace = path.join(root, 't.jsonl');
    writeFileSync(trace, answer('```files\nm/a/x.ts\n```'));
    const raw = { startedAt: '2026-10-19T19:36:32.539Z', cases: [{ name: 'fe-vs-6141-navigator', arms: { with: [{ graders: graders(true, false), trace }] } }] };
    const own = path.join(root, '2026-10-19T19-36-32-539Z', 'aggregate-result.json');
    mkdirSync(path.dirname(own));
    const deps = { tracesRoot: path.join(root, 'traces'), harvest: () => {}, truthOf: () => truth, spawn: () => { writeFileSync(result, JSON.stringify(raw)); writeFileSync(own, JSON.stringify(raw)); return 0; } };
    runCase({ argv: [], env: {}, result, arm: 'plugin' }, deps);
    assert.deepEqual(JSON.parse(readFileSync(own, 'utf8')), JSON.parse(readFileSync(result, 'utf8')));
    assert.equal(JSON.parse(readFileSync(own, 'utf8')).cases[0].arms.with[0].metrics.recall, 0.5);
    rmSync(path.dirname(own), { recursive: true });
    runCase({ argv: [], env: {}, result, arm: 'bare' }, { ...deps, spawn: () => { writeFileSync(result, JSON.stringify(raw)); return 0; } });
    assert.equal(existsSync(own), false, 'the bare copy does not mix with the plugin runs');
    const bare = path.join(root, 'bare', '2026-10-19T19-36-32-539Z', 'aggregate-result.json');
    assert.equal(JSON.parse(readFileSync(bare, 'utf8')).cases[0].arms.with[0].metrics.recall, 0.5);
  });

  it('without a trace the graders give the recall alone', () => {
    assert.equal(recallOfGraders([{ name: 'files-block', passed: true }, { name: 'recall-01-a', passed: true }, { name: 'recall-02-b', passed: false }, { name: 'recall-03-c', passed: false }]), 0.333);
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

  it('every selection runs one harness call at the parallel default, the navigator cases too (they share no state)', () => {
    const jobs = (args) => plan(args).argv[plan(args).argv.indexOf('-j') + 1];
    assert.equal(jobs(['--tag', 'navigator']), '4');
    assert.equal(jobs(['--bare', '--tag', 'navigator']), '4');
    assert.equal(jobs(['--tag', 'gate']), '4');
    assert.equal(jobs([]), '4');
  });

  it('an unfiltered run lists the skill tags and so leaves the navigator cases out; the navigator tag selects only them', () => {
    const tags = (args) => plan(args).argv.flatMap((arg, at, all) => (all[at - 1] === '--tag' ? [arg] : []));
    assert.ok(tags([]).length > 0 && !tags([]).includes('navigator'));
    assert.ok(!tags(['--bare']).includes('navigator'));
    assert.deepEqual(tags(['--tag', 'navigator']), ['navigator']);
    const argv = plan(['--tag', 'navigator']).argv;
    assert.ok(!argv.includes('--allow-tools'), 'the plugin navigator arm only relays: no shell grant');
    assert.ok(plan(['--bare', '--tag', 'navigator']).argv.includes('--allow-tools'), 'the bare arm keeps its grant');
    assert.ok(plan([]).argv.includes('--allow-tools'), 'skill cases keep their grant');
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
