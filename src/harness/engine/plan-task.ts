import path from 'node:path';
import { readLedgerStrict } from '#platform/ledger/ledger';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import type { Runtime } from '#types/composition';

const ITERATION_OF = /^\s*iteration\s+(\d+)\s+of\s+([\w.-]+)\s*$/i;
const ITERATION_ONLY = /^\s*iteration\s+\d+\s*$/i;

/** The task a `task` request continues: `iteration N of <slug>` names it; a bare `iteration N` takes the task of the latest accepted plan. */
export async function continuedTask(runtime: Runtime, text: string): Promise<string | null> {
  const named = ITERATION_OF.exec(text);
  if (named !== null) return named[2]!;
  if (!ITERATION_ONLY.test(text)) return null;
  const tasks = path.dirname((await resolveTaskDir(runtime, '-')).root);
  let latest: { at: string; task: string } | null = null;
  for (const entry of await runtime.fs.readdir(tasks).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const read = await readLedgerStrict(runtime.fs, path.join(tasks, entry.name));
    if (read.state !== 'ok') continue;
    for (const note of read.entries) if (note.kind === 'note' && note['note'] === 'plan' && (latest === null || note.at > latest.at)) latest = { at: note.at, task: entry.name };
  }
  return latest?.task ?? null;
}
