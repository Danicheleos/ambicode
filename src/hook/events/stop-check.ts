import type { HookInput, StopHookOutput, RouteHookDeps } from '#types/hook';

/** Stop: the engine runs the checks under one ledger lock; this adapter only passes the event on. */
export function stopCheck(input: HookInput, deps: RouteHookDeps): Promise<StopHookOutput | null> {
  return deps.engine.stopHook(input);
}
