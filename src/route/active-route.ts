import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import { TASKS_DIR } from '../config/defaults.ts';
import { currentEpoch, deliverOnce, hookStateBaseDir } from '../hook/session/markers.ts';
import type { IdSource } from '../ports/ids.ts';
import { readLedger, type LedgerEntry } from '../task/ledger.ts';
import { buildChain, exitOf, latestRouteOf } from './fold.ts';
import { ownerOfHarness } from './harness.ts';

const ACTIVE = 'active-route';
const ENDED = 'ended-route';
export const POINTER_LIMIT = 4 * 1024;

export interface ActiveRoutePointer {
  write(session: string, scratchpad: string | undefined, value: { task: string; skill: string; owner?: string }): Promise<void>;
  clear(session: string, scratchpad: string | undefined): Promise<void>;
  read(session: string, scratchpad: string | undefined): Promise<{ task: string; skill: string; owner?: string } | null>;
  /** Written when exit or completion clears `active-route`; read and removed only by Stop. */
  readEnded(session: string, scratchpad: string | undefined): Promise<{ task: string; skill: string; routeId: string } | null>;
  clearEnded(session: string, scratchpad: string | undefined): Promise<void>;
}

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
    write: (session, scratchpad, value) => put(file(session, scratchpad, ACTIVE), { task: value.task, skill: value.skill, ...(value.owner === undefined ? {} : { owner: value.owner }) }),
    async clear(session, scratchpad) {
      await fs.remove(file(session, scratchpad, ACTIVE));
    },
    async read(session, scratchpad) {
      const value = await readJson(file(session, scratchpad, ACTIVE));
      return typeof value?.['task'] === 'string' && typeof value['skill'] === 'string'
        ? { task: value['task'], skill: value['skill'], ...(typeof value['owner'] === 'string' ? { owner: value['owner'] } : {}) }
        : null;
    },
    async readEnded(session, scratchpad) {
      const value = await readJson(file(session, scratchpad, ENDED));
      return typeof value?.['task'] === 'string' && typeof value['skill'] === 'string' && typeof value['routeId'] === 'string'
        ? { task: value['task'], skill: value['skill'], routeId: value['routeId'] }
        : null;
    },
    async clearEnded(session, scratchpad) {
      await fs.remove(file(session, scratchpad, ENDED));
    },
  };
}

/** Exit and completion: the pointer goes, `ended-route` stays for one Stop (03-S7). */
export async function endRoute(
  pointer: ActiveRoutePointer,
  fs: FileSystem,
  session: string,
  scratchpad: string | undefined,
  value: { task: string; skill: string; routeId: string },
): Promise<void> {
  await pointer.clear(session, scratchpad);
  const target = path.join(hookStateBaseDir(fs, session, scratchpad), ENDED);
  await fs.mkdirp(path.dirname(target));
  await fs.writeText(target, JSON.stringify(value));
}

const openRouteOf = (entries: readonly LedgerEntry[], harness: string): { head: LedgerEntry; owner: string } | null => {
  const owner = ownerOfHarness(entries, harness);
  const head = owner === null ? null : latestRouteOf(entries, owner);
  return head !== null && owner !== null && exitOf(buildChain(entries, head)) === null ? { head, owner } : null;
};

export interface ActiveRoute { task: string; skill: string; routeId: string; owner: string }

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

/** A step was delivered to this session in this epoch: the next prompt need not re-inject it (03-H4). */
export async function markStepDelivered(
  fs: FileSystem,
  ids: IdSource,
  input: { session: string; scratchpad: string | undefined; routeId: string; position: string },
): Promise<boolean> {
  const base = hookStateBaseDir(fs, input.session, input.scratchpad);
  return deliverOnce(fs, base, { epoch: await currentEpoch(fs, ids, base), agentKey: 'main', kind: 'route-step', subject: input.routeId, contentHash: input.position });
}
