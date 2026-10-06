import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { scoreTaskRun, verification, weakenedAssertions } from './task-score.mjs';

const patchOf = (file, lines) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -0,0 +1 @@\n${lines.map((l) => `+${l}`).join('\n')}\n`;
const check = (phase, extra = {}) => ({ kind: 'check', route: 'r1', key: 'k', phase, exit: phase === 'red' ? 1 : 0, summary: { ran: 2, failed: phase === 'red' ? 1 : 0 }, ...extra });
const route = { kind: 'route', id: 'r1' };

describe('task score', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'task-score-'));
    mkdirSync(path.join(dir, 'hidden', 'files', 'src'), { recursive: true });
    mkdirSync(path.join(dir, 'hidden', 'base', 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'truth.json'), JSON.stringify({ testFiles: ['src/a.test.ts'], testCommand: ['t'] }));
    writeFileSync(path.join(dir, 'hidden', 'base', 'src', 'a.test.ts'), 'expect(a).toBe(1);\nexpect(b).toBe(2);\n');
    writeFileSync(path.join(dir, 'hidden', 'files', 'src', 'a.test.ts'), 'expect(a).toBe(1);\nexpect(b).toBe(2);\nexpect(c).toBe(3);\n');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (over = {}) => ({ arm: 'route', patch: '', entries: [], costUsd: 1, turns: 10, ...over });

  it('07-T5: a weakened assertion present in base and merged but absent from the run is detected', () => {
    assert.deepEqual(weakenedAssertions({ base: 'expect(a).toBe(1);\nexpect(b).toBe(2);', merged: 'expect(a).toBe(1);\nexpect(b).toBe(2);\nexpect(c).toBe(3);', run: 'expect(a).toBe(1);\nexpect(c).toBe(3);' }), ['expect(b).toBe(2);']);
    assert.deepEqual(weakenedAssertions({ base: 'expect(a).toBe(1);', merged: 'expect(a).toBe(1);', run: null }), []);
    const scored = scoreTaskRun(dir, run({ patch: patchOf('src/a.test.ts', ['expect(a).toBe(1);']) }), { runner: () => ({ exit: 0 }) });
    assert.deepEqual(scored.weakened, ['expect(b).toBe(2);']);
  });

  it('07-T5: the hidden test result comes from the injected runner on the run patch', () => {
    const seen = [];
    const pass = scoreTaskRun(dir, run({ patch: 'P' }), { runner: (o) => (seen.push(o.patch), { exit: 0 }) });
    assert.equal(pass.hiddenPass, true);
    assert.deepEqual(seen, ['P']);
    assert.equal(scoreTaskRun(dir, run(), { runner: () => ({ exit: 1 }) }).hiddenPass, false);
  });

  it('07-T5: a red check before a green one proves the route; the reverse order does not', () => {
    const ok = scoreTaskRun(dir, run({ entries: [route, check('red'), check('green')] }), { runner: () => ({ exit: 0 }) });
    assert.equal(ok.redBeforeGreen, true);
    const reversed = scoreTaskRun(dir, run({ entries: [route, check('green'), check('red')] }), { runner: () => ({ exit: 0 }) });
    assert.equal(reversed.redBeforeGreen, false);
  });

  it('07-T5: cost and turns are carried; the naked arm has no ledger proof; a third arm is refused', () => {
    const naked = scoreTaskRun(dir, run({ arm: 'naked' }), { runner: () => ({ exit: 0 }) });
    assert.deepEqual([naked.costUsd, naked.turns, naked.redBeforeGreen], [1, 10, null]);
    assert.throws(() => scoreTaskRun(dir, run({ arm: 'ablated' }), { runner: () => ({ exit: 0 }) }), /task arms are naked and route/);
  });

  it('07-T6: a reviewer error is incomplete verification with its cost, never a failed hidden test', () => {
    const entries = [{ kind: 'review', reviewerRan: false, status: 'error', costUsd: 0.2, turns: 3 }];
    assert.deepEqual(verification(entries), { incomplete: true, reviewerError: true, costUsd: 0.2, turns: 3 });
    const scored = scoreTaskRun(dir, run({ entries }), { runner: () => ({ exit: 0 }) });
    assert.equal(scored.hiddenPass, true);
    assert.equal(scored.verificationIncomplete, true);
    assert.equal(scored.reviewerError, true);
    assert.equal(scored.costUsd, 1.2);
    assert.equal(scored.turns, 13);
  });
});
