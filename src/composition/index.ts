// The composition root: wires the Runtime (filesystem, git runner, config) and resolves projects and policy.

// root.ts: runtime construction, repository/workspace opening and project lookup.
/** createRuntime(overrides?) — builds the production Runtime (fs, env, process runner, clock, ids); pass overrides in tests. */
export { createRuntime } from './root.ts';
/** openRepository(runtime) — the Git handle and root of the repository around runtime.cwd; throws not-a-repository outside one. */
export { openRepository } from './root.ts';
/** openWorkspace(runtime) — opens the repository and loads its config into a Workspace; config notices are appended to the runtime. */
export { openWorkspace } from './root.ts';
/** projectById(config, id) — the configured project with that id; throws unknown-project otherwise. */
export { projectById } from './root.ts';
/** projectForPath(config, repositoryRelativePath) — the project with the most specific root containing the path, or null. */
export { projectForPath } from './root.ts';
/** projectForRequest(config, requestedId, paths) — picks the project for a request by id or paths; throws when ambiguous. */
export { projectForRequest } from './root.ts';
/** resolvePolicyFor(options) — loads the policy packs for a project and returns its ResolvedPolicy. */
export { resolvePolicyFor } from './root.ts';
/** toRepositoryRelative(workspace, value) — a path (absolute or cwd-relative) as a normalized repository-relative path, following symlinks. */
export { toRepositoryRelative } from './root.ts';

// session-repository.ts: locating the repository a session works in.
/** findSessionRepository(runtime, directory) — the repository root a session directory belongs to with where it was found, or a reason string. */
export { findSessionRepository } from './session-repository.ts';
