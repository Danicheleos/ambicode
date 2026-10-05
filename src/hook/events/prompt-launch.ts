import { parseArgs } from '../../cli/args.ts';
import { ROUTE_START_OPTIONS } from '../../cli/commands/route.ts';
import { findSessionRepository } from '../../composition/session-repository.ts';
import type { Runtime } from '../../composition/root.ts';
import type { HookInput } from '../../contracts/hook.ts';
import { resolveActiveRoute, type ActiveRoutePointer } from '../../route/active-route.ts';
import type { Engine } from '../../route/engine.ts';
import { parseAnswerFlag } from '../../route/flags.ts';
import type { RouteRegistry } from '../../route/routes.ts';
import { isAmbicodeError } from '../../util/errors.ts';
import { currentEpoch, deliverOnce, hookStateBaseDir } from '../session/markers.ts';

export interface RouteHookDeps { engine: Engine; routes: RouteRegistry; pointer: ActiveRoutePointer }

const LAUNCH = /^\/ambicode:(\w+)\b([\s\S]*)$/;

/** Splits on whitespace outside quotes; a quote pair is removed and its content kept whole. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  return tokens;
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
  let parsed: ReturnType<typeof parseArgs> | null = null;
  try {
    parsed = parseArgs('route start', tokenize(rest), ROUTE_START_OPTIONS);
  } catch {
    parsed = null;
  }
  const task = parsed?.value('task') ?? null;
  const project = parsed?.value('project') ?? null;
  const attached = await resolveActiveRoute(runtime.fs, deps.pointer, { repositoryRoot: found.repositoryRoot, session: input.session_id, scratchpad: input.scratchpad_dir });
  try {
    const message = await deps.engine.start({
      skill,
      text: parsed === null ? rest : parsed.positionals.join(' '),
      requirements: parsed?.all('requirement') ?? [],
      ...(task === null ? {} : { task }),
      ...(project === null ? {} : { project }),
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
    return message.text;
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
