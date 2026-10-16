// node:fs only: the guard bundle may read bounded state and ledger files and nothing else (see guard.ts).
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import type { LedgerEntry } from '#types/modules/evidence';
import { GUARD_STATE_DIR_NAME, GUARD_LEDGER_FILE, HEADLESS_FILE, LEDGER_LIMIT, type GuardState } from '../types/guard.ts';

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
 * Strict where the CLI's reader is lenient: a torn line could be the exit that closed the plan route, so the whole
 * ledger is unreadable for the plan-body exception rather than read without it.
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
  headless(scratchpadDir: string | null, sessionId: string | null) {
    if (scratchpadDir !== null && bounded(`${scratchpadDir}/${GUARD_STATE_DIR_NAME}/${HEADLESS_FILE}`, 0) !== null) return true;
    if (sessionId === null) return false;
    // hook-state.ts hookStateBaseDir: 'sha256:' + 32 hex of the session id, stripped to [a-z0-9].
    const key = `sha256${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}`;
    return bounded(`${tmpdir()}/${GUARD_STATE_DIR_NAME}/${key}/${HEADLESS_FILE}`, 0) !== null;
  },
  ledger(taskDirectory: string): LedgerEntry[] | null {
    const text = bounded(`${taskDirectory}/${GUARD_LEDGER_FILE}`, LEDGER_LIMIT);
    return text === null ? null : entries(text);
  }
};
