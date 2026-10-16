# Skill coverage history

- **plugin** [longest run, turn by turn](chains/plugin-longest.md) · latest run 2026-10-16T16:14:15.133Z · claude-sonnet-5-5/low · Claude Code 2.1.300 · plugin 0.6.0 · 17 case(s) · mean score 0.99 · cost $5.57
- **bare** [longest run, turn by turn](chains/bare-longest.md) · latest run 2026-10-15T06:55:42.563Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 12 case(s) · mean score 0.82 · cost $2.41

`plugin` is the full case score; `outcome` is its shared graders only (answer, code, boundary); `bare` is the same
shared graders with no plugin loaded; `lift` = outcome − bare, shown only when both rows ran the same model, effort and case version.
`model calls/tools` are the distinct model calls and tool calls of the main session, plugin · bare. The harness `turns` counts every tool result, so parallel reads inflate it; the rows keep it, the tables do not show it.
`plugin $` and `bare $` are the session's cost with its subagents, without the judge votes (the rows keep those as `judgeCostUsd`).
`session s` is how long the session ran, plugin / bare, without the harness setup and graders that the rows' `seconds` also count.
`context` is the largest main-session context of the run in thousands of tokens (input + cache), plugin / bare.
Brackets: change against the previous row of the same arm. Failing graders are the latest plugin run's.

## init

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| init-auto | 0.889 | — | — | — | 0.1526 | — | 13 | 8/8 | 24.1 | check-wired 0 |

## investigate

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| investigate-files | 1 | 1 | 1 | 0.00 | 0.0637 | 0.0538 | 11 / 8.9 | 2.3/2.7 · 3.7/4.7 | 19.8 / 17.3 | — |
| investigate-how | 1 | 1 | 1 | 0.00 | 0.0662 | 0.0506 | 11.1 / 6.8 | 2.3/1 · 2.7/3.3 | 20.0 / 17.1 | — |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.0493 | 0.0531 | 5.6 / 8 | 2/1 · 4/3 | 17.9 / 17.5 | — |
| investigate-trace | 1 | 1 | 0.958 | +0.04 | 0.1149 | 0.1039 | 19 / 20.4 | 3.3/6.3 · 5/10 | 28.0 / 24.5 | — |

## plan

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan-accept | 1 (+0.12) | 1 | 0.733 (-0.13) | +0.27 | 0.1061 | 0.0633 | 27.4 / 17 | 5/5.2 · 3/2 | 24.3 / 17.6 | — |
| plan-draft | 1 | 1 | — | — | 0.126 | — | 52.6 | 7.3/7 | 26.0 | — |
| plan-reuse | 0.927 (-0.01) | 0.84 | 0.733 (+0.13) | — | 0.1966 | 0.1119 | 56.6 / 25.5 | 7/7.8 · 4.7/3.7 | 38.5 / 25.9 | plan-quality 0.6 |

## review

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 1 | 0.667 (-0.03) | +0.33 | 0.0701 | 0.0448 | 9.5 / 8.1 | 2/1 · 2/1 | 19.5 / 17.1 | — |
| review-defect | 1 | 1 | 0.8 | +0.20 | 0.0716 | 0.0458 | 11.4 / 8.8 | 2/1 · 2/1 | 20.0 / 17.0 | — |
| review-regression | 1 | 1 | 0.8 | +0.20 | 0.0714 | 0.045 | 11.4 / 8.4 | 2/1 · 2/1 | 20.0 / 17.0 | — |
| review-skipped | 1 | 1 | — | — | 0.0437 | — | 2.4 | 1/0 | 17.6 | — |
| review-subtle | 0.933 | 0.89 | 0.481 (-0.22) | +0.41 | 0.089 | 0.0776 | 17.7 / 20.2 | 2/1 · 4.3/3.7 | 21.0 / 20.6 | cites-caller 0.67, finding-correct 0.67 |

## rules

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-migrate | 1 | — | — | — | 0.091 | — | 15 | 4.3/3.7 | 23.6 | — |

## task

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task-fix | 1 (+0.04) | 1 | 0.667 | +0.33 | 0.1007 | 0.0444 | 17.3 / 4.7 | 2/1 · 3/2 | 19.3 / 16.6 | — |
| task-multi | 1 (+0.25) | 1 | 1 | 0.00 | 0.1504 | 0.1095 | 40.2 / 27.4 | 2/1 · 9.7/9 | 19.5 / 24.4 | — |
| task-review-skipped | 1 | 1 | — | — | 0.0921 | — | 17.5 | 2/1 | 19.3 | — |

## Runs

Every run of the latest row, for the drift on one case. Recall: share of the files a right answer names that were
named. Precision: share of the named files that are right (or allowed). Mean ± sample standard deviation.

### init-auto · plugin · 3 run(s) · 2026-10-15T11:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.89 | 8 | 8 | 24.2 | 0.15 | check-wired |
| 2 | 0.89 | 8 | 8 | 24.1 | 0.15 | check-wired |
| 3 | 0.89 | 8 | 8 | 24.0 | 0.16 | check-wired |
| spread | 0.89 ± 0.00 | 8.00 ± 0.00 | 8.00 ± 0.00 |  |  |  |

### investigate-files · plugin · 3 run(s) · 2026-10-15T11:45

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 19.6 | 0.06 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 2 | 1 | 19.7 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 6 | 20.0 | 0.07 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.33 ± 0.58 | 2.67 ± 2.89 |  |  |  |  |  |

### investigate-files · bare · 3 run(s) · 2026-10-15T06:55

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 4 | 5 | 17.3 | 0.06 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 4 | 17.1 | 0.05 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 4 | 5 | 17.4 | 0.06 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.67 ± 0.58 | 4.67 ± 0.58 |  |  |  |  |  |

### investigate-how · plugin · 3 run(s) · 2026-10-15T11:45

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 19.8 | 0.06 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 2 | 1 | 19.5 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 1 | 20.7 | 0.08 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.33 ± 0.58 | 1.00 ± 0.00 |  |  |  |  |  |

### investigate-how · bare · 3 run(s) · 2026-10-15T06:55

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 3 | 4 | 17.2 | 0.05 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 5 | 17.2 | 0.05 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 2 | 1 | 17.0 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.67 ± 0.58 | 3.33 ± 2.08 |  |  |  |  |  |

### investigate-nomatch · plugin · 3 run(s) · 2026-10-15T11:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| 2 | 1 | 2 | 1 | 17.9 | 0.05 | — |
| 3 | 1 | 2 | 1 | 17.9 | 0.05 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### investigate-nomatch · bare · 3 run(s) · 2026-10-15T06:55

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 3 | 17.3 | 0.05 | — |
| 2 | 1 | 4 | 3 | 17.6 | 0.05 | — |
| 3 | 1 | 4 | 3 | 17.5 | 0.05 | — |
| spread | 1.00 ± 0.00 | 4.00 ± 0.00 | 3.00 ± 0.00 |  |  |  |

### investigate-trace · plugin · 3 run(s) · 2026-10-15T11:45

recall 0.91 ± 0.08 · precision 0.98 ± 0.03 · F1 0.94 ± 0.03

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 0.86 | 1 | 0.92 | 4 | 13 | 27.7 | 0.12 | src/notifications/channels.js | — | — |
| 2 | 1 | 1 | 0.94 | 0.97 | 3 | 3 | 28.6 | 0.12 | — | src/notifications/routes.js | — |
| 3 | 1 | 0.86 | 1 | 0.92 | 3 | 3 | 27.6 | 0.11 | src/notifications/channels.js | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.33 ± 0.58 | 6.33 ± 5.77 |  |  |  |  |  |

### investigate-trace · bare · 3 run(s) · 2026-10-15T06:55

recall 0.91 ± 0.08 · precision 0.98 ± 0.03 · F1 0.94 ± 0.03

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.88 | 1 | 0.94 | 0.97 | 5 | 4 | 25.2 | 0.11 | — | src/legacy/payment-hooks.js | files-skip-legacy |
| 2 | 1 | 0.86 | 1 | 0.92 | 5 | 13 | 24.1 | 0.1 | src/notifications/channels.js | — | — |
| 3 | 1 | 0.86 | 1 | 0.92 | 5 | 13 | 24.2 | 0.1 | src/notifications/channels.js | — | — |
| spread | 0.96 ± 0.07 |  |  |  | 5.00 ± 0.00 | 10.00 ± 5.20 |  |  |  |  |  |

### plan-accept · plugin · 5 run(s) · 2026-10-15T11:53

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 5 | 5 | 23.7 | 0.1 | — |
| 2 | 1 | 5 | 6 | 23.6 | 0.1 | — |
| 3 | 1 | 5 | 5 | 24.4 | 0.11 | — |
| 4 | 1 | 5 | 5 | 24.5 | 0.11 | — |
| 5 | 1 | 5 | 5 | 25.5 | 0.11 | — |
| spread | 1.00 ± 0.00 | 5.00 ± 0.00 | 5.20 ± 0.45 |  |  |  |

### plan-accept · bare · 3 run(s) · 2026-10-15T06:55

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 3 | 2 | 17.5 | 0.06 | plan-quality |
| 2 | 0.6 | 3 | 2 | 17.7 | 0.06 | plan-quality |
| 3 | 1 | 3 | 2 | 17.5 | 0.06 | — |
| spread | 0.73 ± 0.23 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### plan-draft · plugin · 3 run(s) · 2026-10-15T11:56

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 7 | 6 | 25.7 | 0.12 | — |
| 2 | 1 | 6 | 6 | 25.4 | 0.11 | — |
| 3 | 1 | 9 | 9 | 26.9 | 0.14 | — |
| spread | 1.00 ± 0.00 | 7.33 ± 1.53 | 7.00 ± 1.73 |  |  |  |

### plan-reuse · plugin · 5 run(s) · 2026-10-15T11:54

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.82 | 9 | 9 | 39.8 | 0.22 | plan-quality |
| 2 | 0.82 | 5 | 7 | 36.4 | 0.18 | plan-quality |
| 3 | 1 | 8 | 9 | 37.4 | 0.19 | — |
| 4 | 1 | 6 | 7 | 38.4 | 0.19 | — |
| 5 | 1 | 7 | 7 | 40.6 | 0.21 | — |
| spread | 0.93 ± 0.10 | 7.00 ± 1.58 | 7.80 ± 1.09 |  |  |  |

### plan-reuse · bare · 3 run(s) · 2026-10-15T06:55

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 5 | 4 | 26.6 | 0.12 | plan-quality |
| 2 | 0.6 | 4 | 3 | 25.0 | 0.11 | plan-quality |
| 3 | 1 | 5 | 4 | 26.0 | 0.11 | — |
| spread | 0.73 ± 0.23 | 4.67 ± 0.58 | 3.67 ± 0.58 |  |  |  |

### review-clean · plugin · 3 run(s) · 2026-10-15T11:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 19.5 | 0.08 | — |
| 2 | 1 | 2 | 1 | 19.6 | 0.07 | — |
| 3 | 1 | 2 | 1 | 19.3 | 0.07 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-clean · bare · 3 run(s) · 2026-10-15T06:55

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 17.1 | 0.04 | — |
| 2 | 0.5 | 2 | 1 | 17.1 | 0.04 | no-false-defect |
| 3 | 0.5 | 2 | 1 | 17.0 | 0.04 | no-false-defect |
| spread | 0.67 ± 0.29 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-defect · plugin · 3 run(s) · 2026-10-15T11:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 20.0 | 0.07 | — |
| 2 | 1 | 2 | 1 | 20.0 | 0.07 | — |
| 3 | 1 | 2 | 1 | 20.1 | 0.07 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-defect · bare · 3 run(s) · 2026-10-15T06:55

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 17.0 | 0.04 | cites-location |
| 2 | 0.8 | 2 | 1 | 17.1 | 0.05 | cites-location |
| 3 | 0.8 | 2 | 1 | 17.0 | 0.05 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-regression · plugin · 3 run(s) · 2026-10-15T11:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 20.0 | 0.07 | — |
| 2 | 1 | 2 | 1 | 20.0 | 0.07 | — |
| 3 | 1 | 2 | 1 | 20.0 | 0.07 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-regression · bare · 3 run(s) · 2026-10-15T06:55

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 2 | 0.8 | 2 | 1 | 17.0 | 0.04 | cites-location |
| 3 | 0.8 | 2 | 1 | 17.0 | 0.05 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-skipped · plugin · 3 run(s) · 2026-10-15T11:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0 | 17.6 | 0.04 | — |
| 2 | 1 | 1 | 0 | 17.6 | 0.04 | — |
| 3 | 1 | 1 | 0 | 17.7 | 0.04 | — |
| spread | 1.00 ± 0.00 | 1.00 ± 0.00 | 0.00 ± 0.00 |  |  |  |

### review-subtle · plugin · 3 run(s) · 2026-10-15T11:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.93 | 2 | 1 | 21.1 | 0.09 | cites-caller |
| 2 | 1 | 2 | 1 | 20.9 | 0.09 | — |
| 3 | 0.87 | 2 | 1 | 20.8 | 0.09 | finding-correct |
| spread | 0.93 ± 0.07 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-subtle · bare · 3 run(s) · 2026-10-15T06:55

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.78 | 3 | 3 | 19.0 | 0.07 | convention-finding |
| 2 | 0.33 | 5 | 4 | 21.2 | 0.08 | convention-finding, finding-correct, no-false-defect |
| 3 | 0.33 | 5 | 4 | 21.5 | 0.08 | convention-finding, finding-correct, no-false-defect |
| spread | 0.48 ± 0.26 | 4.33 ± 1.16 | 3.67 ± 0.58 |  |  |  |

### rules-migrate · plugin · 3 run(s) · 2026-10-15T11:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 3 | 23.4 | 0.09 | — |
| 2 | 1 | 4 | 3 | 23.6 | 0.09 | — |
| 3 | 1 | 5 | 5 | 23.9 | 0.1 | — |
| spread | 1.00 ± 0.00 | 4.33 ± 0.58 | 3.67 ± 1.16 |  |  |  |

### task-fix · plugin · 3 run(s) · 2026-10-16T16:14

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 19.2 | 0.09 | — |
| 2 | 1 | 2 | 1 | 19.3 | 0.11 | — |
| 3 | 1 | 2 | 1 | 19.3 | 0.11 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### task-fix · bare · 3 run(s) · 2026-10-15T06:55

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.67 | 3 | 2 | 16.5 | 0.04 | test-added |
| 2 | 0.67 | 3 | 2 | 16.7 | 0.05 | test-added |
| 3 | 0.67 | 3 | 2 | 16.5 | 0.04 | test-added |
| spread | 0.67 ± 0.00 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### task-multi · plugin · 3 run(s) · 2026-10-16T16:14

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 19.6 | 0.15 | — |
| 2 | 1 | 2 | 1 | 19.5 | 0.15 | — |
| 3 | 1 | 2 | 1 | 19.5 | 0.15 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### task-multi · bare · 3 run(s) · 2026-10-15T06:55

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 9 | 8 | 23.7 | 0.1 | — |
| 2 | 1 | 9 | 8 | 23.6 | 0.1 | — |
| 3 | 1 | 11 | 11 | 26.0 | 0.12 | — |
| spread | 1.00 ± 0.00 | 9.67 ± 1.16 | 9.00 ± 1.73 |  |  |  |

### task-review-skipped · plugin · 3 run(s) · 2026-10-16T16:14

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 19.4 | 0.09 | — |
| 2 | 1 | 2 | 1 | 19.3 | 0.09 | — |
| 3 | 1 | 2 | 1 | 19.3 | 0.09 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |
