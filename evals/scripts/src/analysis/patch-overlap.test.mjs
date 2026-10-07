import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hunkRecall, identifierRecall, parsePatch, patchPaths } from './patch-overlap.mjs';

const modify = (file, start, removed, added, context = ['  keep();']) =>
  `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -${start},${removed.length + context.length} +${start},${added.length + context.length} @@\n${context.map((l) => ` ${l}`).join('\n')}\n${removed.map((l) => `-${l}`).join('\n')}\n${added.map((l) => `+${l}`).join('\n')}\n`;
const create = (file, added) => `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${added.length} @@\n${added.map((l) => `+${l}`).join('\n')}\n`;
const remove = (file) => `diff --git a/${file} b/${file}\ndeleted file mode 100644\n--- a/${file}\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone();\n`;

describe('patch-overlap', () => {
  it('parses files, base-side hunk ranges and line kinds; a deleted file keeps its old path', () => {
    const files = parsePatch(modify('src/a.ts', 10, ['old();'], ['orderTotal();']) + create('src/new.ts', ['x']) + remove('src/old.ts'));
    assert.deepEqual(files.map((f) => [f.file, f.created, f.deleted]), [['src/a.ts', false, false], ['src/new.ts', true, false], ['src/old.ts', false, true]]);
    assert.deepEqual(files[0].hunks, [{ start: 10, count: 2 }]);
    assert.deepEqual([files[0].added, files[0].removed, files[0].context], [['orderTotal();'], ['old();'], ['  keep();']]);
    assert.deepEqual(patchPaths(modify('src/a.ts', 1, ['a'], ['b']) + modify('src/a.ts', 50, ['c'], ['d'])), ['src/a.ts']);
    assert.deepEqual(parsePatch(''), []);
    const quoted = 'diff --git "a/caf\\303\\251 \\"x\\".ts" "b/caf\\303\\251 \\"x\\".ts"\n--- "a/caf\\303\\251 \\"x\\".ts"\n+++ "b/caf\\303\\251 \\"x\\".ts"\n@@ -1 +1 @@\n-a\n+b\n';
    assert.deepEqual(patchPaths(quoted + modify('src/x.ts', 1, ['a'], ['b'])), ['café "x".ts', 'src/x.ts'], 'a git-quoted path is read, not skipped');
  });

  it('hunk recall: the same file near the same base lines counts; a far hunk or another file does not', () => {
    const oracle = modify('src/a.ts', 10, ['x'], ['y']) + modify('src/b.ts', 100, ['x'], ['y']) + create('src/new.ts', ['z']);
    assert.deepEqual(hunkRecall(oracle, oracle), { recall: 1, hit: 3, total: 3 });
    const near = modify('src/a.ts', 14, ['x'], ['w']) + modify('src/b.ts', 300, ['x'], ['w']) + create('src/new.ts', ['other']);
    assert.deepEqual(hunkRecall(oracle, near), { recall: 2 / 3, hit: 2, total: 3 }, 'a.ts within the slack and the created file count; b.ts 200 lines off does not');
    assert.deepEqual(hunkRecall(oracle, ''), { recall: 0, hit: 0, total: 3 });
    assert.equal(hunkRecall('', oracle).recall, null, 'nothing to reproduce is unmeasured, not perfect');
  });

  it('identifier recall: only compound identifiers the merged patch introduces', () => {
    const oracle = modify('src/a.ts', 1, ['legacyName();'], ['const orderTotal = computeTotal(legacyName);', 'return MAX_ITEMS;'], ['keepThis();']);
    assert.deepEqual(identifierRecall(oracle, oracle), { recall: 1, hit: 3, total: 3 }, 'orderTotal, computeTotal, MAX_ITEMS; const/return are words, legacyName was there already');
    assert.deepEqual(identifierRecall(oracle, modify('src/z.ts', 1, [], ['let orderTotal = 0;'])), { recall: 1 / 3, hit: 1, total: 3 });
    assert.equal(identifierRecall(modify('src/a.ts', 1, ['x'], ['return value;']), oracle).recall, null);
  });
});
