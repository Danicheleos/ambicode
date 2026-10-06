// The append-only JSONL task ledger, its lock and its entry kinds.

export type { TypedEntry } from './kinds.ts';
/** withLedgerLock(fs, taskDir, now, session, work) — runs `work` holding the ledger lock; use around any read-modify-append. */
export { withLedgerLock } from './ledger-lock.ts';
/** appendLedger(fs, taskDir, entry, …) — appends one entry to the ledger, refusing past the size cap. */
export { appendLedger } from './ledger.ts';
/** readLedger(fs, taskDir) — lenient read: skips torn, foreign or invalid lines; the first of a repeated id wins. */
export { readLedger } from './ledger.ts';
/** readLedgerStrict(fs, taskDir) — strict read like the guard's: anything suspicious makes the whole ledger unreadable. */
export { readLedgerStrict } from './ledger.ts';
