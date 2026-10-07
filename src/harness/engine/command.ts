import { taskSessionSource, sessionUnbound } from '../session/session.ts';
import { commandContext } from './context.ts';
import type { Runtime } from '#types/composition';
import type { CommandScope, GuardedCommand, RouteRegistry } from '#types/harness';

/** Resolves whom a guarded command speaks for and hands its body the route context; the body does the module's work. */
export async function runCommand<T>(
  deps: { runtime: Runtime; routes: RouteRegistry },
  spec: GuardedCommand,
  request: { task: string },
  body: (scope: CommandScope) => Promise<T>,
): Promise<T> {
  const { runtime } = deps;
  const context = commandContext(deps);
  const binding = await taskSessionSource(request.task).resolve(runtime);
  if (spec.route === 'owned' && binding.state === 'unbound') throw sessionUnbound(binding, request.task);
  const session = binding.state === 'bound' ? binding.session : null;
  const view = session === null ? null : await context.open(request.task, session);
  return body({ task: request.task, session, binding, view, context });
}
