# Navigator agent: design (draft for approval)

Branch `navigator-agent` (from `new_tuning`). No code changed. No existing branch is named navigator; the old work is on `agent-as-search` (tip 662a19e6 "record degradation. dead end?", 9 ahead / 20 behind `new_tuning`, 77 files, +2434/-477).

## 1. Reuse, and what the old navigator did wrong
Reuse: `src/modules/search/harvest.ts` `harvest()` (exports/declarations with line numbers, language-agnostic via `DECLARATION_PATTERNS`), `map.ts` (rarity-weighted terms, `shortlist`), `src/modules/context/context.ts` (`parseBundle`, `writeContext`, size limits), `agents/scout.md` recipe (CLI-first, ~8 calls), `agents/navigator.md` + `src/modules/search/navigator.ts` on `agent-as-search` (locate prompt: verify each file, one hop, Reuse lines), `archive/evals/nav/score.mjs` (recall/precision vs `truth.json`).
Old failures (all in `eval-replay/evals/optimization-status.md` and memory `navigator-plan`): inserted into the route itself, so a confident map skipped it and fenced the model (plan-reuse failure); always-on version made the learn step's status the final message and doubled investigate cost; map-seeding from keywords gave 0 recall twice; record step cost $0.059 vs $0.026 for no recall gain (dRecall -0.005, `archive/evals/nav/learn-real/phase4.jsonl`).

## 2. Measured baseline
The "~2 map / ~52 navigator" figures are only stated in `eval-replay/evals/optimization-status.md:29`; no per-run source for them found. What I measured from `archive/evals/nav/` (real set, local, NDA):
- Map candidate list (`n1/candidates-after.json`, 20 cases): prompt-mode mean 29.0, min 6, max 44 paths. Does not reproduce "~2" (that may be the span-level scope, not measured here).
- Files named by the model (`learn-real/phase2.jsonl`, 24 runs/arm): control 11.9 (recall 0.56, precision 0.73), with notes 13.5 (0.62 / 0.78); max 41, min 4. Mean truth size 19.75. phase3 (36 runs): 10.7 named, recall 0.52; phase4 (54 runs): 10.9, recall 0.47.
- No run with a mean near 52 found: not found.

## 3. Proposal (revised 2026-10-17 after user decisions)
Scope: the navigator is evaluated as a standalone agent against bare only. No route integration, no calls from investigate/plan for now.
a. Home: standalone `agents/navigator.md` subagent plus CLI commands (`ambicode.mjs navigate ...`). Rejected: route step (skip/fence failure on `agent-as-search`).
b. File `.ambicode/navigator/features.md`, separate from `context/`. Feature-oriented, one entry per feature (not a flat term-to-path list). Format line:
`## <feature> | terms: <aliases a prompt may use> | files: <path[,path]> | deps: <modules/services the files import across the boundary> | models: <entities>`
Example from the motivating case ("fix modal for location for user migration" names no feature, so grep misses):
`## user management | terms: migration, location modal | files: <modal component, user management service> | deps: core location service; management user service | models: user, location, organization`
Budget 2500 tokens (user decision 2026-10-17, was 2000; tokens estimated as chars/4, `tokensOf`), at most 30 entries of at most 80 tokens each (about 320 bytes; 30 x 80 = 2400 fits). Reasoning: an entry carries four fields instead of one path, so about 40 lines of 1500 tokens would hold fewer features; 30 features covers the feature count of the 20-case projects with room; SWE Context Bench shows irrelevant memory hurts, so no larger.
c. Step 1: prompt words matched against `terms` first; on a miss, candidate terms come from `git ls-files` stems and `harvest` names ranked by the `map.ts` rarity formula. No ecosystem tables.
d. Steps 2-3: CLI prints exports/imports/signatures via `harvest` (6 KiB cap). One hop only; imports leaving the files' boundary are listed and only their exports checked. Keep a file if it hits the prompt/feature terms or is a direct dep whose exported name kept files import. The model uses Read/Grep on top.
e. Step 4 (tested, not optional): when the verified file list differs from what the feature entry predicted, the agent returns an entry patch. Code merges by feature name (union terms, replace files/deps/models with verified ones), drops paths not in `git ls-files`, caps at 30 entries, evicts least recently matched.
f. Measure: recall/precision vs `truth.json` (`archive/evals/nav/score.mjs`), standalone vs bare only, plus returned-file count. Step 4 test: time-ordered run over the 20 local real cases; second case in a feature must show the entry matched and recall not lower than without the file. Fixtures derived from the 20 NDA nav cases stay local (`../ambicode-evals-assets`), never committed; synthetic `investigate-files`/`investigate-trace` are the committed bench.
Deferred: `harvest`'s `DECLARATION_PATTERNS` ecosystem dependency stays; revisit only if it fails on a bench case.

## 4. Open questions
None open; user decisions 1-4 applied. Prior question on keeping step 4 is settled: kept and tested.
