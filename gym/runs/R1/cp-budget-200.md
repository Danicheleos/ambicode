# cp-budget-200 — R1

Written 2026-09-29 by the lead, session 14, at the end of it-010 (03 §1 "Budget checkpoints"; the $200 mark is the budget checkpoint of L-012 a). The ceiling is **$400** and the lead stops at 90 % = $360.

| Item | costUsd | Source |
|---|---|---|
| Ledger at it-008 | ≈ 181.5 | `STATE.md` it-008 row |
| it-009 eval (Sonnet preflight 0.2097 + Opus preflight 0.4025) | 0.61 | `it-009/metrics.json` |
| it-010 eval (Sonnet preflight 0.21 + T2 sweep 21.2623) | 21.47 | `it-010/metrics.json` |
| **Ledger** | **≈ 203.6** | **≈ 50.9 % of $400** |

Not in the ledger row above: this session's lead, worker and two verifier helpers (the supervisor's `state.json` counts them at session end; the session meter read ≈ $2.9 at the time of writing).

Iterations: 9 accepted (it-000 to it-005, it-007, it-009, it-010), 2 inconclusive (it-006, it-008), 0 rejected. Cost per accepted iteration ≈ $22.6 (203.6 / 9); most of it is the two Opus T2 sweeps of it-000 and it-003.

What the money bought since the $50 mark: the cheap Sonnet reference. A 3 runs/arm T2 sweep costs $21.26 on Sonnet against $57.83 on Opus (0.37×), 1,571 s against 3,202 s. That changes the budget picture: a T2 decision iteration is now ≈ $22 plus lead cost, not ≈ $65–70, so about 7 decision sweeps fit under the $360 stop. The 01 §5 figures are still labelled Opus, history; updating them is a plan edit (owner).

What remains: $360 − 203.6 ≈ **$156**. Planned: cp-S0 ($0, auditor pass), WP3 item 2 and WP4 (each with a T2 screening ≈ $7 on Sonnet, decision sweep at the next checkpoint ≈ $22), then cp-3, cp-4, cp-5. The next budget checkpoint is $300.

Caveat that bears on what the T2 money buys: on Sonnet the plugin's helper does not run in T2 (review with-arm helper-ran 0 of 24, `it-010/decision.md`), so a T2 sweep cannot detect a change to the review pipeline. Spending on T2 for WP3/WP4 is only informative for the localize arm, until the owner decides otherwise.

## Correction at cp-S0 (auditor F3)

The ledger above is understated. Restated from files: evals 168.55 + it-010 judge 0.85 + baseline judge ≥ 0.95 + supervisor session spend 43.65 = **≈ $214.0 (53.5 %)**, still without the orphan session 5 (no file). Remaining to the $360 stop ≈ **$146**, about 6 Sonnet decision sweeps, not 7. The caveat about T2 review applies to T2 as configured; the cause is untested (`cp-S0.md` note 1, L-016).
