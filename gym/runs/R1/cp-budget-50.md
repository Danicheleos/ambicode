# cp-budget-50 — R1

Written 2026-09-29 by the lead, session 5, during iteration 0 (03 §1 "Budget checkpoints"). This checkpoint was due during session 4. It was not written then, because the T2 sweep's cost was only known after the sweep was killed.

Ceiling: **$100** (operative). It is what the running supervisor enforces (`supervisor/supervisor.log` session-4 start: `"budgetUsd":100`). Four sources disagree, filed as L-002 (`labels/pending.md`). Stop at 90 % = $90 (03 §3 S2).

| Item | costUsd | Source |
|---|---|---|
| Lead sessions 1–4 (incl. helpers) | 5.7554 | `supervisor/state.json` `spentUsd` |
| T1 baseline sweep | 4.2107 | `evals/evals-triggers/results/2026-09-29T01-38-53-501Z/aggregate-result.json` |
| preflight | 0.39 | `baseline/scratch/preflight.log` |
| T2 baseline sweep, killed with session 4 (`partial: true`, `interrupted`) | 41.0374 | `evals/evals-core/results/eval-2026-09-29T01-43-58-769Z.json` `costUsd` |
| **Total before session 5** | **51.39** | 51.4 % of $100 |

Iterations accepted: 0. Rejected: 0. Cost per accepted iteration: undefined (none accepted).

Plan for what remains:
- Complete T2 by running only the 5 cases the killed sweep did not finish, at 3 runs/arm (`--case`, one invocation per case, because `--case` is not repeatable: `evals/scripts/src/evals-preflight.test.mjs:119`). Estimate: $41.04 / 13.x completed cases ≈ $3 per case → about $15. A full 18-case rerun (≈ $57, 01 §5) would reach about $110, over the $90 stop.
- After iteration 0 the projected total is about $70. That leaves about $20: enough for WP1's T3 re-record, not for any T2 decision iteration (≈ $65–70). Replan trigger R1 applies unless L-002 raises the ceiling.
