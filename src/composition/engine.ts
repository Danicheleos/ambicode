import { createEngine } from '#harness/engine/engine';
import { handlerRegistry } from '#harness/engine/handlers';
import { skillHandlers } from '#skills/handlers';
import type { Runtime } from '#types/composition';
import type { ActiveRoutePointer, Engine, RouteRegistry } from '#types/harness';

/** The production engine: the harness over the shipped skills' code-step handlers. */
export function createAppEngine(runtime: Runtime, routes: RouteRegistry, pointer: ActiveRoutePointer): Engine {
  return createEngine({ runtime, routes, handlers: handlerRegistry(skillHandlers()), pointer });
}
