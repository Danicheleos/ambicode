// Merge-request providers (GitHub, GitLab) behind the ReviewProvider contract in #types/provider.

// registry.ts: the only place a provider is chosen.
/** ProviderRegistry — `new ProviderRegistry(providers)`; `.byId(id)` or `.forUrl(mrUrl)` returns the ReviewProvider or throws. */
export { ProviderRegistry } from './registry.ts';

// github/: GitHub provider (recognises the host; review operations are unsupported and say so).
/** GitHubProvider — ReviewProvider for github.com URLs; construct without arguments and register it. */
export { GitHubProvider } from './github/provider.ts';

// gitlab/: GitLab provider driven by the `glab` CLI through a ProcessRunner.
export type { GitLabProviderOptions } from './gitlab/provider.ts';
/** GitLabProvider — ReviewProvider for GitLab merge requests; `new GitLabProvider({ runner, cwd, … })`, register in ProviderRegistry. */
export { GitLabProvider } from './gitlab/provider.ts';

// position.ts: maps a finding location onto a remote diff position.
export type { PositionResult } from './position.ts';
/** positionForLocation(target, files, location) — maps a FindingLocation to a RemotePosition on the pinned diff, or 'unmappable'. */
export { positionForLocation } from './position.ts';
/** toGitLabPositionFields(position) — flattens a RemotePosition into GitLab's `position[...]` form fields. */
export { toGitLabPositionFields } from './position.ts';
