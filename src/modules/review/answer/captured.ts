import type { LedgerEntry } from '#types/modules/evidence';

/** One review has a pending entry and, once recorded, a later recorded one: only the newest per id says where it stands. */
export function newestReviews(entries: readonly LedgerEntry[]): Map<string, LedgerEntry> {
  const newest = new Map<string, LedgerEntry>();
  for (const entry of entries) {
    if (entry.kind !== 'review') continue;
    newest.delete(String(entry['reviewId']));
    newest.set(String(entry['reviewId']), entry);
  }
  return newest;
}

export function pendingReview(entries: readonly LedgerEntry[], wanted: string | null): LedgerEntry | undefined {
  const newest = newestReviews(entries);
  const entry = wanted === null ? [...newest.values()].findLast((candidate) => candidate['stage'] === 'pending') : newest.get(wanted);
  return entry?.['stage'] === 'pending' ? entry : undefined;
}
