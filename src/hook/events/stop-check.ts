import type { HookInput, StopHookOutput, RouteHookDeps } from '#types/hook';

export { redBeforeGreen, REASON_LIMIT_BYTES } from '#harness/engine/stop';

/** Stop: the engine runs the checks under one ledger lock; this adapter only passes the event on. */
export function stopCheck(input: HookInput, deps: RouteHookDeps, options: { defectBrief?: boolean } = {}): Promise<StopHookOutput | null> {
  return deps.engine.stopHook(input, options);
}
