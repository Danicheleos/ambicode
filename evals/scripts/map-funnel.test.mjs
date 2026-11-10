import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contentHash } from '#util/hash';
import { archivedRequest, benchRequest, fileStage, replayMarkdown, rowsAbove } from './map-funnel.mjs';

const row = (file, score) => ({ path: file, score, reasons: [] });
/** A pool of seven files: two printed, one cut by bytes, one spread loss, one floor loss, plus a spec folded into the first row and one folded with no source. */
const map = {
  pool: [row('a/one.ts', 10), row('b/two.ts', 8), row('c/three.ts', 6), row('a/four.ts', 5), row('d/five.ts', 0.5), row('a/six.ts', 0.4)],
  candidates: [row('a/one.ts', 10), row('b/two.ts', 8)],
  debug: { folded: { 'a/one.spec.ts': 'a/one.ts', 'z/lonely.spec.ts': null }, spreadDropped: ['a/four.ts', 'a/six.ts'], floorDropped: ['d/five.ts'] },
};

test('fileStage names the stage of every file of a map', () => {
  assert.deepEqual(fileStage('a/one.ts', map), { stage: 'printed', stages: [], row: 1, rank: 1, score: 10, into: null, counterfactual: [] });
  assert.deepEqual(fileStage('c/three.ts', map), { stage: 'cut', stages: ['cut'], row: null, rank: 3, score: 6, into: null, counterfactual: [] });
  assert.equal(fileStage('d/five.ts', map).stage, 'floor');
  assert.deepEqual(fileStage('nowhere.ts', map), { stage: 'absent', stages: ['absent'], row: null, rank: null, score: null, into: null, counterfactual: [] });
});

test('fileStage lists every stage a spread loss would also fail, marking the ones it only computed', () => {
  // top 10 x 0.12 = 1.2: a/four.ts (5) clears the floor but rank 4 is past the 2 delivered rows; a/six.ts (0.4) fails the floor.
  assert.deepEqual(fileStage('a/four.ts', map).stages, ['spread', 'cut']);
  assert.deepEqual(fileStage('a/four.ts', map).counterfactual, ['cut']);
  assert.deepEqual(fileStage('a/six.ts', map).stages, ['spread', 'floor']);
  assert.deepEqual(fileStage('a/six.ts', map).counterfactual, ['floor']);
  assert.equal(fileStage('a/six.ts', map).floor, 1.2);
});

test('fileStage does not look a file name up on the prototype', () => {
  assert.equal(fileStage('constructor', map).stage, 'absent');
  assert.equal(fileStage('__proto__', map).stage, 'absent');
});

test('fileStage reports a folded companion with the row it merged into, or none when its folder had no source', () => {
  assert.deepEqual(fileStage('a/one.spec.ts', map), { stage: 'folded', stages: ['folded'], into: 'a/one.ts', row: 1, rank: 1, score: 10, counterfactual: [] });
  assert.deepEqual(fileStage('z/lonely.spec.ts', map), { stage: 'folded', stages: ['folded'], into: null, row: null, rank: null, score: null, counterfactual: [] });
});

test('rowsAbove lists the printed rows ranked above a cut file', () => {
  assert.deepEqual(rowsAbove('c/three.ts', map).map((entry) => entry.row), [1, 2]);
  assert.deepEqual(rowsAbove('nowhere.ts', map), []);
});

const task = (sources, captures, ledgerExtra = []) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'funnel-req-'));
  mkdirSync(path.join(dir, 'requirements'));
  for (const [name, capture] of Object.entries(captures)) writeFileSync(path.join(dir, 'requirements', name), JSON.stringify({ ...capture, rawHash: capture.rawHash ?? contentHash(capture.content) }));
  writeFileSync(path.join(dir, 'ledger.jsonl'), [{ kind: 'envelope', sources }, ...ledgerExtra].map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return dir;
};
const jira = { key: 'VS-1', content: JSON.stringify({ fields: { summary: 'Fix it' } }) };
const plain = { key: 'request', content: 'plain text' };

test('archivedRequest joins the sources in the order of the ledger envelope, not of the file names, each reduced as the route reduces it (a ticket to title and description)', () => {
  // file names sort request.* before VS-1.* but the envelope lists VS-1 first
  const dir = task([{ key: 'VS-1', rawHash: contentHash(jira.content) }, { key: 'request', rawHash: contentHash(plain.content) }], { 'request.aa.json': plain, 'VS-1.bb.json': jira });
  try {
    const found = archivedRequest(dir);
    assert.equal(found.request, 'Fix it\nrequest\nplain text');
    assert.deepEqual(found.sources.map((source) => source.key), ['VS-1', 'request']);
    assert.equal(found.hash, contentHash(found.request));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('archivedRequest refuses a capture whose content hash is not the ledger one, and a source with no capture', () => {
  const dir = task([{ key: 'request', rawHash: contentHash('other') }], { 'request.aa.json': plain });
  const missing = task([{ key: 'VS-9', rawHash: contentHash('x') }], { 'request.aa.json': plain });
  try {
    assert.throws(() => archivedRequest(dir), /request: capture hash differs from the ledger/);
    assert.throws(() => archivedRequest(missing), /VS-9: no capture/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(missing, { recursive: true, force: true });
  }
});

test('archivedRequest appends the investigation text the ledger notes, and refuses one it cannot read', () => {
  const dir = task([{ key: 'request', rawHash: contentHash(plain.content) }], { 'request.aa.json': plain }, [{ kind: 'note', note: 'investigation', path: 'inv.md' }]);
  try {
    assert.throws(() => archivedRequest(dir, dir), /investigation inv.md is not in the archive/);
    writeFileSync(path.join(dir, 'inv.md'), 'findings');
    assert.equal(archivedRequest(dir, dir).request, 'request\nplain text\n\nfindings');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replayMarkdown prints the ledger count check and one row per file, with the stages of a multi-stage loss', () => {
  const result = { name: 'case-a', stamp: 's', requestHash: 'sha256:ab', requestChars: 9, delivered: 2, candidates: 7, bytes: 3000, pool: 6, row1: 'a/one.ts', terms: ['x'],
    ledger: { candidates: 7, bytes: 2999, terms: ['x'] },
    files: ['a/six.ts', 'c/three.ts'].map((file) => ({ file, kind: 'truth', ...fileStage(file, map), above: file === 'c/three.ts' ? rowsAbove(file, map) : [] })) };
  const md = replayMarkdown([result]);
  assert.match(md, /ledger: candidates 7\/7, bytes 3000\/2999, terms pass1 equal: yes => MISMATCH/);
  assert.match(md, /case-a \| a\/six\.ts \| truth \| 6 \| spread\+floor\* \| - \| 0\.40/);
  assert.match(md, /case-a \| c\/three\.ts \| truth \| 3 \| cut \| - \| 6\.00/);
  assert.match(md, /printed above c\/three\.ts: 1 a\/one\.ts 10\.00; 2 b\/two\.ts 8\.00/);
});

test('the bench request equals the route request: `request\n` then the prompt', () => {
  const dir = task([{ key: 'request', rawHash: contentHash(plain.content) }], { 'request.aa.json': plain });
  try {
    assert.equal(benchRequest(plain.content), archivedRequest(dir).request);
    assert.equal(benchRequest('Fix the thing'), 'request\nFix the thing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
