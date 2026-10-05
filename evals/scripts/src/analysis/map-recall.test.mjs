import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapPaths, requestOf } from './map-recall.mjs';

describe('map-recall: offline map check', () => {
  it('03b-M10: reads the request as the hook splits it, and the paths a leads text lists', () => {
    assert.equal(requestOf('---\nname: x\n---\n\n/ambicode:investigate --headless Add "a limit"\nto  cart'), 'Add a limit to cart');
    const text = 'Leads from the terms a:\n1. src/a/one.ts — x\n2. src/a/two.ts\nSame feature (src/a/): one.spec.ts, m/a.mocks.ts, …\nDeclared more than once: X.';
    assert.deepEqual(mapPaths(text), { leads: ['src/a/one.ts', 'src/a/two.ts'], feature: ['src/a/one.spec.ts', 'src/a/m/a.mocks.ts'] });
  });
});
