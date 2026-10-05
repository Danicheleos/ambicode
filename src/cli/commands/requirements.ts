import type { Runtime } from '../../composition/root.ts';
import { loadConfigWithNotices } from '../../config/load.ts';
import { openRouteView } from '../../route/context.ts';
import { runCommandTail } from '../../route/command-tail.ts';
import { splitAcs } from '../../requirements/acs.ts';
import { envelopeSources, normalizeEnvelope } from '../../requirements/envelope.ts';
import { requirementsTemplate } from '../../requirements/template.ts';
import type { RouteArgs } from '../../route/flags.ts';
import { taskSlugFor } from '../../review/review-name.ts';
import { readLedger } from '../../task/ledger.ts';
import { withLedgerLock } from '../../task/ledger-lock.ts';
import { resolveTaskDir } from '../../task/task-dir.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';
import { ownerFor, routeTools, taskOf as requireTask } from './route.ts';

export const REQUIREMENTS_TEMPLATE_OPTIONS = { values: ['task'], repeated: ['requirement'], flags: ['json'] } as const;
export const REQUIREMENTS_NORMALIZE_OPTIONS = { values: ['task'], flags: ['json'] } as const;
export const REQUIREMENTS_ACS_OPTIONS = { values: ['task'], flags: ['json'] } as const;

export interface RequirementsOutput { command: string; task: string; text: string; data: unknown; next?: string }

export async function runRequirementsTemplate(runtime: Runtime, args: ParsedArgs): Promise<RequirementsOutput> {
  const task = requireTask('requirements template', args);
  const dir = await resolveTaskDir(runtime, task);
  const config = (await loadConfigWithNotices(runtime.fs, dir.repositoryRoot)).config;
  const sources = args.all('requirement');
  const { text, bytes } = requirementsTemplate({ sources, task, mcpServer: config.requirements.mcpServer, runner: `node "${runtime.pluginRoot}/scripts/ambicode.mjs"` });
  return { command: 'requirements template', task, text, data: { sources, bytes, text } };
}

export async function runRequirementsNormalize(runtime: Runtime, args: ParsedArgs): Promise<RequirementsOutput> {
  const task = requireTask('requirements normalize', args);
  const tools = await routeTools(runtime, task);
  const view = await openRouteView(runtime, tools.routes, task, ownerFor(tools.binding, task));
  if (view === null) throw new AmbicodeError('route-not-open', `Session has no open route on task ${task}.`, { details: [`Start one: route start <skill> --task ${task}`] });
  const dir = await resolveTaskDir(runtime, task);
  const config = (await loadConfigWithNotices(runtime.fs, dir.repositoryRoot)).config;
  const result = await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), view.session, async (ledger) => {
    const route = (await ledger.read());
    const head = route.state === 'ok' ? route.entries.find((entry) => entry.id === view.routeId) : undefined;
    return normalizeEnvelope({ runtime, dir, ledger, view, args: (head?.['args'] ?? {}) as RouteArgs, mcpServer: config.requirements.mcpServer });
  });
  if (result.state === 'failed') throw new AmbicodeError(result.code, result.message, { details: ['Fetch what is missing, then run requirements normalize again.'] });
  if (result.state === 'raise') throw new AmbicodeError('requirements-not-captured', 'Nothing was captured twice: the route raises requirements-not-captured-twice; run route next to put it to the user.');
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'requirements normalize', session: tools.binding });
  const text = [`Envelope built from ${result.builtFrom}: ${result.sources.map((source) => source.key).join(', ')}.`, ...result.notices].join('\n');
  return { command: 'requirements normalize', task, text, data: { builtFrom: result.builtFrom, asked: result.asked, missingAsked: result.missingAsked, notices: result.notices }, ...(next === null ? {} : { next: next.text }) };
}

export async function runRequirementsAcs(runtime: Runtime, args: ParsedArgs): Promise<RequirementsOutput> {
  const task = requireTask('requirements acs', args);
  const slug = taskSlugFor({ requirementIds: [], task }) ?? task;
  const dir = await resolveTaskDir(runtime, slug);
  const entries = await readLedger(runtime.fs, dir.root);
  const envelope = entries.findLast((entry) => entry.kind === 'envelope');
  const route = envelope === undefined ? undefined : entries.find((entry) => entry.id === envelope['route']);
  if (envelope === undefined || route === undefined) return { command: 'requirements acs', task, text: 'No envelope is recorded for this task.', data: { units: [] } };
  const routeArgs = route['args'] as RouteArgs;
  const units = splitAcs(await envelopeSources({ runtime, dir, args: routeArgs }, envelope));
  return { command: 'requirements acs', task, text: units.length === 0 ? 'No acceptance units found.' : units.map((unit) => `${unit.id}: ${unit.quote}`).join('\n'), data: { units } };
}

export const renderRequirements = (output: RequirementsOutput): string => (output.next === undefined ? output.text : `${output.text}\n\n${output.next}`);
