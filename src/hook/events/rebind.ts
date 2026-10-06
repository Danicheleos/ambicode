import path from 'node:path';
import { findSessionRepository } from '#composition/session-repository';
import { TASKS_DIR } from '#types/defaults';
import type { HookInput } from '#types/hook';
import { liveHeads } from '#harness/engine/fold';
import { harnessOf } from '#harness/session/harness';
import { readLedger } from '#modules/evidence/ledger/ledger';
import { withLedgerLock } from '#modules/evidence/ledger/ledger-lock';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { anySessionEnded, sessionEnded } from '../session/markers.ts';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ActiveRoutePointer } from '#types/harness';

/**
 * Attaches a new Claude session to the one live route in the repository whose own session has ended; any other count
 * attaches nothing and `--adopt` stays the explicit takeover. The route keeps its owner; a `resumes` record names the session.
 */
export async function rebindSession(runtime: Runtime, input: HookInput, pointer: ActiveRoutePointer): Promise<boolean> {
  if (input.agent_id !== undefined) return false;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return false;
  const root = found.repositoryRoot;
  const session = input.session_id;
  if ((await pointer.read(session, input.scratchpad_dir)) !== null) return false;
  const tasks = (await runtime.fs.readdir(path.join(root, TASKS_DIR)).catch(() => [])).filter((entry) => entry.isDirectory());

  // The same Claude session resumed: its own live route gets its pointer back.
  for (const entry of tasks) {
    const own = liveHeads(await readLedger(runtime.fs, taskDirFor(root, entry.name).root).catch(() => [])).filter((head) => harnessOf(head) === session).at(-1);
    if (own === undefined || typeof own['session'] !== 'string') continue;
    if (input.scratchpad_dir !== undefined && own['scratchpad'] !== input.scratchpad_dir) {
      await withLedgerLock(runtime.fs, taskDirFor(root, entry.name).root, () => runtime.clock.now(), session, (ledger) => ledger.append({
        kind: 'route', skill: own['skill'], args: own['args'], mode: own['mode'], channel: own['channel'], trusted: own['trusted'],
        session: own['session'], harnessSession: session, scratchpad: input.scratchpad_dir, epoch: own['epoch'], resumes: own.id, adopts: true,
      }));
    }
    await pointer.write(session, input.scratchpad_dir, { task: entry.name, skill: String(own['skill']), owner: own['session'] });
    return true;
  }
  if (!(await anySessionEnded(runtime.fs))) return false;

  const orphaned: { task: string; head: LedgerEntry }[] = [];
  for (const entry of tasks) {
    for (const head of liveHeads(await readLedger(runtime.fs, taskDirFor(root, entry.name).root).catch(() => []))) {
      const harness = harnessOf(head);
      if (harness !== null && (await sessionEnded(runtime.fs, harness))) orphaned.push({ task: entry.name, head });
    }
  }
  if (orphaned.length !== 1) return false;
  const { task, head } = orphaned[0]!;
  const owner = head['session'];
  if (typeof owner !== 'string' || owner === '') return false;

  const attached = await withLedgerLock(runtime.fs, taskDirFor(root, task).root, () => runtime.clock.now(), session, async (ledger) => {
    const read = await ledger.read();
    if (read.state !== 'ok' || !liveHeads(read.entries).some((live) => live.id === head.id)) return false;
    await ledger.append({
      kind: 'route', skill: head['skill'], args: head['args'], mode: head['mode'], channel: head['channel'], trusted: head['trusted'],
      session: owner, harnessSession: session, ...(input.scratchpad_dir === undefined ? {} : { scratchpad: input.scratchpad_dir }), epoch: head['epoch'], resumes: head.id, adopts: true,
    });
    return true;
  });
  if (attached) await pointer.write(session, input.scratchpad_dir, { task, skill: String(head['skill']), owner });
  return attached;
}
