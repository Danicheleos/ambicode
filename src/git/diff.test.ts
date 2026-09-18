import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { TempRepo } from '../testing/temp-repo.ts';
import { combineDiff, addressableLines, lineAt, parseHunks, splitPatchSections } from './diff.ts';
import { parseRawZ } from './git.ts';

// U08: added, deleted, renamed files and old/new positions, with Unicode,
// spaces and option-like names.
test('U08 diff parsing handles adversarial paths and every change kind', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/normal.ts', 'a\nb\nc\n');
  await repo.write('src/with space.ts', 'x\ny\n');
  await repo.write('src/--option-like.ts', 'q\n');
  await repo.write('src/ünicode-ß.ts', 'u\n');
  await repo.write('src/to-delete.ts', 'old\n');
  await repo.write('src/to-rename.ts', 'r1\nr2\nr3\nr4\nr5\n');
  await repo.commitAll('init');

  await repo.write('src/normal.ts', 'a\nB\nc\nd\n');
  await repo.write('src/with space.ts', 'x\ny\nz\n');
  await repo.write('src/--option-like.ts', 'q\nq2\n');
  await repo.write('src/ünicode-ß.ts', 'u\nü\n');
  await rm(path.join(repo.root, 'src/to-delete.ts'));
  await repo.run(['git', 'mv', 'src/to-rename.ts', 'src/renamed.ts']);
  await repo.write('src/added file.ts', 'new\n');
  await repo.run(['git', 'add', '-A']);

  const changes = await repo.git.rawDiff(['--cached']);
  const patch = await repo.git.patchDiff(['--cached'], 3);
  const files = combineDiff(changes, patch);

  const byPath = new Map(files.map((file) => [file.newPath ?? file.oldPath, file]));

  assert.equal(byPath.get('src/added file.ts')?.changeKind, 'added');
  assert.equal(byPath.get('src/added file.ts')?.oldPath, null);
  assert.equal(byPath.get('src/to-delete.ts')?.changeKind, 'deleted');
  assert.equal(byPath.get('src/to-delete.ts')?.newPath, null);

  const renamed = byPath.get('src/renamed.ts');
  assert.equal(renamed?.changeKind, 'renamed');
  assert.equal(renamed?.oldPath, 'src/to-rename.ts');

  // Paths that would break a shell or a path-parsing patch reader.
  assert.equal(byPath.get('src/with space.ts')?.changeKind, 'modified');
  assert.equal(byPath.get('src/--option-like.ts')?.changeKind, 'modified');
  assert.equal(byPath.get('src/ünicode-ß.ts')?.changeKind, 'modified');

  const normal = byPath.get('src/normal.ts');
  assert.ok(normal !== undefined);
  assert.equal(normal.addedLines, 2); // "B" replaces "b", and "d" is appended
  assert.equal(normal.removedLines, 1);

  // Positions: line 2 exists on both sides but holds different content.
  assert.equal(lineAt(normal, 'new', 2)?.text, 'B');
  assert.equal(lineAt(normal, 'old', 2)?.text, 'b');
  assert.equal(lineAt(normal, 'new', 4)?.text, 'd');
  assert.equal(lineAt(normal, 'new', 999), null);
  assert.ok(addressableLines(normal, 'new').has(4));
  assert.ok(!addressableLines(normal, 'new').has(999));
});

test('U08 a pure rename produces a patch section with no hunks', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('a.ts', 'one\ntwo\nthree\n');
  await repo.commitAll('init');
  await repo.run(['git', 'mv', 'a.ts', 'b.ts']);
  await repo.run(['git', 'add', '-A']);

  const files = combineDiff(await repo.git.rawDiff(['--cached']), await repo.git.patchDiff(['--cached'], 3));
  assert.equal(files.length, 1);
  assert.equal(files[0]?.changeKind, 'renamed');
  assert.equal(files[0]?.hunks.length, 0);
  assert.equal(files[0]?.addedLines, 0);
});

test('U08 raw -z records survive NUL-delimited paths', () => {
  const output =
    ':000000 100644 0000000 3e75765 A\0src/added file.ts\0' +
    ':100644 100644 0ec1772 0ec1772 R100\0old name.ts\0new name.ts\0' +
    ':100644 000000 3367afd 0000000 D\0gone.ts\0';
  assert.deepEqual(parseRawZ(output), [
    { oldPath: null, newPath: 'src/added file.ts', changeKind: 'added', oldMode: '000000', newMode: '100644' },
    { oldPath: 'old name.ts', newPath: 'new name.ts', changeKind: 'renamed', oldMode: '100644', newMode: '100644' },
    { oldPath: 'gone.ts', newPath: null, changeKind: 'deleted', oldMode: '100644', newMode: '000000' },
  ]);
});

test('U08 a patch that does not line up with the change list is an error, not a guess', () => {
  assert.throws(
    () => combineDiff([{ oldPath: 'a', newPath: 'a', changeKind: 'modified', oldMode: '1', newMode: '1' }], ''),
    /but produced 0 patch sections/,
  );
});

test('U08 hunk headers without counts mean a single line', () => {
  const hunks = parseHunks('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -3 +3 @@\n-old\n+new\n');
  assert.equal(hunks.length, 1);
  assert.equal(hunks[0]?.oldStart, 3);
  assert.equal(hunks[0]?.oldLines, 1);
  assert.deepEqual(
    hunks[0]?.lines.map((line) => [line.kind, line.oldLine, line.newLine]),
    [
      ['removed', 3, null],
      ['added', null, 3],
    ],
  );
});

test('U08 "no newline at end of file" markers are not treated as content', () => {
  const hunks = parseHunks('@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+b\n');
  assert.deepEqual(hunks[0]?.lines.map((line) => line.text), ['a', 'b']);
});

test('U08 sections split only on file headers', () => {
  const sections = splitPatchSections('diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/y b/y\n@@ -1 +1 @@\n-c\n+d\n');
  assert.equal(sections.length, 2);
  assert.ok(sections[1]?.includes('a/y'));
});
