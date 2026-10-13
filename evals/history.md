# Skill coverage history

- **plugin** [longest run, turn by turn](chains/plugin-longest.md) · latest run 2026-10-13T01:10:20.380Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · plugin 0.6.0 · 17 case(s) · mean score 0.96 · cost $6.06
- **bare** [longest run, turn by turn](chains/bare-longest.md) · latest run 2026-10-12T23:34:20.594Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 12 case(s) · mean score 0.84 · cost $2.87

`plugin` is the full case score; `outcome` is its shared graders only (answer, code, boundary); `bare` is the same
shared graders with no plugin loaded; `lift` = outcome − bare, shown only when both rows ran the same model, effort and case version.
`calls/tools` are the distinct model calls and tool calls of the main session (the harness turn count is about tool calls + 1), plugin · bare.
`context` is the largest main-session context of the run in thousands of tokens (input + cache), plugin / bare.
Brackets: change against the previous row of the same arm. Failing graders are the latest plugin run's.

## init

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| init-auto | 0.926 (+0.15) | — | — | — | 0.1546 | — | 7.7/7.7 | 23.9 | check-wired 0.33 |

## investigate

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| investigate-files | 1 | 1 | 1 | 0.00 | 0.0683 | 0.0535 | 2.7/1.3 · 3.7/2.7 | 20.2 / 17.3 | — |
| investigate-how | 1 | 1 | 1 | 0.00 | 0.0688 | 0.0503 | 2.7/1.3 · 2.3/2.3 | 20.5 / 17.0 | — |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.0499 | 0.053 | 2/1 · 4/3 | 18.0 / 17.3 | — |
| investigate-trace | 0.944 (-0.04) | 0.917 | 0.958 (+0.03) | -0.04 | 0.1423 | 0.102 | 4.7/7.3 · 4.3/3.7 | 29.9 / 24.8 | answer-correct 0.67 |

## plan

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan-accept | 0.879 (-0.08) | 0.732 | 0.867 (-0.05) | -0.14 | 0.1057 | 0.0663 | 6/6 · 3/2 | 23.5 / 17.5 | plan-quality 0.33 |
| plan-draft | 1 | 1 | — | — | 0.1105 | — | 6.3/8 | 24.3 | — |
| plan-reuse | 0.939 (+0.10) | 0.868 | 0.6 (-0.16) | +0.27 | 0.1639 | 0.1216 | 6.3/6.7 · 4.7/4 | 32.9 / 27.0 | plan-quality 0.67 |

## review

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 1 | 0.7 | +0.30 | 0.1076 | 0.0452 | 8.3/7.7 · 2/1 | 23.0 / 16.9 | — |
| review-defect | 1 | 1 | 0.8 | +0.20 | 0.1231 | 0.0464 | 10/9 · 2/1 | 24.1 / 16.9 | — |
| review-regression | 0.97 (-0.03) | 1 | 0.8 | +0.20 | 0.1394 | 0.0447 | 13.3/12.3 · 2/1 | 25.3 / 16.9 | check-recorded 0.67 |
| review-skipped | 1 | 1 | — | — | 0.0583 | — | 1.7/0.3 | 17.7 | — |
| review-subtle | 0.822 (+0.31) | 0.778 | 0.704 (+0.10) | +0.07 | 0.1471 | 0.0879 | 8.7/8.3 · 4.3/4 | 25.9 / 20.7 | finding-correct 0.33, no-false-defect 0.67, part4-fenced 0.67, route-done 0.67 |

## rules

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-migrate | 1 (+0.56) | — | — | — | 0.1009 | — | 5/5 | 24.5 | — |

## task

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task-fix | 1 | 1 | 0.667 | +0.33 | 0.1577 | 0.0451 | 12.3/13.7 · 3/2 | 28.8 / 16.5 | — |
| task-multi | 0.889 (-0.09) | 1 | 1 (+0.03) | 0.00 | 0.2088 | 0.1202 | 15.7/16 · 9.7/9 | 33.4 / 24.0 | report-sections 0.33, review-recorded 0.67, reviewer-invoked 0.67, route-done 0.33 |
| task-review-skipped | 0.963 (-0.04) | 1 | — | — | 0.1124 | — | 8.7/9.7 | 25.8 | report-sections 0.67 |

## Runs

Every run of the latest row, for the drift on one case. Recall: share of the files a right answer names that were
named. Precision: share of the named files that are right (or allowed). Mean ± sample standard deviation.

### init-auto · plugin · 3 run(s) · 2026-10-13T00:04

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.89 | 7 | 7 | 23.8 | 0.16 | check-wired |
| 2 | 0.89 | 8 | 8 | 23.9 | 0.16 | check-wired |
| 3 | 1 | 8 | 8 | 24.1 | 0.15 | — |
| spread | 0.93 ± 0.06 | 7.67 ± 0.58 | 7.67 ± 0.58 |  |  |  |

### investigate-files · plugin · 3 run(s) · 2026-10-12T23:35

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 4 | 2 | 21.0 | 0.08 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 2 | 1 | 19.9 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 2 | 1 | 19.7 | 0.06 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.67 ± 1.16 | 1.33 ± 0.58 |  |  |  |  |  |

### investigate-files · bare · 3 run(s) · 2026-10-12T23:31

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 4 | 3 | 17.4 | 0.06 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 4 | 3 | 17.5 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 2 | 17.0 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.67 ± 0.58 | 2.67 ± 0.58 |  |  |  |  |  |

### investigate-how · plugin · 3 run(s) · 2026-10-12T23:36

recall 1.00 ± 0.00 · precision 0.92 ± 0.14 · F1 0.95 ± 0.08

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0.75 | 0.86 | 3 | 2 | 19.9 | 0.07 | — | src/app.ts | — |
| 2 | 1 | 1 | 1 | 1 | 2 | 1 | 19.7 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 1 | 22.1 | 0.08 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.67 ± 0.58 | 1.33 ± 0.58 |  |  |  |  |  |

### investigate-how · bare · 3 run(s) · 2026-10-12T23:31

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 16.9 | 0.05 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 5 | 17.4 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 2 | 1 | 16.9 | 0.05 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.33 ± 0.58 | 2.33 ± 2.31 |  |  |  |  |  |

### investigate-nomatch · plugin · 3 run(s) · 2026-10-12T23:36

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| 2 | 1 | 2 | 1 | 17.9 | 0.05 | — |
| 3 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### investigate-nomatch · bare · 3 run(s) · 2026-10-12T23:31

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 3 | 17.3 | 0.05 | — |
| 2 | 1 | 4 | 3 | 17.2 | 0.05 | — |
| 3 | 1 | 4 | 3 | 17.4 | 0.05 | — |
| spread | 1.00 ± 0.00 | 4.00 ± 0.00 | 3.00 ± 0.00 |  |  |  |

### investigate-trace · plugin · 3 run(s) · 2026-10-12T23:36

recall 0.86 ± 0.00 · precision 1.00 ± 0.00 · F1 0.92 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 0.86 | 1 | 0.92 | 6 | 4 | 30.1 | 0.15 | src/notifications/channels.js | — | — |
| 2 | 1 | 0.86 | 1 | 0.92 | 4 | 9 | 29.9 | 0.13 | src/notifications/channels.js | — | — |
| 3 | 0.83 | 0.86 | 1 | 0.92 | 4 | 9 | 29.7 | 0.14 | src/notifications/channels.js | — | answer-correct |
| spread | 0.94 ± 0.10 |  |  |  | 4.67 ± 1.16 | 7.33 ± 2.89 |  |  |  |  |  |

### investigate-trace · bare · 3 run(s) · 2026-10-12T23:32

recall 1.00 ± 0.00 · precision 0.94 ± 0.06 · F1 0.97 ± 0.03

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0.94 | 0.97 | 4 | 4 | 25.5 | 0.11 | — | src/notifications/queue.js | — |
| 2 | 1 | 1 | 1 | 1 | 4 | 3 | 24.3 | 0.1 | — | — | — |
| 3 | 0.88 | 1 | 0.88 | 0.93 | 5 | 4 | 24.7 | 0.1 | — | src/legacy/payment-hooks.js, src/notifications/queue.js | files-skip-legacy |
| spread | 0.96 ± 0.07 |  |  |  | 4.33 ± 0.58 | 3.67 ± 0.58 |  |  |  |  |  |

### plan-accept · plugin · 3 run(s) · 2026-10-12T23:37

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 6 | 6 | 23.4 | 0.11 | — |
| 2 | 0.82 | 6 | 6 | 24.3 | 0.11 | plan-quality |
| 3 | 0.82 | 6 | 6 | 22.8 | 0.1 | plan-quality |
| spread | 0.88 ± 0.10 | 6.00 ± 0.00 | 6.00 ± 0.00 |  |  |  |

### plan-accept · bare · 3 run(s) · 2026-10-12T23:32

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 3 | 2 | 17.6 | 0.07 | plan-quality |
| 2 | 1 | 3 | 2 | 17.3 | 0.07 | — |
| 3 | 1 | 3 | 2 | 17.6 | 0.07 | — |
| spread | 0.87 ± 0.23 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### plan-draft · plugin · 3 run(s) · 2026-10-12T23:37

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 6 | 6 | 23.9 | 0.1 | — |
| 2 | 1 | 6 | 6 | 24.6 | 0.11 | — |
| 3 | 1 | 7 | 12 | 24.5 | 0.12 | — |
| spread | 1.00 ± 0.00 | 6.33 ± 0.58 | 8.00 ± 3.46 |  |  |  |

### plan-reuse · plugin · 3 run(s) · 2026-10-12T23:38

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 6 | 6 | 30.8 | 0.15 | — |
| 2 | 1 | 7 | 7 | 34.4 | 0.17 | — |
| 3 | 0.82 | 6 | 7 | 33.3 | 0.17 | plan-quality |
| spread | 0.94 ± 0.10 | 6.33 ± 0.58 | 6.67 ± 0.58 |  |  |  |

### plan-reuse · bare · 3 run(s) · 2026-10-12T23:32

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 5 | 4 | 26.0 | 0.12 | plan-quality |
| 2 | 0.6 | 4 | 4 | 27.2 | 0.12 | plan-quality |
| 3 | 0.6 | 5 | 4 | 27.6 | 0.13 | plan-quality |
| spread | 0.60 ± 0.00 | 4.67 ± 0.58 | 4.00 ± 0.00 |  |  |  |

### review-clean · plugin · 3 run(s) · 2026-10-13T01:06

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 7 | 6 | 22.8 | 0.1 | — |
| 2 | 1 | 9 | 9 | 23.1 | 0.11 | — |
| 3 | 1 | 9 | 8 | 23.1 | 0.11 | — |
| spread | 1.00 ± 0.00 | 8.33 ± 1.16 | 7.67 ± 1.53 |  |  |  |

### review-clean · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.5 | 2 | 1 | 16.9 | 0.04 | no-false-defect |
| 2 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| 3 | 1 | 2 | 1 | 16.9 | 0.05 | — |
| 4 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| 5 | 1 | 2 | 1 | 17.0 | 0.05 | — |
| spread | 0.70 ± 0.27 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-defect · plugin · 3 run(s) · 2026-10-13T01:06

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 8 | 7 | 23.6 | 0.11 | — |
| 2 | 1 | 9 | 8 | 23.0 | 0.11 | — |
| 3 | 1 | 13 | 12 | 25.7 | 0.15 | — |
| spread | 1.00 ± 0.00 | 10.00 ± 2.65 | 9.00 ± 2.65 |  |  |  |

### review-defect · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 3 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 4 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 5 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-regression · plugin · 3 run(s) · 2026-10-13T01:07

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.91 | 10 | 9 | 24.1 | 0.12 | check-recorded |
| 2 | 1 | 11 | 10 | 24.5 | 0.12 | — |
| 3 | 1 | 19 | 18 | 27.4 | 0.17 | — |
| spread | 0.97 ± 0.05 | 13.33 ± 4.93 | 12.33 ± 4.93 |  |  |  |

### review-regression · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.8 | 0.04 | cites-location |
| 3 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 4 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 5 | 0.8 | 2 | 1 | 16.8 | 0.04 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-skipped · plugin · 3 run(s) · 2026-10-13T01:10

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0 | 17.4 | 0.04 | — |
| 2 | 1 | 1 | 0 | 17.4 | 0.05 | — |
| 3 | 1 | 3 | 1 | 18.3 | 0.09 | — |
| spread | 1.00 ± 0.00 | 1.67 ± 1.16 | 0.33 ± 0.58 |  |  |  |

### review-subtle · plugin · 3 run(s) · 2026-10-13T01:05

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.73 | 8 | 8 | 26.2 | 0.14 | finding-correct, no-false-defect |
| 2 | 0.87 | 10 | 9 | 26.5 | 0.15 | finding-correct |
| 3 | 0.87 | 8 | 8 | 25.2 | 0.15 | part4-fenced, route-done |
| spread | 0.82 ± 0.08 | 8.67 ± 1.16 | 8.33 ± 0.58 |  |  |  |

### review-subtle · bare · 3 run(s) · 2026-10-12T23:34

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.56 | 4 | 4 | 19.7 | 0.08 | convention-finding, no-false-defect |
| 2 | 0.78 | 5 | 4 | 21.0 | 0.09 | convention-finding |
| 3 | 0.78 | 4 | 4 | 21.5 | 0.09 | convention-finding |
| spread | 0.71 ± 0.13 | 4.33 ± 0.58 | 4.00 ± 0.00 |  |  |  |

### rules-migrate · plugin · 3 run(s) · 2026-10-12T23:42

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 5 | 5 | 24.5 | 0.1 | — |
| 2 | 1 | 5 | 5 | 24.5 | 0.1 | — |
| 3 | 1 | 5 | 5 | 24.4 | 0.1 | — |
| spread | 1.00 ± 0.00 | 5.00 ± 0.00 | 5.00 ± 0.00 |  |  |  |

### task-fix · plugin · 3 run(s) · 2026-10-13T00:20

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 12 | 15 | 29.7 | 0.16 | — |
| 2 | 1 | 13 | 14 | 28.8 | 0.16 | — |
| 3 | 1 | 12 | 12 | 27.9 | 0.16 | — |
| spread | 1.00 ± 0.00 | 12.33 ± 0.58 | 13.67 ± 1.53 |  |  |  |

### task-fix · bare · 5 run(s) · 2026-10-12T21:21

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.67 | 3 | 2 | 16.4 | 0.04 | test-added |
| 2 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 3 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 4 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 5 | 0.67 | 3 | 2 | 16.4 | 0.04 | test-added |
| spread | 0.67 ± 0.00 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### task-multi · plugin · 3 run(s) · 2026-10-13T01:10

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.89 | 18 | 16 | 34.6 | 0.23 | report-sections, route-done |
| 2 | 1 | 16 | 20 | 35.7 | 0.23 | — |
| 3 | 0.78 | 13 | 12 | 29.9 | 0.16 | report-sections, review-recorded, reviewer-invoked, route-done |
| spread | 0.89 ± 0.11 | 15.67 ± 2.52 | 16.00 ± 4.00 |  |  |  |

### task-multi · bare · 3 run(s) · 2026-10-12T23:33

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 10 | 9 | 24.3 | 0.12 | — |
| 2 | 1 | 10 | 9 | 23.9 | 0.12 | — |
| 3 | 1 | 9 | 9 | 23.9 | 0.12 | — |
| spread | 1.00 ± 0.00 | 9.67 ± 0.58 | 9.00 ± 0.00 |  |  |  |

### task-review-skipped · plugin · 3 run(s) · 2026-10-13T00:22

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.89 | 7 | 8 | 23.9 | 0.1 | report-sections |
| 2 | 1 | 10 | 11 | 28.0 | 0.13 | — |
| 3 | 1 | 9 | 10 | 25.4 | 0.11 | — |
| spread | 0.96 ± 0.06 | 8.67 ± 1.53 | 9.67 ± 1.53 |  |  |  |
