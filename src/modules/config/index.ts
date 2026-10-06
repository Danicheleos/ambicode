// Config loading and the init/doctor flow. Nothing here is deliberately omitted.

// root: loading and validating the repository config.
export type { ConfigWithNotices, LoadedConfig } from './load.ts';
/** describeIssues(zodError) — turns schema issues into messages naming the field and expected shape, never the value. */
export { describeIssues } from './load.ts';
/** loadConfig(fs, repositoryRoot) — reads and validates the config file; returns config, path and raw text. */
export { loadConfig } from './load.ts';
/** loadConfigWithNotices(fs, repositoryRoot, …) — like loadConfig but also returns non-fatal notices. */
export { loadConfigWithNotices } from './load.ts';
/** parseConfig(raw) — parses and validates config text. */
export { parseConfig } from './load.ts';
/** parseConfigWithNotices(raw) — parses config text and returns the config with its notices. */
export { parseConfigWithNotices } from './load.ts';
/** validateArgv(field, argv) — checks a command argument vector and returns its problems (empty when valid). */
export { validateArgv } from './load.ts';

// workspace.ts: the workspace (repository plus config) and project lookup.
/** openWorkspace(runtime) — opens the repository and loads its config into a Workspace; config notices are appended to the runtime. */
export { openWorkspace } from './workspace.ts';
/** projectById(config, id) — the configured project with that id; throws unknown-project otherwise. */
export { projectById } from './workspace.ts';
/** projectForPath(config, repositoryRelativePath) — the project with the most specific root containing the path, or null. */
export { projectForPath } from './workspace.ts';
/** projectForRequest(config, requestedId, paths) — picks the project for a request by id or paths; throws when ambiguous. */
export { projectForRequest } from './workspace.ts';
/** toRepositoryRelative(workspace, value) — a path (absolute or cwd-relative) as a normalized repository-relative path, following symlinks. */
export { toRepositoryRelative } from './workspace.ts';

// init/: the init proposal, its application, `--set` parsing and doctor.
/** applyInit(deps, {task, sets, refreshProfile?}) — runs the apply checks, then writes the config; nothing is written before the last check passes. */
export { applyInit } from './init/apply.ts';
/** backupOf(fs, repositoryRoot, raw) — the newest `.bak-` copy of the config with exactly these bytes, or null. */
export { backupOf } from './init/apply.ts';
/** valuesLine(canonical) — the `values:` line of an apply command for a canonical `--set` string. */
export { valuesLine } from './init/apply.ts';
/** runDoctor(runtime, repositoryRoot, config, options?) — runs each command slot and returns one table row per slot. */
export { runDoctor } from './init/doctor.ts';
/** adjustTokens(text) — splits an Adjust answer on whitespace, except inside JSON arrays or double-quoted strings. */
export { adjustTokens } from './init/init-sets.ts';
/** canonicalSets(pairs) — sorted `key=<JSON>` pairs joined by one space; '' for none. */
export { canonicalSets } from './init/init-sets.ts';
/** parseSet(raw) — parses one `key=value` `--set`; commands are `null` or a JSON array of strings. */
export { parseSet } from './init/init-sets.ts';
/** parseSets(raws, projects?) — parses every `--set`; a repeated key or unknown project id is a bad argument. */
export { parseSets } from './init/init-sets.ts';
/** projectOfKey(key) — the project id a `projects.<id>.…` key names, or null. */
export { projectOfKey } from './init/init-sets.ts';
/** detectRuleSources(fs, repositoryRoot) — lists the existing agent rule files (e.g. copilot instructions) in the repository. */
export { detectRuleSources } from './init/init.ts';
/** applyLineFor(runtime, task, overrides) — the apply command line that reproduces a proposal with these overrides. */
export { applyLineFor } from './init/proposal.ts';
/** buildProposal(runtime, repositoryRoot, overrides, options?) — the dry run: reads, detects and plans; writes nothing. */
export { buildProposal } from './init/proposal.ts';
/** configFileState(fs, repositoryRoot) — whether the config file exists and parses as YAML; schema problems are left to the loader. */
export { configFileState } from './init/proposal.ts';
/** writeConfig(…) — pure writer with no consent check; only applyInit (after its checks) and tests call it. */
export { writeConfig } from './init/proposal.ts';
