import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REPO_ROOT } from '#testing/paths';

const run = (name: string, input: Record<string, unknown>): Record<string, any> => {
  const out = spawnSync(process.execPath, [path.join(REPO_ROOT, 'skills', 'review', 'scripts', `${name}.mjs`)], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return JSON.parse(out.stdout);
};

describe('review scripts (C7)', () => {
  it('brief lists the new-side and old-side lines each hunk shows, the policy text, the requirements and the check entries of the task', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ambicode-brief-'));
    try {
      const taskDir = path.join(root, '.ambicode', 'tasks', 't');
      const reviewDir = path.join(root, '.ambicode', 'reviews', 'r1');
      await mkdir(path.join(taskDir, 'steps'), { recursive: true });
      await mkdir(reviewDir, { recursive: true });
      const patch = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -3,3 +3,4 @@\n keep\n-old\n+new\n+more\n keep2\n';
      await writeFile(path.join(reviewDir, 'changed.diff'), patch);
      await writeFile(path.join(reviewDir, 'result.json'), JSON.stringify({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [{ id: 'ORD-1', title: 'Totals', content: 'Sum them.' }], checks: [] }));
      const ledger = (...extra: object[]) => [{ kind: 'review', result: path.relative(root, path.join(reviewDir, 'result.json')) }, ...extra].map((entry) => JSON.stringify(entry)).join('\n');
      await writeFile(path.join(taskDir, 'ledger.jsonl'), `${ledger()}\n`);
      await writeFile(path.join(taskDir, 'steps', 'x-policy-before-work-review.md'), 'RULE no-eval: never eval.');
      const out = run('brief', { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') });
      assert.equal(out['payload'], `brief: ${path.join(reviewDir, 'brief.md')}\nanswer: ${path.join(reviewDir, 'answer.json')}`);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(brief, /### a\.ts \[modified\]\nnew-side lines: 3-6\nold-side lines: 3-5/);
      assert.match(brief, /RULE no-eval: never eval\./);
      assert.doesNotMatch(brief, /changed\.diff/);
      assert.match(brief, /## Project conventions\n\nSource: .*conventions\.md\n\n\(none recorded\)/);
      assert.match(brief, /### ORD-1: Totals\nSum them\./);
      assert.match(brief, /No check recorded for this task: nothing was verified by execution\. That is a gap, not a pass\./);

      await writeFile(path.join(taskDir, 'ledger.jsonl'), `${ledger({ kind: 'check', key: 'app/unit', phase: 'red', exit: 1, files: ['a.spec.ts'] }, { kind: 'check', key: 'app/unit', phase: 'green', exit: 0, files: ['a.spec.ts'] })}\n`);
      run('brief', { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') });
      const withChecks = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(withChecks, /- app\/unit: passed; on: a\.spec\.ts/);
      assert.doesNotMatch(withChecks, /exit 1/, 'the red run the green run replaced is stale');
      assert.doesNotMatch(withChecks, /No check recorded/);

      await mkdir(path.join(root, '.ambicode', 'context'), { recursive: true });
      await writeFile(path.join(root, '.ambicode', 'context', 'conventions.md'), '## Errors\nMoney goes through toCents().');
      run('brief', { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') });
      const withConventions = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(withConventions, /## Project conventions\n\nSource: .*conventions\.md\n\n#### Errors\nMoney goes through toCents\(\)\.\n\n## Requirements/, 'the file\'s headings nest under the section');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  const fixture = async (result: Record<string, unknown> | null) => {
    const root = await mkdtemp(path.join(tmpdir(), 'ambicode-brief-'));
    const taskDir = path.join(root, '.ambicode', 'tasks', 't');
    const reviewDir = path.join(root, '.ambicode', 'reviews', 'r1');
    await mkdir(path.join(taskDir, 'steps'), { recursive: true });
    await mkdir(reviewDir, { recursive: true });
    await writeFile(path.join(reviewDir, 'changed.diff'), 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n');
    const entries = result === null ? [] : [{ kind: 'review', result: path.relative(root, path.join(reviewDir, 'result.json')) }];
    if (result !== null) await writeFile(path.join(reviewDir, 'result.json'), JSON.stringify(result));
    await writeFile(path.join(taskDir, 'ledger.jsonl'), entries.map((entry) => JSON.stringify(entry)).join('\n'));
    return { root, reviewDir, input: { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') } };
  };

  it('brief with no review on record fails review-missing instead of delivering nothing', async () => {
    const { root, reviewDir, input } = await fixture(null);
    try {
      assert.deepEqual(run('brief', input), { failed: { code: 'review-missing', message: 'no review on record for this task; nothing to brief' } });
      await assert.rejects(readFile(path.join(reviewDir, 'brief.md')));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief numbers every diff line with its file line: the new side for added and context lines, the old side for removed ones', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      await writeFile(path.join(reviewDir, 'changed.diff'), 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -3,3 +3,4 @@\n keep\n-old\n+new\n+more\n keep2\n@@ -40 +41 @@\n-x\n+y\n');
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.ok(brief.includes('\n 3  keep\n 4 -old\n 4 +new\n 5 +more\n 6  keep2\n@@ -40 +41 @@\n40 -x\n41 +y\n'), brief);
      assert.equal(await readFile(path.join(reviewDir, 'changed.diff'), 'utf8').then((text) => text.startsWith('diff --git a/a.ts')), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('brief lists only the checks of the reviewed route, the latest run per key, named by outcome', async () => {
    const { root, reviewDir, input } = await fixture({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [], checks: [] });
    try {
      const check = (route: string, key: string, exit: number) => ({ kind: 'check', route, key, phase: 'green', exit, files: [] });
      const lines = [
        check('r-old', 'app/stale', 1),
        check('r-now', 'app/unit', 1), check('r-now', 'app/lint', 1), check('r-now', 'app/unit', 0),
        { kind: 'review', route: 'r-now', result: path.relative(root, path.join(reviewDir, 'result.json')) },
      ];
      await writeFile(path.join(input.taskDir, 'ledger.jsonl'), `${lines.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
      run('brief', input);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(brief, /- app\/unit: passed/);
      assert.match(brief, /- app\/lint: FAILED \(exit 1\)/);
      assert.doesNotMatch(brief, /app\/stale|app\/unit[^\n]*exit 1|green: exit/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
