# Step 5 — Search complete: `refs` with collisions, `find`, `relates`, index adapter (`none` + `codeindex`), offline recall, colliding-name cases

> **Dispatch**: 00-README defaults (isolated workspace, uncommitted, $0).
> Prerequisites: 04 integrated (or isolated module-only assignment); decision A: proceed.
> Read 01-contracts and 02-scenarios first. Every paid item below needs named authorization.
> An unrun eval is measurement pending; finish independent model-free work.

## Why this step exists

Step 3 shipped the two-pass map (`shortlist → harvest → shortlist`) with no index (R7, D8). This
step adds the remaining layers and commands (`relates`, the optional index), measures whether an
index helps at all (P10, 33 §3), and builds the colliding-name cases that decide whether the
backlog's exact-reference item is ever reopened (P51). Design:
[../v6/modules/10-search.md](../v6/modules/10-search.md) whole;
[../v6/33-measurement.md](../v6/33-measurement.md) §0.5, §3; [../v6/41-migration.md](../v6/41-migration.md) step 5.

## Read first

1. `CLAUDE.md`.
2. `../v6/modules/10-search.md` whole (§3's measured table and its provenance note; §4 freshness);
   `../v6/33-measurement.md` §3; `../v6/01-goals-and-constraints.md` M5, M6, M10, M21, D4, D8, D9,
   D15, D18, R7, R10, R14, R16; `../v6/40-open-problems.md` P10, P12, P14, P51, P57;
   `../v6/50-backlog.md` (what is **not** built: exact references, agentmap).
3. `../measurements-2026-10-03/README.md`, `results.log`, `queries.log`, `compare.log` (step 0),
   `compare.mjs`, `run.sh`, `queries.sh`.
4. Code after step 3: `src/code-intelligence/{map,harvest,refs,locate,dependents}.ts`,
   `src/git/git.ts` (`grepWords`), `src/config/defaults.ts` (`SHORTLIST_DEFAULTS`),
   `src/contracts/config.ts`; `evals/scripts/src/shortlist-recall.mjs` (offline recall over the 116
   localize tickets; reads `benchmarks/`, prints numbers only), `evals/scripts/src/impact-cases.mjs`
   (impact cases: rebuilt here with colliding names), `evals/scripts/src/reuse-cases.mjs` (already tracked; validated in
   step 00), `evals/scripts/src/lsp-arms.mjs` (**backlog**: read only `tsconfigFor`, reused for the
   language-service truth of impact cases; build nothing LSP).
5. `@maxgfr/codeindex` README (from `node_modules` after a **local, uncommitted** install into the
   scratchpad, or its npm page): command names `refs/find/impact/delta`, index directory flag, the
   grammar list. P12: its README claims "15+6 languages, 17 MiB"; verify the grammar list and the
   installed size and report both.

## Deliverables

### 1. `IndexAdapter` with two implementations (10 §3, Interfaces)

```ts
interface IndexAdapter { name: 'none' | 'codeindex'; build(project, {detached}); find(name, {kind?}); refs(names); relates(path); delta(diff); status(project) }
```

- `src/code-intelligence/index/none.ts`: every query answers "no index" so callers fall back
  (harvest/grep) **and say so** in the output (`index: none`).
- `src/code-intelligence/index/codeindex.ts`: spawns the `codeindex` binary from `node_modules/.bin`
  or PATH (detected by `init` in step 9; until then `search.index: codeindex` in config is honoured
  only if the binary resolves, else `index: error` with the reason). Index directory
  `.ambicode/index/`; `index build` **refuses** unless `.ambicode/index/` is gitignored
  (10 §4; a 33 MB untracked index would land in `review`'s target). `build` runs **detached** at
  `route start` (the hook returns at once); `status` reports `{tool, fresh, builtMs}`; stale is used
  and said. Warm rebuilds after each `check` and `review` step in `task` (hook into the tail advance,
  step 7 wires it; here expose the call).
- `src/code-intelligence/map.ts`: `index.find` appended to the prompt layer list and `index.relates`
  to the context list **by `init`** when `index != none` (20 §Config; step 9 writes it) — `map` itself
  only runs what config lists; with `index: none` and an `index.*` layer in config, `map` skips it
  and prints `index: none` (10 Failure modes). Nothing here chooses layers at runtime (D9, R14).

### 2. `relates <path>` and completing step 03's `refs`/`find` (10 Outputs)

- `relates <path> [--project]`: importers and imports from the index when present, else a
  `grepWords` of the file's basename (without extension) across the project, labelled
  `via: grep-basename`. ≤ 4 KB, `--show` for the rest; `search` ledger entry.
- `refs <name>…`: `grepWords` per name; `collides: true` when the harvest counts > 1 declaration;
  files and lines; ≤ 4 KB. Extend existing symbols from step 03; a project-wide declaration
  census now flags a collision even when only one declaration was in the top-8 map harvest. `find <name> [--kind]`: harvest, or `index.find` when present (which one
  answered is printed).
- Term breadth guard and `limitations[]` on every command (10 §2).

### 3. Offline recall script (33 §3, first bullet; free)

Run NDA recall only in the primary checkout after integration, per 00-README's PRIMARY
protocol; worktree tests use synthetic roots. Extend the existing offline script's input
path option (or add --benchmarks to its current parser) to accept "$PRIMARY/benchmarks".
Use this same explicit root for the impact/reuse generators below; all generated NDA cases
stay in primary ignored locations. Test external-root resolution with synthetic directories.

Extend `evals/scripts/src/shortlist-recall.mjs` to score `map` as **(a)** shortlist only, **(b)**
shortlist + harvest + shortlist, **(c)** (b) + `index.find` (codeindex, built once per side into a
scratch directory) on the 116 localize tickets, recall@15 per side, printing numbers only (never
ticket text, never file names). Today's (a): BE 0.499, FE 0.123 (M6) — reproduce those two numbers
first and report the match before trusting (b) and (c). **Decision 5-I**: (c) − (b) < 0.05 on both
sides → `codeindex` stays off by default (`init` proposes `none`); ≥ 0.05 on either side → report; the
user decides whether the localize decide comparison (10 cases × 3 runs; ≈ $5.40 per new arm at $0.18/run,
subject to actual counts and authorization; v6/33's ≈ $14 is historical) runs with codeindex vs `none`. The
agent does not run that tier without a go.

### 4. Colliding-name impact cases (33 §3, second bullet; free to build, costs to run)

Rebuild `impact-cases.mjs` so a case is generated **only for a symbol declared in ≥ 2 files** of the
side (the harvest's declaration count), truth = the language-service reference set under
`tsconfigFor` (the truth generator may use the TypeScript API offline — it is a **grader**, not a
plugin feature; D8 forbids LSP in the plugin, not in a test oracle; say this in the report). Two arms:
naked / `refs` with collision flags and the "verify imports" instruction (P51). Cases go to
`benchmarks/impact-cases` (gitignored, NDA). Running them is a decision for the user (cost estimate
from the generator's case count × the measured per-run cost; report the estimate). If the plugin arm
loses, the backlog's exact-reference item is the candidate fix — **report**, do not reopen it.

### 5. Reuse cases on the merge-request base commit (33 §3, third bullet; build only)

Build the base-commit scaffold builder from the team clone's sides (`prepare-reviews.mjs` in
`benchmarks/` has the sides; it is NDA and local): a scaffold that checks out the MR base commit
of a ticket, so a reuse case asks "survey what exists" against the code **as it was** (G28). The
tracked `reuse-cases.mjs` is the generator; wire it to the new scaffold. Running is a decision.

### 6. `compare.log` numbers into the design table (10 §3)

Do not edit `../v6/`. Instead, add a dated note under `../measurements-2026-10-03/README.md` saying
which rows of 10 §3's table are now logged (`compare.log` from step 0) and whether any logged number
differs from the unlogged one by more than 10%. A future design correction belongs to the user; do not edit frozen v6 here.

## Proofs

- `npm run verify` green. Tests: adapter `none` falls back and labels; `codeindex` adapter against a
  fake process runner (argv shape, index dir, refusal without the ignore line, detached build does
  not block); `relates` grep fallback label; `refs` collision flag from a two-file fixture; `find`
  answers from harvest and says so; `map` skips `index.*` with `index: none` and prints it; breadth
  guard; `search` entries written.
- Startup/latency: measure `map --mode prompt` on this repository with `index: none`, wall time
  and per-layer ms. The former plan's 1.5 s estimate is not a normative pass/fail ceiling;
  synchronous route start is measured against v6/33's 3 s target.
- Offline recall: the three numbers per side in a code block, with the command.

## Do not

- Do not build `refs --exact`, a language-service child, or any LSP tool use (D8; backlog).
- Do not ship the agentmap adapter (P14; backlog).
- Do not add `--layers` to the CLI or let `map` choose layers by heuristic (D15, D9, R14).
- Do not enable `codeindex` by default; `none` until decision 5-I says otherwise (R10).
- Do not commit anything from `benchmarks/` or any file naming a ticket, symbol or path from the
  NDA repositories (the two symbol names in the measurements README are the only exception already
  made).
- Do not run the decide tier or the impact/reuse cases without a go.

## Implementation hand-off acceptance

Deliverables 1–6 exist with tests; `verify` is green; the offline recall numbers are reported with
decision 5-I stated; the impact and reuse generators produce cases (count reported, names not); the
measurements README carries the dated note.

## Ownership, dependencies and measurement limits

Extend src/config/ecosystems.ts from step 03; step 09 owns detection/writing, not another table.
Own one base-commit scaffold builder under evals/scripts/src/; export its interface for 07.
A scaffold uses an isolated clone/worktree at the MR base, never resets the team checkout.
Test base selection, withheld-test exclusion hook, dependency setup failures and relative paths.
The offline truth generator may use a language-service oracle as grader only; it is never
packaged or called by plugin runtime (D8). A proposed ≤1.5s map target is an unvalidated
implementation target, not a new normative gate; report measured latency against v6/33 ≤3s start.
Default remains none; ≥0.05 offline gain permits proposing a paid run, not auto-enabling index.
5-I report is a hard input to 09's default; unknown means propose none and mark pending.

Measurement status is separate from implementation acceptance. If a paid proof is not authorized,
report it as pending with its exact downstream limitation; do not claim the skill's bar is met.
