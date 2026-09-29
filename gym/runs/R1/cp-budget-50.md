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
