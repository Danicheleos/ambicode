import { test } from 'node:test';
import { systemClock } from '../ports/clock.ts';
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
    clock: systemClock,
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
    clock: systemClock,
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
    clock: systemClock,
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
    requirementBytes: 0,
    promptBytes: 0,
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
    clock: systemClock,
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
  const whole = measureInput(reviewable.files, reviewable.patch, { snapshotBytes: plan.totalBytes });

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
    assert.ok(typed.details.some((detail) => detail.includes('mirrored files the reviewer can read')));
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
      // Run 21f23317 ended here: the refusal named no way out, so "ignore the
      // limit" had nothing behind it and the only route left was editing the
      // installed bundle.
      assert.ok(
        error.details.some((detail) => detail.includes('--exclude')),
        `the refusal must name the escape; got ${JSON.stringify(error.details)}`,
      );
      return true;
    },
  );
});

test('U09 a path the operator excludes leaves the review instead of blocking it', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  // MR 2677 (run 21f23317): main/assets/i18n/cs.json is 390,029 bytes against
  // the 262,144-byte per-file ceiling, so one generated translation file
  // blocked a 299-file review and no configurable limit could unblock it.
  await repo.write('src/app.ts', 'export const value = 0;\n');
  await repo.commitAll('init');
  await repo.write('src/app.ts', 'export const value = 1;\n');
  await repo.write('assets/i18n/cs.json', `{"a":"${'x'.repeat(300_000)}"}\n`);

  const resolution = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const reviewable = partitionChange(resolution.files, { exclude: ['assets/i18n/**'] });

  assert.deepEqual(reviewable.files.map((file) => file.newPath), ['src/app.ts']);
  assert.doesNotMatch(reviewable.patch, /i18n/, 'an excluded path leaves the patch too');
  const excluded = reviewable.excluded.find((entry) => entry.path === 'assets/i18n/cs.json');
  assert.ok(excluded, 'the exclusion is reported, not silent');
  assert.match(excluded.reason, /pattern/i);

  const plan = await planSnapshot({
    files: reviewable.files,
    content: resolution.content,
    includeSiblingContext: false,
  });
  assert.deepEqual(plan.changedPaths, ['src/app.ts']);

  // It also stops counting against the limits it was blocking.
  const measured = measureInput(reviewable.files, reviewable.patch, { snapshotBytes: plan.totalBytes });
  assert.equal(measured.changedFiles, 1);
  assert.doesNotThrow(() => enforceReviewInputLimits(measured, DEFAULTS.review, reviewable.files));
});

/**
 * A `ContentSource` that counts reads, because for a merge request each one is
 * a `glab` subprocess measured at 1.52s (F6). The count is the cost.
 */
function countingSource(files: Map<string, string>, tree: Map<string, string[]>) {
  const reads: string[] = [];
  const lists: string[] = [];
  return {
    reads,
    lists,
    source: {
      pinning: 'counted',
      digest: 'counted',
      async read(relativePath: string) {
        reads.push(relativePath);
        const text = files.get(relativePath);
        if (text === undefined) return null;
        const bytes = Buffer.byteLength(text, 'utf8');
        if (bytes > 262_144) return { kind: 'too-large' as const, bytes };
        return { kind: 'text' as const, text };
      },
      async list(directoryName: string) {
        lists.push(directoryName);
        return tree.get(directoryName) ?? [];
      },
    },
  };
}

function diffFile(newPath: string) {
  return {
    oldPath: newPath,
    newPath,
    changeKind: 'modified' as const,
    addedLines: 1,
    removedLines: 0,
    binary: false,
    hunks: [],
    patchSection: `--- a/${newPath}\n+++ b/${newPath}\n@@ -1 +1 @@\n-old\n+new\n`,
  };
}

test('U09 every file over the per-file ceiling is named in one refusal, not one per run', async () => {
  // Run ce05d377 paid for this twice: 15.7s to be told about
  // main/assets/i18n/cs.json, then 385.6s to be told about package-lock.json,
  // with a question to the user between them. A third was still to come.
  const huge = 'x'.repeat(300_000);
  const files = new Map([
    ['src/app.ts', 'export const a = 1;\n'],
    ['assets/i18n/cs.json', huge],
    ['package-lock.json', huge],
  ]);
  const counted = countingSource(files, new Map());

  await assert.rejects(
    () =>
      planSnapshot({
        files: [diffFile('src/app.ts'), diffFile('assets/i18n/cs.json'), diffFile('package-lock.json')],
        content: counted.source,
        includeSiblingContext: false,
      }),
    (error: Error & { code: string; details: string[] }) => {
      assert.equal(error.code, 'snapshot-too-large');
      const text = error.details.join('\n');
      assert.match(text, /assets\/i18n\/cs\.json/);
      assert.match(text, /package-lock\.json/, 'the second oversized file must be in the same refusal');
      assert.match(text, /--exclude "assets\/i18n\/cs\.json"/);
      assert.match(text, /--exclude "package-lock\.json"/);
      return true;
    },
  );

  // One pass, not one pass per oversized file.
  assert.deepEqual(counted.reads, ['src/app.ts', 'assets/i18n/cs.json', 'package-lock.json']);
});

test('U09 sibling context stops reading once it cannot use what it reads', async () => {
  // MR 2677: 181 directories holding 606 unchanged siblings, every one fetched
  // at 1.52s and most discarded for budget — 15.4 minutes of thrown-away work.
  const files = new Map<string, string>([['src/app.ts', 'export const a = 1;\n']]);
  const siblings: string[] = [];
  for (let index = 0; index < 400; index += 1) {
    const name = `src/neighbour-${index}.ts`;
    siblings.push(name);
    files.set(name, `${'// context\n'.repeat(200)}`);
  }
  const counted = countingSource(files, new Map([['src', ['src/app.ts', ...siblings]]]));

  const plan = await planSnapshot({
    files: [diffFile('src/app.ts')],
    content: counted.source,
    // Room for a handful of the 2,000-byte neighbours, not 400 of them.
    contextBudgetBytes: 20_000,
  });

  const siblingReads = counted.reads.filter((read) => read !== 'src/app.ts').length;
  assert.ok(
    siblingReads <= 120,
    `read ${siblingReads} of 400 siblings for a 20,000-byte budget; reading past the budget is the cost`,
  );
  assert.ok(plan.entries.length > 1, 'it still gathered the context that fits');
  assert.ok(
    plan.omissions.some((line) => /context/i.test(line)),
    'what it stopped short of is reported',
  );
});
