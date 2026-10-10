import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rowsOf, summary } from './track.mjs';
import { harnessArgv, RESULT } from './run.mjs';

const run = (score, graders, extra = {}) => ({ score, passed: score === 1, turns: 7, costUsd: 0.4, judgeCostUsd: 0.01, durationSeconds: 30, error: null, graders, ...extra });
const grader = (name, passed) => ({ name, passed });

const RESULT_JSON = {
  startedAt: '2026-10-10T18:00:00.000Z',
  claudeVersion: '2.1.296',
  cases: [
    { name: 'task-fix', arms: { with: [run(0.5, [grader('red-before-green', true), grader('fix-correct', false)]), run(1, [grader('red-before-green', true), grader('fix-correct', true)])] } },
    { name: 'review-skipped', arms: { with: [run(1, [grader('no-reviewer', true)], { error: 'maximum number of turns' })] } },
  ],
};

describe('evals history', () => {
  it('one row per case: mean score, cost with the judge, per-grader pass share, errored runs counted', () => {
    const rows = rowsOf(RESULT_JSON, { model: 'm', plugin: '0.5.1' });
    assert.equal(rows.length, 2);
    const task = rows[0];
    assert.equal(task.skill, 'task');
    assert.equal(task.runs, 2);
    assert.equal(task.score, 0.75);
    assert.equal(task.passed, false);
    assert.equal(task.costUsd, 0.41);
    assert.deepEqual(task.graders, { 'red-before-green': 1, 'fix-correct': 0.5 });
    assert.equal(rows[1].errors, 1);
    assert.equal(rows[1].at, '2026-10-10T18:00:00.000Z');
  });

  it('the summary shows the latest row per case with the delta against the previous one and names failing graders', () => {
    const earlier = rowsOf({ ...RESULT_JSON, startedAt: '2026-10-09T18:00:00.000Z' }, { model: 'm', plugin: '0.5.0' }).map((row) => ({ ...row, score: 0.25, costUsd: 0.5 }));
    const latest = rowsOf(RESULT_JSON, { model: 'm', plugin: '0.5.1' });
    const text = summary([...earlier, ...latest]);
    assert.match(text, /## task\n/);
    assert.match(text, /\| task-fix \| 0\.75 \(\+0\.50\) \| 0\.41 \(-0\.09\) \| 7 \| 2 \| fix-correct 0\.5 \|/);
    assert.match(text, /\| review-skipped \| 1 \(\+0\.75\) \| .* \| 1 \(1 errored\) \| — \|/);
    assert.match(text, /2 case\(s\) · mean score 0\.88/);
  });

  it('an empty history renders a placeholder', () => {
    assert.match(summary([]), /No run recorded yet/);
  });

  it('the runner pins the eval dir, scaffolding, tool grants and the result path, and passes filters through', () => {
    const { argv, model } = harnessArgv(['--case', 'task-*', '--runs', '3']);
    assert.equal(model, 'claude-sonnet-5-5');
    assert.deepEqual(argv.slice(0, 5), ['plugin', 'eval', '.', '--eval-dir', 'evals/cases']);
    assert.ok(argv.includes('--scaffold') && argv.includes('--trust-plugin') && argv.includes('--no-publish'));
    assert.equal(argv[argv.indexOf('--runs') + 1], '3');
    assert.equal(argv[argv.indexOf('--case') + 1], 'task-*');
    assert.equal(argv[argv.indexOf('--json') + 1], RESULT);
    assert.ok(!argv.includes('--tag'));
  });
});
