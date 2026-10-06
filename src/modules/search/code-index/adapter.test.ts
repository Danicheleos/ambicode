import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatIndexStatus, indexAdapterFor, indexStatus, ledgerIndex } from './adapter.ts';
import type { IndexState } from '#types/modules/search';

const deps = (index?: string) => ({ runtime: { fs: {} }, repositoryRoot: '/r', config: { search: index === undefined ? {} : { index } } }) as never;
const project = { id: 'app', root: '.', ecosystem: 'typescript', commands: {} } as never;

describe('05-A1 indexAdapterFor', () => {
  it('05-A1: none or absent gives the none adapter, codeindex gives the codeindex adapter', () => {
    const rows: [string | undefined, string][] = [['none', 'none'], [undefined, 'none'], ['codeindex', 'codeindex']];
    for (const [index, expected] of rows) assert.equal(indexAdapterFor(deps(index), project).name, expected, String(index));
  });
});

describe('05-A2 formatIndexStatus', () => {
  it('05-A2: every state has its line; fresh is state === fresh', () => {
    const rows: [IndexState, number | null, string | null, string][] = [
      ['none', null, null, 'index: none'],
      ['fresh', 5700, null, 'index: codeindex fresh (built in 5700 ms)'],
      ['stale', 12, null, 'index: codeindex stale (built in 12 ms)'],
      ['building', null, null, 'index: building'],
      ['absent', null, null, 'index: absent'],
      ['error', null, 'codeindex not found', 'index: error (codeindex not found)'],
    ];
    for (const [state, builtMs, reason, line] of rows) {
      const status = indexStatus(state === 'none' ? 'none' : 'codeindex', state, builtMs, reason);
      assert.equal(formatIndexStatus(status), line);
      assert.equal(status.fresh, state === 'fresh');
    }
  });

  it('05-B3: a nonzero drift is printed before the build time', () => {
    assert.equal(formatIndexStatus(indexStatus('codeindex', 'fresh', 900, null, 3)), 'index: codeindex fresh (drift 3 files, built in 900 ms)');
    assert.equal(formatIndexStatus(indexStatus('codeindex', 'stale', null, null, 40)), 'index: codeindex stale (drift 40 files)');
  });

  it('05-M4: the ledger index is "none" for the none tool, else the status without its reason', () => {
    assert.equal(ledgerIndex(indexStatus('none', 'none')), 'none');
    assert.deepEqual(ledgerIndex(indexStatus('codeindex', 'stale', 9, 'x')), { tool: 'codeindex', state: 'stale', fresh: false, builtMs: 9 });
  });
});
