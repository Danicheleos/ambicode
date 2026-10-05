# CHANGELOG — migration plan v6 → v7

v6 was reviewed in [review-migration-plan-v6.md](../review-migration-plan-v6.md) and approved by the
user as APPROVE WITH EDITS. v7 changes neither contracts nor decisions. Unchanged copies of v6:
- 01-contracts, 02-scenarios, 03-review-resolution, 04-release-acceptance;
- step 00;
- input-sha256.txt.

v7 changes how steps are specified, built and reviewed.

## Why

Step 01 was run under v6. The record of that run is in
`plan/migration-v6-reports/step-01/implementation.md`. Three problems showed up:

1. **The review did not converge.** There were four revisions, each answering a fresh set of
   blockers. The blockers were adversarial shell constructs the brief never asked for: `cd` inside
   loops, `case` inside `$( )`, quoted `${X#'…'}` patterns, `env -C` last-option-wins. The brief
   said "never deny a legitimate action" and "parse structurally", but it set no threat model, no
   non-goals and no stopping point. The review prompt asked for "every invariant", with no class
   for out-of-scope findings and no limit on rounds.
2. **The code grew without limit.** The step produced +3,127 lines: an 858-line parser, 1,085 lines
   of guard tests and 553 lines of parser tests. The dispatch prompt pushed in the same direction.
   It said "split large files, consolidate, remove dead branches", which led to a regrouping of
   `src/hook/` that nobody had asked for.
3. **The briefs were too dense to act on.** They were compressed prose that pointed at v6
   sections. Two careful readers could implement different things, so the implementer and the
   reviewer disagreed about what had been required. Conflicts inside the brief were left to the
   agent. For example, "node:fs only" contradicted the tmpdir fallback.

## Changes

| # | Change | Where |
|---|---|---|
| V1 | Fixed brief structure, applied from step 02 on: Goal, Starting point, Files with budgets, Contract, numbered Rules, Decided readings, Non-goals, Tests named by rule, Done when, Hand-off, and a Coverage table of the v6 brief | [05-working-rules](05-working-rules.md) §1 |
| V2 | Implementer rules: build only what the rules require; touch only listed files; soft budgets; no adversarial test expansion; defects outside the rules go to Follow-ups; report the final state only (≤ 150 lines) | 05 §2 |
| V3 | Review rules: four classes (BLOCKER, SCOPE, PLAN, NOTE). Only BLOCKER and SCOPE block, and both need a rule id and a reproduction. PLAN items go to the user, not the implementer. At most two rounds; round 2 checks only the fixes | 05 §3; review template in 00-README |
| V4 | A new, shorter report template for steps 02–10 | 05 §4 |
| V5 | Step 02 rewritten as a brief. Every v6 requirement is mapped in its Coverage table. Seven decided readings resolve the gaps the v6 text left to the agent (D1–D7) | [step-02-evidence](step-02-evidence.md) |
| V6 | The `dispatch/` packet is removed. The brief is the assignment. The implement, review and fix templates are in 00-README; the boundaries are in 05 §2.8 | 00-README |
| V7 | The validator checks the section order and numbered rules of the rewritten briefs, and no longer checks a dispatch packet | validate-plan.mjs |
| V8 | Two links to files removed by commit 10cf672 ("drop old plans") are now plain text: the v5 hand-off in 00-README and `review-migration-plan.md` in 03-review-resolution. The text is otherwise unchanged | 00-README, 03 |
| V9 | The validator lists input-manifest drift instead of failing on it. 24 of 51 inputs changed after the hand-off (the eval-script refactor, the removed v5 plan, `v6/33-measurement.md`, `package.json`). The manifest itself is kept as provenance | validate-plan.mjs |

## Decided readings in step 02 (implementation detail, no contract change)

- D1 Routeless writer ids come from `IdSource.writerId()`.
- D2 The CLI passes `session: null` until step 03's 0-S transport exists, so routed writes refuse
  with `session-unbound`.
- D3 The worker definition id is serialized as the field `worker`.
- D4 Schemas for later modules stay minimal and loose until their owning step.
- D5 `RouteView.skill` is added as an explicit design field.
- D6 Promotion does not change bytes, and the draft label never claims acceptance.
- D7 The lock-steal race after a crashed holder is accepted.

Each one implements a sentence of 01-contracts or v6/13. None replaces one.

## Steps 03–10

| # | Change | Where |
|---|---|---|
| V10 | Steps 03–10 rewritten to the 05 §1 structure. Each brief ends with a Coverage table that maps every v6 requirement of that step. Paid and probe gates, thresholds, decisions 0-S/0-V/A/5-I/6-P/7-T/8-F/0-R/P17/P21 and the pinned lines are kept word for word | step-03 … step-10 |
| V11 | Step 03 orders its work in milestones (03-W), each ending with a green `npm run verify`, so it can be built and reviewed in parts. Its scope is unchanged | step-03 |
| V12 | Step 01's actual layout (`src/hook/{guard,shell,events,session}/`) and its open tmpdir-fallback decision are written into steps 03–09. The fallback is a branch, not a decision (03-S8) | steps 03–09 |
| V13 | All nine rewritten briefs are cross-checked against step 02 and step 03 for names, paths, field shapes and single ownership | steps 02–10 |
| V15 | Step 01 rewritten as a brief although it is already implemented: its deviations become decided readings, adversarial shell semantics become non-goals, code built beyond the rules is accepted but frozen, and its review restarts at round 1 with the two-round limit. The tmpdir fallback stays a branch (01-T1) | step-01 |
| V14 | The validator checks the section order and numbered rules of all ten briefs (01–10) | validate-plan.mjs |

## Independent review of v7 (2026-10-05), applied in place

All nine findings were checked against the text and are valid. Each fix restores a 01-contracts or
v6 requirement that the briefs had broken or left without a mechanism; no contract changes.

| # | Finding | Fix | Where |
|---|---|---|---|
| V16 | The engine holds the ledger lock for a whole advance (03-O6), but the `plan-check` and `promote` handlers call `saveNote`/`promotePlan`, which take the lock again; a nested acquisition throws (02-L5) | `NoteDeps.ledger?`: given, the writers use the held `LockedLedger` and take no lock; CLI wrappers acquire once | step 02 Contract, 02-L7, tests; 03-O6; 06-P10 |
| V17 | The plan route copied from v6/32 §3 has no `acting: [Accept]`, so an untrusted `--answer plan-accept=Accept` at start became a `via: prompt` acceptance that promotes (01-contracts §5 says "Mark Accept") | the route YAML declares `acting: [Accept]`; S1 tested on it | step 06 Contract, 06-R1, tests |
| V18 | The v6/32 §3 block is not valid YAML (`MISSING_CHAR` at `produces: [policy{before-report}]`; the comma in `save(plan-draft, from: …)` splits the item), yet 06-R1 required it verbatim | step 06 carries a quoted, parser-checked route; 03-R1 states the quoting rule for every route file | step 06 Contract, 06-R1; 03-R1 |
| V19 | Completion and exit clear the pointer, and Stop allowed when no route was active, so the exit and saved-note checks of 03-K1 could never run | exit/completion write `ended-route`; Stop checks that route once, then removes it; the guard still sees no active route | 03 Contract (`ActiveRoutePointer`), 03-S7, 03-K1, 03-H7, tests |
| V20 | The review route's `review-run` had no `needs: [review]`, so the code step evaluated before the model ran the reviewer | `needs: [review]` as in task; 03-F4: a skipped step's `needs` are not checked | step 08 YAML, 08-R5, D13; 03-F4 |
| V21 | 07-B4 refused `baseline-missing` for any routed `review --task`, which made the command printed by the review route always fail | baseline scoping and its refusal apply to a task route only; the review route reviews its target and checks consent of `estimate` | 07-B4; 08-R8 |
| V22 | The review target (`--branch`, `--base`, `--mr`) had no way into the route | `StartInput.target`/`RouteArgs.target`, validated at start, hashed only when present | step 08 Starting point, Files, Contract, 08-R2, D12, tests |
| V23 | `narrow` read its answer from `estimate-step`'s window, which starts after the revise, so the answer was outside it | the re-entry records `revise {args: {narrow}}`; handlers receive the window-opening revise as `HandlerInput.revise` (03-F12, also used by investigate's `--term`) | 03 Contract, 03-F12, revise fields; 08 YAML, 08-E6, tests |
| V24 | `init-apply` had `acting` options outside its `options`, and `when` named an undeclared option | four declared options; each print offers three through the seam, recorded in `options`; an answer outside the offered set is `option-not-offered` | 09-G1, Files (`gates.ts`), tests; 03-G14, 03-G5 |

## Decision A fallback (2026-10-05)

| # | Change | Where |
|---|---|---|
| V25 | Run 4 failed 03-A5 on cost (1.44x; recall within band). By the user's decisions the investigate answer becomes the note (Stop saves it; no `report-step`/`write`, ceremony 0), the start context shrinks (no args echo, compact gated map, session contract), the map's terms drop request boilerplate and URLs, and the localize harness harvests session transcripts and reports built-in plugins. Dispatched as its own brief per 03-A6; v6 files unchanged | step-03b, validate-plan.mjs |
| V26 | Run 5 (10 × 1) failed 03-A5: cost 1.22x, recall 0.632 (band 0.655). One run lost its whole answer to a correct Stop block answered with a correction delta; others named only the edited core. Added 03b-N11 (block asks the user to keep or rewrite; headless rewrites whole), 03b-N12 (after a block, a path-less stop saves the blocked answer with its problems), 03b-N13 (complete files answer). Gate: `ledgersOf` accepts several trace directories. `$ARGUMENTS` removal dropped (Claude Code appends arguments anyway) | step-03b |
| V27 | Run 6 (10 × 1): recall 0.706 (pass), cost 1.20x (fail), precision 0.568 and falling. Two cases hold the whole overrun: a broad completeness line listed sibling files and planned specs; a ticket with a missing premise kept the model searching. 03b-N13 reworded (edited files plus their existing tests; no explanatory, optional or similar files), 03b-N14 added (missing premise ends the search), 03b-H4 added (keep sandboxes until the final harvest, then remove only the named ones) | step-03b |
| V28 | Run 7 (10 × 3): cost 1.07x (pass), precision 0.646, recall 0.594 (fail): the must-edit rule dropped the feature's own type, schema, DTO, mock and route files as conditional. 03b-N13 reworded to the whole request as written, with a layer list and named assumptions; 03b-N14 and the cost rules unchanged. Sweep counter counts kept (sealed) sandboxes as ended | step-03b |
| V29 | Run 8 (10 × 2): recall 0.742, cost 1.10x, precision 0.552 (gate pass). Map defects drove the spread: ticket-id parts not terms, pass 2 harvested a sibling feature, the 8-lead cap dropped the feature's layer files. 03b-M8 (ticket parts, abbreviations, short path forms), 03b-M9 (harvest from path-placed files), 03b-M10 (`Same feature` line), 03b-M11 (local git exclude for task files, grep layer exclusions); offline `map-recall.mjs`: true files in the maps 13/53 → 24/53. Read step unchanged | step-03b |
| V30 | Run 9 (10 × 3): recall 0.782, cost 1.11x, precision 0.636 (gate pass); case 10 carried the cost (15–25 tool turns vs ≤ 10 elsewhere). Round 6: 03b-H5 (`map-recall --save/--expect`), 03b-H6 (`layer-audit.mjs`), 03b-H7 (sectioned count); 03b-B1…B3 (route `budget.toolTurns`; the `guard.mjs` counter exists but is not registered: the notice fired once per run in case 10 and did not stop the search); 03b-M12 (lead lines), 03b-M13 (depth-free catalogs, spelled phrases, raw request), 03b-M14 (template pairing), 03b-M15 (broad directories), 03b-M16 (feature-line kinds), 03b-M17 (`gitCommonDir`); non-goal re-ranking bound moved to M17. Offline map: true 24/53 → 25/53, listed 79 → 70. Run 10 (10 × 3): recall 0.735, cost 1.05x, precision 0.559 (gate pass); with 03b-H8 (scorer matches a unique path suffix, as its comment stated) recall 0.768, precision 0.594, runs 8 and 9 unchanged | step-03b |
| V31 | Language-agnostic map, checked on a second (Python) bench of 5 offline cases from merged commits: 03b-M18 (feature line by name across layers, only in a repository split by layer, measured from its file names: 0.78 there, 0.41 and 0.43 on the TS repos), 03b-M19 (sequence-named directories rank last, no harvest, no feature line), 03b-M20 (route-term segments match file names), 03b-H9 (`map-recall --cases`). Python true files in the map 6/34 → 17/34 (feature files ordered by the request's other words, then files about the word); TS 25/53 unchanged, listed 70, no true file lost under `--expect` | step-03b |
| V32 | New brief step-03c (search profile): search stops reading `ecosystem`; `ambicode init` measures sources, companion extensions, text catalogs, feature kinds and the export rule per project and writes them as `profile` (printed, editable, kept on re-init, `--refresh-profile` replaces); replaces 03b-M13/M14/M16's TS facts. Unreviewed | step-03c |
| V33 | Step 03c implemented (offline): `profile.ts`, `profile` on each project, `init --refresh-profile`, search reads catalogs, companions, feature kinds, the export rule and shortlist sources from it. Bench profiles reproduce companions, catalogs and the export rule; feature kinds measured from 50+ commits, else a data-only name fallback (user decision; deviation from 03c-P5 as reviewed). TS map 25/53 and Python 17/34 unchanged, no true file lost | step-03c |
| V34 | Eval tree regrouped under `evals/` (user): `evals/cases/` (suites `evals-core`, `evals-triggers`, `evals-archived`, `scripts`, `python`), `evals/benchmarks/` (data, was `benchmarks/`), `evals/outputs/` (raw output: `core`, `triggers`, `archived`; was each suite's `results/`), `evals/reports/` (was `gym/decA/`; gitignored). Briefs and reports written earlier keep the old paths: read `evals/evals-core/results/…` as `evals/outputs/core/…`, `evals/scripts` as `evals/cases/scripts`, `benchmarks/` as `evals/benchmarks/`, `gym/decA/` as `evals/reports/` (Python cases: `evals/cases/python`) | all |

## Pending

- Core acceptance (04-release-acceptance) keeps its v6 text; it is a checklist, not a build step.
- User decisions raised while writing the briefs are listed in the final hand-over message of the
  v7 session and must be answered before the step that contains them is dispatched.
