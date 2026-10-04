# Step 5 — Search complete: `refs` with collisions, `find`, `relates`, index adapter (`none` + `codeindex`), offline recall, colliding-name cases

> **Dispatcher block (fill in before hand-off; the agent stops if empty)**
> - Branch: `__________`
> - Commit policy: `__________`
> - Spend authorization: the decide tier on localize with codeindex (≈ $14) **only if** the offline step passes — `__________`
> - Decision A outcome (step 3): `proceed` — this step is dispatched only on `proceed`

## Why this step exists

Step 3 shipped the two-pass map (`shortlist → harvest → shortlist`) with no index (R7, D8). This
step adds the remaining layers and commands (`relates`, the optional index), measures whether an
index helps at all (P10, 33 §3), and builds the colliding-name cases that decide whether the
backlog's exact-reference item is ever reopened (P51). Design:
[../v5/modules/10-search.md](../v5/modules/10-search.md) whole;
[../v5/33-measurement.md](../v5/33-measurement.md) §0.5, §3; [../v5/41-migration.md](../v5/41-migration.md) step 5.

## Read first

1. `CLAUDE.md`.
2. `../v5/modules/10-search.md` whole (§3's measured table and its provenance note; §4 freshness);
   `../v5/33-measurement.md` §3; `../v5/01-goals-and-constraints.md` M5, M6, M10, M21, D4, D8, D9,
   D15, D18, R7, R10, R14, R16; `../v5/40-open-problems.md` P10, P12, P14, P51, P57;
   `../v5/50-backlog.md` (what is **not** built: exact references, agentmap).
3. `../measurements-2026-10-03/README.md`, `results.log`, `queries.log`, `compare.log` (step 0),
   `compare.mjs`, `run.sh`, `queries.sh`.
4. Code after step 3: `src/code-intelligence/{map,harvest,refs,locate,dependents}.ts`,
   `src/git/git.ts` (`grepWords`), `src/config/defaults.ts` (`SHORTLIST_DEFAULTS`),
   `src/contracts/config.ts`; `evals/scripts/src/shortlist-recall.mjs` (offline recall over the 116
   localize tickets; reads `benchmarks/`, prints numbers only), `evals/scripts/src/impact-cases.mjs`
   (impact cases: rebuilt here with colliding names), `evals/scripts/src/reuse-cases.mjs` (restored in
   step 0), `evals/scripts/src/lsp-arms.mjs` (**backlog**: read only `tsconfigFor`, reused for the
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

### 2. `relates <path>` and the complete `refs`/`find` (10 Outputs)

- `relates <path> [--project]`: importers and imports from the index when present, else a
  `grepWords` of the file's basename (without extension) across the project, labelled
  `via: grep-basename`. ≤ 4 KB, `--show` for the rest; `search` ledger entry.
- `refs <name>…`: `grepWords` per name; `collides: true` when the harvest counts > 1 declaration;
  files and lines; ≤ 4 KB. `find <name> [--kind]`: harvest, or `index.find` when present (which one
  answered is printed).
- Term breadth guard and `limitations[]` on every command (10 §2).

### 3. Offline recall script (33 §3, first bullet; free)

Extend `evals/scripts/src/shortlist-recall.mjs` to score `map` as **(a)** shortlist only, **(b)**
shortlist + harvest + shortlist, **(c)** (b) + `index.find` (codeindex, built once per side into a
scratch directory) on the 116 localize tickets, recall@15 per side, printing numbers only (never
ticket text, never file names). Today's (a): BE 0.499, FE 0.123 (M6) — reproduce those two numbers
first and report the match before trusting (b) and (c). **Decision 5-I**: (c) − (b) < 0.05 on both
sides → `codeindex` stays off by default (`init` proposes `none`); ≥ 0.05 on either side → report; the
user decides whether the decide tier (≈ $14, 33 §3 last bullet) runs with codeindex vs `none`. The
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
restored `reuse-cases.mjs` is the generator; wire it to the new scaffold. Running is a decision.

### 6. `compare.log` numbers into the design table (10 §3)

Do not edit `../v5/`. Instead, add a dated note under `../measurements-2026-10-03/README.md` saying
which rows of 10 §3's table are now logged (`compare.log` from step 0) and whether any logged number
differs from the unlogged one by more than 10%. The user decides whether a v6 updates the table.

## Proofs

- `npm run verify` green. Tests: adapter `none` falls back and labels; `codeindex` adapter against a
  fake process runner (argv shape, index dir, refusal without the ignore line, detached build does
  not block); `relates` grep fallback label; `refs` collision flag from a two-file fixture; `find`
  answers from harvest and says so; `map` skips `index.*` with `index: none` and prints it; breadth
  guard; `search` entries written.
- Startup/latency: `map --mode prompt` on this repository ≤ 1.5 s wall with `index: none` (10 §1:
  shortlist ×2 at 0.3–1 s + harvest ~50 ms); report the measured time and the per-layer `ms` the
  ledger recorded.
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

## Done when

Deliverables 1–6 exist with tests; `verify` is green; the offline recall numbers are reported with
decision 5-I stated; the impact and reuse generators produce cases (count reported, names not); the
measurements README carries the dated note.
