import { taskSlugFor } from '#modules/review/bundle/review-name';
import { buildChain, currentIn, exitOf } from '#harness/engine/fold';
import { loadRouteRegistry } from '#harness/definition/routes';
import { readLedger } from '#platform/ledger/ledger';
import { buildReport } from '#modules/evidence/report/report';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const REPORT_OPTIONS = { values: ['task'], flags: ['json'] } as const;

type ReportOutput = ReturnType<typeof buildReport>;

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

export const reportCommand: CliCommand = {
  name: 'report',
  summary: 'The evidence of a task and what was not verified, from its ledger.',
  options: REPORT_OPTIONS,
  run: async (runtime, args) => {
    const output = await runReport(runtime, args);
    return { text: renderReport(output), data: { evidence: output.evidence, notVerified: output.notVerified, hash: output.hash } };
  },
};
