import { createEngine } from '#harness/engine/engine';
import { handlerRegistry } from '#harness/engine/execute';
import { loadRouteRegistry } from '#harness/definition/routes';
import { skillHandlers } from '#skills/handlers';
import type { Runtime } from '#types/composition';
import type { Engine, RouteRegistry } from '#types/harness';

export interface App { routes: RouteRegistry; engine: Engine }

/** The production app: the shipped routes and the harness engine over the skills' handlers. */
export async function createApp(runtime: Runtime): Promise<App> {
  const routes = await loadRouteRegistry(runtime.pluginRoot, runtime.fs);
  return { routes, engine: createEngine({ runtime, routes, handlers: handlerRegistry(skillHandlers()) }) };
}
