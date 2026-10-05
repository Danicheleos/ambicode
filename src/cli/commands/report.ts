import type { Runtime } from '../../composition/root.ts';
import { taskSlugFor } from '../../review/review-name.ts';
import { buildChain, currentIn, exitOf } from '../../route/fold.ts';
import { loadRouteRegistry } from '../../route/routes.ts';
import { readLedger } from '../../task/ledger.ts';
import { buildReport } from '../../task/report.ts';
import { resolveTaskDir } from '../../task/task-dir.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';

export const REPORT_OPTIONS = { values: ['task'], flags: ['json'] } as const;

export type ReportOutput = ReturnType<typeof buildReport>;

/** Entries a later revise superseded are marked historical, per the latest route's windows (D10). */
export async function runReport(runtime: Runtime, args: ParsedArgs): Promise<ReportOutput> {
  const task = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (task === null) throw new AmbicodeError('bad-argument', '"report" needs --task <slug>.', { field: 'task' });
  const dir = await resolveTaskDir(runtime, task);
  const entries = await readLedger(runtime.fs, dir.root);
  const head = entries.findLast((entry) => entry.kind === 'route');
  const def = head === undefined ? null : (await loadRouteRegistry(runtime.pluginRoot, runtime.fs)).route(String(head['skill']));
  if (head === undefined || def === null) return buildReport(entries);
  const chain = buildChain(entries, head);
  return buildReport(chain.entries, { current: currentIn(def, chain), complete: exitOf(chain)?.['complete'] === true });
}

export function renderReport(output: ReportOutput): string {
  return output.text;
}
