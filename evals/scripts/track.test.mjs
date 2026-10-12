import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { outcomeOf, rowsOf, summary } from './track.mjs';
import { buildNaked, plan, NAKED } from './run.mjs';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = (score, graders, extra = {}) => ({ score, passed: score === 1, turns: 7, costUsd: 0.4, judgeCostUsd: 0.01, durationSeconds: 30, error: null, context: { peak: 20000, final: 19000, calls: 7, tools: 6 }, graders, ...extra });
const grader = (name, passed) => ({ name, passed });

const RESULT_JSON = {
  startedAt: '2026-10-10T18:00:00.000Z',
  claudeVersion: '2.1.296',
  cases: [
    { name: 'task-fix', arms: { with: [run(0.5, [grader('red-before-green', true), grader('fix-correct', false)]), run(1, [grader('red-before-green', true), grader('fix-correct', true)])] } },
    { name: 'review-skipped', arms: { with: [run(1, [grader('no-reviewer', true)], { error: 'maximum number of turns' })] } },
  ],
};
const SHARED = { 'task-fix': [{ name: 'fix-correct', weight: 2 }, { name: 'test-added', weight: 2 }], 'review-skipped': [] };
const shared = (name) => SHARED[name] ?? [];

describe('evals history', () => {
  it('one row per case: arm, effort, mean score, cost with the judge, per-grader pass share, errored runs counted', () => {
    const rows = rowsOf(RESULT_JSON, { arm: 'plugin', model: 'm', effort: 'low', plugin: '0.5.1' });
    assert.equal(rows.length, 2);
    const task = rows[0];
    assert.equal(task.arm, 'plugin');
    assert.equal(task.effort, 'low');
    assert.equal(task.skill, 'task');
    assert.equal(task.runs, 2);
    assert.equal(task.score, 0.75);
    assert.equal(task.passed, false);
    assert.equal(task.costUsd, 0.41);
    assert.deepEqual(task.graders, { 'red-before-green': 1, 'fix-correct': 0.5 });
    assert.equal(rows[1].errors, 1);
    assert.equal(task.contextPeak, 20000);
    assert.equal(task.contextFinal, 19000);
    assert.equal(task.turns, 7, 'the raw harness value stays');
    assert.equal(task.modelCalls, 7);
    assert.equal(task.toolCalls, 6);
    assert.equal(task.perRun[0].modelCalls, 7);
    assert.equal(task.perRun[0].toolCalls, 6);
    const untraced = rowsOf({ cases: [{ name: 'x-y', arms: { with: [run(1, [], { context: undefined })] } }] })[0];
    assert.equal(untraced.modelCalls, null);
    assert.equal(untraced.toolCalls, null);
    assert.equal(rowsOf({ cases: [{ name: 'x-y', arms: { with: [run(1, [], { context: undefined })] } }] })[0].contextPeak, null, 'no trace: absent, not zero');
    assert.equal(rowsOf(RESULT_JSON, { arm: 'bare' })[0].plugin, null);
  });

  it('the outcome score is the weighted share of the shared graders the row ran; none ran is null, not zero', () => {
    const row = { case: 'task-fix', graders: { 'red-before-green': 1, 'fix-correct': 0.5 } };
    assert.equal(outcomeOf(row, [{ name: 'fix-correct', weight: 2 }, { name: 'missing', weight: 2 }]), 0.5);
    assert.equal(outcomeOf(row, []), null);
  });

  it('the summary puts the plugin outcome beside the bare score and shows the lift only for the same model and effort', () => {
    const plugin = rowsOf(RESULT_JSON, { arm: 'plugin', model: 'm', effort: 'low', plugin: '0.5.1' });
    const bare = rowsOf({ ...RESULT_JSON, cases: [{ name: 'task-fix', arms: { with: [run(0.25, [grader('fix-correct', false)], { context: { peak: 12345, final: 1, calls: 2, tools: 1 } })] } }] }, { arm: 'bare', model: 'm', effort: 'low' });
    const text = summary([...plugin, ...bare], { shared });
    assert.match(text, /\| task-fix \| 0\.75 \| 0\.5 \| 0\.25 \| \+0\.25 \| 0\.41 \| 0\.41 \| 7\/6 · 2\/1 \| 20.0 \/ 12\.3 \| fix-correct 0\.5 \|/);
    assert.match(text, /\*\*bare\*\* \[longest run, turn by turn\]\(chains\/bare-longest\.md\) · latest run .* m\/low/);
    const mismatched = summary([...plugin, ...bare.map((row) => ({ ...row, effort: 'high' }))], { shared });
    assert.match(mismatched, /\| task-fix \| 0\.75 \| 0\.5 \| 0\.25 \| — \|/);
  });

  it('a row without arm or effort reads as a plugin row at default effort, and deltas compare rows of one arm', () => {
    const old = rowsOf(RESULT_JSON, { model: 'm', plugin: '0.5.0' }).map(({ arm, effort, ...row }) => ({ ...row, score: 0.25 }));
    const text = summary([...old, ...rowsOf(RESULT_JSON, { arm: 'plugin', model: 'm', effort: 'low' })], { shared });
    assert.match(text, /\| task-fix \| 0\.75 \(\+0\.50\) \|/);
    assert.match(text, /\| review-skipped \| 1 \(\+0\.75\) \| — \| — \| — \|/);
  });

  it('an empty history renders a placeholder', () => {
    assert.match(summary([]), /No run recorded yet/);
  });
});

describe('evals drift', () => {
  const runWith = (score, metrics) => run(score, [grader('files-complete', score === 1)], { metrics });
  const RESULT = { startedAt: '2026-10-12T00:00:00.000Z', cases: [{ name: 'investigate-files', arms: { with: [
    runWith(1, { recall: 1, precision: 1, f1: 1, missed: [], extra: [], contract: true }),
    runWith(0.5, { recall: 0.5, precision: 0.5, f1: 0.5, missed: ['tests/a.test.ts'], extra: ['docs/glossary.md'], contract: true }),
    runWith(0, { recall: 0, precision: null, f1: 0, missed: ['src/a.ts'], extra: [], contract: false }),
  ] } }] };
  const version = (name) => (name === 'investigate-files' ? 2 : 1);

  it('a row keeps the case version, mean ± sd of each metric, the contract breaks, and every run', () => {
    const [row] = rowsOf(RESULT, { arm: 'plugin', model: 'm', effort: 'low', version });
    assert.equal(row.version, 2);
    assert.deepEqual(row.metrics.recall, { mean: 0.5, sd: 0.5, n: 3 });
    assert.deepEqual(row.metrics.precision, { mean: 0.75, sd: 0.354, n: 2 });
    assert.equal(row.metrics.contractBroken, 1);
    assert.equal(row.perRun.length, 3);
    assert.deepEqual(row.perRun[1].extra, ['docs/glossary.md']);
  });

  it('the Runs section lists every run with its misses and extras; a run without the section says so', () => {
    const text = summary(rowsOf(RESULT, { arm: 'plugin', model: 'm', effort: 'low', version }), { shared: () => [], version });
    assert.match(text, /### investigate-files · plugin · 3 run\(s\)/);
    assert.match(text, /recall 0\.50 ± 0\.50 · precision 0\.75 ± 0\.35 · F1 0\.50 ± 0\.50 · 1 run\(s\) without the Files section/);
    assert.match(text, /\| 2 \| 0\.5 \| 0\.5 \| 0\.5 \| 0\.5 \| 7 \| 6 \| 20\.0 \| 0\.41 \| tests\/a\.test\.ts \| docs\/glossary\.md \| files-complete \|/);
    assert.match(text, /\| 3 \| 0 \| 0 \| — \| 0 \| .* \| no Files section \|/);
  });

  it('a lift is not shown when either row is from an older case version', () => {
    const plugin = rowsOf(RESULT, { arm: 'plugin', model: 'm', effort: 'low', version });
    const bare = rowsOf(RESULT, { arm: 'bare', model: 'm', effort: 'low', version: () => 1 });
    const text = summary([...plugin, ...bare], { shared: () => [{ name: 'files-complete', weight: 1 }], version });
    assert.match(text, /\| investigate-files \| 0\.5 \| 0\.33 \| 0\.5 \| — \|/);
  });
});

describe('evals runner', () => {
  it('the plugin arm runs evals/cases against this repository at low effort by default, with filters passed through', () => {
    const { arm, argv, env, track } = plan(['--case', 'task-*', '--runs', '3']);
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
    assert.deepEqual(track.slice(2), ['--arm', 'plugin', '--model', 'claude-sonnet-5-5', '--effort', 'low']);
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
    mkdirSync(path.join(repo, 'evals', 'bare', 'one'), { recursive: true });
    writeFileSync(path.join(repo, 'evals', 'bare', 'one', 'scaffold.sh'), 'node "$(cd "$(dirname "$0")/../../.." && pwd)/fixtures/materialize.mjs" x "$PWD/repo"\n');
    const naked = path.join(repo, '.tmp', 'naked');
    buildNaked(repo, naked);
    assert.equal(JSON.parse(readFileSync(path.join(naked, '.claude-plugin', 'plugin.json'), 'utf8')).name, 'naked');
    assert.equal(readFileSync(path.join(naked, 'evals', 'bare', 'one', 'scaffold.sh'), 'utf8'), `node "${repo}/fixtures/materialize.mjs" x "$PWD/repo"\n`);
  });
});
