import { COMMAND_SPECS } from '#skills/investigate/commands';
import { runCommandTail } from '#harness/engine/engine';
import { normalizeEnvelope } from '#modules/requirements/envelope/envelope';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { routeTools, taskOf as requireTask } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import type { RouteArgs } from '#types/harness';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const REQUIREMENTS_NORMALIZE_OPTIONS = { values: ['task'], flags: ['json'] } as const;

interface RequirementsOutput { command: string; task: string; text: string; data: unknown; next?: string }

export async function runRequirementsNormalize(runtime: Runtime, args: ParsedArgs): Promise<RequirementsOutput> {
  const task = requireTask('requirements normalize', args);
  const tools = await routeTools(runtime, task);
  const { view } = await tools.engine.command(COMMAND_SPECS.requirementsNormalize, { task }, async (scope) => scope);
  if (view === null) throw new AmbicodeError('route-not-open', `Session has no open route on task ${task}.`, { details: [`Start one: route start <skill> --task ${task}`] });
  const dir = await resolveTaskDir(runtime, task);
  const result = await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), view.session, async (ledger) => {
    const route = (await ledger.read());
    const head = route.state === 'ok' ? route.entries.find((entry) => entry.id === view.routeId) : undefined;
    return normalizeEnvelope({ runtime, dir, ledger, view, args: (head?.['args'] ?? {}) as RouteArgs });
  });
  if (result.state === 'failed') throw new AmbicodeError(result.code, result.message, { details: ['Fetch what is missing, then run requirements normalize again.'] });
  if (result.state === 'raise') throw new AmbicodeError('requirements-not-captured', `The route raises ${result.gate}; run route next to put it to the user.`);
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'requirements normalize', session: tools.binding });
  const text = [`Envelope built from ${result.builtFrom}: ${result.sources.map((source) => source.key).join(', ')}.`].join('\n');
  return { command: 'requirements normalize', task, text, data: { builtFrom: result.builtFrom, asked: result.asked, missingAsked: result.missingAsked }, ...(next === null ? {} : { next: next.text }) };
}

export const requirementsNormalizeCommand: CliCommand = {
  name: 'requirements normalize',
  summary: "Build the requirement envelope from what was captured (--task).",
  options: REQUIREMENTS_NORMALIZE_OPTIONS,
  run: async (runtime, args) => {
    const output = await runRequirementsNormalize(runtime, args);
    return { text: output.next === undefined ? output.text : `${output.text}\n\n${output.next}`, data: output.data };
  },
};
