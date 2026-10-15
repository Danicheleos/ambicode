# Skill coverage history

- **plugin** [longest run, turn by turn](chains/plugin-longest.md) · latest run 2026-10-14T23:04:41.104Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · plugin 0.6.0 · 17 case(s) · mean score 0.97 · cost $5.02
- **bare** [longest run, turn by turn](chains/bare-longest.md) · latest run 2026-10-12T23:34:20.594Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 12 case(s) · mean score 0.84 · cost $2.87

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
| init-auto | 0.889 | — | — | — | 0.1788 | — | 10.3 | 7.7/7.7 | 23.5 | check-wired 0 |

## investigate

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| investigate-files | 1 | 1 | 1 | 0.00 | 0.0736 | 0.0535 | 9.1 / — | 2.3/1.3 · 3.7/2.7 | 20.0 / 17.3 | — |
| investigate-how | 1 | 1 | 1 | 0.00 | 0.0602 | 0.0503 | 8 / — | 2/1 · 2.3/2.3 | 19.6 / 17.0 | — |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.0499 | 0.053 | 5.4 / — | 2/1 · 4/3 | 18.0 / 17.3 | — |
| investigate-trace | 0.944 (-0.06) | 0.917 | 0.958 (+0.03) | -0.04 | 0.1109 | 0.102 | 17.2 / — | 3/2.7 · 4.3/3.7 | 27.8 / 24.8 | answer-correct 0.67 |

## plan

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan-accept | 1 | 1 | 0.867 (-0.05) | +0.13 | 0.1335 | 0.0663 | 37 / — | 7.7/7.7 · 3/2 | 26.4 / 17.5 | — |
| plan-draft | 0.905 (-0.09) | 1 | — | — | 0.1036 | — | 24.4 | 6.3/6.3 | 23.6 | accept-gate-printed 0.67, plan-body-written 0.67 |
| plan-reuse | 0.939 (+0.06) | 0.868 | 0.6 (-0.16) | +0.27 | 0.2307 | 0.1216 | 58.6 / — | 10/12.3 · 4.7/4 | 39.6 / 27.0 | plan-quality 0.67 |

## review

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 1 | 0.7 | +0.30 | 0.0699 | 0.0452 | 7.8 / — | 2/1 · 2/1 | 19.5 / 16.9 | — |
| review-defect | 1 | 1 | 0.8 | +0.20 | 0.0713 | 0.0464 | 9.8 / — | 2/1 · 2/1 | 20.0 / 16.9 | — |
| review-regression | 1 | 1 | 0.8 | +0.20 | 0.071 | 0.0447 | 11.1 / — | 2/1 · 2/1 | 19.9 / 16.9 | — |
| review-skipped | 1 | 1 | — | — | 0.0437 | — | 4 | 1/0 | 17.5 | — |
| review-subtle | 0.889 (+0.18) | 0.817 | 0.704 (+0.10) | +0.11 | 0.0881 | 0.0879 | 24.8 / — | 2/1 · 4.3/4 | 20.9 / 20.7 | cites-caller 0.67, finding-correct 0.67, no-false-defect 0.67 |

## rules

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-migrate | 0.926 (-0.07) | — | — | — | 0.1073 | — | 20.4 | 6.7/6.3 | 24.9 | rules-faithful 0.67 |

## task

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task-fix | 1 | 1 | 0.667 | — | 0.0858 | 0.0451 | 14.5 / — | 5.7/6.7 · 3/2 | 23.0 / 16.5 | — |
| task-multi | 1 | 1 | 1 (+0.03) | — | 0.1154 | 0.1202 | 22.7 / — | 4.7/4 · 9.7/9 | 28.5 / 24.0 | — |
| task-review-skipped | 1 | 1 | — | — | 0.081 | — | 12 | 5/6.3 | 22.4 | — |

## Runs

Every run of the latest row, for the drift on one case. Recall: share of the files a right answer names that were
named. Precision: share of the named files that are right (or allowed). Mean ± sample standard deviation.

### init-auto · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.89 | 7 | 7 | 22.4 | 0.16 | check-wired |
| 2 | 0.89 | 8 | 8 | 24.0 | 0.19 | check-wired |
| 3 | 0.89 | 8 | 8 | 24.1 | 0.19 | check-wired |
| spread | 0.89 ± 0.00 | 7.67 ± 0.58 | 7.67 ± 0.58 |  |  |  |

### investigate-files · plugin · 3 run(s) · 2026-10-14T23:04

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 19.9 | 0.09 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 2 | 1 | 19.9 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 2 | 20.3 | 0.07 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.33 ± 0.58 | 1.33 ± 0.58 |  |  |  |  |  |

### investigate-files · bare · 3 run(s) · 2026-10-12T23:31

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 4 | 3 | 17.4 | 0.06 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 4 | 3 | 17.5 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 2 | 17.0 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.67 ± 0.58 | 2.67 ± 0.58 |  |  |  |  |  |

### investigate-how · plugin · 3 run(s) · 2026-10-14T23:04

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 19.6 | 0.06 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 2 | 1 | 19.6 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 2 | 1 | 19.6 | 0.06 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |  |  |

### investigate-how · bare · 3 run(s) · 2026-10-12T23:31

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 16.9 | 0.05 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 5 | 17.4 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 2 | 1 | 16.9 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.33 ± 0.58 | 2.33 ± 2.31 |  |  |  |  |  |

### investigate-nomatch · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| 2 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| 3 | 1 | 2 | 1 | 18.1 | 0.05 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### investigate-nomatch · bare · 3 run(s) · 2026-10-12T23:31

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 3 | 17.3 | 0.05 | — |
| 2 | 1 | 4 | 3 | 17.2 | 0.05 | — |
| 3 | 1 | 4 | 3 | 17.4 | 0.05 | — |
| spread | 1.00 ± 0.00 | 4.00 ± 0.00 | 3.00 ± 0.00 |  |  |  |

### investigate-trace · plugin · 3 run(s) · 2026-10-14T23:04

recall 0.91 ± 0.08 · precision 0.98 ± 0.03 · F1 0.94 ± 0.03

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 0.86 | 1 | 0.92 | 3 | 2 | 26.6 | 0.1 | src/notifications/channels.js | — | — |
| 2 | 0.83 | 1 | 0.94 | 0.97 | 3 | 3 | 29.6 | 0.12 | — | src/notifications/routes.js | answer-correct |
| 3 | 1 | 0.86 | 1 | 0.92 | 3 | 3 | 27.2 | 0.11 | src/notifications/channels.js | — | — |
| spread | 0.94 ± 0.10 |  |  |  | 3.00 ± 0.00 | 2.67 ± 0.58 |  |  |  |  |  |

### investigate-trace · bare · 3 run(s) · 2026-10-12T23:32

recall 1.00 ± 0.00 · precision 0.94 ± 0.06 · F1 0.97 ± 0.03

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0.94 | 0.97 | 4 | 4 | 25.5 | 0.11 | — | src/notifications/queue.js | — |
| 2 | 1 | 1 | 1 | 1 | 4 | 3 | 24.3 | 0.1 | — | — | — |
| 3 | 0.88 | 1 | 0.88 | 0.93 | 5 | 4 | 24.7 | 0.1 | — | src/legacy/payment-hooks.js, src/notifications/queue.js | files-skip-legacy |
| spread | 0.96 ± 0.07 |  |  |  | 4.33 ± 0.58 | 3.67 ± 0.58 |  |  |  |  |  |

### plan-accept · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 9 | 9 | 26.7 | 0.13 | — |
| 2 | 1 | 7 | 7 | 26.4 | 0.13 | — |
| 3 | 1 | 7 | 7 | 26.2 | 0.13 | — |
| spread | 1.00 ± 0.00 | 7.67 ± 1.16 | 7.67 ± 1.16 |  |  |  |

### plan-accept · bare · 3 run(s) · 2026-10-12T23:32

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 3 | 2 | 17.6 | 0.07 | plan-quality |
| 2 | 1 | 3 | 2 | 17.3 | 0.07 | — |
| 3 | 1 | 3 | 2 | 17.6 | 0.07 | — |
| spread | 0.87 ± 0.23 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### plan-draft · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.71 | 4 | 4 | 21.7 | 0.08 | accept-gate-printed, plan-body-written |
| 2 | 1 | 8 | 8 | 23.9 | 0.11 | — |
| 3 | 1 | 7 | 7 | 25.3 | 0.12 | — |
| spread | 0.90 ± 0.17 | 6.33 ± 2.08 | 6.33 ± 2.08 |  |  |  |

### plan-reuse · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 11 | 10 | 39.0 | 0.23 | — |
| 2 | 1 | 10 | 11 | 38.0 | 0.22 | — |
| 3 | 0.82 | 9 | 16 | 41.9 | 0.24 | plan-quality |
| spread | 0.94 ± 0.10 | 10.00 ± 1.00 | 12.33 ± 3.21 |  |  |  |

### plan-reuse · bare · 3 run(s) · 2026-10-12T23:32

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 5 | 4 | 26.0 | 0.12 | plan-quality |
| 2 | 0.6 | 4 | 4 | 27.2 | 0.12 | plan-quality |
| 3 | 0.6 | 5 | 4 | 27.6 | 0.13 | plan-quality |
| spread | 0.60 ± 0.00 | 4.67 ± 0.58 | 4.00 ± 0.00 |  |  |  |

### review-clean · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 19.5 | 0.08 | — |
| 2 | 1 | 2 | 1 | 19.5 | 0.07 | — |
| 3 | 1 | 2 | 1 | 19.4 | 0.07 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-clean · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.5 | 2 | 1 | 16.9 | 0.04 | no-false-defect |
| 2 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| 3 | 1 | 2 | 1 | 16.9 | 0.05 | — |
| 4 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| 5 | 1 | 2 | 1 | 17.0 | 0.05 | — |
| spread | 0.70 ± 0.27 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-defect · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 19.9 | 0.07 | — |
| 2 | 1 | 2 | 1 | 20.0 | 0.07 | — |
| 3 | 1 | 2 | 1 | 20.1 | 0.07 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-defect · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 3 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 4 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 5 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-regression · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 19.9 | 0.07 | — |
| 2 | 1 | 2 | 1 | 20.0 | 0.07 | — |
| 3 | 1 | 2 | 1 | 19.9 | 0.07 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-regression · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.8 | 0.04 | cites-location |
| 3 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 4 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 5 | 0.8 | 2 | 1 | 16.8 | 0.04 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-skipped · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0 | 17.5 | 0.04 | — |
| 2 | 1 | 1 | 0 | 17.5 | 0.04 | — |
| 3 | 1 | 1 | 0 | 17.6 | 0.04 | — |
| spread | 1.00 ± 0.00 | 1.00 ± 0.00 | 0.00 ± 0.00 |  |  |  |

### review-subtle · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 20.6 | 0.08 | cites-caller, finding-correct |
| 2 | 1 | 2 | 1 | 21.0 | 0.09 | — |
| 3 | 0.87 | 2 | 1 | 21.0 | 0.09 | no-false-defect |
| spread | 0.89 ± 0.10 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-subtle · bare · 3 run(s) · 2026-10-12T23:34

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.56 | 4 | 4 | 19.7 | 0.08 | convention-finding, no-false-defect |
| 2 | 0.78 | 5 | 4 | 21.0 | 0.09 | convention-finding |
| 3 | 0.78 | 4 | 4 | 21.5 | 0.09 | convention-finding |
| spread | 0.71 ± 0.13 | 4.33 ± 0.58 | 4.00 ± 0.00 |  |  |  |

### rules-migrate · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 7 | 7 | 25.4 | 0.11 | — |
| 2 | 1 | 8 | 7 | 25.2 | 0.11 | — |
| 3 | 0.78 | 5 | 5 | 23.9 | 0.09 | rules-faithful |
| spread | 0.93 ± 0.13 | 6.67 ± 1.53 | 6.33 ± 1.16 |  |  |  |

### task-fix · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 6 | 7 | 23.9 | 0.09 | — |
| 2 | 1 | 5 | 6 | 21.3 | 0.08 | — |
| 3 | 1 | 6 | 7 | 23.8 | 0.09 | — |
| spread | 1.00 ± 0.00 | 5.67 ± 0.58 | 6.67 ± 0.58 |  |  |  |

### task-fix · bare · 5 run(s) · 2026-10-12T21:21

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.67 | 3 | 2 | 16.4 | 0.04 | test-added |
| 2 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 3 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 4 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 5 | 0.67 | 3 | 2 | 16.4 | 0.04 | test-added |
| spread | 0.67 ± 0.00 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### task-multi · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 5 | 4 | 28.8 | 0.12 | — |
| 2 | 1 | 5 | 4 | 28.7 | 0.12 | — |
| 3 | 1 | 4 | 4 | 27.8 | 0.11 | — |
| spread | 1.00 ± 0.00 | 4.67 ± 0.58 | 4.00 ± 0.00 |  |  |  |

### task-multi · bare · 3 run(s) · 2026-10-12T23:33

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 10 | 9 | 24.3 | 0.12 | — |
| 2 | 1 | 10 | 9 | 23.9 | 0.12 | — |
| 3 | 1 | 9 | 9 | 23.9 | 0.12 | — |
| spread | 1.00 ± 0.00 | 9.67 ± 0.58 | 9.00 ± 0.00 |  |  |  |

### task-review-skipped · plugin · 3 run(s) · 2026-10-14T23:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 6 | 23.3 | 0.08 | — |
| 2 | 1 | 5 | 6 | 21.6 | 0.08 | — |
| 3 | 1 | 6 | 7 | 22.2 | 0.08 | — |
| spread | 1.00 ± 0.00 | 5.00 ± 1.00 | 6.33 ± 0.58 |  |  |  |
