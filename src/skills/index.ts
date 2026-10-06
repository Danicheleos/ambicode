// Code-step handler tables for the shipped routes, grouped per skill. investigate/ adds none.

// ./: the full table and the handlers shared by routes.
/** skillHandlers() — the full code-step handler table (modules, evidence, plan, init, rules, task, review) as a fresh record. */
export { skillHandlers } from './handlers.ts';
/** EVIDENCE_HANDLERS — `evidence.*` adapters over the note and report writers; they take the ledger the engine already holds. */
export { EVIDENCE_HANDLERS } from './evidence.ts';
/** MODULE_HANDLERS — handlers shared by routes, over the modules (requirements, search, policy). */
export { MODULE_HANDLERS } from './common.ts';

// init/: the `init` route's code steps.
/** INIT_HANDLERS — the `init` route's code-step table. */
export { INIT_HANDLERS } from './init/handlers.ts';

// plan/: the `plan` route's code steps.
/** PLAN_HANDLERS — the `plan` route's code-step table. */
export { PLAN_HANDLERS } from './plan/handlers.ts';

// review/: the `review` route's code steps and its start-time helpers.
/** REVIEW_HANDLERS — the `review` route's code-step table. */
export { REVIEW_HANDLERS } from './review/handlers.ts';
/** metricsIgnoreWarning(runtime, skill) — a warning line when `.ambicode/metrics.jsonl` is not git-ignored; null for other skills or when ignored. */
export { metricsIgnoreWarning } from './review/handlers.ts';
/** selectionOf(target) — maps a ReviewTarget (or none) to a TargetSelection: working tree, merge request or branch. */
export { selectionOf } from './review/handlers.ts';

// rules/: the `rules` route's code steps.
/** RULES_HANDLERS — the `rules` route's code-step table. */
export { RULES_HANDLERS } from './rules/handlers.ts';

// task/: the `task` route's code steps.
/** TASK_HANDLERS — the `task` route's code-step table. */
export { TASK_HANDLERS } from './task/handlers.ts';
