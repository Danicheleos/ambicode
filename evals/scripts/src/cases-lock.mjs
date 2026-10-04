// One owner of a cases directory at a time: a run (naked or plugin prompt), restore-prompts, generation and the
// naked-arm copy all read or change its prompt files. Ownership is a numbered claim in `<cases>/.cases.lock/`.
// Claim n+1 appears atomically (a hard link of a complete file, refused if it exists) and is attempted only after
// claim n was judged released or abandoned. Both are final states, so claimants that read the same top race for
// the same number and exactly one wins. No claimant removes, renames or rewrites a claim that is not its own.
import { randomUUID } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

export const CASES_LOCK = '.cases.lock';
const CLAIM = /^(\d{12})\.json$/;
const pad = (n) => String(n).padStart(12, '0');
const claimFile = (dir, n) => path.join(dir, `${pad(n)}.json`);
const releasedFile = (dir, n) => path.join(dir, `${pad(n)}.released`);

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

const claimNumbers = (dir) =>
  readdirSync(dir)
    .map((file) => CLAIM.exec(file)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);

const readOwner = (dir, n) => {
  try {
    return { owner: JSON.parse(readFileSync(claimFile(dir, n), 'utf8')) };
  } catch (error) {
    return error.code === 'ENOENT' ? { gone: true } : { owner: null };
  }
};

/**
 * `released` and `abandoned` (its process is gone, on this host) free the claim; `live` holds it; `ambiguous`
 * (unreadable, or written on another host whose processes cannot be checked) is never judged free.
 */
function stateOf(dir, n) {
  if (existsSync(releasedFile(dir, n))) return { state: 'released' };
  const { owner, gone } = readOwner(dir, n);
  if (gone) return { state: 'gone' };
  const valid = owner && Number.isInteger(owner.pid) && typeof owner.host === 'string' && typeof owner.token === 'string';
  if (!valid) return { state: 'ambiguous', why: 'is unreadable' };
  if (owner.host !== hostname()) return { state: 'ambiguous', owner, why: `was written on ${owner.host}; a lock from another host is never judged abandoned` };
  return { state: isAlive(owner.pid) ? 'live' : 'abandoned', owner };
}

const top = (dir) => claimNumbers(dir).at(-1) ?? 0;

const legacyFile = (dir) => statSync(dir, { throwIfNoEntry: false })?.isFile() ?? false;

/** Who holds the cases, for a dry run: null when free. Reads only. */
export function casesLockStatus(casesDir) {
  const dir = path.join(casesDir, CASES_LOCK);
  if (!existsSync(dir)) return null;
  if (legacyFile(dir)) return { state: 'ambiguous', purpose: null };
  const n = top(dir);
  if (!n) return null;
  const s = stateOf(dir, n);
  return s.state === 'released' || s.state === 'gone' ? null : { state: s.state, purpose: s.owner?.purpose ?? null };
}

/**
 * Takes the cases directory, or throws naming the live or ambiguous owner without changing anything.
 * `abandoned` on the result is the gone owner this claim replaced: the caller recovers what it left.
 * `pause(point)` is a test seam, called at `before-claim` and `after-claim`.
 */
export function lockCases(casesDir, purpose, { pause = () => {} } = {}) {
  if (!existsSync(casesDir)) throw new Error(`no cases directory at ${casesDir}`);
  const dir = path.join(casesDir, CASES_LOCK);
  if (legacyFile(dir))
    throw new Error(`${casesDir}: ${CASES_LOCK} is a lock file from an older harness, whose owner cannot be judged; nothing was changed; remove it by hand once no run uses these cases`);
  mkdirSync(dir, { recursive: true });
  const token = randomUUID();
  const owner = { pid: process.pid, host: hostname(), token, purpose, at: new Date().toISOString() };
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = top(dir);
    let abandoned = null;
    if (current) {
      const s = stateOf(dir, current);
      if (s.state === 'gone') continue;
      if (s.state === 'live')
        throw new Error(`${casesDir} is in use by ${s.owner.purpose ?? 'another process'} (pid ${s.owner.pid} on ${s.owner.host}, since ${s.owner.at}): nothing was changed`);
      if (s.state === 'ambiguous')
        throw new Error(`${casesDir}: claim ${current} in ${CASES_LOCK} ${s.why}: ownership cannot be judged, so nothing was changed; remove ${dir} by hand once no run uses these cases`);
      if (s.state === 'abandoned') abandoned = s.owner;
    }
    pause('before-claim');
    const mine = current + 1;
    const staged = path.join(dir, `staged-${token}`);
    writeFileSync(staged, `${JSON.stringify({ ...owner, claim: mine })}\n`, { flag: 'wx' });
    try {
      linkSync(staged, claimFile(dir, mine));
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    } finally {
      rmSync(staged, { force: true });
    }
    pause('after-claim');
    // Only a claimant that read a top since collected can land below the real top; it releases its claim and retries.
    if (top(dir) !== mine) {
      writeFileSync(releasedFile(dir, mine), '', { flag: 'wx' });
      continue;
    }
    for (const file of readdirSync(dir)) {
      const n = /^(\d{12})\.(json|released)$/.exec(file)?.[1];
      if (n && Number(n) < mine - 1) rmSync(path.join(dir, file), { force: true });
    }
    return { casesDir, dir, number: mine, token, abandoned };
  }
  throw new Error(`${casesDir}: could not take ${CASES_LOCK} after repeated contention; nothing was changed, try again`);
}

/** Releases the caller's own claim; a lock object whose token does not match its claim releases nothing. */
export function unlockCases(lock) {
  const { owner } = readOwner(lock.dir, lock.number);
  if (owner?.token !== lock.token) return false;
  try {
    writeFileSync(releasedFile(lock.dir, lock.number), '', { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

/** True while `lock` is the current, unreleased claim on its cases directory. */
export function holdsCases(lock) {
  return top(lock.dir) === lock.number && stateOf(lock.dir, lock.number).state !== 'released' && readOwner(lock.dir, lock.number).owner?.token === lock.token;
}

/** Runs `fn` holding the cases lock: the given one (checked), or one taken and released here. */
export function withCasesLock(casesDir, purpose, fn, lock = null) {
  if (lock) {
    if (lock.casesDir !== casesDir || !holdsCases(lock)) throw new Error(`${casesDir}: the cases lock is not held by this process`);
    return fn(lock);
  }
  const taken = lockCases(casesDir, purpose);
  try {
    return fn(taken);
  } finally {
    unlockCases(taken);
  }
}
