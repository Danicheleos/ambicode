// The composition root: wires the Runtime (filesystem, git runner, clock, ids, providers).

// root.ts: runtime construction.
/** createRuntime(overrides?) — builds the production Runtime (fs, env, process runner, clock, ids); pass overrides in tests. */
export { createRuntime } from './root.ts';
/** defaultProviders(runner, cwd) — the GitLab and GitHub providers. */
export { defaultProviders } from './root.ts';
