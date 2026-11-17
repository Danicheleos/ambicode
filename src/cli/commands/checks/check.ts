import { runCheckOnly, splitByProject, outputPointer } from '#modules/checks/run/check-command';
import { COMMAND_SPECS } from '#skills/task/commands';
import { runCommandTail } from '#harness/engine/engine';
import { AmbicodeError } from '#util/errors';
import { delegatedAt, routeTools, taskOf } from '../route/route.ts';
import type { CheckOnlyOutcome } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const CHECK_OPTIONS = { values: ['task', 'phase', 'name', 'project'], repeated: ['file', 'approve', 'decline'], flags: ['json'] } as const;

type CheckResult = CheckOnlyOutcome | { outcome: 'refused'; key: string; code: string; message: string };

interface CheckOutput { command: 'check'; task: string; name: string; results: CheckResult[]; next?: string; held?: true; failed?: true }

export async function runCheckCommand(runtime: Runtime, args: ParsedArgs): Promise<CheckOutput> {
  const task = taskOf('check', args);
  const name = args.value('name');
  if (name === null) throw new AmbicodeError('bad-argument', '"check" needs --name <key>.', { field: 'name' });
  const phase = args.value('phase');
  if (phase !== 'green') throw new AmbicodeError('bad-argument', '"check" needs --phase green.', { field: 'phase' });
  const tools = await routeTools(runtime);
  const { results, delegated } = await tools.engine.command(COMMAND_SPECS.check, { task }, async ({ session, context, view }) => {
    const deps = { runtime, session, context };
    const results: CheckResult[] = [];
    const inputs = await splitByProject(deps, { task, name, project: args.value('project'), files: args.all('file'), phase, approve: args.all('approve'), decline: args.all('decline') });
    for (const input of inputs) {
      try {
        results.push(await runCheckOnly(deps, input));
      } catch (error) {
        // One project's run-time refusal (step limit, policy) must not hide the runs already recorded for the others; a single request throws as before.
        if (inputs.length === 1 || !(error instanceof AmbicodeError)) throw error;
        results.push({ outcome: 'refused', key: `${input.project}/${name}`, code: error.code, message: error.message });
      }
    }
    return { delegated: delegatedAt(tools, view, await context.entries(task)), results };
  });
  const ran = results.flatMap((result) => (result.outcome === 'ran' ? [result.entry.id] : []));
  const produced = ran.length > 0 ? ran : undefined;
  // While a delegated step's subagent is in flight it runs this; the main session's `route next` advances the route, so no route text reaches the subagent.
  const next = delegated ? null : await runCommandTail({ engine: tools.engine }, { task, cause: 'check', ...(produced === undefined ? {} : { produced }) });
  return { command: 'check', task, name, results, ...(next === null ? {} : { next: next.text }), ...(delegated && ran.length > 0 ? { held: true as const } : {}), ...(results.some((result) => result.outcome === 'refused') ? { failed: true as const } : {}) };
}

export function renderCheck(output: CheckOutput): string {
  const line = output.results.map((result) => {
    switch (result.outcome) {
      case 'ran': {
        const { entry, proof } = result;
        const key = entry.key;
        return `check ${key} ${entry.phase}: exit ${entry.exit} (green = exit 0) — ${proof.proven ? 'as expected' : `not as expected (${proof.cause})`}\n${outputPointer(entry)}`;
      }
      case 'not-run': return `check ${output.name}: not run (${result.status}): ${result.detail}`;
      case 'waiting': return `check ${result.key}: waiting for the user's answer to ${result.gate}; nothing was run.`;
      case 'declined': return `check ${result.key}: declined; nothing was run. It stays under Not verified.`;
      case 'refused': return `check ${result.key}: not run (${result.code}): ${result.message}`;
    }
  }).join('\n');
  return output.held ? `${line}\n\nRecorded; the main session advances the route.` : output.next === undefined ? line : `${line}\n\n${output.next}`;
}

export const checkCommand: CliCommand = {
  name: 'check',
  summary: 'Run a configured check and record it (--name, --phase, --file, --project). At a delegated step it does not advance the route.',
  options: CHECK_OPTIONS,
  run: async (runtime, args) => {
    const output = await runCheckCommand(runtime, args);
    return { text: renderCheck(output), data: output, ...(output.failed === true ? { exitCode: 1 } : {}) };
  },
};
