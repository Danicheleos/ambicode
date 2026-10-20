import type { LedgerEntry } from '#types/modules/evidence';

export const ITERATION_HEADING = /^##\s+Iteration\s+(\d+)\b.*$/gim;

/** An iteration is done when its route exited `done`, however the review went; an interrupted or blocked route leaves it open. */
export function doneIterations(entries: readonly LedgerEntry[]): Set<number> {
  const done = new Set<number>();
  for (const exit of entries) {
    if (exit.kind !== 'exit' || exit['reason'] !== 'done') continue;
    const start = entries.find((entry) => entry.kind === 'step' && entry['step'] === 'start' && entry['route'] === exit['route']);
    if (typeof start?.['iteration'] === 'number') done.add(start['iteration']);
  }
  return done;
}
