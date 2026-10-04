# Module: Search (how the plugin finds code)

## Purpose

Give every skill a **map**: the files, symbols and spans the request touches, with reasons, built
by code from code-shaped terms (M5), revised once identifiers are known (R7), bounded (R5), and
recorded (R3). Two input modes, as the user framed them: **by bare prompt** (nothing but the
request) and **with prepared data** (requirement text, an investigation note, a plan, a diff).
LSP is one layer and only `task` may use it (D1).

## Inputs

- Terms: `--term` from the route, or extracted from requirement text / the request / a note.
- Paths the caller already knows (plan brief, diff, note citations).
- Mode: `prompt` (no identifiers known) or `context` (identifiers or paths known).
- The project's `shortlist.include/exclude` globs and ecosystem (config, unchanged).
- Optional: the symbol index tool configured in `search.index` ([32-artifacts.md](../32-artifacts.md) §4).

## Outputs

- `map` (compact JSON, ≤ 6 KB target): candidates `[path, score, reasons[], spans[]?]`, the symbols
  found for each term (`name, kind, path:line-line`), the terms used by pass, the layers that ran
  with their timings, the index freshness, and `limitations[]`.
- `refs <name> [--exact]`: files (and lines) that use a symbol; `find <name>`: where it is declared;
  `relates <path>`: importers and imports of a file. Each prints ≤ 4 KB and `--show` the rest.
- Ledger `map` and `search` entries.

## Workflow

### 1. Layers

| # | Layer | Tool | Cost measured | What it answers | Who uses it |
|---|---|---|---|---|---|
| L1 | Text | `git grep -w` (exists in `locate`) | 17 ms BE, 41 ms FE per symbol | where a word occurs; references of a unique name (M10: 1.00/1.00) | every skill, the model directly too |
| L2 | Term shortlist | `locate` (exists: path, content, co-change) | ~0.3–1 s | files for a bag of terms when no identifier is known | investigate, plan (pass 1) |
| L3 | Symbol index | off-the-shelf, see §3 | cold 0.9 s / 5.7 s (BE / FE); warm 0.1–0.5 s | declarations by name, importers of a file, a ranked overview, blast radius of a diff | all skills, pass 2; review dependents |
| L4 | Exact references | TypeScript compiler API in-process (code exists in `evals/scripts/src/impact-cases.mjs`) | first query 0.7 s / 2.4 s; second 10 / 48 ms; RSS 368 / 777 MB | references of a **colliding** name, implementations, re-exports | task (before changing a symbol), review dependents when names collide |
| L5 | History | `git log` co-change (exists in `locate`) | included in L2 | files that change together | plan, task |
| L6 | LSP | Claude Code `LSP` tool | first `findReferences` partial for 5–11 s (M9); the model loads it 0–1 times when told (M8) | diagnostics after an edit; hover/type; references with the server warm | **task only** (D1), after the map exists |

Order by mode:

- **prompt** mode: L2 with code-shaped terms → L3 `find` on the terms that look like identifiers →
  pass 2: identifiers harvested from the top candidates' exports (from L3, not from the model) → L2+L3
  again → map. Two passes, by code, in one `map` call: this is the B2 fix (1 → 15/15 came from pass 2).
- **context** mode: L3 `relates`/`find` on the known paths and symbols → L1 for names → L4 only for
  names the index reports as declared in more than one file → map.
- **task**, after edits: L6 diagnostics (the LSP tool reports them after an edit when a server runs);
  L4 or L6 references for each symbol the diff changes the signature of.

### 2. Term extraction (R7)

`termsFromRequirements` stays, re-ranked: identifiers (CamelCase, snake_case, dotted, backticked,
file-like) first; quoted UI strings next, mapped through i18n keys when `assets/i18n/*.json` exists
(FE true files share no vocabulary with the ticket, G10; the i18n key does); prose words last and only
when fewer than 3 identifiers exist; hyphenated prose compounds (`organization-level`) are split, not
kept (M5). Each term's hit count is reported; a term over the breadth guard is dropped with a limitation.

### 3. Symbol index: three off-the-shelf candidates, measured 2026-10-03

Measured on copies of the BE (532 ts) and FE (2,338 ts, 4,262 files) snapshots and on this repo,
node 24, no `node_modules` in the snapshots, a generated tsconfig. Scripts and logs in [measurements-2026-10-03/](../../measurements-2026-10-03/README.md).

```
                          install   cold index (self/BE/FE)   warm        query (BE/FE)              index size (BE/FE)
@maxgfr/codeindex 2.31.2  npm, MIT  0.9 s / 0.9 s / 5.7 s     0.15/0.5 s  refs 236 / 483 ms          6.4 MB / 33 MB
  tree-sitter wasm, 15+6 languages incl. Python; single vendorable engine.mjs; refs, find, impact, delta, scip export
@raymondchins/agentmap    npm, MIT  1.2 s / 1.3 s / 6.1 s     0.1/0.2 s   relates 93 / 163 ms        cache in repo (.agentmap)
  ts-morph (TS/JS/Vue only); find, relates, map --tokens, hubs, callers (experimental: 0 callers found here)
@sourcegraph/scip-typescript  npm, Apache  4.0 s / 4.4 s / 11.6 s   n/a   no local query command     13 MB / 36 MB
  compiler-grade; needs the scip CLI or protobuf bindings to read; skipped a 2.9 MB mock file
TypeScript language service (in-process, `typescript` already a devDependency)
  create 8–11 ms; first getReferencesAtPosition 706 ms (BE) / 2,434 ms (FE); second 10 / 48 ms; RSS 368 / 777 MB
```

Reference precision and recall against the language service, one unique-named class per repo:

```
                         BE PermissionHelper (22 files)   FE UserFacade (179 files)
git grep -w -l           1.00 / 1.00                      1.00 / 1.00
codeindex refs           1.00 / 1.00                      1.00 / 1.00
agentmap --relates       1.00 / 1.00                      1.00 / 0.36  (dependents list stops at 65)
```

What the numbers say:

- For a unique name, grep is exact and 10x faster than any index; the index adds nothing on
  references (M10 again). Where the index adds something is **declarations by name** (`find`),
  **importers of a file** (`relates`), a **ranked overview** (`map`, `hubs`) and **blast radius of a
  diff** (`delta`), none of which grep gives in one call, and none of which has a measured effect on
  the plugin's tasks yet (G8, G27, G28).
- Colliding names are the only case where references need a compiler. The language service answers
  them in one process in 0.7–2.4 s cold, complete, against the LSP tool's partial answers for 5–11 s.
  That cost is paid once per task run, not per query.
- scip-typescript is the most exact index but has no local query path short of writing a protobuf
  reader. Rejected for now; `codeindex scip` can produce the same format later if a consumer appears.

**Decision**: the index interface has three implementations behind `search.index`:

| `search.index` | Default for | Why |
|---|---|---|
| `none` | until the eval in [33-measurement.md](../33-measurement.md) §3 passes | R10 |
| `codeindex` | typescript and python projects once it passes | both ecosystems; vendorable single file (no npm at runtime; grammars 17 MiB pulled once into a cache at `init`, regex tier without them); `refs/find/impact/delta`; incremental |
| `agentmap` | typescript projects that want `map --tokens` and ts-morph alias resolution | TS-only; relates recall gap seen |

L4 (exact references) is not an "index": it is 60 lines around `ts.createLanguageService`, already in
the repo, run in-process by `refs --exact`, and only when the ecosystem is typescript and `typescript`
resolves from the project or the plugin. Python gets no L4 (pyright has no in-process API from node);
`refs` says so.

### 4. Freshness and cost control

- The index is built at `route start` in the background (`codeindex index --out .ambicode/index/`,
  gitignored by `init`), awaited only when a step needs it; cold cost 0.9–5.7 s is hidden behind the
  model's first turn. Warm rebuilds are 0.15–0.5 s and run after each `check` or `review` step in
  `task` (the tree changed).
- `map` reports `index: {tool, fresh: true|false, builtMs}`; a stale index is used and said to be stale,
  never silently.
- Every `search` command prints ≤ 4 KB; `--show all` writes the full result to `steps/` and names the
  file. `map` never exceeds 6 KB: candidates are cut from the bottom with a count (existing rule).

### 5. Reading guidance (replaces `READING_ORDER`)

Delivered with the map, 6 lines:

1. The map is a hypothesis. Confirm or reject each candidate; name what you needed from outside it.
2. Nothing known yet: read batched (`cat` several files in one call is fine, M7). Spans known: read
   the span (`path:lineA-lineB` from the map).
3. A name with several declarations: `$A refs <name> --exact` (TypeScript) before trusting a grep.
4. Before adding a helper: `$A find <name>` and `$A find --kind function <verb>`; say what you reused.
5. `task` only: after an edit, read the diagnostics the LSP tool reports; before changing a signature,
   `$A refs <name> --exact` and update every file it lists.
6. Report nothing about navigation; the record does.

The investigate and review routes never mention LSP (D1). `requirements.lsp` becomes
`task.lspPlugins` and is advisory: `task`'s first step says which plugin is installed, from
`claude plugin list` run by the CLI, and does not stop if none is.

## Interfaces

```ts
interface Search {
  map(input: { task; project; mode: 'prompt'|'context'; terms?; paths?; symbols? }): Promise<Map>;
  refs(name, { exact?: boolean; project }): Promise<RefsResult>;
  find(name, { kind? }): Promise<Declaration[]>;
  relates(path): Promise<{ imports: string[]; importers: string[] }>;
  index: { build(project, { background }): Promise<IndexStatus>; status(project): IndexStatus };
}
interface IndexAdapter { name; build(); find(); refs(); relates(); delta(diff) }   // codeindex | agentmap | none
```

CLI: `$A map …`, `$A refs <name> [--exact]`, `$A find <name> [--kind k]`, `$A relates <path>`,
`$A index build|status`. `locate` stays as the L2 command.

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| No index tool installed | `map` runs L1+L2+L5 and says `index: none`; `find`/`relates` answer with grep and say so |
| Index build fails (grammar missing, odd file) | `index: {fresh:false, error}` in the map; the route continues |
| `typescript` not resolvable | `refs --exact` → `exact-unavailable`, falls back to `-w` grep and says so |
| Index older than HEAD + dirty files | used, marked stale; `task` rebuilds after each check |
| A term matches > 60% of files | dropped, listed under limitations (existing guard) |
| Two projects (monorepo) | `--project` or the paths decide; `ambiguous-project` unchanged |

## What changes from v0.4.0

- `prepare` no longer owns navigation; `map` does, in two passes by code.
- `READING_ORDER` (LSP-first, "no grep fallback") is replaced by §5. The `requirements.lsp` mandate goes.
- `dependents.ts` (name search for review) is reimplemented on `relates` + `refs --exact` when an index
  exists; the name search stays as the fallback.
- New commands `map`, `refs`, `find`, `relates`, `index`.

## Open problems

- P10 No measurement shows the index helping the plugin's tasks; the two unique-name probes above
  show grep equal. The eval that decides is 33 §3 (localize with `index: codeindex` vs `none`;
  reuse on base-commit scaffolds; impact with colliding names). Until then `none` is the default.
- P11 Memory: the language service held 777 MB RSS on the FE repo. `refs --exact` runs in a child
  process that exits; a 4,000-file project may need a cap (`search.exactMaxFiles`, default 3,000).
- P12 codeindex grammars: 17 MiB wasm fetched at `init`; offline installs get the regex tier, whose
  precision was not measured here.
- P13 Python: no exact layer; tree-sitter names only. Acceptable because no Python measurement exists;
  flagged so nobody reads "index" as "compiler-grade" for Python.
- P14 agentmap `--relates` returned 65 of 179 importers with no truncation flag in the JSON. Either a
  cap or a resolution miss; not investigated. A reason to prefer codeindex, and a reason to test any
  adapter against the language service before shipping it.
