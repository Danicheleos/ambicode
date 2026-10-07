# Module: Search (how the plugin finds code)

## Purpose

Give every skill a **map**: files, symbols and spans the request touches, with reasons, built by
code from code-shaped terms (M5), revised in a second pass from identifiers the first pass found
(R7) **without needing an index**, bounded (R5) and recorded (R3). Two input modes: **prompt**
(nothing but the request) and **context** (requirement text, a note, a plan, a diff). The layers a
mode uses are **declared in config, printed on every run and recorded** (D9): code chooses
deterministically, the model never does (a `--layers` override is accepted only from a route step,
never from the model, D15), and the user can read and edit the choice. The module knows no
language: declaration patterns, source globs and the index adapter's grammars are **ecosystem
adapters** that `init` detects and config names (R16, D18); the layers and the two-pass shape are
the same for every ecosystem.

**No LSP and no language service anywhere in v4** (D8): the LSP tool, the TypeScript
language-service child (`refs --exact`) and the diagnostics probe are in [50-backlog.md](../50-backlog.md),
to be tried when the skills show good results without them.

## Inputs

- Terms: `--term` from the route, or extracted from requirement text / the request / a note.
- Paths and symbols the caller already knows (plan brief, diff, note citations).
- Mode: `prompt` or `context`; the layer list for that mode from `search.layers` (32 §4).
- `projects[].shortlist` globs and ecosystem (config, unchanged).
- Optional: `search.index` adapter, default `none`.

## Outputs

- `map` (compact JSON, ≤ 6 KB): candidates `[path, score, reasons[], spans[]?]`, symbols per term
  (`name, kind, path:line-line, declarations: n`), terms by pass, **`layers: [{name, ms, hits}]` in
  the order run**, index status, `limitations[]`.
- `refs <name>…`: files (and lines) using the names, `git grep -w`; `find <name>`: declarations
  (harvest, or index when present); `relates <path>`: importers and imports (index) or grep of the
  file's basename. Each ≤ 4 KB, `--show` for the rest.
- Ledger `map` (with `layers`) and `search` entries.

## Workflow

### 1. Layers

| # | Layer | Tool | Cost | Answers | Who |
|---|---|---|---|---|---|
| `grep` | Text | `git grep -w -l` 🆕 (`grepWords` beside the existing `grepFiles`, which is `-i -F -l` with no `-w`, `src/platform/git/git.ts:217-229`) | **70 ms BE / 151 ms FE per name with process spawn** (`queries.log`); 17/41 ms in-process from an unlogged re-run (#50) | occurrences; references of a unique name (M10, 1.00/1.00) | every skill; the model directly |
| `shortlist` | Term shortlist | `locate` (exists: path, content, co-change) | ~0.3–1 s | files for a bag of terms | all, pass 1 and pass 2 |
| `harvest` | **Regex harvest** 🆕 | the `DECLARATIONS` patterns of `dependents.ts:25-33` over the top 8 pass-1 files, run **globally** (today `declaredNames` takes the first match per pattern, ≤ 7 names per file, `:35-40`) with an `export` filter in TypeScript (#51) | I'd guess ~50 ms (unmeasured) | declared names to feed pass 2; **declaration counts per name** (collisions) | all, pass 2 |
| `index.find` / `index.relates` | Symbol index (optional) | `codeindex` adapter, §3 | cold 0.9 s / 5.7 s (BE / FE); warm 0.15–0.5 s | declarations by name, importers of a file, blast radius of a diff | pass 2 improvement; review and task dependents |
| `history` | History | `git log` co-change (exists in `locate`) | inside `shortlist` | files that change together | plan, task |

Default layer lists (config, editable; `init` writes them explicitly so they are visible):

```yaml
search:
  index: none
  layers:
    prompt:  [shortlist, harvest, shortlist]          # + index.find appended by init when index != none
    context: [grep, harvest]                          # + index.relates when index != none
```

- **prompt**: `shortlist` with code-shaped terms → `harvest` names from the top 8 files → `shortlist`
  again with those names (+ `index.find` when present) → map. Two passes, by code, in one `map`
  call. This is the B2 fix (1 → 15/15 came from identifiers), and it ships with `index: none`.
- **context**: `grep -w` on known names; `harvest` on the known paths to count declarations per name;
  `index.relates` on known paths when an index exists → map. A name declared in more than one file
  is marked `collides: true`, and the step text says "verify each hit's import before trusting it"
  — the honest substitute for exact references until the backlog item is measured (P51).

`map` refuses a layer name that is not in the table (`search-layer-unknown`), runs the list in the
order given, records `layers` with per-layer `ms` and `hits`, and prints the list on its first line.

### 2. Term extraction (R7)

`termsFromRequirements` stays, re-ranked: identifiers (CamelCase, snake_case, dotted, backticked,
file-like) first; quoted UI strings next, mapped through i18n keys when `assets/i18n/*.json` exists
(FE true files share no vocabulary with the ticket, G10); prose words last and only when fewer than
3 identifiers exist; hyphenated prose compounds are split (M5). Each term's hit count is reported;
a term over the breadth guard is dropped with a limitation.

### 3. Symbol index: measured candidates, one adapter

Measured 2026-10-03 on copies of the BE (532 ts) and FE (2,338 ts, 4,262 files) snapshots and this
repo; node 24; no `node_modules` in the snapshots; the eval's generated tsconfig. Scripts and logs:
[measurements-2026-10-03/](../../measurements-2026-10-03/README.md). **Provenance (#50)**: the
install and cold/warm index timings are in `results.log`; the agentmap `relates` timings and the
`git grep -w` spawn timings are in `queries.log`; the codeindex query timings, the language-service
timings and the precision/recall rows come from a `compare.mjs` re-run whose stdout was **not
saved** (the logged first attempts failed on a wrong flag and a missing import). 33 §0.5 re-runs it
and commits `compare.log` before any of these numbers is used in a decision.

```
                          install   cold index self/BE/FE     warm        query BE/FE                     index BE/FE   source
@maxgfr/codeindex 2.31.2  npm, MIT  0.9 / 0.9 / 5.7 s         0.15/0.5 s  refs 236 / 483 ms (unlogged)    6.4 / 33 MB   results.log; unlogged re-run
  tree-sitter wasm; "15+6 languages incl. Python", "17 MiB" per the package README, not checked (#72)
@raymondchins/agentmap    npm, MIT  1.2 / 1.3 / 6.1 s         0.1/0.2 s   relates 115 / 199 ms (logged)   cache in repo queries.log
  ts-morph, TS/JS/Vue only; --relates returned 65 of 179 importers with no truncation flag (unlogged re-run, #93); --callers found 0 (logged)
@sourcegraph/scip-typescript  npm   4.0 / 4.4 / 11.6 s        -           no local query command          13 / 36 MB    results.log
TypeScript language service       create 8–11 ms; first references 706 / 2,434 ms; second 10 / 48 ms; RSS 368 / 777 MB   unlogged re-run; backlog
```

Reference precision/recall against the language service, one unique-named class per repo
(n = 1 per repo, unlogged re-run; **this decides nothing about colliding names**):

```
                     BE PermissionHelper (22)   FE UserFacade (179)
git grep -w -l       1.00 / 1.00                1.00 / 1.00
codeindex refs       1.00 / 1.00                1.00 / 1.00
agentmap --relates   1.00 / 1.00                1.00 / 0.36
```

Decision: one `IndexAdapter` interface, **one shipped adapter** (`codeindex`: both ecosystems,
vendorable, `refs/find/impact/delta`, incremental), default `none` until 33 §3 passes (R10).
agentmap is not shipped (TS-only, the `relates` gap). scip-typescript is not adopted (no local
query path); `codeindex scip` can emit the format later if a consumer appears.

### 4. Freshness and cost control

- `index build` runs as a **detached** child at `route start` (the hook returns immediately); a step
  that needs the index and finds it absent falls back to `grep`/`harvest` and says so (`index: building`).
  Warm rebuilds (0.15–0.5 s) run after each `check` and `review` step in `task`.
- `index build` **refuses** unless `.ambicode/index/` is gitignored (a 33 MB untracked index would
  land in `review`'s default target and trip `snapshot-too-large`); `init --apply` writes the ignore
  line **on acceptance** (30 §9).
- `map` reports `index: {tool, fresh, builtMs}`; stale is used and said.
- Every `search` command prints ≤ 4 KB; `--show all` writes the full result to `steps/`. `map` ≤ 6 KB,
  candidates cut from the bottom with a count.

### 5. Reading guidance (replaces `READING_ORDER`), delivered with the map

1. The map is a hypothesis. Confirm or reject each candidate; name what you needed from outside it.
2. Nothing known yet: read batched (`cat` several files in one call is fine, M7). Spans known: read
   the span.
3. A name marked `collides` (declared in several files): check the import at each hit before
   trusting a grep; `$A find <name>` lists the declarations.
4. Before adding a helper: `$A find <name>`; say what you reused.
5. Report nothing about navigation; the record does (CLI calls only; your own reads are not
   recorded, and the report says so).

## Interfaces

```ts
interface Search {
  map(input: { task; project; mode: 'prompt'|'context'; layers?: LayerName[] /* route callers only (D15) */; terms?; paths?; symbols? }): Promise<Map>;
  refs(names: string[], { project }): Promise<RefsResult>;          // git grep -w
  find(name, { kind? }): Promise<Declaration[]>;                     // harvest, or index when present
  relates(path): Promise<{ imports: string[]; importers: string[] }>;
  index: { build(project, { detached: true }): Promise<void>; status(project): IndexStatus };
}
type LayerName = 'grep' | 'shortlist' | 'harvest' | 'history' | 'index.find' | 'index.relates';
interface IndexAdapter { name; build(); find(); refs(); relates(); delta(diff) }   // codeindex | none
```

CLI: `$A map …`, `$A refs <name>…`, `$A find <name> [--kind k]`, `$A relates <path>`,
`$A index build|status`. `locate` stays as the `shortlist` command.

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| No index tool | `map` runs the configured layers minus `index.*`, `index: none`; `find`/`relates` answer with harvest/grep and say so |
| Index building or failed | `index: building|error`; the route continues on `grep`/`harvest` |
| A layer name not in the table | `search-layer-unknown`; release: fix `search.layers` |
| `map --layers` typed by the model | `search-layers-not-for-model`; release: edit `search.layers` in config (D15) |
| A term matches > 60% of files | dropped, listed under limitations (existing guard) |
| A name collides | `collides: true` in the map; step text says to verify imports; no exact tool (P51) |
| Two projects | `--project` or the paths decide; at a hook-run start the raised gate `project-ambiguous`, release `route next --project <id>` (12 §3) |

## What changes from v0.4.0

`prepare` no longer owns navigation; `map` does, in two passes, with the layer list in config.
`READING_ORDER` is replaced by §5. `dependents.ts` keeps its name search as the fallback; with an
index, `relates`. New: `grepWords`, `map`, `refs`, `find`, `relates`, `index`. Removed from v2:
`refs --exact`, `exactMaxFiles`, `task.lspPlugins` (backlog).

## Open problems

- P10 No number shows the index helping; grep tied on two unique names. `none` by default; 33 §3 decides,
  against the regex harvest.
- P12 codeindex grammars: "17 MiB wasm" per its README, not checked; offline gets the regex tier, unmeasured.
- P14 agentmap `relates` 65 of 179: not investigated; the reason one adapter ships.
- P51 Colliding names have no exact answer in v4: `collides: true` plus a reading instruction (a
  model-obeyed instruction, M2 applies). Measured by the colliding-name impact cases (33 §3); the
  backlog item is the fix if they fail.

## v7 changes

- **Measured profile (A5).** `DECLARATION_CANDIDATES` and `TEST_CANDIDATES` are measured into `SearchProfile` (declarations, tests) with the catalog as fallback. A repository with no manifest is project `generic` (was `typescript`). The per-language LSP guidance table is deleted.
- **Tuning (A6).** `SEARCH_TUNING_DEFAULTS` (topFiles, maxTerms, proseRetryTerms, pass2Names, pass2Outside, spansPerCandidate, sequenceDirMin, sequenceShare, layerMin, layeredShare, nameMaxFiles, leads, featureLeads, featurePaths, ...) are overridable by config `search.tuning`; `resolveTuning` returns `{tuning, hash, overrides}`, the hash covering every value. The `map` entry records `tuning{hash, overrides}`, `profile{commit, files}` and `decisions{sequenceFiles, pass2Downweighted, harvestFiles, feature, proseRetry}`; the leads header shows the tuning hash.
- **Seeding (B8).** Plan and task maps are seeded with the paths and symbols cited in the investigation note or brief plus acceptance-criteria identifiers; terms come from the brief or plan iteration text, never "iteration N of <slug>".
