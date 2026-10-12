# Skill coverage history

- **plugin** [longest run, turn by turn](chains/plugin-longest.md) · latest run 2026-10-12T19:38:07.049Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · plugin 0.5.1 · 13 case(s) · mean score 0.93 · cost $5.45
- **bare** [longest run, turn by turn](chains/bare-longest.md) · latest run 2026-10-12T19:33:45.004Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 8 case(s) · mean score 0.81 · cost $2.05

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
| investigate-files | 1 (+0.04) | 1 | 0.933 (+0.20) | +0.07 | 0.0727 | 0.0541 | 3.2/2.2 · 3.2/3.6 | 20.6 / 17.6 | — |
| investigate-how | 1 (+0.13) | 1 | 1 (+0.24) | 0.00 | 0.0716 | 0.0532 | 3.4/2.2 · 2.8/3.6 | 20.4 / 17.2 | — |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.0519 | 0.0559 | 2/1 · 4.4/3.4 | 18.1 / 17.7 | — |

## plan

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan-accept | 0.836 (-0.16) | 0.64 | 0.56 (-0.04) | — | 0.1311 | 0.066 | 6.4/8.2 · 3.2/2.2 | 26.2 / 17.6 | no-checks-run 0.8, plan-quality 0.2 |
| plan-draft | 1 | 1 | — | — | 0.1186 | — | 6.4/8 | 25.9 | — |

## review

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 1 | 0.7 (+0.20) | +0.30 | 0.0924 | 0.0453 | 4/3 · 2/1 | 21.3 / 17.0 | — |
| review-defect | 1 | 1 | 0.8 | +0.20 | 0.0971 | 0.0462 | 4/3 · 2/1 | 22.0 / 16.9 | — |
| review-regression | 0.927 (+0.02) | 1 | 0.8 | +0.20 | 0.1043 | 0.0451 | 5.4/4.4 · 2/1 | 22.9 / 16.9 | check-recorded 0.2 |
| review-skipped | 1 | 1 | — | — | 0.0475 | — | 1/0 | 17.7 | — |

## rules

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-migrate | 0.444 (-0.56) | — | — | — | 0.1126 | — | —/— | 26.0 | apply-recorded, drafts-recorded, route-done, rules-faithful |

## task

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task-fix | 1 | 1 | 0.667 | +0.33 | 0.144 | 0.0451 | 10.8/11 · 3/2 | 27.7 / 16.5 | — |
| task-review-skipped | 1 | 1 | — | — | 0.1027 | — | 7.8/7.6 | 24.4 | — |

## Runs

Every run of the latest row, for the drift on one case. Recall: share of the files a right answer names that were
named. Precision: share of the named files that are right (or allowed). Mean ± sample standard deviation.

### investigate-files · plugin · 5 run(s) · 2026-10-12T19:30

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 3 | 2 | 20.4 | 0.07 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 2 | 20.2 | 0.07 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 2 | 20.4 | 0.07 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | 4 | 3 | 21.4 | 0.08 | — | — | — |
| 5 | 1 | 1 | 1 | 1 | 3 | 2 | 20.4 | 0.07 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.20 ± 0.45 | 2.20 ± 0.45 |  |  |  |  |  |

### investigate-files · bare · 5 run(s) · 2026-10-12T19:30

recall 0.93 ± 0.15 · precision 1.00 ± 0.00 · F1 0.96 ± 0.09

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.67 | 0.67 | 1 | 0.8 | 3 | 2 | 17.4 | 0.05 | tests/invoices.test.ts | — | files-complete |
| 2 | 1 | 1 | 1 | 1 | 3 | 2 | 17.6 | 0.05 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 4 | 4 | 17.8 | 0.06 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | 3 | 8 | 18.0 | 0.06 | — | — | — |
| 5 | 1 | 1 | 1 | 1 | 3 | 2 | 17.4 | 0.05 | — | — | — |
| spread | 0.93 ± 0.15 |  |  |  | 3.20 ± 0.45 | 3.60 ± 2.61 |  |  |  |  |  |

### investigate-how · plugin · 5 run(s) · 2026-10-12T19:30

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 3 | 2 | 20.4 | 0.07 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 2 | 20.1 | 0.07 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 2 | 20.2 | 0.07 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | 3 | 2 | 20.0 | 0.07 | — | — | — |
| 5 | 1 | 1 | 1 | 1 | 5 | 3 | 21.5 | 0.09 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.40 ± 0.89 | 2.20 ± 0.45 |  |  |  |  |  |

### investigate-how · bare · 5 run(s) · 2026-10-12T19:30

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 3 | 4 | 17.4 | 0.06 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 2 | 1 | 16.9 | 0.05 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 4 | 17.2 | 0.05 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | 3 | 5 | 17.5 | 0.06 | — | — | — |
| 5 | 1 | 1 | 1 | 1 | 3 | 4 | 17.2 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.80 ± 0.45 | 3.60 ± 1.52 |  |  |  |  |  |

### investigate-nomatch · plugin · 5 run(s) · 2026-10-12T19:30

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 18.2 | 0.05 | — |
| 2 | 1 | 2 | 1 | 18.1 | 0.05 | — |
| 3 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| 4 | 1 | 2 | 1 | 18.1 | 0.05 | — |
| 5 | 1 | 2 | 1 | 18.1 | 0.05 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### investigate-nomatch · bare · 5 run(s) · 2026-10-12T19:30

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 5 | 4 | 18.2 | 0.06 | — |
| 2 | 1 | 4 | 3 | 17.4 | 0.05 | — |
| 3 | 1 | 4 | 3 | 17.6 | 0.06 | — |
| 4 | 1 | 5 | 4 | 18.2 | 0.06 | — |
| 5 | 1 | 4 | 3 | 17.1 | 0.05 | — |
| spread | 1.00 ± 0.00 | 4.40 ± 0.55 | 3.40 ± 0.55 |  |  |  |

### plan-accept · plugin · 5 run(s) · 2026-10-12T19:32

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.82 | 7 | 7 | 25.9 | 0.13 | plan-quality |
| 2 | 0.82 | 7 | 16 | 29.1 | 0.15 | plan-quality |
| 3 | 0.73 | 7 | 7 | 25.1 | 0.13 | no-checks-run, plan-quality |
| 4 | 0.82 | 5 | 5 | 25.5 | 0.12 | plan-quality |
| 5 | 1 | 6 | 6 | 25.4 | 0.12 | — |
| spread | 0.84 ± 0.10 | 6.40 ± 0.89 | 8.20 ± 4.44 |  |  |  |

### plan-accept · bare · 5 run(s) · 2026-10-12T19:32

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 3 | 2 | 17.7 | 0.07 | plan-quality |
| 2 | 0.4 | 3 | 2 | 17.7 | 0.07 | no-checks-run, plan-quality |
| 3 | 0.6 | 3 | 2 | 17.5 | 0.06 | plan-quality |
| 4 | 0.6 | 3 | 2 | 17.5 | 0.06 | plan-quality |
| 5 | 0.6 | 4 | 3 | 17.5 | 0.07 | plan-quality |
| spread | 0.56 ± 0.09 | 3.20 ± 0.45 | 2.20 ± 0.45 |  |  |  |

### plan-draft · plugin · 5 run(s) · 2026-10-12T19:32

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 6 | 9 | 27.9 | 0.13 | — |
| 2 | 1 | 6 | 6 | 25.0 | 0.11 | — |
| 3 | 1 | 8 | 13 | 25.5 | 0.12 | — |
| 4 | 1 | 6 | 6 | 25.9 | 0.12 | — |
| 5 | 1 | 6 | 6 | 25.0 | 0.11 | — |
| spread | 1.00 ± 0.00 | 6.40 ± 0.89 | 8.00 ± 3.08 |  |  |  |

### review-clean · plugin · 5 run(s) · 2026-10-12T19:34

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 3 | 21.3 | 0.1 | — |
| 2 | 1 | 4 | 3 | 21.3 | 0.09 | — |
| 3 | 1 | 4 | 3 | 21.3 | 0.1 | — |
| 4 | 1 | 4 | 3 | 21.4 | 0.09 | — |
| 5 | 1 | 4 | 3 | 21.3 | 0.09 | — |
| spread | 1.00 ± 0.00 | 4.00 ± 0.00 | 3.00 ± 0.00 |  |  |  |

### review-clean · bare · 5 run(s) · 2026-10-12T19:33

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.5 | 2 | 1 | 17.1 | 0.05 | no-false-defect |
| 2 | 1 | 2 | 1 | 16.9 | 0.04 | — |
| 3 | 1 | 2 | 1 | 16.9 | 0.05 | — |
| 4 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| 5 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| spread | 0.70 ± 0.27 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-defect · plugin · 5 run(s) · 2026-10-12T19:34

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 3 | 22.1 | 0.1 | — |
| 2 | 1 | 4 | 3 | 22.1 | 0.1 | — |
| 3 | 1 | 4 | 3 | 22.1 | 0.1 | — |
| 4 | 1 | 4 | 3 | 21.9 | 0.1 | — |
| 5 | 1 | 4 | 3 | 22.0 | 0.1 | — |
| spread | 1.00 ± 0.00 | 4.00 ± 0.00 | 3.00 ± 0.00 |  |  |  |

### review-defect · bare · 5 run(s) · 2026-10-12T19:33

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 17.0 | 0.05 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 3 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 4 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 5 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-regression · plugin · 5 run(s) · 2026-10-12T19:34

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.91 | 4 | 3 | 22.1 | 0.09 | check-recorded |
| 2 | 0.91 | 4 | 3 | 22.1 | 0.1 | check-recorded |
| 3 | 1 | 11 | 10 | 26.3 | 0.14 | — |
| 4 | 0.91 | 4 | 3 | 22.0 | 0.1 | check-recorded |
| 5 | 0.91 | 4 | 3 | 21.9 | 0.1 | check-recorded |
| spread | 0.93 ± 0.04 | 5.40 ± 3.13 | 4.40 ± 3.13 |  |  |  |

### review-regression · bare · 5 run(s) · 2026-10-12T19:33

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.8 | 0.04 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 3 | 0.8 | 2 | 1 | 17.0 | 0.05 | cites-location |
| 4 | 0.8 | 2 | 1 | 17.0 | 0.05 | cites-location |
| 5 | 0.8 | 2 | 1 | 17.0 | 0.04 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-skipped · plugin · 5 run(s) · 2026-10-12T19:34

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0 | 17.7 | 0.05 | — |
| 2 | 1 | 1 | 0 | 17.7 | 0.05 | — |
| 3 | 1 | 1 | 0 | 17.7 | 0.05 | — |
| 4 | 1 | 1 | 0 | 17.6 | 0.05 | — |
| 5 | 1 | 1 | 0 | 17.7 | 0.05 | — |
| spread | 1.00 ± 0.00 | 1.00 ± 0.00 | 0.00 ± 0.00 |  |  |  |

### task-fix · plugin · 5 run(s) · 2026-10-12T19:34

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 10 | 11 | 27.0 | 0.14 | — |
| 2 | 1 | 10 | 11 | 26.9 | 0.14 | — |
| 3 | 1 | 10 | 10 | 26.9 | 0.14 | — |
| 4 | 1 | 11 | 11 | 27.9 | 0.15 | — |
| 5 | 1 | 13 | 12 | 29.6 | 0.16 | — |
| spread | 1.00 ± 0.00 | 10.80 ± 1.30 | 11.00 ± 0.71 |  |  |  |

### task-fix · bare · 5 run(s) · 2026-10-12T19:33

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 2 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 3 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 4 | 0.67 | 3 | 2 | 16.4 | 0.04 | test-added |
| 5 | 0.67 | 3 | 2 | 16.5 | 0.04 | test-added |
| spread | 0.67 ± 0.00 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### task-review-skipped · plugin · 5 run(s) · 2026-10-12T19:38

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 8 | 8 | 24.8 | 0.11 | — |
| 2 | 1 | 7 | 6 | 23.7 | 0.09 | — |
| 3 | 1 | 9 | 9 | 25.2 | 0.11 | — |
| 4 | 1 | 8 | 7 | 24.7 | 0.11 | — |
| 5 | 1 | 7 | 8 | 23.8 | 0.1 | — |
| spread | 1.00 ± 0.00 | 7.80 ± 0.84 | 7.60 ± 1.14 |  |  |  |
