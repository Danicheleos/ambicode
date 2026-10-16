import { runCheckOnly } from '#modules/checks/run/check-command';
import { COMMAND_SPECS } from '#skills/task/commands';
import { runCommandTail } from '#harness/engine/engine';
import { buildChain, delegatedStepOf } from '#harness/engine/fold';
import { AmbicodeError } from '#util/errors';
import { routeTools, taskOf } from '../route/route.ts';
import type { CheckOnlyOutcome } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { RouteView } from '#types/harness';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ParsedArgs, CliCommand, RouteTools } from '../../types/cli.ts';

export const CHECK_OPTIONS = { values: ['task', 'phase', 'name', 'project'], repeated: ['file', 'approve', 'decline'], flags: ['json'] } as const;

const delegatedAt = (tools: RouteTools, view: RouteView | null, entries: LedgerEntry[]): boolean => {
  const def = view === null ? null : tools.routes.route(view.skill);
  const head = entries.find((entry) => entry.kind === 'route' && entry.id === view?.routeId);
  return def !== null && head !== undefined && delegatedStepOf(def, buildChain(entries, head)) !== null;
};

interface CheckOutput { command: 'check'; task: string; name: string; result: CheckOnlyOutcome; next?: string; held?: true }

export async function runCheckCommand(runtime: Runtime, args: ParsedArgs): Promise<CheckOutput> {
  const task = taskOf('check', args);
  const name = args.value('name');
  if (name === null) throw new AmbicodeError('bad-argument', '"check" needs --name <key>.', { field: 'name' });
  const phase = args.value('phase');
  if (phase !== 'red' && phase !== 'green') throw new AmbicodeError('bad-argument', '"check" needs --phase red|green.', { field: 'phase' });
  const tools = await routeTools(runtime, task);
  const { result, binding, delegated } = await tools.engine.command(COMMAND_SPECS.check, { task }, async ({ session, context, binding, view }) => ({
    binding,
    delegated: delegatedAt(tools, view, await context.entries(task)),
    result: await runCheckOnly({ runtime, session, context }, { task, name, project: args.value('project'), files: args.all('file'), phase, approve: args.all('approve'), decline: args.all('decline') }),
  }));
  const produced = result.outcome === 'ran' ? [result.entry.id] : undefined;
  // While a delegated step's subagent is in flight it runs this; its return hook advances the route in the main session, so no route text reaches the subagent.
  const next = delegated ? null : await runCommandTail({ engine: tools.engine }, { task, cause: 'check', session: binding, ...(produced === undefined ? {} : { produced }) });
  return { command: 'check', task, name, result, ...(next === null ? {} : { next: next.text }), ...(delegated && result.outcome === 'ran' ? { held: true as const } : {}) };
}

export function renderCheck(output: CheckOutput): string {
  const { result } = output;
  const line = (() => {
    switch (result.outcome) {
      case 'ran': {
        const { entry, proof } = result;
        const key = entry.key;
        return `check ${key} ${entry.phase}: exit ${entry.exit} (${entry.phase === 'red' ? 'red = exit != 0' : 'green = exit 0'}) — ${proof.proven ? 'as expected' : `not as expected (${proof.cause})`}\n${entry.tail ?? ''}`.trimEnd();
      }
      case 'not-run': return `check ${output.name}: not run (${result.status}): ${result.detail}`;
      case 'waiting': return `check ${result.key}: waiting for the user's answer to ${result.gate}; nothing was run.`;
      case 'declined': return `check ${result.key}: declined; nothing was run. It stays under Not verified.`;
    }
  })();
  return output.held ? `${line}\n\nRecorded. The route moves on when the implementer returns.` : output.next === undefined ? line : `${line}\n\n${output.next}`;
}

export const checkCommand: CliCommand = {
  name: 'check',
  summary: 'Run a configured check and record it (--name, --phase, optional --file, --project). At a delegated step it records without advancing the route.',
  options: CHECK_OPTIONS,
  run: async (runtime, args) => {
    const output = await runCheckCommand(runtime, args);
    return { text: renderCheck(output), data: output };
  },
};
