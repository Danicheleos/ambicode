import type { Runtime } from '../../composition/root.ts';
import { taskSlugFor } from '../../review/review-name.ts';
import { readLedger } from '../../task/ledger.ts';
import { buildReport } from '../../task/report.ts';
import { resolveTaskDir } from '../../task/task-dir.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';

export const REPORT_OPTIONS = { values: ['task'], flags: ['json'] } as const;

export type ReportOutput = ReturnType<typeof buildReport>;

/** Route windows come with step 03; until then every entry of the ledger counts as current. */
export async function runReport(runtime: Runtime, args: ParsedArgs): Promise<ReportOutput> {
  const task = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (task === null) throw new AmbicodeError('bad-argument', '"report" needs --task <slug>.', { field: 'task' });
  const dir = await resolveTaskDir(runtime, task);
  return buildReport(await readLedger(runtime.fs, dir.root));
}

export function renderReport(output: ReportOutput): string {
  return output.text;
}
