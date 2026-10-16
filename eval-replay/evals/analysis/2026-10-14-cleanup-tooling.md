# Cleanup audit: eval and build tooling (2026-10-14)

Read-only. Scope: `git diff --stat 5d55260 -- evals/scripts tools fixtures package.json .github`, `evals/README.md`, `docs/`. Grader wording and case content not judged. Nothing was built or run except one-off read-only node snippets over existing traces.

## CONFIRMED

### C1. `breakdown.mjs` (264 lines) + test (107) is not wired anywhere
- Not in `package.json` scripts, not in `evals/README.md`, not imported by `run.mjs`/`track.mjs`. Only importer: `breakdown.test.mjs:3`.
- It is used by hand: `eval-replay/evals/analysis/2026-10-12-phase0-accounting.md:3` and `2026-10-14-grader-audit.md:120` cite it.
- Recommendation: decide, do not leave it half-way. Either wire it (`"evals:breakdown"` script + 3 README lines, +4 lines) or delete both files (-371). Merge option below removes ~60 lines of its duplicated parsing.

### C2. Duplicated trace parsing (four JSON-lines parsers, three context formulas, two `mean`)
- JSONL tolerant parser: `metrics.mjs:11-17`, `context.mjs:16-22`, `chain.mjs:34-40`, `breakdown.mjs:16-24` (`events`).
- Main-session context = input + cache_creation + cache_read: `context.mjs:27`, `chain.mjs:75`, `breakdown.mjs:28` (`inputOf`).
- `mean`: `track.mjs:6`, `breakdown.mjs` (~line 186). `seconds` from `result.duration_ms`: `context.mjs:30` (`session`) and `breakdown.mjs:144` (`seconds`), same number.
- Recommendation: merge. One `evals/scripts/trace.mjs` exporting `events(text)`, `contextOf(usage)`, `mean`; the four files import it. About -35 lines net, and one place to change when the trace format moves.

### C3. Two meanings of `costUsd`, neither is "the session"
- Measured on the 12 bare runs in `evals/cases/results/bare.json` against each run's own trace `result.total_cost_usd`: harness `costUsd` minus trace total equals `judgeCostUsd` exactly in 12/12 (sum 0.0086 USD). So `costUsd` in `history.jsonl`/`history.md` ("plugin $", "bare $") = session + subagents + Haiku judge votes. The plugin arm has more `llm` graders than bare (shared only), so its figure carries more judge cost. Size: about 0.0007 USD per case, under 1 %, but it is in the lift column's cost neighbour.
- `breakdown.mjs:145` `costUsd` = trace `total_cost_usd` (no judge). Same field name, different number.
- The uncommitted `track.mjs` change (dropped `+ judgeCostUsd`) is correct: the old code double counted. What is left unlabelled is that judge cost is inside.
- Recommendation: fix. Have `contextOf` return the trace's `total_cost_usd` as `sessionCostUsd` and track that (or subtract `judgeCostUsd`); add one line to `history.md` legend. +3 lines.

### C4. `seconds` shown with the wrong label in the chain header
- `evals/chains/plugin-longest.md:3` header says `16s` (`run.durationSeconds`: includes scaffold and graders, `chain.mjs:134`); the same file's `end:` line (`:13`) says `9s` (trace `duration_ms`, `chain.mjs:103`). Same run, two durations, one unlabelled.
- Also `longestRun` picks by harness `turns` (`chain.mjs:116`), which `track.mjs` legend says is inflated by parallel tool results and which `history.md` therefore stopped showing. Pick by `context.calls` instead.
- Recommendation: fix. Header should print `session` seconds from `run.context.session`; key on `run.context?.calls`. -0 / +2 lines.

### C5. `fixtures/definitions.mjs`: 14 of 25 fixtures are used by nothing
Cross-check: `evals/scripts/cases.mjs` `fixture:` values, `evals/cases|bare/*/scaffold.sh`, `src/**` (`materialized('...')` callers), `tools/`, `docs/`. Used: ts-feature-boundary, ts-app-medium, ts-app-medium-refund-bug, ts-app-medium-money-change, eval-page-bug, ts-off-by-one, py-clean-docstring, ts-source-regression, eval-rules-contributing (9).
- Referenced only by `fixtures/materialize.test.mjs`: ts-staged-unstaged (26 lines), ts-branch-divergence (24).
- Referenced nowhere: ts-source-regression-feature 13, ts-rename-delete 23, ts-no-tests 15, monorepo-mixed 25, unusual-filenames 27, py-none-guard 23, py-source-regression 21, ts-requirement-mismatch 21, py-requirement-mismatch 15, ts-duplication 22, py-complexity 21, ts-locale-decoys 41, polyglot-spellings 22, py-no-runner 15 (about -304 lines, plus the lockfile and `PYPROJECT` bits if they become unused).
- Recommendation: delete the 14 (-304); point the `--ambicode-init` test at ts-off-by-one and drop the 2 test-only ones (-50, test edit +2). Marked confirmed for "unused"; whether the user wants them as a bench for future cases is the user's call.

### C6. `materialize.mjs` flags and fields nobody uses
- `--all <dir>` (`materialize.mjs:240-250`, 11 lines): no caller in package.json, tools, src, docs, workflows. Delete.
- `--list` is only the no-argument default; nobody runs it. It prints `summary`/`covers` of each fixture, the only readers of those two fields (about 50 lines of data across 25 entries, stale for the ts-app-medium trio). Delete both with `--list`, or keep `--list` and drop `covers`.
- `--install`, `--ambicode-init`, `--context`, `intoCwd` are all used by `cases.mjs`.

### C7. Schema version and pack list are hand-copied three times
- `fixtures/materialize.mjs:101` (`schemaVersion: 5`, pack list at ~:117), `tools/smoke-candidate.mjs:12` and `tools/hook-artifact.test.mjs:45` (plus the pack list at `smoke-candidate.mjs:72`). `SUPPORTED_SCHEMA_VERSION = 5` lives in `src/types/modules/config.ts:83`; nothing imports it. This diff already had to bump all three.
- Stale label: `tools/smoke-candidate.mjs:74,76` still say "v4 config" while sending v5.
- Recommendation: fix the strings now (0 lines); sharing the config builder is optional (-30 lines, crosses tools/fixtures boundary, so SUSPECTED worth it).

### C8. Docs out of date
- `evals/README.md` column table (lines ~93-101): says "four numbers per case" and lists 6 rows including `turns`; `history.md` now has no `turns` column and adds `plugin $`, `bare $`, `session s`, `model calls/tools`. Runs section text lists "turns"; the table prints `calls, tools`.
- README tree (lines ~8-22) lacks `breakdown.mjs`; `context.mjs` is described as reading context size only, it now also returns session/api seconds. `seconds` vs `sessionSeconds` vs `apiSeconds` and the judge/subagent content of cost are not explained.
- README "How a case works" step 1 omits `--context` (writes `fixtures/contexts/<fixture>.md` as the scout stand-in; used by 8 of 17 cases).
- `docs/release-checklist.md:124` says "The suite now has 18 cases (12 Phase-1 plus 6 P2.4)"; `cases.mjs` has 17. `docs/compatibility.md:334` says "No arm has been run in this environment", while `history.jsonl` has 233 rows.
- Recommendation: fix, about +10 / -6 lines. Not in any `docs/*` section about installation or review: those are consistent with the code on the points checked.

## SUSPECTED (not measured)

- `breakdown.mjs` `inputTokens` (`:134`) sums input over every call (cumulative), unlike `context.peak`; the name invites reading it as context size. Rename `inputTokensTotal`.
- `breakdown.mjs` `subagentCostUsd` uses a 4 USD/Mtok cache-write price that its own comment says overstates subagent 5-minute writes; treat as approximate (comment at `:10`, not in output).
- Unexported-but-needless exports in `breakdown.mjs` (`ledgerTextOf`, `latestByCase`, `breakdownOfFile`) are used only internally; trivial.
- `materialize.test.mjs` context test needs a built `scripts/ambicode.mjs`, so a bare `node --test fixtures/materialize.test.mjs` fails before `npm run build`; documented only in the file header of `materialize.mjs`.

## Suggested order
1. C3, C4, C7 string fixes (smallest, remove wrong numbers).
2. C8 doc fixes.
3. C5 + C6 deletions (about -365 lines).
4. C1/C2 decision: wire or delete breakdown; if kept, merge parsers (-35).
