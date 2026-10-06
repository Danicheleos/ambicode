// Code-step handler tables for the shipped routes, grouped per skill. investigate/ and plan/ add none to the public surface.

// ./: handlers shared by routes.
export { MODULE_HANDLERS } from './common.ts';

// init/: the `init` route's code steps.
export { INIT_HANDLERS } from './init/handlers.ts';

// review/: the `review` route's code steps and its start-time helpers.
export { REVIEW_HANDLERS } from './review/handlers.ts';
/** metricsIgnoreWarning(runtime, skill) — a warning line when `.ambicode/metrics.jsonl` is not git-ignored; null for other skills or when ignored. */
export { metricsIgnoreWarning } from './review/handlers.ts';
/** selectionOf(target) — maps a ReviewTarget (or none) to a TargetSelection: working tree, merge request or branch. */
export { selectionOf } from './review/handlers.ts';

// rules/: the `rules` route's code steps.
export { RULES_HANDLERS } from './rules/handlers.ts';

// task/: the `task` route's code steps.
export { TASK_HANDLERS } from './task/handlers.ts';
