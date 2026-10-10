import path from 'node:path';
import { TASKS_DIR } from '#types/defaults';
import { deliverOnce, hookStateBaseDir } from '#platform/claude/hook-state';
import { readLedger } from '#platform/ledger/ledger';
import { buildChain, exitOf, latestRouteOf } from '../engine/fold.ts';
import { ownerOfHarness } from './harness.ts';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ActiveRoutePointer } from '#types/harness';
import type { FileSystem } from '#types/platform/ports';

const ACTIVE = 'active-route';
export const POINTER_LIMIT = 4 * 1024;

/** The pointer is a cache of "which route is active"; the ledger stays the authority (03-S7). */
export function fsActiveRoutePointer(fs: FileSystem): ActiveRoutePointer {
  const file = (session: string, scratchpad: string | undefined, name: string): string => path.join(hookStateBaseDir(fs, session, scratchpad), name);
  const readJson = async (target: string): Promise<Record<string, unknown> | null> => {
    try {
      if ((await fs.stat(target)).size > POINTER_LIMIT) return null;
      const parsed = JSON.parse(await fs.readText(target)) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const put = async (target: string, value: object): Promise<void> => {
    await fs.mkdirp(path.dirname(target));
    await fs.writeText(target, JSON.stringify(value));
  };
  return {
    write: (session, scratchpad, value) =>
      put(file(session, scratchpad, ACTIVE), { task: value.task, skill: value.skill, ...(value.owner === undefined ? {} : { owner: value.owner }), ...(value.headless === true ? { headless: true } : {}) }),
    async clear(session, scratchpad) {
      await fs.remove(file(session, scratchpad, ACTIVE));
    },
    async read(session, scratchpad) {
      const value = await readJson(file(session, scratchpad, ACTIVE));
      return typeof value?.['task'] === 'string' && typeof value['skill'] === 'string'
        ? { task: value['task'], skill: value['skill'], ...(typeof value['owner'] === 'string' ? { owner: value['owner'] } : {}) }
        : null;
    },
  };
}

const openRouteOf = (entries: readonly LedgerEntry[], harness: string): { head: LedgerEntry; owner: string } | null => {
  const owner = ownerOfHarness(entries, harness);
  const head = owner === null ? null : latestRouteOf(entries, owner);
  return head !== null && owner !== null && exitOf(buildChain(entries, head)) === null ? { head, owner } : null;
};

interface ActiveRoute { task: string; skill: string; routeId: string; owner: string }

/**
 * The open route of this Claude session: the pointer when the ledger confirms it, otherwise a scan of the task ledgers.
 * The pointer is a cache and never authority (03-S7); the ledger says which owner the session is attached to.
 */
export async function resolveActiveRoute(
  fs: FileSystem,
  pointer: ActiveRoutePointer,
  input: { repositoryRoot: string; session: string; scratchpad: string | undefined; scan?: boolean },
): Promise<ActiveRoute | null> {
  const tasksRoot = path.join(input.repositoryRoot, TASKS_DIR);
  const open = async (task: string): Promise<ActiveRoute | null> => {
    const found = openRouteOf(await readLedger(fs, path.join(tasksRoot, task)).catch(() => []), input.session);
    return found === null ? null : { task, skill: String(found.head['skill']), routeId: found.head.id, owner: found.owner };
  };
  const pointed = await pointer.read(input.session, input.scratchpad);
  const confirmed = pointed === null ? null : await open(pointed.task);
  if (confirmed !== null || input.scan === false) return confirmed;
  for (const entry of await fs.readdir(tasksRoot).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const found = await open(entry.name);
    if (found !== null) return found;
  }
  return null;
}

/**
 * The session's latest route when it exited: a CLI call in the Claude sandbox has another TMPDIR than the hooks, so the
 * ledger is the only record every process shares (walk 10_2314, both plan sessions).
 */
export async function endedRouteInLedger(fs: FileSystem, input: { repositoryRoot: string; session: string }): Promise<{ task: string; skill: string; routeId: string } | null> {
  const tasksRoot = path.join(input.repositoryRoot, TASKS_DIR);
  let found: { task: string; skill: string; routeId: string; at: string } | null = null;
  for (const entry of await fs.readdir(tasksRoot).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const entries = await readLedger(fs, path.join(tasksRoot, entry.name)).catch(() => []);
    const owner = ownerOfHarness(entries, input.session);
    const head = owner === null ? null : latestRouteOf(entries, owner);
    if (head === null) continue;
    const exit = exitOf(buildChain(entries, head));
    if (exit !== null && (found === null || exit.at > found.at)) found = { task: entry.name, skill: String(head['skill']), routeId: head.id, at: exit.at };
  }
  return found === null ? null : { task: found.task, skill: found.skill, routeId: found.routeId };
}

/** A step was delivered to this session since the last reset: the next prompt need not re-inject it (03-H4). */
export async function markStepDelivered(fs: FileSystem, input: { session: string; scratchpad: string | undefined; routeId: string; position: string }): Promise<boolean> {
  return deliverOnce(fs, hookStateBaseDir(fs, input.session, input.scratchpad), 'route-step', `${input.routeId}:${input.position}`);
}
