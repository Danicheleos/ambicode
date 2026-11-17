import path from 'node:path';
import { AmbicodeError } from '#util/errors';
import { LEDGER_FILE } from '#types/modules/evidence';
import type { FileSystem } from '#types/platform/ports';

/** A task is a folder with a ledger: a bare folder is not one, whoever made it. */
export const taskExists = (fs: FileSystem, taskDirectory: string): Promise<boolean> => fs.exists(path.join(taskDirectory, LEDGER_FILE));

/** The tasks under `parent` (folders with a ledger), most recently written first. */
export async function recentTaskNames(fs: FileSystem, parent: string, limit: number): Promise<string[]> {
  const found: { name: string; at: number }[] = [];
  for (const entry of await fs.readdir(parent).catch(() => [])) {
    const stats = await fs.stat(path.join(parent, entry.name, LEDGER_FILE)).catch(() => null);
    if (stats !== null) found.push({ name: entry.name, at: stats.mtimeMs });
  }
  return found.sort((a, b) => b.at - a.at).slice(0, limit).map((task) => task.name);
}

/** A task is a folder with a ledger; naming one that is not there lists the real ones, never offers to start it under that name. */
export async function taskUnknown(fs: FileSystem, taskDirectory: string): Promise<AmbicodeError> {
  const latest = await recentTaskNames(fs, path.dirname(taskDirectory), 5);
  return new AmbicodeError('task-unknown', `Task ${path.basename(taskDirectory)} does not exist.`, {
    details: [latest.length === 0 ? 'There are no tasks yet.' : `Existing tasks, newest first: ${latest.join(', ')}.`],
  });
}
