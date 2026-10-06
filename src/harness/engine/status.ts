import path from 'node:path';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { readEntries } from './context.ts';
import { entryPaths } from '#modules/requirements/capture/capture-files';
import { buildChain, exitOf, executions, foldRoute, humanRevisesLeft } from './fold.ts';
import { ownerOf, OWNING_SKILLS } from '../session/ownership.ts';
import type { Runtime } from '#types/composition';
import type { LedgerEntry, TaskDir } from '#types/modules/evidence';
import type { RouteRegistry, Position } from '#types/harness';

type StatusScope = { runtime: Runtime; routes: RouteRegistry };

async function orphansOf(runtime: Runtime, dir: TaskDir, entries: readonly LedgerEntry[]): Promise<string[]> {
  const named = new Set<string>();
  for (const entry of entries) {
    for (const field of ['path', 'file', 'artifact']) if (typeof entry[field] === 'string') named.add(path.resolve(dir.repositoryRoot, entry[field] as string));
    if (entry.kind === 'requirement' && typeof entry['key'] === 'string') for (const file of entryPaths(dir, entry)) named.add(file);
  }
  const found: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const item of await runtime.fs.readdir(directory).catch(() => [])) {
      const full = path.join(directory, item.name);
      if (item.isDirectory()) await walk(full);
      else if (!['ledger.jsonl', 'ledger.lock'].includes(item.name) && !named.has(full) && !item.name.startsWith('payload-')) found.push(path.relative(dir.root, full));
    }
  };
  await walk(dir.root);
  return found.sort();
}

/** Every route on the task (one session's, or the live ones), with its position, limits and stray files. */
export async function routeStatus({ runtime, routes }: StatusScope, task: string, session: string | null): Promise<Position[]> {
  const dir = await resolveTaskDir(runtime, task);
  const entries = await readEntries(runtime, task);
  const orphans = await orphansOf(runtime, dir, entries);
  const positions: Position[] = [];
  const heads = entries.filter((entry) => entry.kind === 'route');
  const resumed = new Set(heads.map((entry) => entry['resumes']).filter((id): id is string => typeof id === 'string'));
  for (const head of heads.filter((candidate) => !resumed.has(candidate.id))) {
    const def = routes.route(String(head['skill']));
    if (def === null) continue;
    const chain = buildChain(entries, head);
    if (session !== null && !chain.entries.some((entry) => entry.kind === 'route' && entry['session'] === session)) continue;
    if (exitOf(chain) !== null && session === null) continue;
    const fold = foldRoute(def, chain);
    const owning = OWNING_SKILLS.has(def.skill);
    positions.push({
      routeId: head.id,
      skill: def.skill,
      chainIds: [...chain.ids],
      sessions: chain.entries.filter((entry) => entry.kind === 'route').map((entry) => ({ session: String(entry['session']), routeId: entry.id, adopts: entry['adopts'] === true })),
      owner: owning ? ownerOf(entries, task) : null,
      position: fold.position?.id ?? 'complete',
      steps: fold.steps.map((state) => ({ id: state.step.id, state: state.state, windowStart: state.windowStart })),
      cycles: chain.entries.filter((entry) => entry.kind === 'revise' && entry['via'] === 'gate').length,
      repeatsLeft: Object.fromEntries(def.steps.filter((step) => step.repeat > 1).map((step) => [step.id, Math.max(0, step.repeat - executions(chain.entries, step))])),
      revisesLeft: Object.fromEntries(def.steps.filter((step) => step.gate !== null && Object.keys(step.gate.onAnswer).length > 0).map((step) => [step.gate!.id, humanRevisesLeft(chain.entries, step.gate!)])),
      limits: chain.entries.filter((entry) => entry.kind === 'limit'),
      maps: chain.entries.filter((entry) => entry.kind === 'map').map((entry) => ({ id: entry.id, layers: Array.isArray(entry['layers']) ? entry['layers'] : [] })),
      orphans,
    });
  }
  return positions;
}
