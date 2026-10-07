import { createEngine } from '#harness/engine/engine';
import { handlerRegistry } from '#harness/engine/handlers';
import { loadRouteRegistry } from '#harness/definition/routes';
import { fsActiveRoutePointer } from '#harness/session/active-route';
import { skillHandlers } from '#skills/handlers';
import type { Runtime } from '#types/composition';
import type { ActiveRoutePointer, Engine, RouteRegistry } from '#types/harness';

export interface App { routes: RouteRegistry; pointer: ActiveRoutePointer; engine: Engine }

/** The production app: the shipped routes, the active-route pointer and the harness engine over the skills' handlers. */
export async function createApp(runtime: Runtime): Promise<App> {
  const routes = await loadRouteRegistry(runtime.pluginRoot, runtime.fs);
  const pointer = fsActiveRoutePointer(runtime.fs);
  return { routes, pointer, engine: createEngine({ runtime, routes, handlers: handlerRegistry(skillHandlers()), pointer }) };
}
