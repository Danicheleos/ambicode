// Claimants in separate processes, stopped at the lock's pause points by file barriers, so each interleaving
// is forced rather than hoped for.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { CASES_LOCK, casesLockStatus, holdsCases, lockCases, unlockCases } from './cases-lock.mjs';

const LOCK_MODULE = pathToFileURL(path.join(import.meta.dirname, 'cases-lock.mjs')).href;

// argv: casesDir barrierDir name stopAt(none|before-claim|after-claim) then(hold|die|release)
const CHILD = `
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lockCases, unlockCases } from ${JSON.stringify(LOCK_MODULE)};
const [casesDir, barriers, name, stopAt, then] = process.argv.slice(2);
const nap = new Int32Array(new SharedArrayBuffer(4));
const waitFor = (file) => { while (!existsSync(file)) Atomics.wait(nap, 0, 0, 5); };
const pause = (point) => {
  if (point !== stopAt) return;
  writeFileSync(path.join(barriers, name + '.at'), point);
  waitFor(path.join(barriers, name + '.go'));
};
let lock;
try {
  lock = lockCases(casesDir, name, { pause });
} catch (error) {
  writeFileSync(path.join(barriers, name + '.result'), JSON.stringify({ error: error.message }));
  process.exit(0);
}
writeFileSync(path.join(barriers, name + '.result'), JSON.stringify({ number: lock.number, abandoned: lock.abandoned }));
if (then === 'die') process.exit(0);
if (then === 'hold') waitFor(path.join(barriers, name + '.release'));
writeFileSync(path.join(barriers, name + '.released'), JSON.stringify(unlockCases(lock)));
`;

const pad = (n) => String(n).padStart(12, '0');
const DEAD_PID = 99_999_999;

describe('cases lock: claimants in separate processes', () => {
  let root;
  let script;
  let casesDir;
  let barriers;
  let children;
  let n = 0;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'cases-lock-'));
    script = path.join(root, 'claimant.mjs');
    writeFileSync(script, CHILD);
  });
  after(() => rmSync(root, { recursive: true, force: true }));
  beforeEach(() => {
    casesDir = path.join(root, `cases-${++n}`);
    barriers = path.join(root, `barriers-${n}`);
    mkdirSync(casesDir);
    mkdirSync(barriers);
    children = [];
  });
  afterEach(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  });

  const lockDir = () => path.join(casesDir, CASES_LOCK);
  const at = (name, suffix) => path.join(barriers, `${name}.${suffix}`);
  const until = async (test, what) => {
    const deadline = Date.now() + 10_000;
    while (!test()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  const claimant = (name, { stopAt = 'none', then = 'release' } = {}) => {
    const child = spawn(process.execPath, [script, casesDir, barriers, name, stopAt, then], { stdio: 'inherit' });
    const exited = new Promise((resolve) => child.on('exit', resolve));
    children.push(child);
    return {
      child,
      exited,
      paused: () => until(() => existsSync(at(name, 'at')), `${name} to pause`),
      go: () => writeFileSync(at(name, 'go'), ''),
      result: async () => {
        await until(() => existsSync(at(name, 'result')), `${name}'s result`);
        return JSON.parse(readFileSync(at(name, 'result'), 'utf8'));
      },
      release: async () => {
        writeFileSync(at(name, 'release'), '');
        await until(() => existsSync(at(name, 'released')), `${name} to release`);
        return JSON.parse(readFileSync(at(name, 'released'), 'utf8'));
      },
    };
  };
  const plant = (number, owner) => {
    mkdirSync(lockDir(), { recursive: true });
    writeFileSync(path.join(lockDir(), `${pad(number)}.json`), typeof owner === 'string' ? owner : JSON.stringify(owner));
  };
  const deadClaim = (number = 1) => plant(number, { pid: DEAD_PID, host: hostname(), token: 'dead', purpose: 'killed run', at: '2026-10-04T00:00:00Z' });
  const ownerOf = (number) => JSON.parse(readFileSync(path.join(lockDir(), `${pad(number)}.json`), 'utf8'));
  const listing = () => readdirSync(lockDir()).sort();

  it('refuses a recoverer whose abandoned claim was replaced before it resumed', async () => {
    deadClaim();
    const slow = claimant('slow', { stopAt: 'before-claim' });
    await slow.paused(); // slow judged claim 1 abandoned and is about to claim 2
    const fast = claimant('fast', { then: 'hold' });
    assert.deepEqual(await fast.result(), { number: 2, abandoned: { pid: DEAD_PID, host: hostname(), token: 'dead', purpose: 'killed run', at: '2026-10-04T00:00:00Z' } });
    slow.go();
    assert.match((await slow.result()).error, /in use by fast/);
    assert.equal(ownerOf(2).pid, fast.child.pid, 'the replacement claim is untouched');
    assert.deepEqual(ownerOf(1).token, 'dead', 'and so is the abandoned one');
    assert.equal(casesLockStatus(casesDir).purpose, 'fast');
    assert.equal(await fast.release(), true);
    assert.equal(casesLockStatus(casesDir), null);
  });

  it('refuses a third claimant while a recoverer holds its new claim', async () => {
    deadClaim();
    const recoverer = claimant('recoverer', { stopAt: 'after-claim', then: 'hold' });
    await recoverer.paused(); // claim 2 is linked; the recoverer has not returned yet
    assert.throws(() => lockCases(casesDir, 'third'), /in use by recoverer/);
    const third = claimant('third');
    assert.match((await third.result()).error, /in use by recoverer/);
    assert.ok(!listing().includes(`${pad(3)}.json`), 'no claim was taken above the recoverer');
    recoverer.go();
    assert.equal((await recoverer.result()).number, 2);
    assert.throws(() => lockCases(casesDir, 'fourth'), /in use by recoverer/);
    assert.equal(await recoverer.release(), true);
    const lock = lockCases(casesDir, 'after');
    assert.equal(lock.number, 3);
    assert.equal(lock.abandoned, null, 'a released claim is free, not abandoned');
    unlockCases(lock);
  });

  it('lets exactly one of two simultaneous recoverers win', async () => {
    deadClaim();
    const a = claimant('a', { stopAt: 'before-claim', then: 'hold' });
    const b = claimant('b', { stopAt: 'before-claim', then: 'hold' });
    await Promise.all([a.paused(), b.paused()]);
    a.go();
    b.go();
    const results = await Promise.all([a.result(), b.result()]);
    const winners = results.filter((r) => r.number !== undefined);
    assert.equal(winners.length, 1, JSON.stringify(results));
    assert.equal(winners[0].number, 2);
    assert.match(results.find((r) => r.error).error, /in use by (a|b)/);
    const winner = results[0].number ? a : b;
    assert.equal(ownerOf(2).pid, winner.child.pid);
    assert.equal(await winner.release(), true);
  });

  it('refuses a claimant while the owner lives, and changes nothing', async () => {
    const owner = claimant('owner', { then: 'hold' });
    assert.equal((await owner.result()).number, 1);
    const before = listing();
    assert.throws(() => lockCases(casesDir, 'second'), /in use by owner \(pid \d+ on .*\): nothing was changed/);
    assert.deepEqual(listing(), before);
    assert.equal(await owner.release(), true);
  });

  it('recovers the claim of an owner that died holding it, and leaves the dead claim as it was', async () => {
    const owner = claimant('crashed', { then: 'die' });
    assert.equal((await owner.result()).number, 1);
    await owner.exited;
    const dead = readFileSync(path.join(lockDir(), `${pad(1)}.json`), 'utf8');
    assert.equal(casesLockStatus(casesDir).state, 'abandoned');
    const lock = lockCases(casesDir, 'recoverer');
    assert.deepEqual([lock.number, lock.abandoned.pid, lock.abandoned.purpose], [2, owner.child.pid, 'crashed']);
    assert.equal(readFileSync(path.join(lockDir(), `${pad(1)}.json`), 'utf8'), dead);
    assert.ok(holdsCases(lock));
    assert.equal(unlockCases(lock), true);
  });

  it('never judges a claim from another host or an unreadable one, and changes nothing', () => {
    plant(1, { pid: DEAD_PID, host: `not-${hostname()}`, token: 'far', purpose: 'run', at: 'then' });
    let before = listing();
    assert.throws(() => lockCases(casesDir, 'test'), /another host is never judged abandoned.*ownership cannot be judged/);
    assert.deepEqual(listing(), before);
    assert.equal(casesLockStatus(casesDir).state, 'ambiguous');
    plant(2, '{"pid": 12, "ho');
    writeFileSync(path.join(lockDir(), `${pad(1)}.released`), '');
    before = listing();
    assert.throws(() => lockCases(casesDir, 'test'), /claim 2 .* is unreadable: ownership cannot be judged/);
    assert.deepEqual(listing(), before);
    plant(3, { pid: 'x', host: hostname(), token: 't' });
    assert.throws(() => lockCases(casesDir, 'test'), /claim 3 .* is unreadable/);
    rmSync(lockDir(), { recursive: true });
    writeFileSync(lockDir(), JSON.stringify({ pid: process.pid, host: hostname(), token: 'old', purpose: 'run' }));
    assert.throws(() => lockCases(casesDir, 'test'), /lock file from an older harness/);
    assert.equal(casesLockStatus(casesDir).state, 'ambiguous');
  });

  it('releases nothing for the wrong owner: a forged token, a stale lock object, another claim\'s number', async () => {
    const mine = lockCases(casesDir, 'parent');
    assert.equal(unlockCases(mine), true);
    const owner = claimant('owner', { then: 'hold' });
    const { number } = await owner.result();
    assert.equal(number, mine.number + 1);
    assert.equal(unlockCases(mine), false, 'the parent\'s released lock object');
    assert.equal(unlockCases({ ...mine, number }), false, 'the parent\'s token on the owner\'s claim');
    assert.equal(unlockCases({ ...mine, number, token: 'forged' }), false, 'a forged token');
    assert.equal(holdsCases({ ...mine, number }), false);
    assert.throws(() => lockCases(casesDir, 'third'), /in use by owner/, 'the owner still holds the cases');
    assert.ok(!existsSync(path.join(lockDir(), `${pad(number)}.released`)));
    assert.equal(await owner.release(), true);
  });

  it('fills a collected gap without effect: a claimant that read an old top releases what it took and is refused', async () => {
    unlockCases(lockCases(casesDir, 'first'));
    const late = claimant('late', { stopAt: 'before-claim' });
    await late.paused(); // late read top 1 (released) and will claim 2
    unlockCases(lockCases(casesDir, 'second'));
    unlockCases(lockCases(casesDir, 'third'));
    const owner = lockCases(casesDir, 'owner'); // claim 4; claims 1 and 2 are collected
    assert.ok(!listing().includes(`${pad(2)}.json`));
    late.go();
    assert.match((await late.result()).error, /in use by owner/);
    assert.ok(existsSync(path.join(lockDir(), `${pad(2)}.released`)), 'the gap claim was released by its own claimant');
    assert.ok(holdsCases(owner), 'the owner above it was never disturbed');
    assert.equal(unlockCases(owner), true);
  });

  it('keeps the lock directory small: claims more than one behind the owner are collected', () => {
    for (let i = 0; i < 5; i++) unlockCases(lockCases(casesDir, `pass ${i}`));
    const lock = lockCases(casesDir, 'last');
    assert.deepEqual(listing(), [`${pad(5)}.json`, `${pad(5)}.released`, `${pad(6)}.json`]);
    unlockCases(lock);
  });
});
