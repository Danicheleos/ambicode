import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapPaths, regressions, requestOf } from './map-recall.mjs';

describe('map-recall: offline map check', () => {
  it('03b-M10: reads the request as the hook splits it, and the paths a leads text lists', () => {
    assert.equal(requestOf('---\nname: x\n---\n\n/ambicode:investigate --headless Add "a limit"\nto  cart'), 'Add "a limit"\nto  cart');
    const text = 'Leads from the terms a:\n1. src/a/one.ts:12 — x\n2. src/a/two.ts\nSame feature (src/a/): one.spec.ts, m/a.mocks.ts, …\nDeclared more than once: X.';
    assert.deepEqual(mapPaths(text), { leads: ['src/a/one.ts', 'src/a/two.ts'], feature: ['src/a/one.spec.ts', 'src/a/m/a.mocks.ts'] });
    assert.deepEqual(mapPaths('Leads from the terms x:\n1. src/r/issues.py:3 — y\nSame feature "issue": src/d/issue.py, tests/issues/t.py, …').feature, ['src/d/issue.py', 'tests/issues/t.py'], '03b-H9: named form');
  });

  it('03b-H5: --expect reports a lost true file and a text over its cap, by case number', () => {
    const row = (truePaths, extra = {}) => ({ name: 'c', truePaths, leadBytes: 900, featureBytes: 100, ...extra });
    assert.deepEqual(regressions([row(['a', 'b'])], { c: { truePaths: ['a'] } }), []);
    assert.deepEqual(regressions([row(['b'])], { c: { truePaths: ['a', 'b'] } }), ['01: lost 1 true file(s)']);
    assert.deepEqual(regressions([row([], { leadBytes: 1300, featureBytes: 450 })], {}), ['01: leads 1300 B over 1200', '01: feature line 450 B over 400']);
  });
});
