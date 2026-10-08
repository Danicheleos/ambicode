// Code search: the optional code index, declaration lookups, and text-based maps and shortlists.

// code-index/: the index adapter and the `codeindex` binary lifecycle.
/** formatIndexStatus(status) — one-line text for an index status. */
export { formatIndexStatus } from './code-index/adapter.ts';
/** indexAdapterFor(deps, project) — the only way to get an index adapter (codeindex or none) for a project. */
export { indexAdapterFor } from './code-index/adapter.ts';
/** indexStatus(tool, state, builtMs?, reason?, drift?) — builds an IndexStatus value. */
export { indexStatus } from './code-index/adapter.ts';
/** findCodeindex(runtime, repositoryRoot) — locates the binary in the plugin's `vendor/codeindex`, then `node_modules/.bin`, then PATH; null when absent. */
export { findCodeindex, codeindexCommand } from './code-index/codeindex.ts';
/** indexDepsOf(runtime, git, repositoryRoot, config) — bundles the dependencies the index functions take. */
export { indexDepsOf } from './code-index/codeindex.ts';
/** refreshIndex(deps, project) — starts a rebuild even when the index is fresh (warm rebuilds). */
export { refreshIndex } from './code-index/codeindex.ts';
/** runIndexBuild(deps, project) — `index build`: refuses before creating anything if binary, grammar or ignore line is missing. */
export { runIndexBuild } from './code-index/codeindex.ts';
/** startIndexBuild(deps, project) — spawns a detached build at route start and never waits; skips a fresh index. */
export { startIndexBuild } from './code-index/codeindex.ts';

// declarations/: dependents, census, profile and the find/refs/relates lookups.
/** findDependents({…}) — unchanged source files that mention what a change adds, removes or renames (a hypothesis, not a reference). */
export { findDependents } from './declarations/dependents.ts';
/** declarationCensus(git, fs, project, names) — project-wide whole-word hits for names among the profile's source files. */
export { declarationCensus } from './declarations/harvest.ts';
/** buildProfile(runtime, project) — measures a project's search facts from tracked files, contents and history. */
export { buildProfile } from './declarations/profile.ts';
/** sourceGlob(sources) — one glob covering the source extensions. */
export { sourceGlob } from './declarations/profile.ts';
/** find(runtime, name, {project, kind, index?}) — declarations of a name from the index, else harvested from census files. */
export { find } from './declarations/refs.ts';
/** refs(runtime, names, {project, show}) — lines using each whole word; collisions come from the census. */
export { refs } from './declarations/refs.ts';
/** renderFind(result) — renders a find result as bounded text. */
export { renderFind } from './declarations/refs.ts';
/** readMany(deps, operands, budget?) — several files or spans in one bounded, numbered result; a cut file names the span to ask for next. */
export { readMany, parseReadOperand, READ_BUDGET_BYTES } from './text/read-many.ts';
/** relates(deps, project, value, {index?}) — imports and importers of a file from the index, else files naming its basename. */
export { relates } from './declarations/relates.ts';
/** renderRelates(result) — renders a relates result as short and full text. */
export { renderRelates } from './declarations/relates.ts';

// text/: term ranking, maps, shortlists and navigation guidance.
/** locate(request) — shortlists candidate files for a request from terms and layers. */
export { locate } from './text/locate.ts';
/** shortlistRules(project) — default shortlist rules: the profile's source extensions with test conventions excluded. */
export { shortlistRules } from './text/locate.ts';
/** termsFromRequirements(…) — word-frequency heuristic extracting search terms; identifier-shaped tokens rank first. */
export { termsFromRequirements } from './text/locate.ts';
export type { MapResult } from './text/map.ts';
/** buildMap({…}) — builds the map of terms, candidates and collisions for a route. */
export { buildMap } from './text/map.ts';
/** leadsOf(map, n) — the route's short map form (terms, top ranked candidates, feature line) with the paths it delivers and its hash; leadsText is its text. */
export { leadsOf, leadsText } from './text/map.ts';
/** rankTerms(…) — ranks identifiers first, then quoted UI strings, prose only when identifiers are scarce. */
export { rankTerms } from './text/map.ts';
/** resolveLayers(search, mode) — the search layers for a mode from config or defaults. */
export { resolveLayers } from './text/map.ts';
/** resolveTuning(search) — the map's ranking constants (defaults plus `search.tuning`) with a stable hash. */
export { resolveTuning } from './text/map.ts';
/** navigationFor(ecosystem) — the navigation guidance text for an ecosystem. */
export { navigationFor } from './text/navigation.ts';
