import path from 'node:path';
import { findSessionRepository } from '#platform/git/session-repository';
import { readLedger } from '#platform/ledger/ledger';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { TASKS_DIR } from '#types/defaults';
import type { HookInput } from '#types/hook';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ActiveRoutePointer } from '#types/harness';
import { liveHeads } from '../engine/fold.ts';
import { harnessOf } from './harness.ts';

/** The Claude session wrote `session{end}` and no route entry has been written for it since (a resume or rebind brings it back). */
export const harnessEnded = (entries: readonly LedgerEntry[], harness: string): boolean => {
  const ended = entries.findLastIndex((entry) => entry.kind === 'session' && entry['event'] === 'end' && entry['harnessSession'] === harness);
  return ended >= 0 && !entries.slice(ended + 1).some((entry) => entry.kind === 'route' && harnessOf(entry) === harness);
};

/** The route entry that hands `head` over to `to`: same owner and arguments, `rebind` names both Claude sessions. */
export const rebindEntry = (head: LedgerEntry, to: string, scratchpad: string | undefined): { kind: 'route'; [key: string]: unknown } => ({
  kind: 'route', skill: head['skill'], args: head['args'], mode: head['mode'], channel: head['channel'], trusted: head['trusted'],
  session: head['session'], harnessSession: to, ...(scratchpad === undefined ? {} : { scratchpad }), epoch: head['epoch'],
  resumes: head.id, adopts: true, rebind: { from: harnessOf(head), to },
});

const ORPHAN_WINDOW_MS = 30 * 60_000;
const REVIVAL_GRACE_MS = 10_000;

interface TaskLedger { task: string; dir: string; entries: LedgerEntry[] }

async function taskLedgers(runtime: Runtime, root: string): Promise<TaskLedger[]> {
  const tasks = (await runtime.fs.readdir(path.join(root, TASKS_DIR)).catch(() => [])).filter((entry) => entry.isDirectory());
  return Promise.all(tasks.map(async (entry) => {
    const dir = taskDirFor(root, entry.name).root;
    return { task: entry.name, dir, entries: await readLedger(runtime.fs, dir).catch(() => []) };
  }));
}

/** Ended recently enough that the next new session is plausibly its continuation (a `/clear`), not an unrelated terminal. */
const endedRecently = (entries: readonly LedgerEntry[], harness: string, now: Date): boolean => {
  const end = entries.findLast((entry) => entry.kind === 'session' && entry['event'] === 'end' && entry['harnessSession'] === harness);
  return end !== undefined && now.getTime() - Date.parse(end.at) <= ORPHAN_WINDOW_MS;
};

/**
 * Attaches a new Claude session to the one live route in the repository whose own session has ended (a ledger `session{end}`) within
 * the last 30 minutes; any other count attaches nothing and `--adopt` stays the explicit takeover. The route keeps its owner.
 */
export async function rebindSession(runtime: Runtime, input: HookInput, pointer: ActiveRoutePointer): Promise<boolean> {
  if (input.agent_id !== undefined) return false;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return false;
  const root = found.repositoryRoot;
  const session = input.session_id;
  if ((await pointer.read(session, input.scratchpad_dir)) !== null) return false;
  const ledgers = await taskLedgers(runtime, root);

  // The same Claude session resumed: its own live route gets its pointer back; a hand-over is written once, after an end.
  for (const { task, dir, entries } of ledgers) {
    const own = liveHeads(entries).filter((head) => harnessOf(head) === session).at(-1);
    if (own === undefined || typeof own['session'] !== 'string') continue;
    await withLedgerLock(runtime.fs, dir, () => runtime.clock.now(), session, async (ledger) => {
      const read = await ledger.read();
      if (read.state !== 'ok') return;
      const tip = liveHeads(read.entries).find((live) => live.id === own.id);
      if (tip === undefined) return;
      const moved = input.scratchpad_dir !== undefined && tip['scratchpad'] !== input.scratchpad_dir;
      if (moved || harnessEnded(read.entries, session)) await ledger.append(rebindEntry(tip, session, input.scratchpad_dir));
    });
    await pointer.write(session, input.scratchpad_dir, { task, skill: String(own['skill']), owner: own['session'] });
    return true;
  }

  const now = runtime.clock.now();
  const orphaned = ledgers.flatMap(({ task, dir, entries }) => liveHeads(entries).filter((head) => {
    const harness = harnessOf(head);
    return harness !== null && harnessEnded(entries, harness) && endedRecently(entries, harness, now);
  }).map((head) => ({ task, dir, head })));
  if (orphaned.length !== 1) return false;
  const { task, dir, head } = orphaned[0]!;
  const owner = head['session'];
  if (typeof owner !== 'string' || owner === '') return false;

  const attached = await withLedgerLock(runtime.fs, dir, () => runtime.clock.now(), session, async (ledger) => {
    const read = await ledger.read();
    const harness = harnessOf(head);
    if (read.state !== 'ok' || harness === null || !liveHeads(read.entries).some((live) => live.id === head.id) || !harnessEnded(read.entries, harness)) return false;
    await ledger.append(rebindEntry(head, session, input.scratchpad_dir));
    return true;
  });
  if (attached) await pointer.write(session, input.scratchpad_dir, { task, skill: String(head['skill']), owner });
  return attached;
}

/** SessionEnd: records the end in every task whose latest route of this session is a chain head; a repeated end writes nothing. */
export async function endSession(runtime: Runtime, input: HookInput): Promise<void> {
  if (input.agent_id !== undefined) return;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return;
  const session = input.session_id;
  const reason = typeof input['reason'] === 'string' && input['reason'] !== '' ? input['reason'] : 'other';
  for (const { dir, entries } of await taskLedgers(runtime, found.repositoryRoot)) {
    if (!entries.some((entry) => entry.kind === 'route' && harnessOf(entry) === session)) continue;
    await withLedgerLock(runtime.fs, dir, () => runtime.clock.now(), session, async (ledger) => {
      const read = await ledger.read();
      if (read.state !== 'ok' || harnessEnded(read.entries, session)) return;
      const route = read.entries.findLast((entry) => entry.kind === 'route' && harnessOf(entry) === session);
      if (route === undefined || read.entries.some((entry) => entry.kind === 'route' && entry['resumes'] === route.id)) return;
      // The previous process's end can arrive after the same id resumed: an end this soon after its own revival is that stale one.
      const rebind = route['rebind'] as { from?: unknown; to?: unknown } | undefined;
      if (rebind?.from === session && rebind.to === session && runtime.clock.now().getTime() - Date.parse(route.at) <= REVIVAL_GRACE_MS) return;
      await ledger.append({ kind: 'session', route: route.id, harnessSession: session, event: 'end', reason });
    });
  }
}
