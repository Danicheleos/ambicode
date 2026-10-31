import path from 'node:path';
import { REVIEWS_DIR, TASKS_DIR } from '#types/defaults';
import { deliverOnce, hookStateBaseDir } from '#platform/claude/hook-state';
import { readLedger } from '#platform/ledger/ledger';
import { LEDGER_FILE } from '#types/modules/evidence';
import { buildChain, exitOf, latestRouteOf } from '../engine/fold.ts';
import type { FileSystem } from '#types/platform/ports';

interface SessionRoute { task: string; skill: string; routeId: string; live: boolean; endedAt: string; channel: string; lastAt: string }

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
      if (head !== null) found.push({ task: entry.name, skill: String(head['skill']), routeId: head.id, live: exit === null, endedAt: exit?.at ?? '', channel: String(head['channel']), lastAt: entries.at(-1)?.at ?? '' });
    }
  }
  return found.sort((a, b) => Number(b.live) - Number(a.live) || b.endedAt.localeCompare(a.endedAt));
}

// The longest quiet stretch inside a route that later finished was 32.4 min (385 gaps, 14 routes in the user's own repositories); 2 h is about 4x that.
// A route abandoned by a failing step or a closed window keeps no process to ask, so idle time is the only evidence it is gone.
export const STALE_ROUTE_MS = 2 * 60 * 60 * 1000;
export const isStale = (route: { lastAt: string }, now: Date): boolean => now.getTime() - Date.parse(route.lastAt) > STALE_ROUTE_MS;

/**
 * The live route the hooks drive for a session. Parallel subagents share their parent's session id, so one session can hold
 * several live routes and the session id alone does not say whose each is: the route the user typed (hook channel) is the
 * main session's own, a lone live route is the main session's, and with several candidates the hooks stay out of all of them.
 * A route idle past STALE_ROUTE_MS is not a candidate, so abandoned routes do not silence the hooks; a lone route is never hidden by its age.
 */
export async function liveRouteOf(fs: FileSystem, repositoryRoot: string, session: string, now: Date): Promise<SessionRoute | null> {
  const all = (await sessionRoutes(fs, repositoryRoot, session)).filter((route) => route.live);
  const live = all.length <= 1 ? all : all.filter((route) => !isStale(route, now));
  if (live.length <= 1) return live[0] ?? null;
  const typed = live.filter((route) => route.channel === 'hook');
  return typed.length === 1 ? typed[0]! : null;
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
