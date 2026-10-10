import { runCheckOnly } from '#modules/checks/run/check-command';
import { COMMAND_SPECS } from '#skills/task/commands';
import { runCommandTail } from '#harness/engine/engine';
import { AmbicodeError } from '#util/errors';
import { routeTools, taskOf } from '../route/route.ts';
import type { CheckOnlyOutcome } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const CHECK_OPTIONS = { values: ['task', 'phase', 'name', 'project'], repeated: ['file', 'approve', 'decline'], flags: ['json'] } as const;

interface CheckOutput { command: 'check'; task: string; name: string; result: CheckOnlyOutcome; next?: string }

export async function runCheckCommand(runtime: Runtime, args: ParsedArgs): Promise<CheckOutput> {
  const task = taskOf('check', args);
  const name = args.value('name');
  if (name === null) throw new AmbicodeError('bad-argument', '"check" needs --name <check>.', { field: 'name' });
  const phase = args.value('phase');
  if (phase !== 'red' && phase !== 'green') throw new AmbicodeError('bad-argument', '"check" needs --phase red|green.', { field: 'phase' });
  const tools = await routeTools(runtime, task);
  const { result, binding } = await tools.engine.command(COMMAND_SPECS.check, { task }, async ({ session, context, binding }) => ({
    binding,
    result: await runCheckOnly({ runtime, session, context }, { task, name, project: args.value('project'), files: args.all('file'), phase, approve: args.all('approve'), decline: args.all('decline') }),
  }));
  const produced = result.outcome === 'ran' ? [result.entry.id] : undefined;
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'check', session: binding, ...(produced === undefined ? {} : { produced }) });
  return { command: 'check', task, name, result, ...(next === null ? {} : { next: next.text }) };
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
  return output.next === undefined ? line : `${line}\n\n${output.next}`;
}

export const checkCommand: CliCommand = {
  name: 'check',
  summary: 'Run a configured check and record it (--name, --phase, optional --file, --project).',
  options: CHECK_OPTIONS,
  run: async (runtime, args) => {
    const output = await runCheckCommand(runtime, args);
    return { text: renderCheck(output), data: output };
  },
};
