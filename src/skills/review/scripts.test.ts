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
  it('mr-diff names the project and iid from the URL, and refuses a URL that is not a merge request', () => {
    const ok = run('mr-diff', { args: { target: { mr: 'https://gitlab.example.com/g/sub/p/-/merge_requests/7/diffs' } } });
    assert.match(ok['payload'], /project "g\/sub\/p", merge request 7/);
    assert.equal(run('mr-diff', { args: { target: { mr: 'https://gitlab.example.com/g/p/-/issues/3' } } })['failed'].code, 'bad-argument');
  });

  it('brief lists the new-side and old-side lines each hunk shows, the policy text and the requirements', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ambicode-brief-'));
    try {
      const taskDir = path.join(root, '.ambicode', 'task', 't');
      const reviewDir = path.join(root, '.ambicode', 'reviews', 'r1');
      const snapshot = path.join(root, 'snap');
      await mkdir(path.join(taskDir, 'steps'), { recursive: true });
      await mkdir(reviewDir, { recursive: true });
      await mkdir(snapshot, { recursive: true });
      const patch = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -3,3 +3,4 @@\n keep\n-old\n+new\n+more\n keep2\n';
      await writeFile(path.join(snapshot, 'changed.diff'), patch);
      await writeFile(path.join(reviewDir, 'snapshot-path.txt'), `${snapshot}\n`);
      await writeFile(path.join(reviewDir, 'result.json'), JSON.stringify({ reviewId: 'r1', target: { kind: 'working', snapshotId: 'w-1' }, requirements: [{ id: 'ORD-1', title: 'Totals', content: 'Sum them.' }], checks: [] }));
      await writeFile(path.join(taskDir, 'ledger.jsonl'), `${JSON.stringify({ kind: 'review', result: path.relative(root, path.join(reviewDir, 'result.json')) })}\n`);
      await writeFile(path.join(taskDir, 'steps', 'payload-x-policy-before-work.txt'), 'RULE no-eval: never eval.');
      const out = run('brief', { repositoryRoot: root, taskDir, steps: path.join(taskDir, 'steps') });
      assert.equal(out['payload'], null);
      const brief = await readFile(path.join(reviewDir, 'brief.md'), 'utf8');
      assert.match(brief, /### a\.ts \[modified\]\nnew-side lines: 3-6\nold-side lines: 3-5/);
      assert.match(brief, /RULE no-eval: never eval\./);
      assert.match(brief, /### ORD-1: Totals\nSum them\./);
      assert.match(brief, /\(no check ran\)/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
