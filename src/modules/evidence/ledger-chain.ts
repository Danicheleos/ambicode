import { sinceReopen } from '#platform/ledger/reopen';
import type { ArtifactRef, Chain, LedgerEntry } from '#types/modules/evidence';

export const text = (entry: LedgerEntry, field: string): string | null => (typeof entry[field] === 'string' ? (entry[field] as string) : null);
export const isBoundKind = (entry: LedgerEntry): boolean => entry.kind === 'acceptance' || entry.kind === 'declined' || entry.kind === 'default-taken';

export function buildChain(all: readonly LedgerEntry[], head: LedgerEntry): Chain {
  const routes = new Map(all.filter((entry) => entry.kind === 'route').map((entry) => [entry.id, entry]));
  const ids = new Set<string>([head.id]);
  for (let current: LedgerEntry | undefined = head; current !== undefined; ) {
    const next = text(current, 'resumes');
    if (next === null || ids.has(next)) break;
    ids.add(next);
    current = routes.get(next);
  }
  const member = (entry: LedgerEntry): boolean => (entry.kind === 'route' ? ids.has(entry.id) : ids.has(text(entry, 'route') ?? ''));
  return { head, ids, entries: all.filter(member) };
}

/** Heads of the chains no exit has closed: routes nothing resumes. */
export function liveHeads(entries: readonly LedgerEntry[]): LedgerEntry[] {
  const resumed = new Set(entries.filter((entry) => entry.kind === 'route' && typeof entry['resumes'] === 'string').map((entry) => entry['resumes'] as string));
  return entries.filter((entry) => entry.kind === 'route' && !resumed.has(entry.id)).filter((head) => exitOf(buildChain(entries, head)) === null);
}

/** The exit that currently ends the chain: exits before the latest reopen no longer count. */
export function exitOf(chain: Chain): LedgerEntry | null {
  return sinceReopen(chain.entries).findLast((entry) => entry.kind === 'exit') ?? null;
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
