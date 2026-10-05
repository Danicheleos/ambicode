# Step 05 — Search: collision census, `relates`, index adapter, offline recall, colliding-name cases, base-commit scaffold

> Prerequisites: steps 00–04 integrated and decision A answered "proceed" (00-README). Spend: $0.
> Read [05-working-rules.md](05-working-rules.md) first; it governs this brief, the review and the report.
> Normative sources (read the sections, not the whole files): [v6/10](../v6/modules/10-search.md) whole
> (§3 table and provenance note, §4 freshness, Interfaces, Failure modes); [v6/33](../v6/33-measurement.md)
> §3; [v6/31](../v6/31-cli.md) Search rows; [v6/32](../v6/32-artifacts.md) §1 (`index/`) and §5;
> [v6/01](../v6/01-goals-and-constraints.md) M5, M6, M10, M21, D4, D8, D9, D15, D18, R7, R10, R14, R16;
> [v6/40](../v6/40-open-problems.md) P10, P12, P14, P51, P57; [v6/50](../v6/50-backlog.md) (what is not built);
> [measurements README](../measurements-2026-10-03/README.md).

## Goal

Step 03 shipped the two-pass map with no index. This step completes Search: a project-wide
declaration census so `refs` and `find` flag colliding names, the `relates` command, an
`IndexAdapter` with `none` and `codeindex` (off by default), and the index layers in `map`.
It also builds the free measurement tools: the offline recall script that decides 5-I, the
colliding-name impact cases (P51), and the shared base-commit scaffold builder for reuse cases
and step 07. Nothing paid runs here.

## Starting point

Recheck these at dispatch. Use the actual paths and symbol names if step 03 placed them differently;
list every difference in the report.

Existing code (inspected at the plan revision):

- `src/code-intelligence/locate.ts` (524 lines): `locate()`, `termsFromRequirements`,
  `PREPARE_SHORTLIST_LIMIT = 15`, `shortlistRules`, `shortlistable`. Module-private:
  `SCORE_FILENAME = 3`, `specificity()`, `isTooBroad()` (the >60% breadth guard).
- `src/code-intelligence/dependents.ts` (127 lines): `DECLARATIONS` patterns, first-match
  `declaredNames`, private `moduleName`.
- `src/git/git.ts` (398 lines): `Git` with `grepFiles` (`-i -F -l`), `listFiles`, `revParse`,
  `isDirty`. No `check-ignore` method.
- `src/ports/process.ts`: `ProcessRequest {argv, cwd, timeoutMs, maxOutputBytes, env, stdin?,
  output?: 'capture'|'ignore'}`, `ProcessOutcome.kind: 'exited'|'timed-out'|'spawn-failed'`.
  `src/ports/node-process-runner.ts`: `NodeProcessRunner`. No detached mode.
- `src/config/defaults.ts`: `CONFIG_DIR`, `TASKS_DIR`, `IGNORE_ENTRIES`, `MAX_SNAPSHOT_FILE_BYTES = 262_144`.
- `hooks/hooks.json`: the hook and the CLI are the same script, `scripts/ambicode.mjs`
  (`build.mjs` entry `ambicode: src/cli/main.ts`).
- `evals/scripts/src/analysis/shortlist-recall.mjs` (65 lines): `ticketOf`, `shortlistRecall({repos,
  unfiltered, limit, termsOf})`. Reads the fixed `ROOT/benchmarks/cases`. CLI
  `<BE repo> <FE repo> [limit] [--unfiltered]`. Prints one line **per case, with the case name**.
- `evals/scripts/src/cases/impact-cases.mjs` (171 lines): `walk`, `exportedSymbols`, `analyse`
  (language-service truth under `tsconfigFor`, `TRUTH_RANGE` 3–8, mention bound 3–14), `pickHard`
  (keeps only names that occur **once**: the opposite of what P51 needs), `impactPrompt`,
  `writeImpactCase` (writes `prompt.md` only). Writes to the fixed `BENCHMARKS/impact-cases`.
- `evals/scripts/src/cases/reuse-cases.mjs` (183 lines): generator; scaffold is `scaffoldFile`
  over the **snapshot**; still writes `-forced` twins (step 00 left them, not owned).
- `evals/scripts/src/arms/lsp-arms.mjs`: `tsconfigFor`. `evals/scripts/src/shared/bench-paths.mjs`:
  `ROOT`, `BENCHMARKS`, `IMPACT_CASES_DIRECTORY`, `REUSE_CASES_DIRECTORY`.
- `evals/scripts/src/harness/prompt-transport.mjs` (step 00): `writePluginPrompt(caseDir, command)`,
  `INVESTIGATE_COMMAND = '/ambicode:investigate --headless'`. `arms/naked-arm.mjs` has the
  `--benchmarks <absolute dir>` pattern (relative refused).
- Benchmark layout in PRIMARY (ignored, NDA; shapes only): `<side>/src`, `<side>/.ambicode/config.yaml`,
  `<side>/reviews/<ticket>/<iid>-<head8>/{version.json, change.patch, absent.txt, base/}` where
  `version.json` holds `base`, `head`, `root`, `touched`, `absentAtBase`; `<side>/.git-cache` is the
  scratch clone `prepare-reviews.mjs` creates (never the team checkout).
- [measurements README](../measurements-2026-10-03/README.md) "Re-run status": step 00 did **not**
  re-run `compare.mjs`; there is no `compare.log`; every unlogged figure stays unlogged.
- `src/util/skill-content.test.ts` "F3 documented outcomes": every literal
  `new AmbicodeError('<code>'` must appear in a skills Markdown file.

From earlier steps (named as their briefs and the ownership table name them; reconcile at dispatch):

- Step 02: `appendLedger`, `readLedgerStrict`, `resolveTaskDir`; `kinds.ts` with `map` and `search`
  loosely typed (D4 there), which step 03 tightened: `search {command: 'refs' | 'find', names[], hits,
  bytes}` and `map {mode, layers, layersSource, terms, candidates, limitations, index, bytes}`.
- Step 03: `grepWords` in `src/git/git.ts`; `src/config/ecosystems.ts` (declaration filters,
  source globs) read by harvest; `src/code-intelligence/harvest.ts` (global harvest over the top 8
  pass-1 files, names with declaration counts); `src/code-intelligence/map.ts` (runs the configured
  `search.layers` list in order, records `layers [{name, ms, hits}]`, skips `index.*` layers with a
  limitation, `search-layer-unknown`, `search-layers-not-for-model`); `src/code-intelligence/refs.ts`
  (first `refs` and `find`, ≤ 4 KiB, `--show`, `search` entries); the config v3 reader with
  `search.index` and `search.layers`; the CLI wrappers for `map`, `refs`, `find` in
  `src/cli/commands/search.ts`; `buildMap({runtime, project, mode, layers, layersSource, terms, paths,
  symbols})`, `refs(runtime, names, {project, show})`, `find(runtime, name, {project, kind})`; `src/route/engine.ts` `Engine.start`; `src/route/command-tail.ts`.
- Step 04: nothing consumed.
- Step 01 facts that matter here: none beyond `hooks/hooks.json` staying unchanged.

## Files

Budgets are source lines, tests excluded (05-working-rules §2.3). As a guide, tests for this step
should total about 1,100 lines.

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/code-intelligence/index/adapter.ts` | create | 70 | `IndexAdapter`, `IndexStatus`, `indexAdapterFor`, `formatIndexStatus` |
| `src/code-intelligence/index/none.ts` | create | 30 | the `none` adapter |
| `src/code-intelligence/index/codeindex.ts` | create | 230 | binary resolution, argv table, output parsing, markers, status, build, `startIndexBuild`, `refreshIndex` |
| `src/code-intelligence/relates.ts` | create | 90 | `relates` core: index or grep of the basename |
| `src/code-intelligence/harvest.ts` | change | +40 | `countDeclarations` (pure) and `declarationCensus` (git-backed) |
| `src/code-intelligence/refs.ts` | change | +60 | census-based `collides`; `find` through the adapter; limitations |
| `src/code-intelligence/map.ts` | change | +60 | run `index.find` / `index.relates` when listed; `index` status in output and ledger |
| `src/code-intelligence/locate.ts` | change | ±3 | export `SCORE_FILENAME` and `isTooBroad` (mechanical) |
| `src/config/ecosystems.ts` | change | +15 | `indexGrammar` per ecosystem |
| `src/config/defaults.ts` | change | +2 | `INDEX_DIR = '.ambicode/index'` |
| `src/git/git.ts` | change | +15 | `isIgnored(repositoryRelativePath)` (`git check-ignore -q`) |
| `src/task/kinds.ts` | change | +6 | `search.command` gains `relates`; `map.index` accepts `'none'` or `{tool, state, fresh, builtMs}` (step 03 tightened both) |
| `src/ports/process.ts` | change | +4 | `output: 'detached'`, outcome kind `'detached'` |
| `src/ports/node-process-runner.ts` | change | +25 | detached spawn |
| `src/route/engine.ts` | change | ±10 | one `startIndexBuild` call in `start` |
| `src/cli/commands/search.ts` | change | +110 | `relates`, `index build`, `index status` wrappers and rendering |
| `src/cli/main.ts` | change | +25 | `relates`, `index build`, `index status` in SPECS, USAGE and dispatch |
| `skills/review/references/outcomes.md` | change | — | the new codes (see Contract) |
| `evals/scripts/src/analysis/shortlist-recall.mjs` | change | +100 | arms (a)/(b)/(c), `--benchmarks`, `--codeindex`, `--index-dir`, numbers only, 5-I line |
| `evals/scripts/src/cases/impact-cases.mjs` | change | ±60 | colliding names only; plugin-arm prompt; `--benchmarks`; estimate line |
| `evals/scripts/src/cases/base-scaffold.mjs` | create | 100 | the one base-commit scaffold builder |
| `evals/scripts/src/cases/reuse-cases.mjs` | change | ±25 | base scaffold; `--benchmarks` |
| `gym/planing/new-architecture/measurements-2026-10-03/README.md` | change | ~12 | the dated note (05-N1) |

Unchanged in this step: `skills/*/SKILL.md`, `routes/**`, `hooks/hooks.json`, `package.json`
(no codeindex dependency), `src/task/kinds.ts` beyond the two widenings above, `src/route/*` except the one call in `engine.ts`,
`src/hook/**`, `src/requirements/**`, everything under `gym/planing/new-architecture/v6/`.

## Contract

```ts
// src/code-intelligence/index/adapter.ts
export type IndexName = 'none' | 'codeindex';
export type IndexState = 'none' | 'fresh' | 'stale' | 'building' | 'absent' | 'error';
export interface IndexStatus { tool: IndexName; state: IndexState; fresh: boolean;   // fresh === (state === 'fresh')
  builtMs: number | null; reason: string | null }
export interface IndexDeclaration { name: string; path: string; line: number | null; kind: string | null }
export interface IndexReference { path: string; line: number | null }
export type IndexAnswer<T> = { ok: true; value: T; status: IndexStatus } | { ok: false; status: IndexStatus };
export interface IndexAdapter {
  readonly name: IndexName;
  build(project: ProjectConfig, options: { detached: boolean }): Promise<IndexStatus>;
  status(project: ProjectConfig): Promise<IndexStatus>;
  find(name: string, options?: { kind?: string }): Promise<IndexAnswer<IndexDeclaration[]>>;
  refs(names: readonly string[]): Promise<IndexAnswer<IndexReference[]>>;
  relates(path: string): Promise<IndexAnswer<{ imports: string[] | null; importers: string[] }>>;
  delta(diff: string): Promise<IndexAnswer<string[]>>;
}
export function indexAdapterFor(deps: IndexDeps, project: ProjectConfig): IndexAdapter;
export function formatIndexStatus(status: IndexStatus): string;
// 'index: none' | 'index: codeindex fresh (built in 5700 ms)' | 'index: codeindex stale (built in …)'
// | 'index: building' | 'index: absent' | 'index: error (<reason>)'

// src/code-intelligence/index/codeindex.ts
export interface IndexDeps { runtime: Runtime; git: Git; repositoryRoot: string; config: AmbicodeConfig;
  selfArgv: readonly string[];          // production: [process.execPath, process.argv[1]]
  indexDir?: string;                    // override for the offline recall script only
  isAlive?: (pid: number) => boolean }  // injectable, as in step 02's lock
export const CODEINDEX_ARGV: { build; find; refs; relates; delta };   // one table, see 05-A5
export function startIndexBuild(deps: IndexDeps, project: ProjectConfig): Promise<IndexStatus>;
export function refreshIndex(deps: IndexDeps, project: ProjectConfig): Promise<IndexStatus>;   // step 07 calls it

// src/code-intelligence/harvest.ts
export function countDeclarations(texts: ReadonlyMap<string, string>, names: readonly string[],
  ecosystem: Ecosystem): Map<string, { declarations: number | null; files: string[] }>;  // null: no patterns
export function declarationCensus(git: Git, project: ProjectConfig, names: readonly string[]):
  Promise<{ census: Map<string, { declarations: number | null; files: string[] }>; limitations: string[] }>;

// src/code-intelligence/relates.ts
export interface RelatesResult { path: string; via: 'index' | 'grep-basename'; imports: string[] | null;
  importers: string[]; index: IndexStatus; limitations: string[] }
export function relates(deps: IndexDeps, project: ProjectConfig, path: string): Promise<RelatesResult>;

// src/code-intelligence/map.ts — step 03's `buildMap` input gains one optional field; absent →
// `indexAdapterFor` from the runtime and config (05-A1)
//   buildMap({ ...step 03 fields, index?: IndexAdapter })

// src/git/git.ts
isIgnored(repositoryRelativePath: string): Promise<boolean>;   // git check-ignore -q; exit 1 → false

// src/ports/process.ts (additive)
output?: 'capture' | 'ignore' | 'detached';   ProcessOutcome.kind: … | 'detached';

// evals/scripts/src/cases/base-scaffold.mjs — interface for step 07
export function baseOf(versionDir: string): { base: string; root: string };   // reads version.json
export function baseScaffoldScript(options: { sideRel: string; base: string; root: string;
  withhold?: readonly string[]; setup?: { argv: readonly string[] } | null }): string;
export function writeBaseScaffold(caseDir: string, options: Parameters<typeof baseScaffoldScript>[0]): void;
```

**CLI** (v6/31): `relates <path> [--project <id>] [--show] [--json]`;
`index build [--project <id>] [--json]`; `index status [--project <id>] [--json]`.
`refs` and `find` keep step 03's syntax.

**Index files** under `<repositoryRoot>/.ambicode/index/` (`INDEX_DIR`): the codeindex index itself,
`ambicode-index.json` `{tool:'codeindex', head: string|null, builtAt, builtMs}` written only after a
successful build, and `building.json` `{pid: number|null, startedAt}` while a build runs.

**Ledger.** No new kind. Step 03's tightened `search` and `map` schemas are widened in `kinds.ts`
only as follows. `relates` appends `{kind:'search', command:'relates', names:[<path>],
hits:<importers count>, bytes}`. The `map` entry's `index` field is `'none'` when the tool is none
(v6/32 example) and otherwise `{tool, state, fresh, builtMs}`.

**New error codes**, each documented in `skills/review/references/outcomes.md` with its release:
`index-not-ignored` (release: add `.ambicode/index/` to `.gitignore`; `init --apply` writes it on
acceptance), `index-unavailable` (release: install `codeindex` in the project or on PATH, or set
`search.index: none`), `index-build-failed` (release: run `index build` again; the previous index,
if any, stays in use as stale). Queries never raise these; they fall back (05-A6).

## Rules

**A — index adapter**
- 05-A1 `indexAdapterFor` returns the `none` adapter when `config.search.index` is `none` or absent,
  and the codeindex adapter when it is `codeindex`. `map`, `refs`/`find`, `relates`, the `index`
  commands, `startIndexBuild` and the offline script get their adapter only through it (the script
  passes `indexDir`).
- 05-A2 `none`: `build` and `status` return `{tool:'none', state:'none', fresh:false, builtMs:null,
  reason:null}`; every query returns `{ok:false, status}`. Callers fall back and print `index: none`.
- 05-A3 Binary resolution, in order: `<repositoryRoot>/node_modules/.bin/codeindex` (also
  `codeindex.cmd` on win32), then the first `PATH` entry holding an executable `codeindex`. Not found →
  every call returns state `error`, reason `codeindex not found (node_modules/.bin or PATH)`, and
  nothing is spawned.
- 05-A4 The index directory is `<repositoryRoot>/.ambicode/index/` unless `deps.indexDir` is set.
  The ignore check (05-B1, 05-B5) applies to `.ambicode/index/` only; the low-level adapter `build`
  does not check it.
- 05-A5 All argv forms live in `CODEINDEX_ARGV`, spawned with `cwd` = the project root, inherited
  environment, timeout 10,000 ms and `maxOutputBytes` 4 MiB for queries, timeout 600,000 ms for
  build. Initial forms, from the measurement scripts' working calls: build `index --out <dir>`;
  find `find <name> --repo . --index <dir>`; refs `refs <name>… --repo . --index <dir>`; relates
  `impact <path> --repo . --index <dir>`; delta per the README. Verify each form against the
  codeindex README (or `--help` if the install is named in the dispatch, 05-T2); put corrections in
  the table and list them in the report.
- 05-A6 Query output is parsed as JSON: a top-level array, or the first array among the keys
  `results`, `references`, `refs`, `declarations`, `importers`, `imports`. Path from `file`, `path` or
  `filePath`; line from `line` or `startLine`; paths normalized to repository-relative POSIX. A
  nonzero exit, timeout, spawn failure or unparsable output returns `{ok:false, status: {state:'error',
  reason: <one line, ≤ 200 chars>}}`. A query never throws.
- 05-A7 A query runs only when status is `fresh` or `stale`; the answer carries that status, so a stale
  answer is used and said. `building`, `absent` and `error` return `{ok:false, status}` without a spawn.
- 05-A8 Each ecosystem entry in `ecosystems.ts` gains `indexGrammar: string | null`, filled from the
  README's grammar list (P12). For a project whose ecosystem has `null`, the codeindex adapter reports
  state `error`, reason `codeindex has no grammar for <ecosystem>`. No second ecosystem table.

**B — build, status, start**
- 05-B1 `index build` with `search.index: none` prints `index: none — nothing to build` and exits 0.
  Otherwise it checks in this order and creates nothing before a refusal: binary (05-A3) →
  `index-unavailable`; grammar (05-A8) → `index-unavailable`; `git.isIgnored('.ambicode/index/')`
  false → `index-not-ignored`.
- 05-B2 Build: write `building.json {pid: process.pid, startedAt}`, run the build argv, measure ms.
  Exit 0 → write `ambicode-index.json {tool, head: git.revParse('HEAD'), builtAt, builtMs}`, remove
  `building.json`, print the status. Otherwise remove `building.json`, keep any existing
  `ambicode-index.json`, throw `index-build-failed` naming the exit code or timeout and the last
  stderr line (≤ 300 chars).
- 05-B3 Status, decided in this order: tool none → `none`; binary or grammar missing → `error`;
  `building.json` present with a live `pid` (`isAlive`), or with `pid: null` and `startedAt` less than
  60 s old → `building`; no `ambicode-index.json` → `absent`; its `head` equals the current `HEAD`
  and `git.isDirty()` is false → `fresh`; otherwise `stale`. `builtMs` comes from the marker.
  `index status` prints `formatIndexStatus` (with `--json`: the `IndexStatus`).
- 05-B4 `startIndexBuild` does nothing and returns the status when the tool is none, or the status is
  `building` or `fresh`. When the index directory is not ignored or the binary/grammar is missing, it
  spawns nothing and returns state `error` with that reason. Otherwise it writes
  `building.json {pid:null, startedAt}` and spawns `[...selfArgv, 'index', 'build', '--project', <id>]`
  with `output: 'detached'`, and returns `building` without waiting for the child.
- 05-B5 `refreshIndex` is `startIndexBuild` without the `fresh` skip. Nothing in this step calls it.
- 05-B6 `Engine.start` calls `startIndexBuild` once, after the route entry is appended and before
  delivery, on every start channel, when the route's project resolves. Its result never refuses or
  delays the start; an error surfaces later as `map`'s `index:` line. `advance`, resume and status do
  not call it.
- 05-B7 `output: 'detached'`: `NodeProcessRunner` spawns with `detached: true`, `stdio: 'ignore'`,
  `windowsHide: true`, calls `unref()`, and resolves on the `spawn` event with `{kind:'detached',
  exitCode:null, stdout:'', stderr:'', truncated:false, durationMs, failure:null}`, or on `error` with
  `spawn-failed`. Behaviour for `capture` and `ignore` is unchanged.

**M — index layers in `map`**
- 05-M1 `map` runs `index.find` and `index.relates` only when they are in the configured
  `search.layers.<mode>` list. `map` never adds them; `init` does (step 09).
- 05-M2 Listed and the adapter answers ok: `index.find` queries each name harvested for pass 2;
  `index.relates` queries each known path. Each returned path gains the reason `index.find <name>` or
  `index.relates <path>` and `SCORE_FILENAME` per distinct name or path; a path not yet a candidate
  enters with that score. Candidates are re-sorted (score descending, path ascending) and cut to the
  map's limit. The layer records `{name, ms, hits}`, `hits` = distinct paths returned.
- 05-M3 Listed but the adapter does not answer ok: the layer is skipped exactly as step 03 skips it
  for `index: none`, and the limitation names the state: `index.find skipped — index: building`.
- 05-M4 `map`'s text output has an `index:` line (`formatIndexStatus`), and the ledger `map` entry's
  `index` field follows the Contract.

**C — collision census and `refs`**
- 05-C1 `countDeclarations` applies the ecosystem's declaration patterns **globally** (every match,
  not the first per pattern) to each text, with the same filters harvest uses. A name's `declarations`
  is the number of distinct files declaring it. An ecosystem without patterns gives `null`.
- 05-C2 `declarationCensus` takes, per name, the `grepWords` files inside the project that match the
  ecosystem's source globs, skips files larger than 262,144 bytes (with one limitation naming the
  count), reads them and calls `countDeclarations`.
- 05-C3 `refs <name>…` reports for each name `declarations: n` and `collides: n ≥ 2` from the census.
  A name declared in two files collides even when the map's top-8 harvest saw one declaration.
  Files and lines stay as step 03 prints them. `refs` never consults the index.
- 05-C4 With no declaration patterns (unknown ecosystem, P57): `declarations: null`, `collides: null`,
  limitation `no declaration patterns for ecosystem <x>; collisions not computed`. The grep result is
  still printed.

**F — `find`**
- 05-F1 Adapter answers ok → declarations from `index.find`, printed `via: index (codeindex <state>)`.
  Otherwise → the census declarations, printed `via: harvest`, plus the `index:` line (05-L2).
  `--kind` filters on `kind` where the source provides one; harvest results keep step 03's
  `--kind` behaviour.
- 05-F2 Output cap, `--show` and the `search` entry stay as step 03 built them.

**R — `relates`**
- 05-R1 `<path>` is repository-relative (or relative to the working directory inside the
  repository) and must name an existing file inside a configured project; anything else is
  `bad-argument` (field `path`). `--project` selects among overlapping projects.
- 05-R2 Adapter answers ok → `imports` and `importers` from the adapter, `via: 'index'`.
  Otherwise → `grepWords(<basename without extension>)` across the project, minus the file itself,
  as `importers`; `imports: null`; `via: 'grep-basename'`; limitation `imports need an index`.
- 05-R3 Text output ≤ 4,096 bytes with the rest behind `--show` (step 03's mechanism); `--json`
  prints `RelatesResult`. The `search` entry is appended under the same conditions as step 03's
  `refs` entry.

**L — limitations and breadth**
- 05-L1 Every `refs`, `find`, `relates` and `map` result carries `limitations: string[]`, printed after
  the results. A name or basename that matches more than 60% of the project's files (`isTooBroad`) is
  dropped and listed: `"<term>" matched <n> of <total> files; ignored`.
- 05-L2 `find`, `relates` and `map` always print an `index:` line (`formatIndexStatus`), including
  `index: none` with the `none` adapter. `refs` prints none (05-C3).

**O — offline recall** (33 §3, first bullet)
- 05-O1 `shortlist-recall.mjs <BE repo> <FE repo> [limit] [--unfiltered] [--benchmarks <absolute dir>]
  [--codeindex <bin> --index-dir <absolute dir>]`. A relative `--benchmarks` or `--index-dir` is
  refused. Cases come from `<benchmarks>/cases`; the default stays `BENCHMARKS`.
- 05-O2 Per localize case, with the same terms (`termsOf(ticket)`) and limit 15 for every arm:
  (a) the existing `locate` path, unchanged; (b) `map` with layers `[shortlist, harvest, shortlist]`
  and the `none` adapter; (c) `map` with `[shortlist, harvest, shortlist, index.find]` and the
  codeindex adapter, its index built once per side (foreground) into `<index-dir>/<side>` before
  scoring. Without `--codeindex`, (c) prints `n/a`. The script writes no ledger.
- 05-O3 Output is numbers only: per side, `n`, recall@15 for (a), (b), (c) with three decimals, and
  (c) − (b). No case name, ticket text, term or file name is printed; the per-case lines go.
- 05-O4 It prints `(a) reproduces M6: yes|no (expected BE 0.499, FE 0.123)`, equality at three
  decimals.
- 05-O5 It prints one 5-I line. Decision 5-I, verbatim: (c) − (b) < 0.05 on both sides → `codeindex`
  stays off by default (`init` proposes `none`); ≥ 0.05 on either side → report; the user decides
  whether the localize decide comparison (10 cases × 3 runs; ≈ $5.40 per new arm at $0.18/run, subject
  to actual counts and authorization; v6/33's ≈ $14 is historical) runs with codeindex vs `none`. The
  agent does not run that tier without a go. The line is `5-I: none`, `5-I: report`, or
  `5-I: pending (<reason>)` when (c) was not run or (a) did not reproduce M6. Unknown means step 09
  proposes `none`.
- 05-O6 The NDA run happens only in PRIMARY after integration (00-README PRIMARY protocol). Worktree
  tests use synthetic roots.

**K — colliding-name impact cases** (33 §3, second bullet)
- 05-K1 A candidate is an exported symbol (`exportedSymbols`) whose name `countDeclarations`, over the
  side's code files, finds in ≥ 2 files. Truth stays the language-service reference set under
  `tsconfigFor`, with `TRUTH_RANGE` 3–8 and the 3–14 mention bound. `pickHard`'s unique-name filter is
  replaced by this collision filter; the folder de-duplication and `--limit` stay. At most one case per
  name: the declaration with the most lookalikes plus hidden references, ties by path.
- 05-K2 Two arms: `prompt.md` is the existing naked `impactPrompt`; `prompt.with.md` comes from
  `writePluginPrompt(caseDir, INVESTIGATE_COMMAND)`, so the plugin arm gets `refs` collision flags and
  the "verify imports" read guidance from the route (P51). `truth.json` adds `declarations: <n>`.
- 05-K3 `--benchmarks <absolute dir>` (relative refused): reads `<benchmarks>/<side>/src`, writes
  `<benchmarks>/impact-cases`. Default `BENCHMARKS`.
- 05-K4 After generation it prints per side the case count, and one line
  `estimate: <cases> cases × 3 runs × 2 arms × $0.18/run ≈ $<x> (estimate, not an authorization)`.
- 05-K5 The TypeScript API is a grader oracle here (D8 forbids LSP in the plugin, not in a test oracle).
  No file under `src/` imports `typescript`; the report says this.

**S — base-commit scaffold and reuse cases** (33 §3, third bullet; G28)
- 05-S1 `baseOf(versionDir)` reads `version.json` and returns `{base, root}`; a missing file, a `base`
  that is not 40 hex characters, or an empty `root` throws an `Error` naming the field.
- 05-S2 `baseScaffoldScript` returns a POSIX `sh` script that:
  1. resolves `SIDE` from its own location and `sideRel`, as `scaffoldFile` does;
  2. exits 2 with `scaffold: no <SIDE>/.git-cache; run benchmarks/prepare-reviews.mjs` when the cache
     is missing, and exits 2 with `scaffold: base commit not in cache` when
     `git -C "$CACHE" cat-file -e <base>^{commit}` fails;
  3. extracts the base tree with `git -C "$CACHE" archive <base> -- <root> | tar -x -C "$PWD/repo"`;
  4. copies `$SIDE/.ambicode/config.yaml` into `repo/.ambicode/`;
  5. removes each `withhold` path with `rm -rf -- "repo/<path>"`;
  6. runs `setup.argv` inside `repo/` when given, and exits 3 with
     `scaffold: dependency setup failed (exit <n>)` when it fails;
  7. runs `git init -q`, `git add -A` and one `git commit -q` with a fixed author and committer.
  It writes nothing outside `$PWD/repo`. Its only git calls on the cache are `cat-file` and `archive`.
- 05-S3 `reuse-cases.mjs` writes each chosen case's `scaffold.sh` with `writeBaseScaffold` for the
  version it chose (`withhold: []`, `setup: null`) and accepts `--benchmarks <absolute dir>`. Truth
  computation, selection and the `-forced` twins are unchanged.
- 05-S4 `base-scaffold.mjs` is the only base-commit scaffold builder. Step 07 calls it with `withhold`
  (the withheld tests) and `setup` (the dependency install).

**N — measurement note**
- 05-N1 Append a dated section to the [measurements README](../measurements-2026-10-03/README.md):
  which rows of v6/10 §3's table are now logged in `compare.log`, and whether any logged number differs
  from the unlogged one by more than 10%. If `compare.log` is still absent, the section says no row is
  logged, the unlogged figures stay unlogged, and P10's precondition is still open. Do not edit `v6/`.

**T — measurements (free)**
- 05-T1 Latency: on this repository with `index: none`, run step 03's `map --mode prompt` CLI five times
  with three code-shaped terms from this repository. Report median wall ms and median per-layer ms from
  `layers`. Synchronous route start is measured against v6/33's 3 s target; the former plan's 1.5 s
  estimate is not a pass/fail ceiling.
- 05-T2 P12: report the codeindex grammar list and installed size. Read the README from its npm page;
  install it locally, uncommitted, into the scratchpad only if the dispatch names that install. Without
  an install, the size is `pending`.

## Decided readings

These choices are fixed by this brief. Do not reopen them; report a conflict as PLAN instead.

- D1 The detached build runs ambicode's own `index build` (`selfArgv`), not `codeindex` directly, so the
  child that finishes the build is the one that writes `ambicode-index.json`. Hook and CLI are the same
  script (`hooks/hooks.json`), so `[process.execPath, process.argv[1]]` works for both. Implements
  v6/10 §4 "`index build` runs as a detached child at `route start`".
- D2 Freshness is the recorded `HEAD` plus a clean working tree (05-B3). Implements "`status` reports
  `{tool, fresh, builtMs}`; stale is used and said".
- D3 The detached mode extends the existing `ProcessRequest.output` seam instead of adding a new port.
- D4 Index hits score `SCORE_FILENAME` (05-M2): a declaration or importer is as strong a signal as a
  filename match. Implements "`index.find` appended" with a deterministic merge; tuning the weight is a
  non-goal, and the offline (c) arm measures this rule as written.
- D5 A collision counts **files** that declare the name (05-C1), so overloads in one file do not collide.
  Implements "declared in ≥ 2 files" (33 §3) and "harvest counts > 1 declaration".
- D6 The census is grep-then-harvest over the grep hits (05-C2): project-wide without reading every file.
- D7 Without an index, `relates` reports `imports: null`, not `[]`: an absent result is reported as
  absent (CLAUDE.md "Making changes").
- D8 Arm (a) keeps the existing `locate` path unchanged, so the reproduction check tests the harness.
  (b) and (c) get the same terms explicitly, so the arms differ only in their layers.
- D9 The base scaffold uses `git archive` of the base tree into a fresh one-commit repository. It is an
  isolated copy at the MR base that never touches the team checkout, and it hides history after the
  base (no `git log --all` to the answer). Implements "a scaffold uses an isolated clone/worktree at
  the MR base, never resets the team checkout".
- D10 The impact plugin arm uses the route's own reading guidance (`INVESTIGATE_COMMAND`); the case
  prompt adds no extra instruction. That keeps the arms' prompts byte-identical apart from the typed
  command (step 00's transport).
- D11 Decision 5-I and P12 are user-facing and are not decided here. Branches:
  - (c) − (b) < 0.05 on both sides → `5-I: none`. Step 09 proposes `none`.
  - ≥ 0.05 on either side → `5-I: report`. The user decides the paid decide tier.
  - (c) not run, or (a) not reproduced → `5-I: pending`. Step 09 proposes `none` and marks it pending.
- D12 The codeindex install is a dispatch item (05-T2): 05-working-rules §2.8 forbids installs, and the
  v6 brief allows a local uncommitted one. Without it, (c), the argv check against `--help`, and the
  P12 size are pending; everything else proceeds against a fake runner.

## Non-goals (a reviewer may not raise these)

- No `refs --exact`, no language-service child, no LSP tool use anywhere in the plugin (D8; backlog).
- No agentmap adapter (P14). No scip output.
- No `--layers` CLI flag and no layer chosen by heuristic (D15, D9, R14). `map` does not append index
  layers; `init` (step 09) writes them, and writes the `.ambicode/index/` ignore line on acceptance.
- `codeindex` is not enabled by default and not added to `package.json` or vendored (R10).
- No warm-rebuild wiring after `check`/`review` (step 07 calls `refreshIndex`). No review dependents
  through `relates` or `delta` (step 08).
- No change to term extraction, the breadth threshold, locate scoring or the map's own collision list
  (step 03 owns them). No tuning of the index-hit weight (D4).
- No `kinds.ts` change beyond the `relates` command and the `map.index` object. No new ledger kind.
  `index build` writes no ledger entry.
- No special handling of entry-file basenames (`index`, `mod`, `main`) in `relates`; the breadth guard
  covers them.
- No recomputation of reuse truth at the base commit; no change to reuse selection or its `-forced`
  twins. No change to how impact-cases prints during generation, beyond the estimate line.
- No index cleanup, no garbage collection, no concurrent-build arbitration beyond `building.json`,
  no multi-host behaviour, no protection against a hostile local process (01-contracts §5).
- No codeindex output fields beyond those in 05-A6. No Windows support beyond the `.cmd` lookup.
- No re-run of `compare.mjs` (needs the install and copies of NDA snapshots in an ignored location;
  the dispatcher may name it separately). No edit to frozen v6.
- No paid run: no decide tier, no impact or reuse case execution, no probe.

## Tests

Name each test after its rule. Use real temporary git repositories for git-backed code, a fake
`ProcessRunner` for every codeindex call, and an injected `isAlive`. No test reads `gym/` or
`benchmarks/`. 02-scenarios assigns no S-id to step 05; existing S-tests must keep passing.

1. `index/adapter.test.ts` and `index/none.test.ts`: factory selection (05-A1); `none` status and
   queries (05-A2); `formatIndexStatus` for every state.
2. `index/codeindex.test.ts`, against the fake runner:
   - binary resolution: `node_modules/.bin`, PATH, neither (05-A3);
   - argv shape, cwd, index directory and timeouts for every table entry (05-A4, 05-A5);
   - parsing: array, keyed object, unknown keys, nonzero exit, timeout, garbage (05-A6);
   - query gating by state, and a stale answer carrying its status (05-A7);
   - ecosystem with `indexGrammar: null` (05-A8);
   - `index build` refusal order with nothing created: binary, grammar, not ignored (05-B1);
   - success writes the marker; failure keeps the old marker and throws `index-build-failed` (05-B2);
   - status table: building (live pid, null pid young and old), absent, fresh, stale after a commit,
     stale with a dirty tree (05-B3);
   - `startIndexBuild`: skips when fresh or building, refuses to spawn when not ignored, spawns
     `[...selfArgv, 'index', 'build', '--project', id]` with `output: 'detached'` and returns
     `building` while the fake child never finishes (05-B4); `refreshIndex` spawns when fresh (05-B5).
3. `node-process-runner` test: a detached `node -e "setTimeout(()=>{},5000)"` resolves in under 1 s
   with kind `detached`; a missing binary gives `spawn-failed` (05-B7).
4. Engine test (extend step 03's): `start` calls `startIndexBuild` once per start channel, and a start
   whose build status is `error` still completes; `advance` does not call it (05-B6).
5. `map.test.ts` (extend): index layers listed and answering, with the merge order and `hits`
   (05-M2); listed but `building` → skipped with the named limitation (05-M3); not listed → not run
   (05-M1); the `index:` line and the ledger `index` field for none and codeindex (05-M4).
6. `harvest.test.ts` / `refs.test.ts` (extend): two-file fixture → `collides: true` while the map
   harvest saw one; overloads in one file → `declarations: 1` (05-C1, 05-C3); size skip and its
   limitation (05-C2); unknown ecosystem → `null` and the limitation (05-C4).
7. `find`: index answer printed `via: index`; index error → `via: harvest` with the `index:` line
   (05-F1).
8. `relates.test.ts`: index answer; grep fallback label, `imports: null`, the file itself excluded
   (05-R2); bad path → `bad-argument` (05-R1); 4,096-byte cap with `--show`, `--json` shape and the
   `search` entry (05-R3).
9. Breadth guard on `refs`, `find` and `relates`, and `limitations` present on every result (05-L1);
   `index: none` printed by `find`, `relates`, `map` (05-L2).
10. CLI tests (`cli.test.ts`): `relates`, `index build`, `index status` registered with `--json`;
    `index build` with `search.index: none` exits 0. The F3 outcomes test passes with the new codes.
11. `shortlist-recall.test.mjs` (extend), on a synthetic benchmarks root with two synthetic side repos:
    `--benchmarks` resolution and relative refusal (05-O1); arms (a)/(b)/(c) with a fake codeindex
    adapter (05-O2); output contains no case name, ticket text or path (05-O3); the reproduction line
    (05-O4); every 5-I branch (05-O5).
12. `impact-cases.test.mjs` (extend): collision filter keeps a two-file name and drops a unique one;
    one case per name (05-K1); `prompt.with.md` written through `writePluginPrompt` (05-K2);
    `--benchmarks` (05-K3); the estimate line (05-K4). A test asserts no `src/**/*.ts` imports
    `typescript` (05-K5).
13. `base-scaffold.test.mjs`, running the script with `sh` on synthetic repositories:
    `baseOf` field errors (05-S1); the script checks out the base and not the head; a missing cache and
    a missing commit exit 2; withheld paths absent; a failing `setup` exits 3; the case directory copied
    one level deeper still resolves `SIDE`; the result has one commit and no history beyond it; the
    cache's refs and HEAD are unchanged (05-S2). `reuse-cases` writes the base scaffold (05-S3).

## Done when

- [ ] Every rule id above appears in at least one test name, except 05-N1, 05-T1 and 05-T2, which the
      report covers; all tests pass.
- [ ] `npm run verify` and `node --test 'evals/scripts/src/**/*.test.mjs'` are green; the report states
      the counts.
- [ ] Files changed ⊆ the Files table, plus mechanical changes listed in the report; budgets are
      reported with actual line counts.
- [ ] `git diff` of `skills/*/SKILL.md`, `routes/`, `hooks/hooks.json`, `package.json` and
      `gym/planing/new-architecture/v6/` is empty; `src/task/kinds.ts` changes only by the two
      widenings in the Files table.
- [ ] The measurements README carries the dated note (05-N1).
- [ ] The report gives: the 05-T1 latency numbers; the P12 grammar list and size (or `pending`); the
      verified `CODEINDEX_ARGV` and the observed output shape; the exact PRIMARY commands for the
      offline recall, impact generation and reuse generation; the 5-I state; the impact and reuse case
      counts (never names) with the 05-K4 estimate; the statement of 05-K5.
- [ ] The report follows 05-working-rules §4.

Measurement status is separate from implementation acceptance. The offline recall numbers, the 5-I
line and the generated case counts come from PRIMARY after integration. Until then the report says
`implementation ready; measurement pending` and names what each pending item blocks (5-I → step 09's
default). Running the decide tier, the impact cases or the reuse cases is a decision for the user;
do not run the decide tier or the impact/reuse cases without a go.

## Hand-off to steps 09, 06, 07 and 08

- Step 09 receives the 5-I state as a hard input to its default: `none` or `pending` → propose
  `search.index: none`; `report` → the user's decision. When `index != none`, step 09's `init` appends
  `index.find` to `search.layers.prompt` and `index.relates` to `search.layers.context`, writes
  `INDEX_DIR`'s ignore line on acceptance, and detects ecosystems into the same `ecosystems.ts` table,
  including `indexGrammar`. It does not create another table or a second adapter.
- Step 07 calls `refreshIndex` after `check` and `review` steps in `task`, and builds task cases with
  `writeBaseScaffold` (`withhold`, `setup`). It writes no other scaffold builder.
- Step 08 uses `indexAdapterFor(...).relates` or `delta` for review dependents when an index exists,
  and the name search otherwise. It does not spawn codeindex itself.
- All later steps get collisions from `declarationCensus` and declarations from `find`; nobody writes
  a second declaration counter.
- The impact cases (P51) and reuse cases are ready to run on a go. If the plugin arm loses the impact
  cases, the backlog's exact-reference item is the candidate fix: report it, do not reopen it.

## Coverage of the v6 brief

| v6 step-05 requirement | Here |
|---|---|
| `IndexAdapter` interface with `build/find/refs/relates/delta/status`, two implementations | Contract, 05-A1 |
| `none` answers "no index", callers fall back and say `index: none` | 05-A2, 05-L2 |
| codeindex from `node_modules/.bin` or PATH; config honoured only if the binary resolves, else `index: error` | 05-A3 |
| Index directory `.ambicode/index/`; `index build` refuses unless ignored | 05-A4, 05-B1 |
| Detached build at route start; the hook returns at once | 05-B4, 05-B6, 05-B7, D1, D3 |
| `status` `{tool, fresh, builtMs}`; stale used and said | 05-B3, 05-A7, D2 |
| Warm rebuilds after `check`/`review` in task: expose the call, step 07 wires it | 05-B5, Hand-off |
| `index.find`/`index.relates` added to layer lists by `init`; `map` runs only what config lists; skips `index.*` with `index: none` | 05-M1 … 05-M4, Non-goals |
| Nothing chooses layers at runtime (D9, R14) | 05-M1, Non-goals |
| `relates <path> [--project]`: index or `grepWords` of the basename, `via: grep-basename`, ≤ 4 KB, `--show`, `search` entry | 05-R1 … 05-R3, D7 |
| `refs`: `grepWords`, `collides` from declaration counts, files and lines, ≤ 4 KB; project-wide census | 05-C1 … 05-C4, D5, D6 |
| `find <name> [--kind]`: harvest or `index.find`, which one answered is printed | 05-F1, 05-F2 |
| Extend step 03's symbols, no duplicate module | Files, Starting point, Hand-off |
| Term breadth guard and `limitations[]` on every command | 05-L1 |
| Offline recall in PRIMARY after integration; synthetic roots in worktree tests; `--benchmarks` external root, also for the impact/reuse generators | 05-O1, 05-O6, 05-K3, 05-S3 |
| Score (a)/(b)/(c) on the 116 localize tickets, recall@15, numbers only; codeindex built once per side into scratch | 05-O2, 05-O3, D8 |
| Reproduce BE 0.499 / FE 0.123 first and report the match | 05-O4, D11 |
| Decision 5-I with its thresholds, cost figures and "no tier without a go" | 05-O5 (verbatim), D11 |
| Impact cases only for names declared in ≥ 2 files; language-service truth as a grader; say so | 05-K1, 05-K5 |
| Two arms: naked / `refs` with collision flags and "verify imports" | 05-K2, D10 |
| Cases to `benchmarks/impact-cases`; running is the user's decision; estimate from case count × per-run cost | 05-K3, 05-K4, Done when |
| If the plugin arm loses, report the backlog item, do not reopen it | Hand-off |
| Base-commit scaffold from the team clone's sides; reuse generator wired to it | 05-S1 … 05-S3, D9 |
| One builder under `evals/scripts/src/`, interface exported for 07; isolated, never resets the team checkout | 05-S2, 05-S4, Contract, D9 |
| Test base selection, withheld-test exclusion, dependency setup failure, relative paths | Test 13 |
| `compare.log` rows: dated note in the measurements README; do not edit v6 | 05-N1 |
| P12: verify the grammar list and installed size; local uncommitted install | 05-T2, 05-A8, D12 |
| Startup latency of `map --mode prompt` with `index: none`; 1.5 s not normative; 3 s target | 05-T1 |
| Offline recall: three numbers per side with the command | 05-O3, Done when |
| Tests listed under "Proofs" | Tests 1–13 |
| Do not build `refs --exact`, a language-service child, LSP use, agentmap, `--layers`, heuristic layers | Non-goals |
| Do not enable codeindex by default | Non-goals, 05-A1 |
| Do not commit anything from `benchmarks/` or naming NDA tickets, symbols or paths | 05-O3, Done when, 00-README PRIMARY protocol |
| Do not run the decide tier or the impact/reuse cases without a go | 05-O5, Done when, Non-goals |
| Extend `src/config/ecosystems.ts` from step 03; step 09 owns detection and writing; no other table | 05-A8, Hand-off |
| Measurement status separate from acceptance; pending paid proofs reported with their limitation | Done when |
| 5-I is a hard input to step 09; unknown means propose `none` and mark pending | 05-O5, D11, Hand-off |
| Hand-off acceptance: deliverables with tests, verify green, recall and 5-I reported, case counts not names, README note | Done when |
