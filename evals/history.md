# Skill coverage history

- **plugin** latest run 2026-10-12T05:21:32.567Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · plugin 0.5.1 · 13 case(s) · mean score 0.96 · cost $1.4
- **bare** latest run 2026-10-12T05:20:56.213Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 8 case(s) · mean score 0.75 · cost $0.52

`plugin` is the full case score; `outcome` is its shared graders only (answer, code, boundary); `bare` is the same
shared graders with no plugin loaded; `lift` = outcome − bare, shown only when both rows ran the same model and effort.
Brackets: change against the previous row of the same arm. Failing graders are the latest plugin run's.

## init

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| init-auto | 0.857 (-0.14) | — | — | — | 0.1804 | — | 8 | check-wired |

## investigate

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| investigate-files | 0.778 | 0.667 | 0.667 | 0.00 | 0.077 | 0.0864 | 7 / 6 | files-complete |
| investigate-how | 1 | 1 | 1 | 0.00 | 0.0781 | 0.0817 | 7 / 6 | — |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.0509 | 0.0813 | 2 / 4 | — |

## plan

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plan-accept | 1 | 1 | 0.6 | +0.40 | 0.1197 | 0.0898 | 7 / 3 | — |
| plan-draft | 1 | 1 | — | — | 0.1172 | — | 6 | — |

## review

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 1 | 0.5 | +0.50 | 0.1083 | 0.0453 | 6 / 2 | — |
| review-defect | 1 | 1 | 0.8 | +0.20 | 0.0977 | 0.046 | 4 / 2 | — |
| review-regression | 0.909 | 1 | 0.8 | +0.20 | 0.1206 | 0.0466 | 9 / 2 | check-recorded |
| review-skipped | 1 | 1 | — | — | 0.0479 | — | 1 | — |

## rules

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-migrate | 1 (+0.33) | — | — | — | 0.1586 | — | 15 | — |

## task

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| task-fix | 1 (+0.77) | 1 | 0.667 | +0.33 | 0.1348 | 0.0452 | 12 / 3 | — |
| task-review-skipped | 1 | 1 | — | — | 0.1109 | — | 10 | — |
