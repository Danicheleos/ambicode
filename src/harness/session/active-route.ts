import path from 'node:path';
import { REVIEWS_DIR, TASKS_DIR } from '#types/defaults';
import { deliverOnce, hookStateBaseDir } from '#platform/claude/hook-state';
import { readLedger } from '#platform/ledger/ledger';
import { LEDGER_FILE } from '#types/modules/evidence';
import { buildChain, exitOf, latestRouteOf } from '../engine/fold.ts';
import type { FileSystem } from '#types/platform/ports';

interface SessionRoute { task: string; skill: string; routeId: string; live: boolean; endedAt: string }

/**
 * The latest route of a Claude session in each run directory, live ones first, then the most recently ended. Only a
 * ledger whose text names the session is parsed, so the scan costs one file read per task.
 */
export async function sessionRoutes(fs: FileSystem, repositoryRoot: string, session: string): Promise<SessionRoute[]> {
  const found: SessionRoute[] = [];
  for (const base of [TASKS_DIR, REVIEWS_DIR]) {
    for (const entry of await fs.readdir(path.join(repositoryRoot, base)).catch(() => [])) {
      const dir = path.join(repositoryRoot, base, entry.name);
      if (!entry.isDirectory() || !(await fs.readText(path.join(dir, LEDGER_FILE)).catch(() => '')).includes(session)) continue;
      const entries = await readLedger(fs, dir);
      const head = latestRouteOf(entries, session);
      const exit = head === null ? null : exitOf(buildChain(entries, head));
      if (head !== null) found.push({ task: entry.name, skill: String(head['skill']), routeId: head.id, live: exit === null, endedAt: exit?.at ?? '' });
    }
  }
  return found.sort((a, b) => Number(b.live) - Number(a.live) || b.endedAt.localeCompare(a.endedAt));
}

export async function liveRouteOf(fs: FileSystem, repositoryRoot: string, session: string): Promise<SessionRoute | null> {
  const [latest] = await sessionRoutes(fs, repositoryRoot, session);
  return latest?.live === true ? latest : null;
}

/** A step was delivered to this session since the last reset: the next prompt need not re-inject it (03-H4). */
export async function markStepDelivered(fs: FileSystem, input: { session: string; scratchpad: string | undefined; routeId: string; position: string }): Promise<boolean> {
  return deliverOnce(fs, hookStateBaseDir(fs, input.session, input.scratchpad), 'route-step', `${input.routeId}:${input.position}`);
}

export const HEADLESS_FILE = 'headless';

/** The guard has no repository to scan, so a live headless route leaves this marker in the session's hook state. */
export async function markHeadless(fs: FileSystem, input: { session: string; scratchpad: string | undefined; on: boolean }): Promise<void> {
  const file = path.join(hookStateBaseDir(fs, input.session, input.scratchpad), HEADLESS_FILE);
  if (!input.on) return fs.remove(file);
  await fs.mkdirp(path.dirname(file));
  await fs.writeText(file, '');
}
