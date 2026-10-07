import type { LedgerEntry } from '#types/modules/evidence';

/** One chain's entries from its latest reopen (a `revise` with via `reopen`) on; all of them when it was never reopened. */
export function sinceReopen(entries: readonly LedgerEntry[]): LedgerEntry[] {
  const index = entries.findLastIndex((entry) => entry.kind === 'revise' && entry['via'] === 'reopen');
  return entries.slice(Math.max(index, 0));
}
