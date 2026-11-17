import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANCESTOR_SHARE, ancestorShares, folderTruth, scoreFolders, ticketOf } from './folder-truth.mjs';

describe('folder truth helpers', () => {
  it('a companion-only directory becomes a directory item; a directory with a logic file stays a file item', () => {
    assert.deepEqual(folderTruth(['a/x.component.html', 'a/x.component.scss', 'a/y.spec.ts', 'b/c.ts', 'b/c.component.html', 'i18n/en.json', 'a/i18n/en.json']), ['a/', 'b/c.ts']);
  });

  it('scoreFolders: folders are covered by files, folders below, or accepted ancestors; extra and the no-list contract follow metrics.mjs', () => {
    const truth = { relevant: ['m/a/x.ts', 'm/b/'], allowed: ['m/c/y.ts'], ancestorShare: 0.5, ancestors: { m: { relevant: 1, total: 4 }, 'm/a': { relevant: 1, total: 2 }, q: { relevant: 2, total: 2 } } };
    assert.deepEqual(scoreFolders(truth, ['m/a/other.ts', 'm/b/deep/z.ts']), { recall: 1, precision: 1, f1: 1, missed: [], extra: [], contract: true });
    assert.deepEqual(scoreFolders(truth, ['m/z.ts']), { recall: 0, precision: 0, f1: 0, missed: ['m/a', 'm/b'], extra: ['m'], contract: true }, 'an ancestor below the share covers nothing');
    assert.equal(scoreFolders({ ...truth, ancestorShare: 0.25 }, ['m/z.ts']).recall, 1, 'exactly the share');
    assert.equal(scoreFolders({ ...truth, ancestors: {} }, ['m/z.ts']).recall, 0, 'absent from the map');
    const shipped = (relevant, total) => scoreFolders({ ...truth, ancestorShare: ANCESTOR_SHARE, ancestors: { m: { relevant, total } } }, ['m/z.ts']).recall;
    assert.deepEqual([shipped(3, 10), shipped(2, 7)], [1, 0], 'the shipped share is 0.3: 3/10 counts, 2/7 does not');
    assert.deepEqual(scoreFolders(truth, ['m/a/x.ts', 'm/c/y.ts', 'm/d/z.ts']), { recall: 0.5, precision: 0.667, f1: 0.572, missed: ['m/b'], extra: ['m/d'], contract: true }, 'allowed folder is correct, sibling is extra');
    assert.deepEqual(scoreFolders(truth, null), { recall: 0, precision: null, f1: 0, missed: ['m/a', 'm/b'], extra: [], contract: false });
    assert.deepEqual(scoreFolders(truth, ['package.json']), { recall: 0, precision: null, f1: 0, missed: ['m/a', 'm/b'], extra: [], contract: true }, 'a top-level file is no folder');
  });

  it('ancestor shares count source folders: one big folder does not outweigh several small relevant ones', () => {
    const big = Array.from({ length: 50 }, (_, i) => `big/f${i}.ts`);
    const bench = [...big, 'big/one/a.ts', 'big/two/b.ts', 'big/three/c.ts', 'big/spec/x.spec.ts', 'big/tpl/t.component.html'];
    // Files: 3 of 54 relevant. Folders: big, one, two, three hold logic files; the template and spec folders do not count; 3 of 4 covered.
    assert.deepEqual(ancestorShares(['big/one/a.ts', 'big/two/b.ts', 'big/three/c.ts'], bench), { big: { relevant: 3, total: 4 } });
    assert.deepEqual(ancestorShares(['big/one/a.ts', 'big/two/b.ts'], bench), { big: { relevant: 2, total: 4 } }, 'exactly half');
    assert.deepEqual(ancestorShares(['big/one/a.ts'], []), { big: { relevant: 0, total: 0 } }, 'an empty ancestor');
    assert.deepEqual(ancestorShares(['big/one/'], ['big/one/deep/q.ts', 'big/f.ts']), { big: { relevant: 1, total: 2 } }, 'below a directory item is covered');
  });
});
