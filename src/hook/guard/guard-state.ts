// node:fs only: the guard bundle may read bounded state and ledger files and nothing else (see guard.ts).
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import type { LedgerEntry } from '../../task/ledger.ts';
import type { ActiveRoute, GuardState } from './guard-core.ts';

// Equal to markers.ts HOOK_STATE_DIR_NAME and ledger.ts LEDGER_FILE (tested); importing either would bundle node:path and node:crypto.
export const GUARD_STATE_DIR_NAME = 'ambicode-hook-state';
export const ACTIVE_ROUTE_FILE = 'active-route';
export const GUARD_LEDGER_FILE = 'ledger.jsonl';

const POINTER_LIMIT = 4 * 1024;
// The 1 MiB ledger warning (01-contracts §1). Built guard, 20-spawn medians: 34-38 ms small, 40-43 ms at 1 MiB of
// long records, 45-50 ms at 1 MiB of short ones, 53-57 ms at 2 MiB of short ones against 33 §7's 50 ms; a larger
// ledger denies the plan-body write instead.
export const LEDGER_LIMIT = 1024 * 1024;

// Opening a FIFO without a writer would block the hook; non-blocking, it opens at once and fstat rejects it.
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

/** A regular file of at most `limit` bytes, read whole; anything else, or any error, is `null`. */
function bounded(file: string, limit: number): string | null {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(file, OPEN_FLAGS);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > limit) return null;
    // The file as fstat saw it: a line appended meanwhile is read in part or not at all, and a torn line is refused.
    const buffer = Buffer.alloc(stat.size);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(descriptor, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    return buffer.toString('utf8', 0, length);
  } catch {
    return null;
  } finally {
    try {
      if (descriptor !== undefined) closeSync(descriptor);
    } catch {
      // Nothing was decided from this descriptor that closing it could change.
    }
  }
}

/**
 * Strict where the CLI's reader is lenient: a torn or foreign line could be the adoption that moved ownership, so the
 * whole ledger is unreadable for the plan-body exception rather than read without it.
 */
function entries(text: string): LedgerEntry[] | null {
  const found: LedgerEntry[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const entry = parsed as LedgerEntry;
    if (typeof entry.id !== 'string' || typeof entry.kind !== 'string') return null;
    found.push(entry);
  }
  return found;
}

export const fsGuardState: GuardState = {
  activeRoute(scratchpadDir: string): ActiveRoute | null {
    const text = bounded(`${scratchpadDir}/${GUARD_STATE_DIR_NAME}/${ACTIVE_ROUTE_FILE}`, POINTER_LIMIT);
    if (text === null) return null;
    try {
      const pointer = JSON.parse(text) as Partial<ActiveRoute> | null;
      return typeof pointer?.task === 'string' && typeof pointer.skill === 'string' ? { task: pointer.task, skill: pointer.skill } : null;
    } catch {
      return null;
    }
  },
  ledger(taskDirectory: string): LedgerEntry[] | null {
    const text = bounded(`${taskDirectory}/${GUARD_LEDGER_FILE}`, LEDGER_LIMIT);
    return text === null ? null : entries(text);
  },
};
