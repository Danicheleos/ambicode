# Skill coverage history

- **plugin** [longest run, turn by turn](chains/plugin-longest.md) · latest run 2026-10-12T14:06:08.152Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · plugin 0.5.1 · 13 case(s) · mean score 0.92 · cost $1.39
- **bare** [longest run, turn by turn](chains/bare-longest.md) · latest run 2026-10-12T13:57:57.724Z · claude-sonnet-5-5/low · Claude Code 2.1.296 · 8 case(s) · mean score 0.75 · cost $0.42

`plugin` is the full case score; `outcome` is its shared graders only (answer, code, boundary); `bare` is the same
shared graders with no plugin loaded; `lift` = outcome − bare, shown only when both rows ran the same model and effort.
`context` is the largest main-session context of the run in thousands of tokens (input + cache), plugin / bare.
Brackets: change against the previous row of the same arm. Failing graders are the latest plugin run's.

## init

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| init-auto | 0.857 | — | — | — | 0.171 | — | 7 | 24.2 | check-wired |

## investigate

| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | context k | failing graders |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| investigate-files | 1 (+0.22) | 1 | 0.667 | +0.33 | 0.0801 | 0.0591 | 4 / 7 | 21.7 / 17.5 | — |
| investigate-how | 0.778 (-0.22) | 0.6 | 1 | -0.40 | 0.0971 | 0.0575 | 11 / 6 | 23.0 / 17.4 | answer-correct |
| investigate-nomatch | 1 | 1 | 1 | 0.00 | 0.0508 | 0.0518 | 2 / 4 | 18.1 / 17.3 | — |

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
