// Worker runs: the plan-check worker. Nothing here is deliberately omitted.

/** checkDraft(deps, task, draft) — checks a saved plan draft, writes the artifact, then the `worker` entry. */
export { checkDraft } from './plan-check.ts';
/** LAST_ROUND — the instruction shown on the last automatic plan-check round: list unfixable items under `## Known limitations`. */
export { LAST_ROUND } from './plan-check.ts';
/** runPlanCheck(deps, {task, body, from}) — `plan check`: saves the draft under the ownership check, then runs the checker. */
export { runPlanCheck } from './plan-check.ts';
