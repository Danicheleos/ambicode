import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { addressableLines } from '#platform/git/diff';
import { resolveCapturedTarget } from './target.ts';
import { MR_DIFF_JSON, MR_DIFF_PATCH } from './mr-capture.ts';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import type { Workspace } from '#types/composition';

const PATCH = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n keep\n-old\n+new\ndiff --git a/src/b.ts b/src/b.ts\n--- /dev/null\n+++ b/src/b.ts\n@@ -0,0 +1 @@\n+x\n';
const URL_MR = 'https://gitlab.example.com/g/p/-/merge_requests/7';

async function setup(t: { after(fn: () => Promise<void>): void }, meta: object = {}) {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());
  await repo.write('src/a.ts', 'keep\nnew\n');
  await repo.commitAll('head');
  const reviews = taskDirFor(repo.root, 't').reviews;
  await repo.write(path.relative(repo.root, path.join(reviews, MR_DIFF_PATCH)), PATCH);
  await repo.write(path.relative(repo.root, path.join(reviews, MR_DIFF_JSON)), JSON.stringify(meta));
  const workspace = { runtime: { fs: (await import('#platform/ports/filesystem')).nodeFileSystem }, git: repo.git, repositoryRoot: repo.root } as unknown as Workspace;
  return { repo, workspace };
}

test('a captured diff resolves to a merge-request target with addressable lines', async (t) => {
  const { workspace } = await setup(t);
  const resolved = await resolveCapturedTarget({ workspace, task: 't', url: URL_MR });
  assert.equal(resolved.target.kind, 'merge-request');
  assert.deepEqual(resolved.files.map((file) => [file.oldPath, file.newPath, file.changeKind]), [['src/a.ts', 'src/a.ts', 'modified'], [null, 'src/b.ts', 'added']]);
  assert.deepEqual([...addressableLines(resolved.files[0]!, 'new')], [1, 2]);
  assert.equal(await resolved.content.read('src/a.ts'), null);
  assert.match(resolved.target.notes.join('\n'), /File content not available locally; the reviewer sees the diff only/);
});

test('a captured head sha that exists locally pins the file content to it', async (t) => {
  const { repo, workspace } = await setup(t);
  const sha = await repo.git.revParse('HEAD');
  await repo.write(path.relative(repo.root, path.join(taskDirFor(repo.root, 't').reviews, MR_DIFF_JSON)), JSON.stringify({ sha }));
  const resolved = await resolveCapturedTarget({ workspace, task: 't', url: URL_MR });
  assert.equal(resolved.target.headSha, sha);
  assert.deepEqual(await resolved.content.read('src/a.ts'), { kind: 'text', text: 'keep\nnew\n' });
});

test('no capture on disk is mr-diff-missing, naming the MCP call and route next', async (t) => {
  const { workspace } = await setup(t);
  for (const task of ['absent', null]) {
    await assert.rejects(resolveCapturedTarget({ workspace, task, url: URL_MR }), (error: { code: string; details?: string[] }) => error.code === 'mr-diff-missing' && /GitLab MCP server.*route next/.test((error.details ?? []).join(' ')));
  }
});
