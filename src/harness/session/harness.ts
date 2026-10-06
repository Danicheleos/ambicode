import type { LedgerEntry } from '#types/modules/evidence';

// No runtime imports: the guard bundles this (see hook/guard/guard.ts).

/** The Claude session a route entry was written for; a route recorded without one used the Claude session as its owner. */
export const harnessOf = (entry: LedgerEntry): string | null => {
  const value = typeof entry['harnessSession'] === 'string' && entry['harnessSession'] !== '' ? entry['harnessSession'] : entry['session'];
  return typeof value === 'string' && value !== '' ? value : null;
};

/** The owner key a Claude session speaks for: it counts only while it is the latest session recorded on that owner's routes. */
export function ownerOfHarness(entries: readonly LedgerEntry[], harness: string): string | null {
  const owner = entries.findLast((entry) => entry.kind === 'route' && harnessOf(entry) === harness)?.['session'];
  if (typeof owner !== 'string' || owner === '') return null;
  const latest = entries.findLast((entry) => entry.kind === 'route' && entry['session'] === owner);
  return latest !== undefined && harnessOf(latest) === harness ? owner : null;
}
