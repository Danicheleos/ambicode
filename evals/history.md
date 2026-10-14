# Skill coverage history

- **plugin** [longest run, turn by turn](chains/plugin-longest.md) · latest run 2026-10-14T21:05:44.332Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · plugin 0.6.0 · 17 case(s) · mean score 0.98 · cost $2.49
- **bare** [longest run, turn by turn](chains/bare-longest.md) · latest run 2026-10-12T23:34:20.594Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 12 case(s) · mean score 0.84 · cost $2.87

`plugin` is the full case score; `outcome` is its shared graders only (answer, code, boundary); `bare` is the same
shared graders with no plugin loaded; `lift` = outcome − bare, shown only when both rows ran the same model, effort and case version.
`model calls/tools` are the distinct model calls and tool calls of the main session, plugin · bare. The harness `turns` counts every tool result, so parallel reads inflate it; the rows keep it, the tables do not show it.
`session s` is how long the session ran, plugin / bare, without the harness setup and graders that the rows' `seconds` also count.
`context` is the largest main-session context of the run in thousands of tokens (input + cache), plugin / bare.
Brackets: change against the previous row of the same arm. Failing graders are the latest plugin run's.

## init

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| init-auto | 0.889 (-0.04) | — | — | — | 0.1702 | — | — | 7/8 | 24.3 | check-wired |

## investigate

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| investigate-files | 1 | 1 | 1 | 0.00 | 0.0612 | 0.0535 | — / — | 2/1 · 3.7/2.7 | 19.9 / 17.3 | — |
| investigate-how | 1 | 1 | 1 | 0.00 | 0.061 | 0.0503 | — / — | 2/1 · 2.3/2.3 | 19.9 / 17.0 | — |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.0501 | 0.053 | — / — | 2/1 · 4/3 | 18.0 / 17.3 | — |
| investigate-trace | 1 (+0.06) | 1 | 0.958 (+0.03) | +0.04 | 0.1035 | 0.102 | — / — | 3/9 · 4.3/3.7 | 25.9 / 24.8 | — |

## plan

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan-accept | 1 (+0.18) | 1 | 0.867 (-0.05) | +0.13 | 0.1159 | 0.0663 | 33.4 / — | 6.3/6.3 · 3/2 | 24.3 / 17.5 | — |
| plan-draft | 1 | 1 | — | — | 0.1439 | — | — | 9/14 | 28.7 | — |
| plan-reuse | 1 (+0.06) | 1 | 0.6 (-0.16) | +0.40 | 0.2096 | 0.1216 | — / — | 10/10 · 4.7/4 | 37.4 / 27.0 | — |

## review

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 1 | 0.7 | +0.30 | 0.0787 | 0.0452 | — / — | 2/1 · 2/1 | 19.9 / 16.9 | — |
| review-defect | 1 | 1 | 0.8 | +0.20 | 0.0723 | 0.0464 | — / — | 2/1 · 2/1 | 20.3 / 16.9 | — |
| review-regression | 1 | 1 | 0.8 | +0.20 | 0.0725 | 0.0447 | — / — | 2/1 · 2/1 | 20.2 / 16.9 | — |
| review-skipped | 1 | 1 | — | — | 0.046 | — | — | 1/0 | 17.5 | — |
| review-subtle | 0.867 (+0.33) | 0.777 | 0.704 (+0.10) | +0.07 | 0.1292 | 0.0879 | 16.5 / — | 2/1 · 4.3/4 | 21.2 / 20.7 | cites-caller 0.33, finding-correct 0.33 |

## rules

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-migrate | 0.926 (+0.15) | — | — | — | 0.1319 | — | 20.9 | 5/5 | 25.1 | rules-faithful 0.67 |

## task

| case | plugin | outcome | bare | lift | plugin $ | bare $ | session s | model calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task-fix | 1 | 1 | 0.667 | — | 0.0751 | 0.0451 | — / — | 4/6 · 3/2 | 21.5 / 16.5 | — |
| task-multi | 1 | 1 | 1 (+0.03) | — | 0.1357 | 0.1202 | — / — | 8/14 · 9.7/9 | 28.8 / 24.0 | — |
| task-review-skipped | 1 | 1 | — | — | 0.0772 | — | — | 5/6 | 21.6 | — |

## Runs

Every run of the latest row, for the drift on one case. Recall: share of the files a right answer names that were
named. Precision: share of the named files that are right (or allowed). Mean ± sample standard deviation.

### investigate-files · plugin · 1 run(s) · 2026-10-14T00:23

recall 1.00 · precision 1.00 · F1 1.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 19.9 | 0.06 | — | — | — |
| spread | 1.00 |  |  |  | 2.00 | 1.00 |  |  |  |  |  |

### investigate-files · bare · 3 run(s) · 2026-10-12T23:31

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 4 | 3 | 17.4 | 0.06 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 4 | 3 | 17.5 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 2 | 17.0 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.67 ± 0.58 | 2.67 ± 0.58 |  |  |  |  |  |

### investigate-how · plugin · 1 run(s) · 2026-10-14T00:23

recall 1.00 · precision 1.00 · F1 1.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 19.9 | 0.06 | — | — | — |
| spread | 1.00 |  |  |  | 2.00 | 1.00 |  |  |  |  |  |

### investigate-how · bare · 3 run(s) · 2026-10-12T23:31

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 16.9 | 0.05 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 5 | 17.4 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 2 | 1 | 16.9 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.33 ± 0.58 | 2.33 ± 2.31 |  |  |  |  |  |

### investigate-nomatch · plugin · 1 run(s) · 2026-10-14T00:23

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| spread | 1.00 | 2.00 | 1.00 |  |  |  |

### investigate-nomatch · bare · 3 run(s) · 2026-10-12T23:31

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 3 | 17.3 | 0.05 | — |
| 2 | 1 | 4 | 3 | 17.2 | 0.05 | — |
| 3 | 1 | 4 | 3 | 17.4 | 0.05 | — |
| spread | 1.00 ± 0.00 | 4.00 ± 0.00 | 3.00 ± 0.00 |  |  |  |

### investigate-trace · plugin · 1 run(s) · 2026-10-14T00:23

recall 0.86 · precision 1.00 · F1 0.92

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 0.86 | 1 | 0.92 | 3 | 9 | 25.9 | 0.1 | src/notifications/channels.js | — | — |
| spread | 1.00 |  |  |  | 3.00 | 9.00 |  |  |  |  |  |

### investigate-trace · bare · 3 run(s) · 2026-10-12T23:32

recall 1.00 ± 0.00 · precision 0.94 ± 0.06 · F1 0.97 ± 0.03

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0.94 | 0.97 | 4 | 4 | 25.5 | 0.11 | — | src/notifications/queue.js | — |
| 2 | 1 | 1 | 1 | 1 | 4 | 3 | 24.3 | 0.1 | — | — | — |
| 3 | 0.88 | 1 | 0.88 | 0.93 | 5 | 4 | 24.7 | 0.1 | — | src/legacy/payment-hooks.js, src/notifications/queue.js | files-skip-legacy |
| spread | 0.96 ± 0.07 |  |  |  | 4.33 ± 0.58 | 3.67 ± 0.58 |  |  |  |  |  |

### plan-accept · plugin · 3 run(s) · 2026-10-14T14:53

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 7 | 7 | 24.9 | 0.12 | — |
| 2 | 1 | 6 | 6 | 24.3 | 0.12 | — |
| 3 | 1 | 6 | 6 | 23.7 | 0.11 | — |
| spread | 1.00 ± 0.00 | 6.33 ± 0.58 | 6.33 ± 0.58 |  |  |  |

### plan-accept · bare · 3 run(s) · 2026-10-12T23:32

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 3 | 2 | 17.6 | 0.07 | plan-quality |
| 2 | 1 | 3 | 2 | 17.3 | 0.07 | — |
| 3 | 1 | 3 | 2 | 17.6 | 0.07 | — |
| spread | 0.87 ± 0.23 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### plan-reuse · bare · 3 run(s) · 2026-10-12T23:32

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 5 | 4 | 26.0 | 0.12 | plan-quality |
| 2 | 0.6 | 4 | 4 | 27.2 | 0.12 | plan-quality |
| 3 | 0.6 | 5 | 4 | 27.6 | 0.13 | plan-quality |
| spread | 0.60 ± 0.00 | 4.67 ± 0.58 | 4.00 ± 0.00 |  |  |  |

### review-clean · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.5 | 2 | 1 | 16.9 | 0.04 | no-false-defect |
| 2 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| 3 | 1 | 2 | 1 | 16.9 | 0.05 | — |
| 4 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| 5 | 1 | 2 | 1 | 17.0 | 0.05 | — |
| spread | 0.70 ± 0.27 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-defect · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 3 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 4 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 5 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-regression · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.8 | 0.04 | cites-location |
| 3 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 4 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 5 | 0.8 | 2 | 1 | 16.8 | 0.04 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-subtle · plugin · 3 run(s) · 2026-10-14T14:53

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 21.1 | 0.12 | cites-caller, finding-correct |
| 2 | 0.8 | 2 | 1 | 21.2 | 0.13 | cites-caller, finding-correct |
| 3 | 1 | 2 | 1 | 21.2 | 0.13 | — |
| spread | 0.87 ± 0.12 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-subtle · bare · 3 run(s) · 2026-10-12T23:34

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.56 | 4 | 4 | 19.7 | 0.08 | convention-finding, no-false-defect |
| 2 | 0.78 | 5 | 4 | 21.0 | 0.09 | convention-finding |
| 3 | 0.78 | 4 | 4 | 21.5 | 0.09 | convention-finding |
| spread | 0.71 ± 0.13 | 4.33 ± 0.58 | 4.00 ± 0.00 |  |  |  |

### rules-migrate · plugin · 3 run(s) · 2026-10-14T21:05

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 5 | 5 | 25.0 | 0.13 | — |
| 2 | 0.78 | 5 | 5 | 24.9 | 0.13 | rules-faithful |
| 3 | 1 | 5 | 5 | 25.4 | 0.13 | — |
| spread | 0.93 ± 0.13 | 5.00 ± 0.00 | 5.00 ± 0.00 |  |  |  |

### task-fix · bare · 5 run(s) · 2026-10-12T21:21

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.67 | 3 | 2 | 16.4 | 0.04 | test-added |
| 2 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 3 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 4 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 5 | 0.67 | 3 | 2 | 16.4 | 0.04 | test-added |
| spread | 0.67 ± 0.00 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### task-multi · bare · 3 run(s) · 2026-10-12T23:33

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 10 | 9 | 24.3 | 0.12 | — |
| 2 | 1 | 10 | 9 | 23.9 | 0.12 | — |
| 3 | 1 | 9 | 9 | 23.9 | 0.12 | — |
| spread | 1.00 ± 0.00 | 9.67 ± 0.58 | 9.00 ± 0.00 |  |  |  |
