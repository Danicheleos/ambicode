import path from 'node:path';
import { readLedger } from '#platform/ledger/ledger';
import { recentTaskNames } from '#platform/ledger/task-unknown';
import { TASKS_DIR } from '#types/defaults';
import { ITERATION_HEADING, doneIterations } from './iterations.ts';
import type { RouteRegistry } from '#types/harness';
import type { FileSystem } from '#types/platform/ports';

/** One line per recent task that a request-taking route ran on (not `init`, not `rules`): what the user needs to pick one to continue. */
export async function recentTasks(fs: FileSystem, repositoryRoot: string, routes: RouteRegistry, limit: number): Promise<string[]> {
  const base = path.join(repositoryRoot, TASKS_DIR);
  const lines: string[] = [];
  for (const name of await recentTaskNames(fs, base, Infinity)) {
    if (lines.length === limit) break;
    const entries = await readLedger(fs, path.join(base, name));
    const skill = entries.findLast((entry) => entry.kind === 'route')?.['skill'];
    if (typeof skill !== 'string' || routes.route(skill)?.needsRequest !== true) continue;
    const plan = entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan')?.['path'];
    const text = typeof plan === 'string' ? await fs.readText(path.resolve(repositoryRoot, plan)).catch(() => '') : '';
    const total = [...text.matchAll(ITERATION_HEADING)].length;
    const exit = entries.findLast((entry) => entry.kind === 'exit')?.['reason'];
    lines.push(`- ${name} · plan: ${typeof plan === 'string' ? plan : 'none'}${total === 0 ? '' : ` · iterations ${doneIterations(entries).size}/${total}`} · last exit: ${typeof exit === 'string' ? exit : 'none'}`);
  }
  return lines;
}
