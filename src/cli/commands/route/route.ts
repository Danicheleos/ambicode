import { createApp } from '#composition/app';
import { parseAnswerFlag } from '#harness/definition/flags';
import { sessionUnbound, taskSessionSource } from '#harness/session/session';
import { taskSlugFor } from '#modules/review/bundle/review-name';
import { AmbicodeError } from '#util/errors';
import { startTarget } from '#composition/start';
import type { Runtime } from '#types/composition';
import { EXITS } from '#types/harness';
import type { Exit, StepMessage, SessionBinding } from '#types/harness';
import type { ParsedArgs, RouteTools, CliCommand } from '../../types/cli.ts';
import { ROUTE_START_OPTIONS } from '#types/cli';

export { startTarget };

export const ROUTE_NEXT_OPTIONS = { values: ['task', 'revise', 'project'], repeated: ['answer'], flags: ['json'] } as const;

/** The engine over the shipped routes; `binding` is the owner of the named task's one live route, unbound when there is none to name. */
export async function routeTools(runtime: Runtime, task: string | null): Promise<RouteTools> {
  const { engine, routes } = await createApp(runtime);
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

interface RouteOutput extends StepMessage { command: string }

export async function runRouteStart(runtime: Runtime, args: ParsedArgs): Promise<RouteOutput> {
  const [skill, ...words] = args.positionals;
  if (skill === undefined) throw new AmbicodeError('bad-argument', '"route start" needs a skill: route start <skill> [request…].', { field: 'skill' });
  const { engine } = await routeTools(runtime, null);
  const session = runtime.ids.ownerId();
  const text = words.join(' ');
  const task = args.value('task');
  const project = args.value('project');
  const plan = args.value('plan');
  const fromDraft = args.value('from-draft');
  const target = startTarget(skill, args);
  const message = await engine.start({
    skill,
    text,
    requirements: args.all('requirement'),
    ...(task === null ? {} : { task: taskSlugFor({ requirementIds: [], task }) ?? task }),
    headless: args.flag('headless'),
    ...(project === null ? {} : { project }),
    ...(plan === null ? {} : { plan }),
    ...(fromDraft === null ? {} : { fromDraft }),
    ...(target === undefined ? {} : { target }),
    answers: args.all('answer').map(parseAnswerFlag),
    fresh: args.flag('fresh'),
    cwd: runtime.cwd,
    session,
    channel: 'cli',
  });
  return { command: 'route start', ...message };
}

export async function runRouteNext(runtime: Runtime, args: ParsedArgs): Promise<RouteOutput> {
  const task = taskOf('route next', args);
  const { engine, binding } = await routeTools(runtime, task);
  const session = ownerFor(binding, task);
  const revise = args.value('revise');
  const project = args.value('project');
  const message = await engine.advance({
    task,
    session,
    cause: 'route-next',
    answers: args.all('answer').map(parseAnswerFlag),
    ...(revise === null ? {} : { revise }),
    ...(project === null ? {} : { project }),
  });
  return { command: 'route next', ...message };
}

export const routeStartCommand: CliCommand = {
  name: 'route start',
  summary: "Start a skill's route: route start <skill> [request].",
  options: ROUTE_START_OPTIONS,
  run: async (runtime, args) => {
    const output = await runRouteStart(runtime, args);
    return { text: output.text, data: output };
  },
};

export const routeNextCommand: CliCommand = {
  name: 'route next',
  summary: 'End the current step and print the next one (--task).',
  options: ROUTE_NEXT_OPTIONS,
  run: async (runtime, args) => {
    const output = await runRouteNext(runtime, args);
    return { text: output.text, data: output };
  },
};

export const ROUTE_STOP_OPTIONS = { values: ['task', 'reason', 'detail'], flags: ['json'] } as const;
const STOP_REASONS: readonly Exit[] = ['blocked', 'human', 'inconclusive'];

export const routeStopCommand: CliCommand = {
  name: 'route stop',
  summary: 'End the route unfinished (--task, --reason, --detail).',
  options: ROUTE_STOP_OPTIONS,
  run: async (runtime, args) => {
    const task = taskOf('route stop', args);
    const reason = EXITS.find((exit) => exit === args.value('reason'));
    if (reason === undefined || !STOP_REASONS.includes(reason)) throw new AmbicodeError('bad-argument', `--reason is one of ${STOP_REASONS.join(', ')}.`, { field: 'reason' });
    const { engine, binding } = await routeTools(runtime, task);
    const detail = args.value('detail') ?? undefined;
    await engine.stop(task, ownerFor(binding, task), reason, detail);
    return { text: `Route on ${task} stopped: ${reason}.`, data: { command: 'route stop', task, reason, ...(detail === undefined ? {} : { detail }) } };
  },
};
