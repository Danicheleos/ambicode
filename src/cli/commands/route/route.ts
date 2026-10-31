import { createApp } from '#composition/app';
import { answersOf, parseAnswerFlag } from '#harness/definition/flags';
import { taskSlugFor } from '#modules/review/bundle/review-name';
import { AmbicodeError } from '#util/errors';
import { startTarget } from '#composition/start';
import { buildChain, delegatedStepOf } from '#harness/engine/fold';
import type { Runtime } from '#types/composition';
import { EXITS } from '#types/harness';
import type { Exit, RouteView, StepMessage } from '#types/harness';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ParsedArgs, RouteTools, CliCommand } from '../../types/cli.ts';
import { ROUTE_START_OPTIONS } from '#types/cli';

export { startTarget };

export const ROUTE_NEXT_OPTIONS = { values: ['task', 'project'], repeated: ['answer'], flags: ['json'] } as const;

export async function routeTools(runtime: Runtime): Promise<RouteTools> {
  const { engine, routes } = await createApp(runtime);
  return { engine, routes };
}

export function taskOf(command: string, args: ParsedArgs): string {
  const task = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (task === null) throw new AmbicodeError('bad-argument', `"${command}" needs --task <slug>.`, { field: 'task' });
  return task;
}

/** Whether a delegated step's subagent is in flight, so its own commands record without advancing: the main session's `route next` does. */
export const delegatedAt = (tools: RouteTools, view: RouteView | null, entries: LedgerEntry[]): boolean => {
  const def = view === null ? null : tools.routes.route(view.skill);
  const head = entries.find((entry) => entry.kind === 'route' && entry.id === view?.routeId);
  return def !== null && head !== undefined && delegatedStepOf(def, buildChain(entries, head)) !== null;
};

interface RouteOutput extends StepMessage { command: string }

export async function runRouteStart(runtime: Runtime, args: ParsedArgs): Promise<RouteOutput> {
  const [skill, ...words] = args.positionals;
  if (skill === undefined) throw new AmbicodeError('bad-argument', '"route start" needs a skill: route start <skill> [request…].', { field: 'skill' });
  const { engine } = await routeTools(runtime);
  // Claude Code exports its session id to every Bash call, so a CLI start is the session the hooks bind by.
  const session = runtime.env['CLAUDE_CODE_SESSION_ID'] || runtime.ids.sessionId();
  const text = words.join(' ');
  const task = args.value('task');
  const project = args.value('project');
  const plan = args.value('plan');
  const target = startTarget(skill, args);
  const message = await engine.start({
    skill,
    text,
    requirements: args.all('requirement'),
    ...(task === null ? {} : { task: taskSlugFor({ requirementIds: [], task }) ?? task }),
    headless: args.flag('headless'),
    ...(project === null ? {} : { project }),
    ...(plan === null ? {} : { plan }),
    ...(target === undefined ? {} : { target }),
    answers: answersOf(args),
    cwd: runtime.cwd,
    session,
    channel: 'cli',
  });
  return { command: 'route start', ...message };
}

export async function runRouteNext(runtime: Runtime, args: ParsedArgs): Promise<RouteOutput> {
  const task = taskOf('route next', args);
  const { engine } = await routeTools(runtime);
  const project = args.value('project');
  const message = await engine.advance({
    task,
    cause: 'route-next',
    answers: args.all('answer').map(parseAnswerFlag),
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

const ROUTE_STOP_OPTIONS = { values: ['task', 'reason', 'detail'], flags: ['json'] } as const;
const STOP_REASONS: readonly Exit[] = ['blocked', 'human', 'inconclusive'];

export const routeStopCommand: CliCommand = {
  name: 'route stop',
  summary: 'End the route unfinished (--task, --reason, --detail).',
  options: ROUTE_STOP_OPTIONS,
  run: async (runtime, args) => {
    const task = taskOf('route stop', args);
    const reason = EXITS.find((exit) => exit === args.value('reason'));
    if (reason === undefined || !STOP_REASONS.includes(reason)) throw new AmbicodeError('bad-argument', `--reason is one of ${STOP_REASONS.join(', ')}.`, { field: 'reason' });
    const { engine } = await routeTools(runtime);
    const detail = args.value('detail') ?? undefined;
    await engine.stop(task, reason, detail);
    return { text: `Route on ${task} stopped: ${reason}.`, data: { command: 'route stop', task, reason, ...(detail === undefined ? {} : { detail }) } };
  },
};
