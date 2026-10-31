import path from 'node:path';
import { taskOf } from './route.ts';
import { readLedger } from '#platform/ledger/ledger';
import { renderSummary } from '#modules/evidence/report/summary';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

const REPORT_OPTIONS = { values: ['task'], flags: ['json'] } as const;

/** The same text closeRoute writes to summary.md, rendered from the ledger as it is now. */
async function runReport(runtime: Runtime, args: ParsedArgs): Promise<string> {
  const dir = await resolveTaskDir(runtime, taskOf('report', args));
  return renderSummary(dir.slug, await readLedger(runtime.fs, dir.root), (file) => runtime.fs.readText(path.join(dir.repositoryRoot, file)).catch(() => null));
}

export const reportCommand: CliCommand = {
  name: 'report',
  summary: 'The task summary: plan, iterations and what was not verified, from its ledger.',
  options: REPORT_OPTIONS,
  run: async (runtime, args) => {
    const summary = await runReport(runtime, args);
    return { text: summary, data: { summary } };
  },
};
