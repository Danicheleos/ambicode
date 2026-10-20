import { appendLedger } from '#platform/ledger/ledger';
import { resolveTaskDir } from './task/task-dir.ts';
import type { Runtime } from '#types/composition';

/** Init has no route of its own: with `--task` each of its commands is a creator of that task and leaves one line of what it did. */
export async function recordInit(runtime: Runtime, task: string | null, what: string, outcome: string): Promise<void> {
  if (task === null) return;
  const dir = await resolveTaskDir(runtime, task);
  await appendLedger(runtime.fs, dir.root, runtime.clock.now(), runtime.ids.writerId(), { kind: 'init', what, outcome });
}
