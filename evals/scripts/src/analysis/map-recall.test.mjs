import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mapPaths, mapRecall, regressions, requestOf } from './map-recall.mjs';

describe('map-recall: offline map check', () => {
  it('measures only localize cases: a core plan or task case shares the ticket, not the route', async () => {
    const cases = mkdtempSync(path.join(tmpdir(), 'map-recall-'));
    try {
      for (const [name, kind] of [['be-1-plan', 'plan'], ['be-1-task', 'task']]) {
        mkdirSync(path.join(cases, name), { recursive: true });
        writeFileSync(path.join(cases, name, 'prompt.with.md'), 'x');
        writeFileSync(path.join(cases, name, 'truth.json'), JSON.stringify({ kind, truth: ['src/a.ts'] }));
        writeFileSync(path.join(cases, name, 'scaffold.sh'), 'exit 9\n');
      }
      assert.deepEqual(await mapRecall({ cases }), [], 'neither is scaffolded or scored');
    } finally {
      rmSync(cases, { recursive: true, force: true });
    }
  });

  it('03b-M10: reads the request as the hook splits it', () => {
    assert.equal(requestOf('---\nname: x\n---\n\n/ambicode:investigate --headless Add "a limit"\nto  cart'), 'Add "a limit"\nto  cart');
  });

  it('reads candidate paths from a delivered map text, and none from a cut line', () => {
    const text = `[ambicode] step\nlayers: shortlist (default)\n${JSON.stringify({ terms: { pass1: ['a'], pass2: [] }, candidates: [['src/a.ts', 8, ['x']], ['src/b.ts', 2, []]], limitations: [] })}`;
    assert.deepEqual(mapPaths(text), { leads: ['src/a.ts', 'src/b.ts'] });
    assert.deepEqual(mapPaths('layers: none\n{"terms":{"pass1":'), { leads: [] });
  });

  it('03b-H5: --expect reports a lost true file and a map over its cap, by case number', () => {
    const row = (truePaths, extra = {}) => ({ name: 'c', truePaths, bytes: 900, ...extra });
    assert.deepEqual(regressions([row(['a', 'b'])], { c: { truePaths: ['a'] } }), []);
    assert.deepEqual(regressions([row(['b'])], { c: { truePaths: ['a', 'b'] } }), ['01: lost 1 true file(s)']);
    assert.deepEqual(regressions([row([], { bytes: 7000 })], {}), ['01: map 7000 B over 6144']);
  });
});
