import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { referenceFloors, writeReferenceLock } from './reference-lock.mjs';

describe('reference-lock', () => {
  let dir;
  let truthFile;
  const answer = (files) => ({ graders: [{ name: 'names-a-true-file', passed: true, evidence: `## Files\n${files.map((f) => `- ${f}`).join('\n')}\n` }], costUsd: 0.2, turns: 8 });
  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'reference-lock-'));
    mkdirSync(path.join(dir, 'SIDE', 'full', 'side-t-1'), { recursive: true });
    truthFile = path.join(dir, 'SIDE', 'full', 'side-t-1', 'truth.json');
    writeFileSync(truthFile, JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts', 'app/b.ts'] }));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('pins sources, not numbers: the floors are rescored, and a changed source or truth is refused', () => {
    const source = path.join(dir, 'eval.json');
    writeFileSync(source, JSON.stringify({ partial: false, cases: [{ name: 'side-t-1', arms: { with: [answer(['app/a.ts', 'app/b.ts']), answer(['app/a.ts']), answer(['app/a.ts', 'app/b.ts'])] } }] }));
    const lockFile = path.join(dir, 'reference.lock.json');
    const lock = writeReferenceLock(source, { lockFile, cases: dir });
    assert.deepEqual(Object.keys(lock.cases), ['side-t-1']);
    assert.equal('recall' in lock.cases['side-t-1'], false, 'no score is stored');
    const floor = referenceFloors({ lockFile, cases: dir }).get('side-t-1');
    assert.equal(floor.runs, 3);
    assert.ok(Math.abs(floor.recall.mean - 5 / 6) < 1e-9);
    assert.equal(floor.recall.worst, 0.5);

    writeFileSync(truthFile, JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts'] }));
    assert.throws(() => referenceFloors({ lockFile, cases: dir }), /truth changed/);
    writeFileSync(truthFile, JSON.stringify({ side: 'SIDE', ticket: 'T-1', root: 'app', truth: ['app/a.ts', 'app/b.ts'] }));
    writeFileSync(source, JSON.stringify({ partial: false, cases: [] }));
    assert.throws(() => referenceFloors({ lockFile, cases: dir }), /changed since side-t-1 was pinned/);
  });

  it('refuses a partial run and a case the run does not have', () => {
    const partial = path.join(dir, 'partial.json');
    writeFileSync(partial, JSON.stringify({ partial: true, cases: [] }));
    assert.throws(() => writeReferenceLock(partial, { lockFile: path.join(dir, 'x.json'), cases: dir }), /partial/);
    const one = path.join(dir, 'one.json');
    writeFileSync(one, JSON.stringify({ partial: false, cases: [{ name: 'side-t-1', arms: { with: [] } }] }));
    assert.throws(() => writeReferenceLock(one, { lockFile: path.join(dir, 'y.json'), only: ['side-t-9'], cases: dir }), /no case side-t-9/);
  });
});
