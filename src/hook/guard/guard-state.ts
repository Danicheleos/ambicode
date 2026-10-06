// node:fs (plus crypto and os for the session key) only: the guard bundle may read bounded state and ledger files and nothing else (see guard.ts).
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { LedgerEntry } from '#types/evidence';
import { GUARD_STATE_DIR_NAME, ACTIVE_ROUTE_FILE, GUARD_LEDGER_FILE, LEDGER_LIMIT, type ActiveRoute, type GuardState } from '../types/guard.ts';

const POINTER_LIMIT = 4 * 1024;
// Equal to stop-check.ts TRANSCRIPT_TAIL_BYTES (tested).
export const TRANSCRIPT_TAIL = 1024 * 1024;

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

/** The last `limit` bytes of a regular file, from the first line that starts inside them; any error is `null`. */
function tail(file: string, limit: number): string | null {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(file, OPEN_FLAGS);
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) return null;
    const start = Math.max(0, stat.size - limit);
    const buffer = Buffer.alloc(stat.size - start);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(descriptor, buffer, length, buffer.length - length, start + length);
      if (read === 0) break;
      length += read;
    }
    const text = buffer.toString('utf8', 0, length);
    return start === 0 ? text : text.slice(text.indexOf('\n') + 1);
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

/** markers.ts `hookStateBaseDir` without a scratchpad: the state of a session whose hook input carries none (tested equal). */
export function sessionStateDir(sessionId: string): string {
  return `${tmpdir()}/${GUARD_STATE_DIR_NAME}/sha256${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}`;
}

function pointerAt(file: string): ActiveRoute | null {
  const text = bounded(file, POINTER_LIMIT);
  if (text === null) return null;
  try {
    const pointer = JSON.parse(text) as Partial<ActiveRoute> | null;
    if (typeof pointer?.task !== 'string' || typeof pointer.skill !== 'string') return null;
    return { task: pointer.task, skill: pointer.skill, ...(typeof pointer.toolTurns === 'number' ? { toolTurns: pointer.toolTurns } : {}) };
  } catch {
    return null;
  }
}

export const fsGuardState: GuardState = {
  activeRoute: (scratchpadDir: string) => pointerAt(`${scratchpadDir}/${GUARD_STATE_DIR_NAME}/${ACTIVE_ROUTE_FILE}`),
  sessionRoute: (sessionId: string) => pointerAt(`${sessionStateDir(sessionId)}/${ACTIVE_ROUTE_FILE}`),
  ledger(taskDirectory: string): LedgerEntry[] | null {
    const text = bounded(`${taskDirectory}/${GUARD_LEDGER_FILE}`, LEDGER_LIMIT);
    return text === null ? null : entries(text);
  },
  transcriptTail(file: string): string | null {
    return tail(file, TRANSCRIPT_TAIL);
  },
};
