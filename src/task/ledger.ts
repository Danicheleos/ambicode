import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';

export const LEDGER_FILE = 'ledger.jsonl';

export interface LedgerEntry {
  id: string;
  at: string;
  kind: string;
  [field: string]: unknown;
}

/**
 * Written only by the CLI: the guard denies the agent a write to `.ambicode/task/**`, which is what makes an
 * entry evidence rather than a claim. Append-only; a reader skips lines it cannot parse and kinds it does not know.
 */
export async function appendLedger(
  fs: FileSystem,
  taskDirectory: string,
  now: Date,
  entry: { kind: string; [field: string]: unknown },
): Promise<LedgerEntry> {
  await fs.mkdirp(taskDirectory);
  const file = path.join(taskDirectory, LEDGER_FILE);
  const highest = Math.max(0, ...(await readLedger(fs, taskDirectory)).map((existing) => Number(/^L(\d+)$/.exec(existing.id)?.[1] ?? 0)));
  const next: LedgerEntry = { id: `L${highest + 1}`, at: now.toISOString(), ...entry };
  await fs.appendText(file, `${JSON.stringify(next)}\n`);
  return next;
}

export async function readLedger(fs: FileSystem, taskDirectory: string): Promise<LedgerEntry[]> {
  const file = path.join(taskDirectory, LEDGER_FILE);
  if (!(await fs.exists(file))) return [];
  const entries: LedgerEntry[] = [];
  for (const line of (await fs.readText(file)).split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed === 'object' && parsed !== null && typeof (parsed as LedgerEntry).id === 'string' && typeof (parsed as LedgerEntry).kind === 'string') {
        entries.push(parsed as LedgerEntry);
      }
    } catch {
      // A torn or foreign line must not hide the entries after it.
    }
  }
  return entries;
}
