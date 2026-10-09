# Plan: drift — ruler first, then one answer-side lever (before stage 3)

## Context
`eval-replay/evals/24-25-26-27-next/drift-2026-10-09.md` audited 88 saved attempts. The engine serves identical inputs (prompt, contract, step, map) within each case. Drift starts at the model's first tool calls, and the biggest quality losses are at answer time. Two loss types:
- **Evidence read but left out of the answer.** FE6404 sees 15 locale files and omits them; FE6292 is similar.
- **Read files listed as changes.** BE6140's precision drops from 1.00 to 0.43.

Resources are unstable too: 3/19 cases hold agent cost within the band, 0/19 hold API calls.

The report also found a ruler defect. I verified it on 26_1600: harness `costUsd` already includes judging (e-c9VoUw: trace 0.3044404 + judge 0.017466 = 0.3219064). The gate comment at `eval-gate.mjs` ~line 97 says judging is excluded, which is wrong. Agent-only, 26_1600 is about 1.196× bare (from means), not 1.1845×.

User decisions (2026-10-09):
- **Target:** per case over 3 runs, recall and F1 ≥ 0.9× the case's best run, and agent cost ≤ 1.25× its cheapest run. Counts are reported, not gated.
- **Scope:** fix the ruler, and try an evidence-to-answer receipt. Discovery families and the shortlist default (markup and data excluded, `locate.ts` `shortlistRules`) go to stage 3a.

## Phase A — Ruler (free, no model spend)
1. **Agent cost.**
   - `bench-score.mjs` adds `agentCostUsd = costUsd − (judgeCostUsd ?? 0)` per row. It is cross-checked against the trace's terminal `total_cost_usd` when traced, and a mismatch over 1e-6 is a caveat.
   - `eval-gate.mjs` compares `agentCostUsd` and fixes the comment.
   - `run-report.mjs` shows agent / judge / total columns.
   - Tests: a fixture row with judge cost; the gate ratio excludes it.
2. **Drift ruler** in the existing seam: the `spread`/`unstable` logic in `run-report.mjs` (~292, 417) and the gate.
   - Add `ACCEPTANCE.drift = { qualityFloor: 0.9, costCeiling: 1.25, minShare: 0.8 }` in `eval-gate.mjs`.
   - Per case with ≥ 3 complete runs, it reports whether recall and F1 are within the floor and agent cost within the ceiling. API calls, turns, peak context and wall time get the same ratio, report-only.
   - Gate row `drift`: share of cases in band ≥ 0.8 (5/6 on the six, 16/20 on core).
   - Blocked, absent or partial runs are out of band; they are never counted as stable.
   - Report: a per-case drift table plus an `unstable-case` finding naming the failing metric.
   - Tests: band edges (0.9× exact, 1.25× exact), a blocked run, a case with fewer than 3 runs (gap, not pass).
3. **Outcome columns.** Per run: `completed | blocked(<reason>) | accepted-with-failed-check | replayed-review`, from the exported ledger exit and gate entries. The report and drift ruler use them; a blocked run is never a quality witness.
4. **Helper count from receipts.** `run-report.mjs` line 40 counts helper calls with a command regex, which misses `node "$N" read`. Count engine reader receipts instead: ledger `search` entries with `command: 'read'`, plus served bytes and truncations. Keep the regex count beside it as a cross-check. Test: a `$N` invocation fixture.
5. **Re-score saved runs (free).** Run the new report and gate on 26_1600 and on 15_1241 + 16_1304:
   - the agent-only cost ratio, which updates the §5 Debt cost row;
   - the drift share per run set, the starting value for the drift gate.

## Phase B — Decide the answer lever from saved data (free)
6. **Loss split on the drift cohort** (15/16, 26_1600). Per run, split the missing true files into "read but not named" (`trueFilesRead` vs `namedFiles`, already in report rows) and "never read". Also count named non-truth files that were only read as evidence.
   - **Decision rule:** build step 7 only if "read but not named" is ≥ 30% of the lost true files across the cohort. Otherwise record the result and stop; the remaining loss is discovery, which is stage 3.
7. **Answer receipt** (only if step 6 passes), language-agnostic, at the investigate answer's Stop check (`src/harness/engine/stop.ts`, `problemsOf` and the `citationsOnly` answer path):
   - The engine collects the files the session read: reader receipts, plus host Read and Bash `cat`/`sed` paths from the transcript. It groups those the answer neither lists nor cites by directory family, for example `main/assets/i18n/ (15 files)`.
   - When an unlisted family holds ≥ 2 files, or the answer omits a file it cited earlier, Stop blocks once: "You read these and did not list them: add the ones the change edits, or name why not, in one line each." The block happens at most once, so the cost is bounded to one call.
   - Offline replay on the saved transcripts before any paid run:
     - how often it would fire;
     - the truth files inside the families it flags, which is the upper bound on recall gain;
     - the non-truth files inside them, which is the precision risk.
   - Tests:
     - `stop-check.test.ts`: an unlisted family blocks once, a second Stop passes, and nothing fires when every read file is listed.
     - A replay fixture.
   - `routes/investigate/read.md` gets no new wording; the receipt is engine text.

## Paid (ask before each)
- After A + B: one 6 × 3 plugin-only run on the six (about $4.5) with the drift gate. No bare re-run: the lock stays.
- Pass: drift share ≥ 5/6, recall ≥ 0.417, and agent cost not worse than the re-scored 26_1600.

## Docs
- `evals/TRAINING-PLAN.md`:
  - a drift gate row with the policy;
  - §5 Debt cost row re-stated as agent-only;
  - in stage 3a levers: the shortlist default (`shortlistRules` excludes markup and data) and family inventory, from the drift report.
- `eval-replay/evals/ROADMAP.md`: a "Drift" item ahead of stage 3, linking the drift report.
- `evals/README.md`: drift ruler and agent-cost column.

## Files
`evals/scripts/src/analysis/{bench-score,run-report,trace-analysis}.mjs`, `evals/scripts/src/validation/eval-gate.mjs` (+ tests), `src/harness/engine/stop.ts` (+ `stop-check.test.ts`, step 7 only).

## Verification
- Targeted tests per change: `node --test` on the touched eval test files and `src/harness/engine/stop-check.test.ts`; `npm run typecheck`; `npm run build` before any run.
- Re-scoring 26_1600 gives the same recall and precision as before, a new agent-only cost ratio and a drift share.
- Full `npm run verify` at hand-off; the 4 codeindex failures that also fail on unmodified HEAD are noted.

## Not in this plan
Discovery families and the shortlist default (stage 3a); the task fixture check command (stage-2 debt); plan anchor schema (stage 10); review replay vs live (stage 6); the read-budget change (needs its own measurement).
