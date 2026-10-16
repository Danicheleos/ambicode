# Plan: drift — ruler first, then one answer-side lever (before stage 3)

Revised 2026-10-09 after the plan review (P1 ×4, P2 ×2). Phase A is done, including the two review gaps it owned. Phase B is rewritten.

## Context
`eval-replay/evals/24-25-26-27-next/drift-2026-10-09.md` audited 88 saved attempts. The engine serves identical inputs (prompt, contract, step, map) within each case. Drift starts at the model's first tool calls, and the biggest quality losses are at answer time:
- **Evidence seen but left out of the change set.** FE6404 sees 15 locale files and omits them; FE6292 is similar.
- **Precision drops in BE6140.** The review showed most of this was the scorer, not the model. e-OXdoVc lists ReportHelper and the router under "Files that need no change", and the old scorer counted them as changes. Fixed in A6.

User decisions (2026-10-09):
- **Target:** per case over 3 runs, recall and F1 ≥ 0.9× the case's best run, and agent cost ≤ 1.25× its cheapest run. Counts are reported, not gated.
- **Scope:** fix the ruler, then try an evidence-to-answer receipt. Discovery families and the shortlist default go to stage 3a.

## Phase A — Ruler (done 2026-10-09, free)
1. **Agent cost.** Harness `costUsd` = the trace's `total_cost_usd` + `judgeCostUsd` in 130 of 130 recorded runs. Gate and report use the trace's cost, else harness cost minus judging. A disagreement is a caveat; a run with neither is a gap.
2. **Drift gate.** `ACCEPTANCE.drift`, `driftOf` in `eval-gate.mjs`. Per case: recall and F1 ≥ 0.9× best, agent cost ≤ 1.25× cheapest. The check needs ≥ 80% of cases in band. Blocked, open or unverified runs put their case out of band; fewer than 3 runs or a missing ledger is a gap. The report adds an `unstable-case` finding.
3. **Outcome per run** from the ledger exit: `completed`, `unverified`, `blocked(<code>)`, `open`, `unrouted`, `unknown`. Replayed reviews were already a gap.
4. **Reader receipts.** Taken from ledger `search` entries with `command: 'read'`. The report compares them with the command-text count on the same runs, and the `helper-uncounted` caveat flags any run where the two differ.
5. **Re-scored saved runs.**

   | Run | Agent cost × bare | Cases in drift band |
   |---|---|---|
   | 26_1600 | 1.1956 | 0 / 6 |
   | 05_0035 | 1.1446 | 6 / 20 |
   | 15_1241 | 1.1170 | 3 / 14 |
   | 16_1304 | 1.2713 | 0 / 5 |

   Bare 30_2248 under the same band: 1 / 6 on the six, 4 / 20 on core.
6. **Change decisions in `## Files`** (review P1-1). `changeLines` in `bench-score.mjs` separates what the answer changes from what it excludes:
   - A heading or lead-in that says "no change", "for reference", "out of scope", "left out", "Evidence" and similar excludes its group.
   - A bullet or table row that says so excludes itself; nested lines follow their bullet.
   - A hedged line ("likely unchanged", "probably", "only if") stays a change.
   - A path that is proposed anywhere stays a change.

   Rows carry `excluded` and `excludedTrue` counts. Re-scoring every saved answer (bare 30_2248 and walks 02–04; plugin 05, 06, 07, 15, 16, 26) changes 4 of 316:

   | Run | Case | Effect |
   |---|---|---|
   | 15_1241 | be-vs-6140 r2 | P 0.43 → 0.75 |
   | 07_1933 | be-vs-4606 r2 | P 0.85 → 1.00 |
   | 07_1933 | fe-vs-6141 r0 | P 0.85 → 0.92 |
   | 06_1853 | be-vs-4606 r0 | R 1.00 → 0.92: it explicitly lists a true file as "considered and left out … unchanged" |

   No bare answer changes, so the baseline lock's means stand. Drift shares and gate recall are unchanged.
7. **Frozen per-case reference** (review P1-4).
   - `evals:bench reference <plugin eval.json> [--cases]` pins source files (sha256, truth hash), never numbers. `referenceFloors` rescores the pinned runs with the current scorer, so a scorer fix moves reference and run together.
   - New gate check `case floors`: each pinned case's mean recall and F1 ≥ reference mean − the run's noise band. It is reported apart from drift: drift is consistency, floors are quality kept. Three steady weak runs pass drift and fail floors.
   - Pinned now: 05_0035 for 20 cases, then 26_1600 for the six (newer build).
   - Checks against it:
     - 26_1600: 6 / 6 pass.
     - 16_1304: 5 / 5 pass.
     - 15_1241: 10 / 15. It is the reverted notation build; fe-vs-438 0.57 vs 0.81.
     - 05_0035: 19 / 20. fe-vs-3571 is now pinned to 26_1600.
   - The aggregate band is narrower than per-case noise, so a single case can fail on noise. The first paid check will show how often that happens.

## Phase B — Decide the answer lever from saved data (free)

### B1. Per-file states (replaces the 30% rule on `trueFilesRead`)
The review measured 692 missing truth paths in runs 15/16. Only 34 have inferred read operands, but 256 appear in tool output, so `trueFilesRead` is not a file set. Build per-file states for every truth path in every saved plugin run (15, 16, 26_1600, 05_0035) and the bare lock:

| State | Meaning |
|---|---|
| `future` | in `truth.created`: not at base, so it can only be proposed |
| `unknown` | the run has no complete trace, or the path never appears in it |
| `discovered` | the path appears in a tool result (grep/ls/glob output, map leads, reader receipt names) |
| `served` | its content came back: a Read result, a reader receipt span, or a `cat`/`sed` result whose output carries its lines |
| `proposed` | in the answer's change set (A6) |
| `excluded` | the answer named it and decided against it (A6) |

States combine: a file can be `served` and then `excluded`. Report per run and pooled. The lever's question is: how many missing truth files reached `served` or `discovered`, then ended neither `proposed` nor `excluded`, or ended `excluded`?

- **Decision rule.** Build B2 only if `served ∧ ¬proposed` covers ≥ 25% of missing existing-file truth across the cohort. That share is the receipt's reachable ceiling. Report `discovered ∧ ¬served` separately: that is a read-depth problem, not an answer problem.
- `future` files are counted apart and never in that share.

Code: a `fileStates(row, calls, receipts)` in `run-report.mjs` beside `toolFiles`, reusing `readOperands`, `callChain` results and the ledger `search` names. Tests: one fixture per state, including a grep hit that is `discovered` but not `served`.

**Result (2026-10-09).** `fileStates` and `missingByExposure` in `run-report.mjs`; report section 7 shows the pooled split. Cohort: plugin 05_0035, 15_1241, 16_1304, 26_1600 (136 runs) and bare 30_2248 (60 runs), all traced. Raw: `raw/drift/b1-file-states.{txt,json}`.

| Missing existing truth | plugin | bare |
|---|---|---|
| missing / existing | 1583 / 2857 | 765 / 1173 |
| `served`, not proposed | 51 (3.2%) | 12 (1.6%) |
| of those `excluded` | 0 | 0 |
| `discovered` only | 621 (39.2%) | 408 (53.3%) |
| `unseen` | 911 (57.5%) | 345 (45.1%) |
| `unknown` | 0 | 0 |
| created, not proposed | 188 / 311 | 91 / 153 |

On the omission cases, served and not proposed: fe-vs-6404 4 / 96, fe-vs-6292 2 / 157, fe-vs-438 0 / 26. FE6404's locale files are `discovered` (a `grep -l` listing), never served.

- **Decision: B2 is not built.** 3.2% is far under 25%; a receipt over served files can recover at most that.
- `discovered` is an upper bound: one listing marks every path in it. Even so, the loss is read depth (39%) and discovery (58%), which is stage 3a.
- `unseen` is split from `unknown` here: `unknown` is kept for a run with no trace (none in the cohort).
- Cross-check with the review: 15/16 missing truth incl. created = 605 + 87 = 692, the review's number.

**Family reach (2026-10-09, after the user kept the drift target absolute).** Counted by directory instead of by file (raw: `raw/drift/b1-family-reach.txt`):

| Missing existing truth (plugin, 1583) | files |
|---|---|
| in a directory where the run opened a file | 322 (20.3%) |
| in a directory where the run opened or listed a file | 952 (60.1%) |
| the file itself in the engine's map | 45 (2.8%) |

Run-to-run agreement of the proposed sets (mean pairwise Jaccard per case): plugin 0.648, bare 0.677. Existing recall per run 0.594; hit by every run 0.525; by any run 0.681.

**B2 offline replay (2026-10-09).** A truth-free receipt over 136 plugin and 60 bare runs: the engine's inputs only (base tree from the case's commit, tool calls and results, reader receipts, the answer's change decisions). Bounds: ≤ 5 directories, ≤ 600 B. A directory the Files section names is resolved. Raw: `raw/drift/b2-replay.{txt,json}`, script in the session scratchpad.

| Variant (plugin) | fires | controls (≤ 9 / 18) | missing truth in shown dirs | undecided files shown: true / non-truth |
|---|---|---|---|---|
| dir holds a proposed file | 126 / 136 | 15 / 18 | 291 (18.4%) | 245 / 1265 |
| dir holds an opened file | 136 / 136 | 18 / 18 | 244 (15.4%) | 214 / 1762 |
| proposed file's basename-stem siblings | 87 / 136 | 5 / 18 | 108 (6.8%) | 63 / 215 |
| stem, plus ≥ 2 same-extension siblings | 117 / 136 | 14 / 18 | 286 (18.1%) | 244 / 1192 |

- **Decision: B2 is not built.** Every variant that reaches the omission cases fires on the controls; the one that stays quiet reaches 6.8% of the loss and shows 3.4 non-truth files per true one.
- The receipt can only act on what the run saw. 58% of the loss is files never seen, and seen siblings are 1 true in 5. An answer-side check cannot make the result stable; the input the model works from has to be.

### B2. Answer receipt — not built (B1 file rule and the family replay both fail)
Engine-side, language-agnostic, at the investigate answer's Stop check (`src/harness/engine/stop.ts`, the `citationsOnly` answer path).
- **Input is change decisions, not citations.** Parse the answer's `## Files` with the same `changeLines` contract, ported to `src/` with one shared fixture set, so scorer and engine cannot disagree. A citation elsewhere in the answer does not count as coverage. FE6404's weak run cites upload-complete evidence and still leaves the component out.
- **Families, not just bodies.** Group served and discovered paths by directory and by shared basename stem (`*.component.{ts,html,scss}`, `en.json` with its locale siblings). A family counts as unresolved when it holds ≥ 2 served or discovered files, and none of them is proposed or excluded with a reason line.
- **Receipt text:** at most 5 families, each one line (`main/assets/i18n/ — 15 files, 1 served`), capped at 600 B. It asks for one line per family: propose with the requirement it serves, or exclude with the reason. No paths are injected beyond the family names already seen. Truth is never used.
- **Bound and measure.** Block once per route (`limit which: answer-receipt`). The report counts, per run:
  - receipt blocks;
  - model calls, tool calls and bytes after the block;
  - agent cost after the block, from the trace call chain.

  A continuation can search again, so "one call" is not assumed.
- **Offline replay before any paid run.** Run the receipt function over every saved transcript of B1's cohort and count:
  - how often it fires;
  - truth inside flagged families, which is the recall ceiling and not a recall gain;
  - non-truth inside them, which is the precision risk.

  If it fires on more than half of the runs of the cases that did not drop files (be-vs-5973, be-vs-5941), stop and tighten it.
- **Tests:**
  - `src/hook/events/stop-check.test.ts`: an unresolved family blocks once; a second Stop passes; the block does not fire when every family is proposed or excluded with a reason, nor when a citation alone covers a file.
  - A size-cap test.
  - The shared `changeLines` fixtures run in both suites.
- `routes/investigate/read.md` gets no new wording.

## Next: the input side, in stage 3a (2026-10-09)
The drift fix moves into stage 3a (`evals/TRAINING-PLAN.md`, Stage 3): a candidate inventory the engine builds the same way on every run, then a Stop check that the answer decides each listed family. Order: measure the inventory's coverage and noise offline, then replay the check on saved runs, then the paid 3b run with the drift gate and case floors in its acceptance. The paid run below is superseded by 3b.

## Paid (superseded by stage 3b; kept for the record)
Cases (review P2-6), 6 × 3 plugin-only, about $5:

| Role | Cases |
|---|---|
| omission | fe-vs-6404, fe-vs-6292, fe-vs-438 |
| precision | be-vs-6140 |
| negative controls (steady, high recall, receipt should stay silent) | be-vs-5973, be-vs-5941 |

Pin the references for fe-vs-6404, fe-vs-6292, fe-vs-438 and be-vs-6140 before the run. They are 05_0035 now; 15/16 are the reverted notation build and are not pinned.

Pass:
- `case floors` pass.
- Drift in band on more cases than in the pinned reference.
- Recall on the omission cases above their reference mean + band.
- No precision loss beyond the band on be-vs-6140 and on the controls.
- Agent cost per case ≤ 1.1× its reference. Receipt continuation cost is reported per run.

No bare re-run: the lock stays.

## Docs
- `evals/TRAINING-PLAN.md`: drift gate and case floors.
- `evals/README.md`: `case floors`, `evals:bench reference`, change-decision scoring.
- `eval-replay/evals/ROADMAP.md`: Phase A done; B1 next.

## Files
- **Done:** `evals/scripts/src/analysis/{bench-score,run-report,trace-analysis,ledger-metrics,reference-lock}.mjs`, `evals/scripts/src/validation/eval-gate.mjs`, `evals/scripts/src/harness/evals-bench.mjs`, `evals/scripts/src/shared/bench-paths.mjs`, plus tests.
- **B1:** `run-report.mjs`.
- **B2:** `src/harness/engine/stop.ts`, a `changeLines` port under `src/modules/evidence/`, and `src/hook/events/stop-check.test.ts`.

## Verification
- Targeted tests per change: `node --test` on the touched eval test files and `src/hook/events/stop-check.test.ts`; `npm run typecheck`; `npm run build` before any run.
- Full `npm run verify` at hand-off; the 4 codeindex failures that also fail on unmodified HEAD are noted.

## Not in this plan
Discovery families in the map and the shortlist default (stage 3a); the task fixture check command (stage-2 debt); plan anchor schema (stage 10); review replay vs live (stage 6); the read-budget change.
