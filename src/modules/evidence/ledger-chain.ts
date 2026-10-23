import type { ArtifactRef, Chain, LedgerEntry } from '#types/modules/evidence';

export const text = (entry: LedgerEntry, field: string): string | null => (typeof entry[field] === 'string' ? (entry[field] as string) : null);
export const isBoundKind = (entry: LedgerEntry): boolean => entry.kind === 'acceptance' || entry.kind === 'declined' || entry.kind === 'default-taken';

export function buildChain(all: readonly LedgerEntry[], head: LedgerEntry): Chain {
  const ids = new Set<string>([head.id]);
  return { head, ids, entries: all.filter((entry) => (entry.kind === 'route' ? entry.id === head.id : entry['route'] === head.id)) };
}

/** Routes no exit has closed. */
export function liveHeads(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return entries.filter((entry) => entry.kind === 'route').filter((head) => exitOf(buildChain(entries, head)) === null);
}

/** The exit that ends the chain. */
export function exitOf(chain: Chain): LedgerEntry | null {
  return chain.entries.findLast((entry) => entry.kind === 'exit') ?? null;
}

/** A bound answer: not an unbound hook answer and not a decline that was never an answer (03-G5). */
export function isBoundAnswer(entry: LedgerEntry): boolean {
  if (!isBoundKind(entry) || entry['unbound'] === true) return false;
  return !(entry.kind === 'declined' && (entry['reason'] === 'acting-needs-human' || entry['reason'] === 'option-not-offered'));
}

export function latestBound(window: readonly LedgerEntry[], gate: string): LedgerEntry | null {
  return window.findLast((entry) => isBoundAnswer(entry) && entry['gate'] === gate) ?? null;
}

/** Entries after the latest human revise: the current cycle (03-F6). */
export function cycleEntries(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return entries.slice(entries.findLastIndex((entry) => entry.kind === 'revise' && entry['via'] === 'gate') + 1);
}

export function refOf(entry: LedgerEntry, kind: string, value: string | null): ArtifactRef {
  const hash = entry['contentHash'] ?? entry['hash'] ?? entry['rawHash'];
  return {
    kind,
    value: value ?? (typeof entry[kind] === 'string' ? (entry[kind] as string) : ''),
    id: entry.id,
    path: typeof entry['path'] === 'string' ? entry['path'] : '',
    contentHash: typeof hash === 'string' ? hash : '',
  };
}
