import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULTS } from '../config/defaults.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { enforceReviewInputLimits, measureInput, partitionChange } from './limits.ts';
import { buildSnapshot, planSnapshot } from './snapshot.ts';
import { resolveBranchTarget, resolveWorkingTarget } from './target.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';

test('U09 a snapshot holds the reviewed bytes even after the working file changes', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/app.ts', 'export const value = 0;\n');
  await repo.commitAll('init');
  await repo.write('src/app.ts', 'export const value = 1; // reviewed version\n');

  const resolution = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const reviewedSnapshotId = resolution.target.snapshotId;

  // Exactly the race the snapshot has to survive: the developer keeps typing,
  // or a watcher writes, after the target was resolved.
  await repo.write('src/app.ts', 'export const value = 2; // changed after resolution\n');

  const snapshot = await buildSnapshot({
    fs: nodeFileSystem,
    files: resolution.files,
    patch: resolution.patch,
    content: resolution.content,
    includeSiblingContext: false,
  });
  t.after(() => snapshot.dispose());

  const mirrored = await readFile(path.join(snapshot.filesDirectory, 'src/app.ts'), 'utf8');
  assert.match(mirrored, /reviewed version/);
  assert.doesNotMatch(mirrored, /changed after resolution/);

  // The patch, the mirrored file, and the identity all describe one state.
  const patch = await readFile(path.join(snapshot.directory, 'changed.diff'), 'utf8');
  assert.match(patch, /reviewed version/);
  assert.doesNotMatch(patch, /changed after resolution/);
  assert.equal(resolution.target.snapshotId, reviewedSnapshotId);

  // A later review of the edited tree is a different snapshot, not the same one.
  const second = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  assert.notEqual(second.target.snapshotId, reviewedSnapshotId);
});

test('U09 a branch snapshot reads committed content, not the dirty checkout', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/app.ts', 'base\n');
  await repo.commitAll('init');
  await repo.run(['git', 'checkout', '-q', '-b', 'feature']);
  await repo.write('src/app.ts', 'committed on the branch\n');
  await repo.commitAll('feature work');
  await repo.write('src/app.ts', 'uncommitted edit\n');

  const resolution = await resolveBranchTarget({
    git: repo.git,
    repositoryRoot: repo.root,
    baseRef: 'main',
  });
  const snapshot = await buildSnapshot({
    fs: nodeFileSystem,
    files: resolution.files,
    patch: resolution.patch,
    content: resolution.content,
    includeSiblingContext: false,
  });
  t.after(() => snapshot.dispose());

  const mirrored = await readFile(path.join(snapshot.filesDirectory, 'src/app.ts'), 'utf8');
  assert.equal(mirrored, 'committed on the branch\n');
  assert.ok(resolution.target.notes.some((note) => note.includes('were excluded from this review')));
});

test('U09 a snapshot never contains the working .git directory', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/app.ts', 'one\n');
  await repo.commitAll('init');
  await repo.write('src/app.ts', 'two\n');

  const resolution = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const snapshot = await buildSnapshot({
    fs: nodeFileSystem,
    files: resolution.files,
    patch: resolution.patch,
    content: resolution.content,
  });
  t.after(() => snapshot.dispose());

  assert.ok(!snapshot.directory.startsWith(repo.root), 'the snapshot lives outside the checkout');
  assert.ok(!snapshot.included.some((value) => value.startsWith('.git/')));
});

test('U09 input above a configured limit blocks the review with measured counts', () => {
  const files = Array.from({ length: 3 }, (_unused, index) => ({
    oldPath: `src/${index}.ts`,
    newPath: `src/${index}.ts`,
    changeKind: 'modified' as const,
    binary: false,
    addedLines: 40,
    removedLines: 10,
    hunks: [],
    patchSection: `diff --git a/src/${index}.ts b/src/${index}.ts\n`,
  }));
  const measured = measureInput(files, 'x'.repeat(100));

  assert.deepEqual(measured, {
    changedFiles: 3,
    changedLines: 150,
    patchBytes: 100,
    snapshotBytes: 0,
    contextBytes: 100,
  });
  assert.doesNotThrow(() => enforceReviewInputLimits(measured, DEFAULTS.review));

  try {
    enforceReviewInputLimits(measured, { ...DEFAULTS.review, maxChangedLines: 100, maxChangedFiles: 2 });
    assert.fail('expected a refusal');
  } catch (error) {
    const typed = error as Error & { code: string; details: string[] };
    assert.equal(typed.code, 'input-too-large');
    assert.ok(typed.details.some((detail) => detail.includes('changed files: 3, limit 2')));
    assert.ok(typed.details.some((detail) => detail.includes('changed lines: 150, limit 100')));
    assert.ok(typed.details.some((detail) => detail.includes('Split the change')));
  }
});

test('U09 excluded content leaves the patch, not just the mirrored tree', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/app.ts', 'export const value = 1;\n');
  await repo.commitAll('init');
  await repo.write('src/app.ts', 'export const value = 2;\n');
  await repo.write('.env', 'API_TOKEN=super-secret-value\n');
  await repo.write('node_modules/left-pad/index.js', 'module.exports = 1;\n');

  const resolution = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const reviewable = partitionChange(resolution.files);

  // The reason this matters: a file kept out of files/ but left in the diff
  // would still put its contents in front of the model.
  assert.doesNotMatch(reviewable.patch, /super-secret-value/);
  assert.doesNotMatch(reviewable.patch, /left-pad/);
  assert.match(reviewable.patch, /export const value = 2/);

  assert.deepEqual(reviewable.files.map((file) => file.newPath), ['src/app.ts']);
  assert.ok(reviewable.excluded.some((entry) => entry.path === '.env'));
  assert.ok(reviewable.excluded.some((entry) => entry.path.includes('node_modules')));

  const snapshot = await buildSnapshot({
    fs: nodeFileSystem,
    files: reviewable.files,
    patch: reviewable.patch,
    content: resolution.content,
    includeSiblingContext: false,
  });
  t.after(() => snapshot.dispose());

  const written = await readFile(path.join(snapshot.directory, 'changed.diff'), 'utf8');
  assert.doesNotMatch(written, /super-secret-value/);
  assert.deepEqual(snapshot.included, ['src/app.ts']);
});

test('U09 the mirrored files count against the context limit, not just the patch', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  // A tiny edit to a big file: the patch is a few bytes, but the reviewer is
  // handed the whole file. A limit that only measured the patch would pass this
  // through and put 40 KiB of context in front of the model.
  const body = `${'// filler\n'.repeat(4000)}export const value = 0;\n`;
  await repo.write('src/big.ts', body);
  await repo.commitAll('init');
  await repo.write('src/big.ts', body.replace('value = 0', 'value = 1'));

  const resolution = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const reviewable = partitionChange(resolution.files);
  const plan = await planSnapshot({
    files: reviewable.files,
    content: resolution.content,
    includeSiblingContext: false,
  });

  const patchOnly = measureInput(reviewable.files, reviewable.patch);
  const whole = measureInput(reviewable.files, reviewable.patch, plan.totalBytes);

  assert.ok(patchOnly.contextBytes < 2_000, 'the patch alone is small');
  assert.ok(whole.contextBytes > 40_000, 'what the reviewer actually receives is not');

  const limits = { ...DEFAULTS.review, maxContextBytes: 10_000 };
  assert.doesNotThrow(() => enforceReviewInputLimits(patchOnly, limits));
  try {
    enforceReviewInputLimits(whole, limits, reviewable.files);
    assert.fail('expected a refusal');
  } catch (error) {
    const typed = error as Error & { code: string; details: string[] };
    assert.equal(typed.code, 'input-too-large');
    assert.ok(typed.details.some((detail) => detail.includes('in the mirrored files')));
  }
});

test('U09 sibling context is trimmed to the budget instead of refusing the change', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/app.ts', 'export const value = 0;\n');
  for (const index of [0, 1, 2]) {
    await repo.write(`src/neighbour-${index}.ts`, `${'// context\n'.repeat(500)}`);
  }
  await repo.commitAll('init');
  await repo.write('src/app.ts', 'export const value = 1; // edited\n');

  const resolution = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const reviewable = partitionChange(resolution.files);
  assert.deepEqual(reviewable.files.map((file) => file.newPath), ['src/app.ts']);

  const unbounded = await planSnapshot({ files: reviewable.files, content: resolution.content });
  assert.deepEqual(unbounded.entries.map((entry) => entry.path), [
    'src/app.ts',
    'src/neighbour-0.ts',
    'src/neighbour-1.ts',
    'src/neighbour-2.ts',
  ]);

  // Only the changed file fits. The change itself is never dropped; the
  // discretionary context is, and the omission says so.
  const trimmed = await planSnapshot({
    files: reviewable.files,
    content: resolution.content,
    contextBudgetBytes: 0,
  });

  assert.deepEqual(trimmed.entries.map((entry) => entry.path), ['src/app.ts']);
  assert.ok(trimmed.totalBytes < unbounded.totalBytes);
  assert.ok(
    trimmed.omissions.some((line) => line.includes('over its configured input limit')),
    'the trimmed context is named, not silently missing',
  );
  assert.ok(trimmed.omissions.some((line) => line.includes('The change itself is complete')));
});

test('U09 an unchanged lockfile is not context, but a changed one is still reviewed', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/app.ts', 'export const value = 0;\n');
  await repo.write('package-lock.json', `{"packages": ${JSON.stringify('x'.repeat(50_000))}}\n`);
  await repo.commitAll('init');
  await repo.write('src/app.ts', 'export const value = 1; // edited\n');

  const sourceOnly = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const context = await planSnapshot({
    files: partitionChange(sourceOnly.files).files,
    content: sourceOnly.content,
  });

  // It would otherwise be the largest thing the reviewer is handed, and it says
  // nothing about the change.
  assert.ok(!context.entries.some((entry) => entry.path === 'package-lock.json'));
  assert.ok(context.totalBytes < 1_000);

  // Changing it is a different matter: that is reviewable evidence (doc 02).
  await repo.write('package-lock.json', `{"packages": ${JSON.stringify('y'.repeat(50_000))}}\n`);
  const withChange = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const changed = await planSnapshot({
    files: partitionChange(withChange.files).files,
    content: withChange.content,
  });

  assert.ok(changed.entries.some((entry) => entry.path === 'package-lock.json'));
});

test('U09 a changed file that will not fit blocks the review instead of being omitted', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/small.ts', 'export const a = 0;\n');
  await repo.commitAll('init');
  await repo.write('src/small.ts', 'export const a = 1;\n');
  await repo.write('src/huge.ts', `${'// x\n'.repeat(80_000)}export const b = 0;\n`);

  const resolution = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const reviewable = partitionChange(resolution.files);

  // Mirroring src/small.ts and dropping src/huge.ts would report on part of a
  // change as if it were the whole one.
  await assert.rejects(
    () => planSnapshot({ files: reviewable.files, content: resolution.content, includeSiblingContext: false }),
    (error: Error & { code: string; details: string[] }) => {
      assert.equal(error.code, 'snapshot-too-large');
      assert.ok(error.details.some((detail) => detail.includes('src/huge.ts')));
      assert.ok(error.details.some((detail) => detail.includes('not configurable')));
      assert.ok(error.details.some((detail) => detail.includes('does not review part of a change')));
      return true;
    },
  );
});
