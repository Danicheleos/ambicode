import path from 'node:path';
import { AmbicodeError, messageOf } from '#util/errors';
import { parseEntry, type TypedEntry } from './kinds.ts';
import { withLedgerLock } from './ledger-lock.ts';
import { LEDGER_FILE, type NewEntry, type LedgerEntry, type StrictRead } from '#types/modules/evidence';
import type { FileSystem } from '#types/platform/ports';
export const MAX_ENTRY_BYTES = 16 * 1024;
export const WARN_LEDGER_BYTES = 1024 * 1024;

/** The 8 `[0-9a-z]` characters an id carries for its writer; a session id is lowercased first. */
function writerPrefix(writer: string): string {
  const prefix = writer.toLowerCase().replace(/[^0-9a-z]/g, '').slice(0, 8);
  if (prefix.length !== 8) throw new AmbicodeError('internal', `A ledger writer id needs 8 letters or digits; got "${writer}".`);
  return prefix;
}

/**
 * Written only by the CLI: the guard denies the agent a write to `.ambicode/task/**`, which is what makes an
 * entry evidence rather than a claim. Append-only. Callers hold the ledger lock (`withLedgerLock`).
 */
export async function appendLocked(fs: FileSystem, taskDirectory: string, now: Date, writer: string, entry: NewEntry): Promise<LedgerEntry> {
  const prefix = writerPrefix(writer);
  const file = path.join(taskDirectory, LEDGER_FILE);
  let highest = 0;
  if (await fs.exists(file)) {
    for (const line of (await fs.readText(file)).split('\n')) {
      if (line === '') continue;
      try {
        const id = (JSON.parse(line) as { id?: unknown } | null)?.id;
        const match = typeof id === 'string' && id.startsWith(`${prefix}-`) ? /^\d+$/.exec(id.slice(prefix.length + 1)) : null;
        if (match !== null) highest = Math.max(highest, Number(match[0]));
      } catch {
        // A torn line has no id to count.
      }
    }
  }
  const id = `${prefix}-${highest + 1}`;
  const at = now.toISOString();
  // An entry never chooses its own identity.
  const next: LedgerEntry = { id, at, ...entry };
  next.id = id;
  next.at = at;
  const line = JSON.stringify(next);
  if (Buffer.byteLength(line) > MAX_ENTRY_BYTES) {
    throw new AmbicodeError('ledger-entry-too-large', `A ${entry.kind} ledger entry is ${Buffer.byteLength(line)} bytes; the limit is ${MAX_ENTRY_BYTES}. Nothing was written.`, {
      details: ['Keep the payload in a file under the task directory and record its path and hash.'],
    });
  }
  await fs.appendText(file, `${line}\n`);
  return next;
}

/** `null` while the ledger is under 1 MiB; the recovery is a separate task slug. */
export async function ledgerSizeWarning(fs: FileSystem, taskDirectory: string): Promise<string | null> {
  const { size } = await fs.stat(path.join(taskDirectory, LEDGER_FILE));
  if (size < WARN_LEDGER_BYTES) return null;
  return `The task ledger is ${size} bytes. The plan-body guard refuses a ledger over 1 MiB; continue under a separate task: --task ${path.basename(taskDirectory)}-2.`;
}

export async function appendLedger(
  fs: FileSystem,
  taskDirectory: string,
  now: Date,
  writer: string,
  entry: NewEntry,
): Promise<{ entry: LedgerEntry; ledgerBytes: number; warning: string | null }> {
  return withLedgerLock(fs, taskDirectory, () => now, writer, async (ledger) => {
    const appended = await ledger.append(entry);
    return {
      entry: appended,
      ledgerBytes: (await fs.stat(path.join(taskDirectory, LEDGER_FILE))).size,
      warning: await ledgerSizeWarning(fs, taskDirectory),
    };
  });
}

/** Lenient: a torn line, a foreign shape, an unknown kind or a known kind that breaks its schema is skipped; the first of a repeated id wins. */
export async function readLedger(fs: FileSystem, taskDirectory: string): Promise<LedgerEntry[]> {
  const file = path.join(taskDirectory, LEDGER_FILE);
  if (!(await fs.exists(file))) return [];
  const entries: LedgerEntry[] = [];
  const seen = new Set<string>();
  for (const line of (await fs.readText(file)).split('\n')) {
    if (line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const result = parseEntry(parsed);
    if (!result.ok || seen.has(result.entry.id)) continue;
    seen.add(result.entry.id);
    entries.push(result.entry);
  }
  return entries;
}

/** Strict, like the guard's reader: anything that could hide a takeover makes the whole ledger unreadable, never empty. */
export async function readLedgerStrict(fs: FileSystem, taskDirectory: string): Promise<StrictRead> {
  const file = path.join(taskDirectory, LEDGER_FILE);
  let content: string;
  try {
    if (!(await fs.exists(file))) return { state: 'absent' };
    content = await fs.readText(file);
  } catch (error) {
    return { state: 'unreadable', reason: `the ledger cannot be read: ${messageOf(error)}`, line: null };
  }
  const entries: TypedEntry[] = [];
  const seen = new Set<string>();
  for (const [index, line] of content.split('\n').entries()) {
    if (line.trim() === '') continue;
    const unreadable = (reason: string): StrictRead => ({ state: 'unreadable', reason, line: index + 1 });
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return unreadable('a line is not complete JSON');
    }
    const result = parseEntry(parsed);
    if (!result.ok && !result.unknownKind) return unreadable(result.reason);
    const id = (parsed as LedgerEntry).id;
    if (seen.has(id)) return unreadable(`ledger id ${id} appears twice`);
    seen.add(id);
    if (result.ok) entries.push(result.entry);
  }
  return { state: 'ok', entries };
}
