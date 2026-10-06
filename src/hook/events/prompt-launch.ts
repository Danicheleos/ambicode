import { parseArgs } from '#cli/args';
import { startTarget } from '#cli/commands/route/route';
import { findSessionRepository } from '#platform/git/session-repository';
import type { HookInput, RouteHookDeps } from '#types/hook';
import { resolveActiveRoute } from '#harness/session/active-route';
import { parseAnswerFlag } from '#harness/definition/flags';
import { metricsIgnoreWarning } from '#skills/review/handlers';
import { isAmbicodeError } from '#util/errors';
import { currentEpoch, deliverOnce, hookStateBaseDir } from '#platform/claude/hook-state';
import { ROUTE_START_OPTIONS } from '#types/cli';
import type { Runtime } from '#types/composition';

const LAUNCH = /^\/ambicode:(\w+)\b([\s\S]*)$/;

/** Known `route start` options before and after the request; the request stays as typed, quotes kept (they mark UI text). */
export function splitLaunch(rest: string): { args: string[]; text: string } {
  const takesValue = new Set<string>([...ROUTE_START_OPTIONS.values, ...ROUTE_START_OPTIONS.repeated]);
  const known = new Set<string>([...takesValue, ...ROUTE_START_OPTIONS.flags]);
  const tokens = [...rest.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((match) => ({ raw: match[0], value: match[1] ?? match[2] ?? match[3] ?? '', at: match.index }));
  /** The token count of an option run from `from` (stopping at the first non-option), and whether it reached the end. */
  const options = (from: number): { end: number; complete: boolean } => {
    let index = from;
    while (index < tokens.length) {
      const name = /^--([\w-]+)(=|$)/.exec(tokens[index]!.raw);
      if (name === null || !known.has(name[1]!)) return { end: index, complete: false };
      index += name[2] === '' && takesValue.has(name[1]!) ? 2 : 1;
    }
    return { end: Math.min(index, tokens.length), complete: index <= tokens.length };
  };
  const lead = options(0).end;
  let tail = lead;
  while (tail < tokens.length && !options(tail).complete) tail += 1;
  const take = (from: number, to: number): string[] => tokens.slice(from, to).map((token) => token.value);
  const text = lead >= tokens.length ? '' : rest.slice(tokens[lead]!.at, tail < tokens.length ? tokens[tail]!.at : rest.length).trim();
  return { args: [...take(0, lead), ...take(tail, tokens.length)], text };
}

/** `/ambicode:<skill> …` with a shipped route starts it; the first step comes back as context (03-H3). */
export async function launchRoute(runtime: Runtime, input: HookInput, deps: RouteHookDeps): Promise<string | null> {
  if (input.agent_id !== undefined) return null;
  const match = LAUNCH.exec((input.prompt ?? '').trim());
  if (match === null || deps.routes.route(match[1]!) === null) return null;
  const skill = match[1]!;
  const rest = match[2]!.trim();
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return `AMBICODE could not start the ${skill} route: ${found}.`;
  const launch = splitLaunch(rest);
  let parsed: ReturnType<typeof parseArgs> | null = null;
  try {
    parsed = parseArgs('route start', launch.args, ROUTE_START_OPTIONS);
  } catch {
    parsed = null;
  }
  const task = parsed?.value('task') ?? null;
  const project = parsed?.value('project') ?? null;
  const plan = parsed?.value('plan') ?? null;
  const fromDraft = parsed?.value('from-draft') ?? null;
  const attached = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: found.repositoryRoot, session: input.session_id, scratchpad: input.scratchpad_dir });
  try {
    const target = parsed === null ? undefined : startTarget(skill, parsed);
    const message = await deps.engine.start({
      skill,
      ...(target === undefined ? {} : { target }),
      text: parsed === null ? rest : launch.text,
      requirements: parsed?.all('requirement') ?? [],
      ...(task === null ? {} : { task }),
      ...(project === null ? {} : { project }),
      ...(plan === null ? {} : { plan }),
      ...(fromDraft === null ? {} : { fromDraft }),
      headless: parsed?.flag('headless') ?? false,
      answers: (parsed?.all('answer') ?? []).map(parseAnswerFlag),
      fresh: parsed?.flag('fresh') ?? false,
      adopt: parsed?.flag('adopt') ?? false,
      cwd: found.repositoryRoot,
      session: attached?.owner ?? runtime.ids.ownerId(),
      harnessSession: input.session_id,
      channel: 'hook',
      ...(input.scratchpad_dir === undefined ? {} : { scratchpadDir: input.scratchpad_dir }),
    });
    const warning = await metricsIgnoreWarning({ ...runtime, cwd: found.repositoryRoot }, skill);
    return warning === null ? message.text : `${message.text}\n${warning}`;
  } catch (error) {
    if (!isAmbicodeError(error)) throw error;
    return `AMBICODE could not start the ${skill} route: ${error.code}: ${error.message}${error.details.length === 0 ? '' : `\n${error.details.join('\n')}`}`;
  }
}

/** A new epoch since the route's step was last delivered (a resume, a compaction): deliver it again, once (03-H4). */
export async function reinjectRoute(runtime: Runtime, input: HookInput, deps: RouteHookDeps): Promise<string | null> {
  if (input.agent_id !== undefined) return null;
  const found = await findSessionRepository(runtime, input.cwd ?? runtime.cwd);
  if (typeof found === 'string') return null;
  const active = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: found.repositoryRoot, session: input.session_id, scratchpad: input.scratchpad_dir });
  if (active === null) return null;
  const [position] = await deps.engine.status(active.task, active.owner);
  if (position === undefined) return null;
  const base = hookStateBaseDir(runtime.fs, input.session_id, input.scratchpad_dir);
  const fresh = await deliverOnce(runtime.fs, base, { epoch: await currentEpoch(runtime.fs, runtime.ids, base), agentKey: 'main', kind: 'route-step', subject: active.routeId, contentHash: position.position });
  if (!fresh) return null;
  const message = await deps.engine.deliver(active.task, active.owner, input.scratchpad_dir);
  return message === null ? null : message.text;
}
