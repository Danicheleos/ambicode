# Skill coverage history

- **plugin** [longest run, turn by turn](chains/plugin-longest.md) · latest run 2026-10-12T21:07:42.937Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · plugin 0.5.1 · 13 case(s) · mean score 0.92 · cost $5.94
- **bare** [longest run, turn by turn](chains/bare-longest.md) · latest run 2026-10-12T21:09:41.525Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 8 case(s) · mean score 0.82 · cost $2.04

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
| investigate-files | 1 | 1 | 1 (+0.07) | 0.00 | 0.0705 | 0.0536 | 3/2 · 3.4/4.2 | 20.3 / 17.2 | — |
| investigate-how | 1 | 1 | 1 | 0.00 | 0.0741 | 0.0533 | 3.2/2.2 · 2.6/4 | 20.7 / 17.2 | — |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.0507 | 0.0538 | 2/1 · 4.2/3.2 | 18.0 / 17.4 | — |

## plan

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan-accept | 0.891 | 0.76 | 0.6 | +0.16 | 0.1266 | 0.0659 | 6.4/7.2 · 3/2.2 | 26.3 / 17.5 | plan-quality 0.4 |
| plan-draft | 1 | 1 | — | — | 0.1295 | — | 7/12.2 | 26.9 | — |

## review

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 1 | 0.7 | +0.30 | 0.1158 | 0.0452 | 8.6/7.6 · 2/1 | 23.6 / 16.9 | — |
| review-defect | 0.873 (-0.13) | 0.96 | 0.8 | +0.16 | 0.1099 | 0.0464 | 7.4/6.4 · 2/1 | 23.4 / 16.9 | cites-location 0.8, finding-recorded 0.8, part4-fenced 0.8, review-recorded 0.8, reviewer-invoked 0.8, route-done 0.8 |
| review-regression | 1 (+0.07) | 1 | 0.8 | +0.20 | 0.1582 | 0.0447 | 14.6/13.6 · 2/1 | 27.8 / 16.9 | — |
| review-skipped | 0.943 (-0.06) | 1 | — | — | 0.0474 | — | 1/0 | 17.7 | skip-stated 0.8 |

## rules

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-migrate | 0.444 (-0.56) | — | — | — | 0.1126 | — | —/— | 26.0 | apply-recorded, drafts-recorded, route-done, rules-faithful |

## task

| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task-fix | 1 (+0.15) | 1 | 0.667 | +0.33 | 0.1448 | 0.0452 | 10.6/10.4 · 3/2 | 27.3 / 16.5 | — |
| task-review-skipped | 1 (+0.11) | 1 | — | — | 0.1031 | — | 7.6/7.6 | 24.3 | — |

## Runs

Every run of the latest row, for the drift on one case. Recall: share of the files a right answer names that were
named. Precision: share of the named files that are right (or allowed). Mean ± sample standard deviation.

### investigate-files · plugin · 5 run(s) · 2026-10-12T19:59

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 3 | 2 | 20.4 | 0.07 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 2 | 20.3 | 0.07 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 2 | 20.3 | 0.07 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | 3 | 2 | 20.1 | 0.07 | — | — | — |
| 5 | 1 | 1 | 1 | 1 | 3 | 2 | 20.3 | 0.07 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |  |  |

### investigate-files · bare · 5 run(s) · 2026-10-12T19:59

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 3 | 4 | 17.0 | 0.05 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 4 | 5 | 17.3 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 2 | 17.0 | 0.05 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | 3 | 4 | 17.0 | 0.05 | — | — | — |
| 5 | 1 | 1 | 1 | 1 | 4 | 6 | 17.6 | 0.06 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.40 ± 0.55 | 4.20 ± 1.48 |  |  |  |  |  |

### investigate-how · plugin · 5 run(s) · 2026-10-12T19:59

recall 1.00 ± 0.00 · precision 0.96 ± 0.09 · F1 0.98 ± 0.05

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 3 | 2 | 20.5 | 0.07 | — | — | — |
| 2 | 1 | 1 | 0.8 | 0.89 | 4 | 3 | 22.2 | 0.09 | — | .ambicode/tasks/inv-how/investigation_2026-10-12T22-00-2.md | — |
| 3 | 1 | 1 | 1 | 1 | 3 | 2 | 20.4 | 0.07 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | 3 | 2 | 20.3 | 0.07 | — | — | — |
| 5 | 1 | 1 | 1 | 1 | 3 | 2 | 20.2 | 0.07 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 3.20 ± 0.45 | 2.20 ± 0.45 |  |  |  |  |  |

### investigate-how · bare · 5 run(s) · 2026-10-12T19:59

recall 1.00 ± 0.00 · precision 1.00 ± 0.00 · F1 1.00 ± 0.00

| run | score | recall | precision | F1 | calls | tools | context k | $ | missed | extra | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 1 | 1 | 2 | 1 | 16.9 | 0.05 | — | — | — |
| 2 | 1 | 1 | 1 | 1 | 3 | 6 | 17.5 | 0.06 | — | — | — |
| 3 | 1 | 1 | 1 | 1 | 2 | 1 | 16.7 | 0.05 | — | — | — |
| 4 | 1 | 1 | 1 | 1 | 3 | 5 | 17.4 | 0.06 | — | — | — |
| 5 | 1 | 1 | 1 | 1 | 3 | 7 | 17.7 | 0.06 | — | — | — |
| spread | 1.00 ± 0.00 |  |  |  | 2.60 ± 0.55 | 4.00 ± 2.83 |  |  |  |  |  |

### investigate-nomatch · plugin · 5 run(s) · 2026-10-12T19:59

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2 | 1 | 17.8 | 0.05 | — |
| 2 | 1 | 2 | 1 | 18.1 | 0.05 | — |
| 3 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| 4 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| 5 | 1 | 2 | 1 | 18.0 | 0.05 | — |
| spread | 1.00 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### investigate-nomatch · bare · 5 run(s) · 2026-10-12T19:59

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 | 3 | 17.3 | 0.05 | — |
| 2 | 1 | 4 | 3 | 17.5 | 0.05 | — |
| 3 | 1 | 4 | 3 | 17.1 | 0.05 | — |
| 4 | 1 | 5 | 4 | 17.8 | 0.06 | — |
| 5 | 1 | 4 | 3 | 17.3 | 0.05 | — |
| spread | 1.00 ± 0.00 | 4.20 ± 0.45 | 3.20 ± 0.45 |  |  |  |

### plan-accept · plugin · 5 run(s) · 2026-10-12T21:07

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 6 | 6 | 25.8 | 0.12 | — |
| 2 | 0.82 | 9 | 13 | 30.8 | 0.17 | plan-quality |
| 3 | 0.82 | 5 | 5 | 24.9 | 0.11 | plan-quality |
| 4 | 1 | 6 | 6 | 25.4 | 0.12 | — |
| 5 | 0.82 | 6 | 6 | 24.5 | 0.11 | plan-quality |
| spread | 0.89 ± 0.10 | 6.40 ± 1.52 | 7.20 ± 3.27 |  |  |  |

### plan-accept · bare · 5 run(s) · 2026-10-12T21:09

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.6 | 3 | 3 | 17.6 | 0.07 | plan-quality |
| 2 | 0.6 | 3 | 2 | 17.6 | 0.07 | plan-quality |
| 3 | 0.6 | 3 | 2 | 17.3 | 0.07 | plan-quality |
| 4 | 0.6 | 3 | 2 | 17.4 | 0.06 | plan-quality |
| 5 | 0.6 | 3 | 2 | 17.5 | 0.06 | plan-quality |
| spread | 0.60 ± 0.00 | 3.00 ± 0.00 | 2.20 ± 0.45 |  |  |  |

### plan-draft · plugin · 5 run(s) · 2026-10-12T21:07

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 7 | 17 | 29.2 | 0.14 | — |
| 2 | 1 | 7 | 14 | 25.9 | 0.13 | — |
| 3 | 1 | 8 | 17 | 28.6 | 0.14 | — |
| 4 | 1 | 6 | 6 | 25.4 | 0.12 | — |
| 5 | 1 | 7 | 7 | 25.6 | 0.12 | — |
| spread | 1.00 ± 0.00 | 7.00 ± 0.71 | 12.20 ± 5.36 |  |  |  |

### review-clean · plugin · 5 run(s) · 2026-10-12T20:02

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 9 | 8 | 24.0 | 0.12 | — |
| 2 | 1 | 8 | 7 | 23.0 | 0.12 | — |
| 3 | 1 | 9 | 8 | 23.8 | 0.12 | — |
| 4 | 1 | 8 | 7 | 23.5 | 0.11 | — |
| 5 | 1 | 9 | 8 | 23.6 | 0.12 | — |
| spread | 1.00 ± 0.00 | 8.60 ± 0.55 | 7.60 ± 0.55 |  |  |  |

### review-clean · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.5 | 2 | 1 | 16.9 | 0.04 | no-false-defect |
| 2 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| 3 | 1 | 2 | 1 | 16.9 | 0.05 | — |
| 4 | 0.5 | 2 | 1 | 16.9 | 0.05 | no-false-defect |
| 5 | 1 | 2 | 1 | 17.0 | 0.05 | — |
| spread | 0.70 ± 0.27 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-defect · plugin · 5 run(s) · 2026-10-12T20:02

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 8 | 7 | 24.5 | 0.12 | — |
| 2 | 0.36 | 6 | 5 | 20.4 | 0.08 | cites-location, finding-recorded, part4-fenced, review-recorded, reviewer-invoked, route-done |
| 3 | 1 | 8 | 7 | 24.0 | 0.12 | — |
| 4 | 1 | 7 | 6 | 24.0 | 0.12 | — |
| 5 | 1 | 8 | 7 | 24.1 | 0.12 | — |
| spread | 0.87 ± 0.29 | 7.40 ± 0.89 | 6.40 ± 0.89 |  |  |  |

### review-defect · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 3 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 4 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| 5 | 0.8 | 2 | 1 | 16.9 | 0.05 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-regression · plugin · 5 run(s) · 2026-10-12T20:02

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 18 | 17 | 30.1 | 0.18 | — |
| 2 | 1 | 15 | 14 | 27.8 | 0.16 | — |
| 3 | 1 | 11 | 10 | 25.9 | 0.14 | — |
| 4 | 1 | 11 | 10 | 25.6 | 0.13 | — |
| 5 | 1 | 18 | 17 | 29.9 | 0.18 | — |
| spread | 1.00 ± 0.00 | 14.60 ± 3.51 | 13.60 ± 3.51 |  |  |  |

### review-regression · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 2 | 0.8 | 2 | 1 | 16.8 | 0.04 | cites-location |
| 3 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 4 | 0.8 | 2 | 1 | 16.9 | 0.04 | cites-location |
| 5 | 0.8 | 2 | 1 | 16.8 | 0.04 | cites-location |
| spread | 0.80 ± 0.00 | 2.00 ± 0.00 | 1.00 ± 0.00 |  |  |  |

### review-skipped · plugin · 5 run(s) · 2026-10-12T20:02

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0 | 17.7 | 0.05 | — |
| 2 | 0.71 | 1 | 0 | 17.6 | 0.05 | skip-stated |
| 3 | 1 | 1 | 0 | 17.7 | 0.05 | — |
| 4 | 1 | 1 | 0 | 17.7 | 0.05 | — |
| 5 | 1 | 1 | 0 | 17.6 | 0.05 | — |
| spread | 0.94 ± 0.13 | 1.00 ± 0.00 | 0.00 ± 0.00 |  |  |  |

### task-fix · plugin · 5 run(s) · 2026-10-12T20:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 10 | 10 | 27.9 | 0.14 | — |
| 2 | 1 | 11 | 10 | 27.9 | 0.16 | — |
| 3 | 1 | 12 | 11 | 27.1 | 0.14 | — |
| 4 | 1 | 10 | 11 | 26.8 | 0.14 | — |
| 5 | 1 | 10 | 10 | 27.0 | 0.14 | — |
| spread | 1.00 ± 0.00 | 10.60 ± 0.89 | 10.40 ± 0.55 |  |  |  |

### task-fix · bare · 5 run(s) · 2026-10-12T20:01

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.67 | 3 | 2 | 16.5 | 0.04 | test-added |
| 2 | 0.67 | 3 | 2 | 16.5 | 0.04 | test-added |
| 3 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 4 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| 5 | 0.67 | 3 | 2 | 16.5 | 0.05 | test-added |
| spread | 0.67 ± 0.00 | 3.00 ± 0.00 | 2.00 ± 0.00 |  |  |  |

### task-review-skipped · plugin · 5 run(s) · 2026-10-12T20:45

| run | score | calls | tools | context k | $ | failing graders |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 8 | 8 | 24.6 | 0.11 | — |
| 2 | 1 | 7 | 6 | 23.6 | 0.09 | — |
| 3 | 1 | 8 | 8 | 24.7 | 0.11 | — |
| 4 | 1 | 8 | 8 | 25.0 | 0.11 | — |
| 5 | 1 | 7 | 8 | 23.8 | 0.1 | — |
| spread | 1.00 ± 0.00 | 7.60 ± 0.55 | 7.60 ± 0.89 |  |  |  |
