import type { Runtime } from '../../composition/root.ts';
import { fsActiveRoutePointer } from '../../route/active-route.ts';
import { createEngine, type Engine, type Position, type StepMessage } from '../../route/engine.ts';
import { chainKey, loadPayload } from '../../route/delivery.ts';
import { readEntries } from '../../route/context.ts';
import { buildChain, latestRouteOf } from '../../route/fold.ts';
import { parseAnswerFlag } from '../../route/flags.ts';
import { defaultHandlers, handlerRegistry } from '../../route/handlers.ts';
import { loadRouteRegistry, type RouteRegistry } from '../../route/routes.ts';
import { cliHarnessPort, sessionUnbound, taskSessionSource, type SessionBinding } from '../../route/session.ts';
import { resolveTaskDir } from '../../task/task-dir.ts';
import { taskSlugFor } from '../../review/review-name.ts';
import { AmbicodeError } from '../../util/errors.ts';
import { contentHash } from '../../util/hash.ts';
import type { ParsedArgs } from '../args.ts';

export const ROUTE_START_OPTIONS = { values: ['task', 'project'], repeated: ['answer', 'requirement'], flags: ['json', 'headless', 'fresh', 'adopt'], positionals: true } as const;
export const ROUTE_NEXT_OPTIONS = { values: ['task', 'default', 'revise', 'conflict', 'sources', 'project', 'show'], repeated: ['answer'], flags: ['json'] } as const;
export const ROUTE_STATUS_OPTIONS = { values: ['task'], flags: ['json'] } as const;
export const ROUTE_STOP_OPTIONS = { values: ['task', 'reason', 'detail'], flags: ['json'] } as const;

export interface RouteTools { engine: Engine; routes: RouteRegistry; binding: SessionBinding }

/** The engine over the shipped routes; `binding` is the owner of the named task's one live route, unbound when there is none to name. */
export async function routeTools(runtime: Runtime, task: string | null): Promise<RouteTools> {
  const routes = await loadRouteRegistry(runtime.pluginRoot, runtime.fs);
  const engine = createEngine({ runtime, routes, handlers: handlerRegistry(defaultHandlers()), pointer: fsActiveRoutePointer(runtime.fs) });
  return { engine, routes, binding: task === null ? { state: 'unbound', reason: 'missing' } : await taskSessionSource(task).resolve(runtime) };
}

export function taskOf(command: string, args: ParsedArgs): string {
  const task = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (task === null) throw new AmbicodeError('bad-argument', `"${command}" needs --task <slug>.`, { field: 'task' });
  return task;
}

/** The owner a call speaks for; a task with no live route or with several is an error, not a guess. */
export function ownerFor(binding: SessionBinding, task: string): string {
  if (binding.state === 'unbound') throw sessionUnbound(binding, task);
  return binding.session;
}

export interface RouteOutput extends StepMessage { command: string; extra?: string }

export async function runRouteStart(runtime: Runtime, args: ParsedArgs): Promise<RouteOutput> {
  const [skill, ...words] = args.positionals;
  if (skill === undefined) throw new AmbicodeError('bad-argument', '"route start" needs a skill: route start <skill> [request…].', { field: 'skill' });
  const { engine } = await routeTools(runtime, null);
  const session = runtime.ids.ownerId();
  const text = words.join(' ');
  const channel = (await cliHarnessPort.validate(runtime, session, contentHash(`${skill} ${text}`))) ? 'harness' : 'cli';
  const task = args.value('task');
  const project = args.value('project');
  const message = await engine.start({
    skill,
    text,
    requirements: args.all('requirement'),
    ...(task === null ? {} : { task: taskSlugFor({ requirementIds: [], task }) ?? task }),
    headless: args.flag('headless'),
    ...(project === null ? {} : { project }),
    answers: args.all('answer').map(parseAnswerFlag),
    fresh: args.flag('fresh'),
    adopt: args.flag('adopt'),
    cwd: runtime.cwd,
    session,
    channel,
  });
  return { command: 'route start', ...message };
}

export async function runRouteNext(runtime: Runtime, args: ParsedArgs): Promise<RouteOutput> {
  const task = taskOf('route next', args);
  const { engine, binding } = await routeTools(runtime, task);
  const session = ownerFor(binding, task);
  const conflict = args.value('conflict');
  const sources = args.value('sources');
  if ((conflict === null) !== (sources === null)) throw new AmbicodeError('bad-argument', '--conflict and --sources go together.', { field: 'conflict' });
  const defaultGate = args.value('default');
  const revise = args.value('revise');
  const project = args.value('project');
  const show = args.value('show');
  const message = await engine.advance({
    task,
    session,
    cause: 'route-next',
    answers: args.all('answer').map(parseAnswerFlag),
    ...(defaultGate === null ? {} : { default: defaultGate }),
    ...(revise === null ? {} : { revise }),
    ...(conflict === null || sources === null ? {} : { conflict: { summary: conflict, sources: sources.split(',').map((source) => source.trim()) } }),
    ...(project === null ? {} : { project }),
    ...(show === null ? {} : { show }),
  });
  const shown = show === null ? null : await shownPayload(runtime, task, session, show);
  return { command: 'route next', ...message, ...(shown === null ? {} : { extra: shown }) };
}

async function shownPayload(runtime: Runtime, task: string, session: string, key: string): Promise<string | null> {
  const entries = await readEntries(runtime, task);
  const head = latestRouteOf(entries, session);
  return head === null ? null : loadPayload(runtime.fs, await resolveTaskDir(runtime, task), chainKey([...buildChain(entries, head).ids]), key);
}

export interface RouteStatusOutput { command: 'route status'; task: string; routes: Position[] }

export async function runRouteStatus(runtime: Runtime, args: ParsedArgs): Promise<RouteStatusOutput> {
  const task = taskOf('route status', args);
  const { engine } = await routeTools(runtime, null);
  return { command: 'route status', task, routes: await engine.status(task, null) };
}

export interface RouteStopOutput { command: 'route stop'; task: string; reason: string }

export async function runRouteStop(runtime: Runtime, args: ParsedArgs): Promise<RouteStopOutput> {
  const task = taskOf('route stop', args);
  const reason = args.value('reason');
  if (reason === null || !['blocked', 'human', 'inconclusive', 'budget'].includes(reason)) {
    throw new AmbicodeError('bad-argument', '"route stop" needs --reason blocked|human|inconclusive|budget.', { field: 'reason' });
  }
  const { engine, binding } = await routeTools(runtime, task);
  const detail = args.value('detail');
  await engine.stop(task, ownerFor(binding, task), reason as 'blocked', detail ?? undefined);
  return { command: 'route stop', task, reason };
}

export const renderMessage = (output: RouteOutput): string => (output.extra === undefined ? output.text : `${output.text}\n\n${output.extra}`);

export function renderRouteStatus(output: RouteStatusOutput): string {
  if (output.routes.length === 0) return `No route is open on task ${output.task}.`;
  return output.routes
    .map((route) => {
      const lines = [
        `Route ${route.routeId} (${route.skill}) at ${route.position}; sessions: ${route.sessions.map((entry) => `${entry.session}${entry.adopts ? ' (adopted)' : ''}`).join(', ')}`,
        ...(route.owner === null || route.owner.state !== 'owned' ? [] : [`  owner: ${route.owner.session}`]),
        ...route.steps.map((step) => `  ${step.state.padEnd(8)} ${step.id}`),
        `  cycles ${route.cycles}; repeats left ${JSON.stringify(route.repeatsLeft)}; revises left ${JSON.stringify(route.revisesLeft)}`,
        ...route.limits.map((limit) => `  limit: ${limit['which']}${typeof limit['step'] === 'string' ? ` at ${limit['step']}` : ''}`),
        ...route.maps.map((map) => `  map ${map.id}: ${map.layers.map((layer) => (layer as { name?: string }).name).join(' → ')}`),
        ...(route.orphans.length === 0 ? [] : [`  files no entry names: ${route.orphans.join(', ')}`]),
      ];
      return lines.join('\n');
    })
    .join('\n');
}
