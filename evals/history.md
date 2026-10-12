# Skill coverage history

- **plugin** [longest run, turn by turn](chains/plugin-longest.md) · latest run 2026-10-12T14:16:13.541Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · plugin 0.5.1 · 13 case(s) · mean score 0.93 · cost $2.21
- **bare** [longest run, turn by turn](chains/bare-longest.md) · latest run 2026-10-12T13:57:57.724Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 8 case(s) · mean score 0.75 · cost $0.42

`plugin` is the full case score; `outcome` is its shared graders only (answer, code, boundary); `bare` is the same
shared graders with no plugin loaded; `lift` = outcome − bare, shown only when both rows ran the same model, effort and case version.
`context` is the largest main-session context of the run in thousands of tokens (input + cache), plugin / bare.
Brackets: change against the previous row of the same arm. Failing graders are the latest plugin run's.

## init

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| init-auto | 0.857 | — | — | — | 0.171 | — | 7 | 24.2 | check-wired |

## investigate

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| investigate-files | 0.867 (-0.13) | 0.8 | 0.667 | — | 0.0825 | 0.0591 | 6.4 / 7 | 22.3 / 17.5 | files-complete 0.4 |
| investigate-how | 0.956 (+0.09) | 1 | 1 | — | 0.0755 | 0.0575 | 4.6 / 6 | 21.8 / 17.4 | citations-valid 0.8, route-done 0.8 |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.0515 | 0.0518 | 2 / 4 | 18.1 / 17.3 | — |

## plan

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan-accept | 1 | 1 | 0.6 | +0.40 | 0.1204 | 0.0675 | 7 / 3 | 25.4 / 17.6 | — |
| plan-draft | 1 | 1 | — | — | 0.1621 | — | 18 | 30.7 | — |

## review

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 1 | 0.5 | +0.50 | 0.0963 | 0.0456 | 4 / 2 | 21.3 / 17.0 | — |
| review-defect | 1 | 1 | 0.8 | +0.20 | 0.0967 | 0.047 | 4 / 2 | 22.1 / 17.0 | — |
| review-regression | 0.909 | 1 | 0.8 | +0.20 | 0.0955 | 0.0451 | 4 / 2 | 22.0 / 17.0 | check-recorded |
| review-skipped | 1 | 1 | — | — | 0.0488 | — | 1 | 17.8 | — |

## rules

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-migrate | 0.444 (-0.56) | — | — | — | 0.1126 | — | 6 | 26.0 | apply-recorded, drafts-recorded, route-done, rules-faithful |

## task

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task-fix | 1 | 1 | 0.667 | +0.33 | 0.1532 | 0.0455 | 13 / 3 | 28.4 / 16.6 | — |
| task-review-skipped | 1 | 1 | — | — | 0.1075 | — | 10 | 24.6 | — |

## Runs

Every run of the latest row, for the drift on one case. Recall: share of the files a right answer names that were
named. Precision: share of the named files that are right (or allowed). Mean ± sample standard deviation.

### investigate-files · plugin · 5 run(s) · 2026-10-12T14:14

recall 0.80 ± 0.18 · precision 1.00 ± 0.00 · F1 0.88 ± 0.11

| run | score | recall | precision | F1 | turns | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.78 | 0.67 | 1 | 0.8 | 6 | 21.5 | 0.08 | tests/invoices.test.ts | — | files-complete |
| 2 | 1 | 1 | 1 | 1 | 5 | 22.5 | 0.09 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 9 | 24.7 | 0.09 | — | — | — |
| 4 | 0.78 | 0.67 | 1 | 0.8 | 6 | 21.3 | 0.08 | tests/invoices.test.ts | — | files-complete |
| 5 | 0.78 | 0.67 | 1 | 0.8 | 6 | 21.2 | 0.07 | tests/invoices.test.ts | — | files-complete |
| spread | 0.87 ± 0.12 | | | | 6.40 ± 1.52 | | | | | |

### investigate-how · plugin · 5 run(s) · 2026-10-12T14:16

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | turns | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 7 | 21.2 | 0.07 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 21.3 | 0.07 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 21.4 | 0.08 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | 3 | 21.2 | 0.07 | — | — | — |
| 5 | 0.78 | 1 | 1 | 1 | 7 | 23.8 | 0.09 | — | — | citations-valid, route-done |
| spread | 0.96 ± 0.10 | | | | 4.60 ± 2.19 | | | | | |

### investigate-nomatch · plugin · 5 run(s) · 2026-10-12T14:14

recall — · precision — · F1 —

| run | score | recall | precision | F1 | turns | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | — | — | — | 2 | 18.0 | 0.05 | — | — | — |
| 2 | 1 | — | — | — | 2 | 18.1 | 0.05 | — | — | — |
| 3 | 1 | — | — | — | 2 | 18.1 | 0.05 | — | — | — |
| 4 | 1 | — | — | — | 2 | 18.2 | 0.05 | — | — | — |
| 5 | 1 | — | — | — | 2 | 18.1 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 | | | | 2.00 ± 0.00 | | | | | |
