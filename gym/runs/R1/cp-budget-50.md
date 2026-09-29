# cp-budget-50 — R1

Written 2026-09-29 by the lead, session 5, at the end of iteration 0 (03 §1 "Budget checkpoints"). A first version was written against a $100 ceiling before L-002 was answered. This version replaces it.

Ceiling: **$150** (`labels/labels.json` L-002, owner, 2026-09-29T02:23:04Z). Stop at 90 % = $135 (03 §3 S2).

| Item | costUsd | Source |
|---|---|---|
| Lead sessions 1–4 (incl. helpers) | 5.7554 | `supervisor/state.json` `spentUsd` |
| T1 baseline sweep | 4.2107 | `evals/evals-triggers/results/2026-09-29T01-38-53-501Z/aggregate-result.json` |
| preflight, session 4 | 0.39 | `baseline/scratch/preflight.log` |
| preflight, session 5 | 0.40 | `baseline/scratch/preflight-s5.log` |
| T2 sweep killed with session 4 (`partial: true`, `interrupted`, 13 of 18 cases usable) | 41.0374 | `eval-2026-09-29T01-43-58-769Z.json` |
| T2 reruns of the 5 unfinished cases | 19.5257 | the five `eval-2026-09-29T02-*.json` files |
| Lead session 5 up to this checkpoint (incl. verifier) | ≈ 4.4 | session budget meter; exact value lands in `supervisor/state.json` at session end |
| **Total** | **≈ 75.7** | **≈ 50.5 % of $150** |

Iterations accepted: 1 (it-000, baseline). Rejected: 0.

The baseline cost $65.56 in eval spend against the plan's ≈ $62 (01 §5: T1 $4 + preflight $0.7 + T2 decision $57). The $41.04 sweep lost to the guard kill was mostly recovered: its 13 complete cases were kept, and only 5 cases ($19.53) were rerun. A full rerun would have been about $57.

What remains: $135 − 75.7 ≈ **$59**. One T2 decision iteration costs ≈ $65–70 (01 §5), so none fits. What fits: T3 re-records ($0.33–0.67 per recording), T1 ($4), T2 screening ($19, never decides, 01 §3), and gate-only work ($0). The owner's L-002 instruction applies: use the cheapest measurement the signal rules accept.

## Revision for the $250 ceiling (L-009, written at the end of it-003, session 6)

Ceiling **$250**, stop at $225. The 50 % mark ($125) was crossed during it-003's T2 sweep.

| Item | costUsd | Source |
|---|---|---|
| Ledger at cp-1 | ≈ 80.3 | `cp-1.md` |
| Lead session 6, both parts, incl. worker and verifier | ≈ 12.2 | session budget meter; exact value lands in `supervisor/state.json` |
| it-003 eval spend | 68.48 | `it-003/metrics.json` costUsd (includes T2 judge $0.88) |
| **Total** | **≈ 161** | **≈ 64 % of $250** |

Iterations accepted: 4 (it-000 … it-003). Rejected: 0. Cost per accepted iteration: ≈ $40 mean. The T2-decision ones cost it-000 $65.56 and it-003 $68.48 in eval spend.

What remains before the stop: $225 − 161 ≈ **$64**. One more T2 decision (≈ $61 measured in it-003, plus preflight and sessions ≈ $70) does not fit with any margin. WP3's first item is an investigation with no behaviour change, which costs no eval spend. WP3's behaviour item needs T3 (≈ $2.4) and, as a WP3 must-not-move, T2 (≈ $61). The next checkpoint is 75 % = $187.5.

Correction after the cp-2 audit (F9). Add the T3 same-day A/A ($2.42, `it-003/metrics.json` costBreakdown). Add the baseline's T2 judge cost, which no ledger line counted: ≥ $0.95, summed over `baseline/scratch/t2-merged.json` runs only, so the killed sweep's discarded runs add an unknown amount. Session 6 now stands at ≈ $15.9 instead of ≈ $12.2. The lead-session figures (sessions 5 and 6) come from the session budget meter, not from a file; the supervisor did not record session 5 (the orphan). New total ≈ **$169.6**, 68 % of $250. Remaining before the $225 stop: ≈ **$55**.
