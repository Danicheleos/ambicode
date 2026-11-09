import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileStage, requestOf, rowsAbove } from './map-funnel.mjs';

const row = (file, score) => ({ path: file, score, reasons: [] });
/** A pool of seven files: two printed, one cut by bytes, one spread loss, one floor loss, plus a spec folded into the first row and one folded with no source. */
const map = {
  pool: [row('a/one.ts', 10), row('b/two.ts', 8), row('c/three.ts', 6), row('a/four.ts', 5), row('d/five.ts', 0.5)],
  candidates: [row('a/one.ts', 10), row('b/two.ts', 8)],
  debug: { folded: { 'a/one.spec.ts': 'a/one.ts', 'z/lonely.spec.ts': null }, spreadDropped: ['a/four.ts'], floorDropped: ['d/five.ts'] },
};

test('fileStage names the stage of every file of a map', () => {
  assert.deepEqual(fileStage('a/one.ts', map), { stage: 'printed', row: 1, rank: 1, score: 10, into: null });
  assert.deepEqual(fileStage('c/three.ts', map), { stage: 'cut', row: null, rank: 3, score: 6, into: null });
  assert.equal(fileStage('a/four.ts', map).stage, 'spread');
  assert.equal(fileStage('d/five.ts', map).stage, 'floor');
  assert.deepEqual(fileStage('nowhere.ts', map), { stage: 'absent', row: null, rank: null, score: null, into: null });
});

test('fileStage reports a folded companion with the row it merged into, or none when its folder had no source', () => {
  assert.deepEqual(fileStage('a/one.spec.ts', map), { stage: 'folded', into: 'a/one.ts', row: 1, rank: 1, score: 10 });
  assert.deepEqual(fileStage('z/lonely.spec.ts', map), { stage: 'folded', into: null, row: null, rank: null, score: null });
});

test('rowsAbove lists the printed rows ranked above a cut file', () => {
  assert.deepEqual(rowsAbove('c/three.ts', map).map((entry) => entry.row), [1, 2]);
  assert.deepEqual(rowsAbove('nowhere.ts', map), []);
});

test('requestOf rebuilds the plan route string: title, newline, content, sources joined by a newline', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'funnel-req-'));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'request.aa.json'), JSON.stringify({ key: 'request', content: 'plain text' }));
    writeFileSync(path.join(dir, 'VS-1.bb.json'), JSON.stringify({ key: 'VS-1', content: JSON.stringify({ fields: { summary: 'Fix it' } }) }));
    assert.equal(requestOf(dir), `Fix it\n{"fields":{"summary":"Fix it"}}\nrequest\nplain text`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
