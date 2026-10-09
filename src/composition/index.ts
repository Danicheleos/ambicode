// The composition root: wires the Runtime (filesystem, git runner, clock, ids) and the production app (createApp).

// root.ts: runtime construction.
/** createRuntime(overrides?) — builds the production Runtime (fs, env, process runner, clock, ids); pass overrides in tests. */
export { createRuntime } from './root.ts';

// app.ts: the production route engine and its registry.
/** createApp(runtime) — the shipped routes, the active-route pointer and the harness engine over the skills' handler table. */
export { createApp } from './app.ts';
