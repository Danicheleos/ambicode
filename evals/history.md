# Skill coverage history

Latest run: 2026-10-10T16:17:17.754Z · plugin 0.5.1 · Claude Code 2.1.296 · model claude-sonnet-5-5 · 13 case(s) · mean score 0.89 · cost $1.37

Δ compares each case with its previous row. Failing graders are the latest run's, with the pass share when runs > 1.

## init

| case | score | cost $ | turns | runs | failing graders |
| --- | --- | --- | --- | --- | --- |
| init-auto | 1 | 0.1811 | 7 | 1 | — |

## investigate

| case | score | cost $ | turns | runs | failing graders |
| --- | --- | --- | --- | --- | --- |
| investigate-files | 0.778 | 0.084 | 4 | 1 | files-complete |
| investigate-how | 1 | 0.0738 | 7 | 1 | — |
| investigate-nomatch | 1 | 0.0504 | 2 | 1 | — |

## plan

| case | score | cost $ | turns | runs | failing graders |
| --- | --- | --- | --- | --- | --- |
| plan-accept | 1 | 0.1423 | 8 | 1 | — |
| plan-draft | 1 | 0.1271 | 9 | 1 | — |

## review

| case | score | cost $ | turns | runs | failing graders |
| --- | --- | --- | --- | --- | --- |
| review-clean | 1 | 0.1111 | 8 | 1 | — |
| review-defect | 1 | 0.0989 | 4 | 1 | — |
| review-regression | 0.909 | 0.0964 | 4 | 1 | check-recorded |
| review-skipped | 1 | 0.0682 | 5 | 1 | — |

## rules

| case | score | cost $ | turns | runs | failing graders |
| --- | --- | --- | --- | --- | --- |
| rules-migrate | 0.667 | 0.1101 | 6 | 1 | apply-recorded, drafts-recorded, route-done |

## task

| case | score | cost $ | turns | runs | failing graders |
| --- | --- | --- | --- | --- | --- |
| task-fix | 0.231 | 0.1005 | 10 | 1 | fix-correct, format-recorded, red-before-green, review-recorded, reviewer-invoked, route-done, test-added |
| task-review-skipped | 1 | 0.1227 | 11 | 1 | — |
