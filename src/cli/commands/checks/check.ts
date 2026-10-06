import { runCheckOnly } from '#modules/checks/run/check-command';
import { ledgerRouteContext } from '#harness/engine/context';
import { runCommandTail } from '#harness/engine/command-tail';
import { AmbicodeError } from '#util/errors';
import { routeTools, taskOf } from '../route/route.ts';
import type { CheckOnlyOutcome } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const CHECK_OPTIONS = { values: ['task', 'phase'], repeated: ['only', 'approve', 'decline'], flags: ['json'], positionals: true } as const;

interface CheckOutput { command: 'check'; task: string; key: string; result: CheckOnlyOutcome; next?: string }

export async function runCheckCommand(runtime: Runtime, args: ParsedArgs): Promise<CheckOutput> {
  const task = taskOf('check', args);
  if (args.positionals.length !== 1) throw new AmbicodeError('bad-argument', '"check" takes exactly one <projectId>/<checkId>.', { field: 'key' });
  const key = args.positionals[0]!;
  const phase = args.value('phase');
  if (phase !== 'red' && phase !== 'green') throw new AmbicodeError('bad-argument', '"check" needs --phase red|green.', { field: 'phase' });
  const tools = await routeTools(runtime, task);
  const session = tools.binding.state === 'bound' ? tools.binding.session : null;
  const result = await runCheckOnly(
    { runtime, session, context: ledgerRouteContext({ runtime, routes: tools.routes }), routes: tools.routes },
    { task, key, only: args.all('only'), phase, approve: args.all('approve'), decline: args.all('decline') },
  );
  const produced = result.outcome === 'ran' ? [result.entry.id] : undefined;
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'check', session: tools.binding, ...(produced === undefined ? {} : { produced }) });
  return { command: 'check', task, key, result, ...(next === null ? {} : { next: next.text }) };
}

export function renderCheck(output: CheckOutput): string {
  const { result, key } = output;
  const line = (() => {
    switch (result.outcome) {
      case 'ran': {
        const { entry, proof } = result;
        const summary = entry.summary === null ? 'no summary' : `ran ${entry.summary.ran}, failed ${entry.summary.failed}`;
        return `check ${key} ${entry.phase}: exit ${entry.exit}, ${summary} — proof: ${proof.proven ? 'met' : `not met (${proof.cause})`}`;
      }
      case 'not-run': return `check ${key}: not run (${result.status}): ${result.detail} — proof: not met (no-summary)`;
      case 'waiting': return `check ${key}: waiting for the user's answer to ${result.gate}; nothing was run.`;
      case 'declined': return `check ${key}: declined; nothing was run. It stays under Not verified.`;
    }
  })();
  return output.next === undefined ? line : `${line}\n\n${output.next}`;
}

export const checkCommand: CliCommand = {
  name: 'check',
  options: CHECK_OPTIONS,
  run: async (runtime, args) => {
    const output = await runCheckCommand(runtime, args);
    return { text: renderCheck(output), data: output };
  },
};
