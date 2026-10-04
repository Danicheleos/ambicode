# Module: Search (how the plugin finds code)

## Purpose

Give every skill a **map**: files, symbols and spans the request touches, with reasons, built by
code from code-shaped terms (M5), revised in a second pass from identifiers the first pass found
(R7) **without needing an index**, bounded (R5) and recorded (R3). Two input modes: **prompt**
(nothing but the request) and **context** (requirement text, a note, a plan, a diff). LSP is one
layer, `task` only, passive (D1).

## Inputs

- Terms: `--term` from the route, or extracted from requirement text / the request / a note.
- Paths and symbols the caller already knows (plan brief, diff, note citations).
- Mode: `prompt` or `context`.
- `projects[].shortlist` globs and ecosystem (config, unchanged).
- Optional: `search.index` adapter ([32-artifacts.md](../32-artifacts.md) §4), default `none`.

## Outputs

- `map` (compact JSON, ≤ 6 KB): candidates `[path, score, reasons[], spans[]?]`, symbols per term
  (`name, kind, path:line-line`), terms by pass, layers used with timings, index status,
  `limitations[]`.
- `refs <name>… [--exact]`: files (and lines) that use the names; `find <name>`: declarations;
  `relates <path>`: importers and imports. Each ≤ 4 KB, `--show` for the rest.
- Ledger `map` and `search` entries.

## Workflow

### 1. Layers

| # | Layer | Tool | Cost measured | Answers | Who |
|---|---|---|---|---|---|
| L1 | Text | `git grep -w -l` 🆕 (`grepWords` beside the existing `grepFiles`, which is `-i -F -l` with no `-w`, `src/git/git.ts:217-229`) | 17 ms BE, 41 ms FE per name | occurrences; references of a unique name (M10, 1.00/1.00) | every skill; the model directly |
| L2 | Term shortlist | `locate` (exists: path, content, co-change) | ~0.3–1 s | files for a bag of terms | all, pass 1 |
| L2′ | **Regex harvest** 🆕 | the `DECLARATIONS` patterns of `dependents.ts:25-33` applied to the top 8 pass-1 files | ~50 ms | exported identifiers to feed pass 2 | all, pass 2 |
| L3 | Symbol index (optional) | `codeindex` adapter, §3 | cold 0.9 s / 5.7 s (BE / FE); warm 0.15–0.5 s | declarations by name, importers of a file, a ranked overview, blast radius of a diff | pass 2 improvement; review dependents |
| L4 | Exact references | TypeScript language service in-process (`impact-cases.mjs:62-77`, ~20 lines) | first query 0.7 s / 2.4 s; next 10 / 48 ms; RSS 368 / 777 MB | references of a **colliding** name, implementations, re-exports | task before changing a symbol; review dependents when names collide (TypeScript only) |
| L5 | History | `git log` co-change (exists in `locate`) | inside L2 | files that change together | plan, task |
| L6 | LSP | Claude Code `LSP` tool | first `findReferences` partial for 5–11 s (M9) | **diagnostics pushed after an edit**, if the plugin does that (probe, 33 §0) | task only, passive |

Order by mode:

- **prompt**: L2 with code-shaped terms → L2′ harvests exported names from the top 8 files → L2
  again with those names (+ L3 `find` when an index exists) → map. Two passes, by code, in one
  `map` call. This is the B2 fix (1 → 15/15 came from identifiers), and it ships with `index: none`.
- **context**: L1 `-w` on known names; L3 `relates` on known paths when an index exists; L4 for
  names that L2′ or the index report as declared in more than one file → map.
- **task, after edits**: L6 diagnostics (passive); L4 references for each symbol the brief changes
  the signature of, all symbols in **one** `refs --exact` call.

### 2. Term extraction (R7)

`termsFromRequirements` stays, re-ranked: identifiers (CamelCase, snake_case, dotted, backticked,
file-like) first; quoted UI strings next, mapped through i18n keys when `assets/i18n/*.json` exists
(FE true files share no vocabulary with the ticket, G10); prose words last and only when fewer than
3 identifiers exist; hyphenated prose compounds are split (M5). Each term's hit count is reported;
a term over the breadth guard is dropped with a limitation.

### 3. Symbol index: measured candidates, one adapter

Measured 2026-10-03 on copies of the BE (532 ts) and FE (2,338 ts, 4,262 files) snapshots and this
repo; node 24; no `node_modules` in the snapshots; the eval's generated tsconfig. Scripts and logs:
[measurements-2026-10-03/](../../measurements-2026-10-03/README.md).

```
                          install   cold index self/BE/FE     warm        query BE/FE            index BE/FE
@maxgfr/codeindex 2.31.2  npm, MIT  0.9 / 0.9 / 5.7 s         0.15/0.5 s  refs 236 / 483 ms      6.4 / 33 MB
  tree-sitter wasm, 15+6 languages incl. Python; single vendorable engine.mjs; refs, find, impact, delta, scip export; incremental
@raymondchins/agentmap    npm, MIT  1.2 / 1.3 / 6.1 s         0.1/0.2 s   relates 93 / 163 ms    cache in repo
  ts-morph, TS/JS/Vue only; --relates returned 65 of 179 importers with no truncation flag; --callers found 0
@sourcegraph/scip-typescript  npm   4.0 / 4.4 / 11.6 s        -           no local query command 13 / 36 MB
TypeScript language service       create 8–11 ms; first references 706 / 2,434 ms; second 10 / 48 ms; RSS 368 / 777 MB
```

Reference precision/recall against the language service, one unique-named class per repo
(n = 1 per repo; **this decides nothing about colliding names**, which is what an index is for):

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

L4 is not an index: `refs --exact <name>…` starts **one child process per call**, loads the project
once (0.7–2.4 s), answers every name given, prints, exits. The task route passes all of a brief's
symbols in one call, so a run usually pays the cold cost once. No resident process. Python has no L4
(`refs` says so).

### 4. Freshness and cost control

- `index build` runs as a **detached** child at `route start` (the hook returns immediately); a step
  that needs the index and finds it absent falls back to L1/L2′ and says so (`index: building`).
  Warm rebuilds (0.15–0.5 s) run after each `check` and `review` step in `task`.
- `index build` **refuses** unless `.ambicode/index/` is gitignored (a 33 MB untracked index would
  land in `review`'s default target and trip `snapshot-too-large`); `init` writes the ignore line.
- `map` reports `index: {tool, fresh, builtMs}`; stale is used and said.
- Every `search` command prints ≤ 4 KB; `--show all` writes the full result to `steps/`. `map` ≤ 6 KB,
  candidates cut from the bottom with a count.

### 5. Reading guidance (replaces `READING_ORDER`), delivered with the map

1. The map is a hypothesis. Confirm or reject each candidate; name what you needed from outside it.
2. Nothing known yet: read batched (`cat` several files in one call is fine, M7). Spans known: read
   the span.
3. A name with several declarations: `$A refs <name> --exact` (TypeScript) before trusting a grep.
4. Before adding a helper: `$A find <name>`; say what you reused.
5. `task` only: if diagnostics appear after an edit, fix them in the same step; before changing a
   signature, `$A refs --exact <all names>` once and update every file it lists.
6. Report nothing about navigation; the record does (CLI calls only; your own reads are not
   recorded, and the report says so).

`requirements.lsp` becomes `task.lspPlugins`, advisory: the task route's first step says which
plugin is installed (from `claude plugin list`, when available) and does not stop if none is.

## Interfaces

```ts
interface Search {
  map(input: { task; project; mode: 'prompt'|'context'; terms?; paths?; symbols? }): Promise<Map>;
  refs(names: string[], { exact?: boolean; project }): Promise<RefsResult>;
  find(name, { kind? }): Promise<Declaration[]>;
  relates(path): Promise<{ imports: string[]; importers: string[] }>;
  index: { build(project, { detached: true }): Promise<void>; status(project): IndexStatus };
}
interface IndexAdapter { name; build(); find(); refs(); relates(); delta(diff) }   // codeindex | none
```

CLI: `$A map …`, `$A refs <name>… [--exact]`, `$A find <name> [--kind k]`, `$A relates <path>`,
`$A index build|status`. `locate` stays as the L2 command.

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| No index tool | `map` runs L1+L2+L2′+L5, `index: none`; `find`/`relates` answer with grep and say so |
| Index building or failed | `index: building|error`; the route continues on L1/L2′ |
| `typescript` not resolvable, or > `exactMaxFiles` (3,000 `.ts/.tsx`; FE at 2,338 passes) | `exact-unavailable` → `-w` grep, stated |
| A term matches > 60% of files | dropped, listed under limitations (existing guard) |
| Two projects | `--project` or the paths decide; at a hook-run start the gate's release is `route next --project <id>` (12 §3) |

## What changes from v0.4.0

`prepare` no longer owns navigation; `map` does, in two passes. `READING_ORDER` is replaced by §5.
`dependents.ts` keeps its name search as the fallback; with an index, `relates` + `refs --exact`.
New: `grepWords`, `map`, `refs`, `find`, `relates`, `index`.

## Open problems

- P10 No number shows the index helping; grep tied on two unique names. `none` by default; 33 §3 decides,
  now against the regex harvest, not against nothing.
- P11 777 MB RSS per `refs --exact` child on FE; one child per call; cap 3,000 `.ts/.tsx` files.
- P12 codeindex grammars: 17 MiB wasm pulled at `init`; offline gets the regex tier, unmeasured.
- P13 Python: no exact layer.
- P14 agentmap `relates` 65 of 179: not investigated; the reason one adapter ships.
- P36 Whether the LSP plugin pushes diagnostics after `Edit` (goal (a) in practice) is a probe (33 §0).
