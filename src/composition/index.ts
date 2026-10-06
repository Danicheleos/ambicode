// The composition root: wires the Runtime (filesystem, git runner, clock, ids, providers) and the production route engine (createAppEngine).

// root.ts: runtime construction.
/** createRuntime(overrides?) — builds the production Runtime (fs, env, process runner, clock, ids); pass overrides in tests. */
export { createRuntime } from './root.ts';
/** defaultProviders(runner, cwd) — the GitLab and GitHub providers. */
export { defaultProviders } from './root.ts';

// engine.ts: the production route engine.
/** createAppEngine(runtime, routes, pointer) — the harness engine over the shipped skills' handler table. */
export { createAppEngine } from './engine.ts';
