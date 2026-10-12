# Skill coverage history

- **plugin** [longest run, turn by turn](chains/plugin-longest.md) · latest run 2026-10-12T18:45:58.015Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · plugin 0.5.1 · 13 case(s) · mean score 0.93 · cost $2.21
- **bare** [longest run, turn by turn](chains/bare-longest.md) · latest run 2026-10-12T18:47:11.218Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 8 case(s) · mean score 0.73 · cost $1.05

`plugin` is the full case score; `outcome` is its shared graders only (answer, code, boundary); `bare` is the same
shared graders with no plugin loaded; `lift` = outcome − bare, shown only when both rows ran the same model, effort and case version.
`calls/tools` are the distinct model calls and tool calls of the main session (the harness turn count is about tool calls + 1), plugin · bare.
`context` is the largest main-session context of the run in thousands of tokens (input + cache), plugin / bare.
Brackets: change against the previous row of the same arm. Failing graders are the latest plugin run's.

## init

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| init-auto | 0.857 | — | — | — | 0.171 | — | —/— | 24.2 | check-wired |

## investigate

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| investigate-files | 0.956 (+0.09) | 0.933 | 0.733 (+0.07) | — | 0.0779 | 0.0552 | —/— · —/— | 21.7 / 17.5 | files-complete 0.8 |
| investigate-how | 0.867 (-0.09) | 1 | 0.76 (-0.24) | — | 0.0799 | 0.0524 | —/— · —/— | 22.8 / 17.2 | citations-valid 0.4, route-done 0.4 |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.051 | 0.053 | —/— · —/— | 18.1 / 17.4 | — |

## plan

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan-accept | 1 | 1 | 0.6 | +0.40 | 0.1204 | 0.0675 | —/— · —/— | 25.4 / 17.6 | — |
| plan-draft | 1 | 1 | — | — | 0.1621 | — | —/— | 30.7 | — |

## review

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 1 | 0.5 | +0.50 | 0.0963 | 0.0456 | —/— · —/— | 21.3 / 17.0 | — |
| review-defect | 1 | 1 | 0.8 | +0.20 | 0.0967 | 0.047 | —/— · —/— | 22.1 / 17.0 | — |
| review-regression | 0.909 | 1 | 0.8 | +0.20 | 0.0955 | 0.0451 | —/— · —/— | 22.0 / 17.0 | check-recorded |
| review-skipped | 1 | 1 | — | — | 0.0488 | — | —/— | 17.8 | — |

## rules

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-migrate | 0.444 (-0.56) | — | — | — | 0.1126 | — | —/— | 26.0 | apply-recorded, drafts-recorded, route-done, rules-faithful |

## task

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task-fix | 1 | 1 | 0.667 | +0.33 | 0.1532 | 0.0455 | —/— · —/— | 28.4 / 16.6 | — |
| task-review-skipped | 1 | 1 | — | — | 0.1075 | — | —/— | 24.6 | — |

## Runs

Every run of the latest row, for the drift on one case. Recall: share of the files a right answer names that were
named. Precision: share of the named files that are right (or allowed). Mean ± sample standard deviation.

### investigate-files · plugin · 5 run(s) · 2026-10-12T18:45

recall 0.93 ± 0.15 · precision 1.00 ± 0.00 · F1 0.96 ± 0.09

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.78 | 0.67 | 1 | 0.8 | — | — | 21.2 | 0.07 | tests/invoices.test.ts | — | files-complete |
| 2 | 1 | 1 | 1 | 1 | — | — | 21.6 | 0.08 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | — | — | 22.1 | 0.08 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | — | — | 22.0 | 0.08 | — | — | — |
| 5 | 1 | 1 | 1 | 1 | — | — | 21.6 | 0.08 | — | — | — |
| spread | 0.96 ± 0.10 | | | | — | — | | | | | |

### investigate-files · bare · 5 run(s) · 2026-10-12T18:47

recall 0.80 ± 0.18 · precision 1.00 ± 0.00 · F1 0.88 ± 0.11

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.67 | 0.67 | 1 | 0.8 | — | — | 17.3 | 0.05 | tests/invoices.test.ts | — | files-complete |
| 2 | 1 | 1 | 1 | 1 | — | — | 17.8 | 0.06 | — | — | — |
| 3 | 0.67 | 0.67 | 1 | 0.8 | — | — | 17.4 | 0.06 | tests/invoices.test.ts | — | files-complete |
| 4 | 0.67 | 1 | 1 | 1 | — | — | 17.6 | 0.06 | — | — | files-complete |
| 5 | 0.67 | 0.67 | 1 | 0.8 | — | — | 17.4 | 0.05 | tests/invoices.test.ts | — | files-complete |
| spread | 0.74 ± 0.15 | | | | — | — | | | | | |

### investigate-how · plugin · 5 run(s) · 2026-10-12T18:45

recall 0.80 ± 0.45 · precision 0.80 ± 0.45 · F1 0.80 ± 0.45

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.78 | 1 | 1 | 1 | — | — | 24.1 | 0.09 | — | — | citations-valid, route-done |
| 2 | 0.78 | 0 | 0 | 0 | — | — | 24.0 | 0.09 | src/invoices/service.ts, src/routes/invoices.ts | src/legacy/invoice-export.ts, src/reports/monthly.ts | citations-valid, route-done |
| 3 | 1 | 1 | 1 | 1 | — | — | 21.2 | 0.07 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | — | — | 21.3 | 0.07 | — | — | — |
| 5 | 0.78 | 1 | 1 | 1 | — | — | 23.7 | 0.08 | — | — | citations-valid, route-done |
| spread | 0.87 ± 0.12 | | | | — | — | | | | | |

### investigate-how · bare · 5 run(s) · 2026-10-12T18:47

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | — | — | 17.1 | 0.05 | — | — | — |
| 2 | 0.8 | 1 | 1 | 1 | — | — | 17.2 | 0.05 | — | — | answer-cites-service |
| 3 | 0.8 | 1 | 1 | 1 | — | — | 17.4 | 0.05 | — | — | answer-cites-service |
| 4 | 0.4 | 1 | 1 | 1 | — | — | 17.0 | 0.05 | — | — | answer-cites-service, answer-correct |
| 5 | 0.8 | 1 | 1 | 1 | — | — | 17.2 | 0.05 | — | — | answer-cites-service |
| spread | 0.76 ± 0.22 | | | | — | — | | | | | |

### investigate-nomatch · plugin · 5 run(s) · 2026-10-12T18:45

recall — · precision — · F1 —

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | — | — | — | — | — | 18.0 | 0.05 | — | — | — |
| 2 | 1 | — | — | — | — | — | 18.1 | 0.05 | — | — | — |
| 3 | 1 | — | — | — | — | — | 18.0 | 0.05 | — | — | — |
| 4 | 1 | — | — | — | — | — | 18.2 | 0.05 | — | — | — |
| 5 | 1 | — | — | — | — | — | 18.0 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 | | | | — | — | | | | | |

### investigate-nomatch · bare · 5 run(s) · 2026-10-12T18:47

recall — · precision — · F1 —

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | — | — | — | — | — | 17.5 | 0.05 | — | — | — |
| 2 | 1 | — | — | — | — | — | 17.6 | 0.05 | — | — | — |
| 3 | 1 | — | — | — | — | — | 17.3 | 0.05 | — | — | — |
| 4 | 1 | — | — | — | — | — | 17.4 | 0.05 | — | — | — |
| 5 | 1 | — | — | — | — | — | 17.4 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 | | | | — | — | | | | | |
