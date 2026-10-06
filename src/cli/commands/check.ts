import type { Runtime } from '../../composition/root.ts';
import { runCheckOnly, type CheckOnlyOutcome } from '../../checks/check-command.ts';
import { ledgerRouteContext } from '../../route/context.ts';
import { runCommandTail } from '../../route/command-tail.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';
import { routeTools, taskOf } from './route.ts';

export const CHECK_OPTIONS = { values: ['task', 'phase'], repeated: ['only', 'approve', 'decline'], flags: ['json'], positionals: true } as const;

export interface CheckOutput { command: 'check'; task: string; key: string; result: CheckOnlyOutcome; next?: string }

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
