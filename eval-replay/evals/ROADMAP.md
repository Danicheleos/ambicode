# Roadmap: plugin training

Updated 2026-10-09. Source of truth for thresholds: [TRAINING-PLAN.md](../../evals/TRAINING-PLAN.md). Move-by-move log: [next-moves-2026-10-08.md](plans/next-moves-2026-10-08.md).

## Done

| Stage | Result | Details |
|---|---|---|
| 0 Ruler is valid | closed | [stage0-audit.md](stage0-audit.md) |
| 1 Session cost (hooks, contract) | closed on the 6-case set; its 2 failing rows moved to stage 2 | [stage1-baseline.md](stage1-baseline.md) |
| 2 first close | superseded: measured 6 old cases, no task walk | `stage2-baseline.md` (file no longer in this folder) |
| Stage 2 reopen: S0–S6 | exits 60/60, reader root, plan write path, task-route exit, export manifest, ruler fixes, route-ready 60/60, walk 10_2314 8/8 exits | [stage2-baseline-v2.md](stage2-baseline-v2.md), [moves S0–S6](plans/next-moves-2026-10-08.md#moves-in-order), [walk findings](plans/next-moves-2026-10-08.md#walk-10_2314-findings-applied-2026-10-09) |
| Guard denials fix | alias rewrite via `updatedInput`; 16 denials in 16 runs (05_0035) → 0 in a 20-run sample | [alias denials](plans/next-moves-2026-10-08.md#alias-denials-wording-then-the-guard-rewrite-2026-10-09) |
| Notation + session contract + Route line | tried, then reverted; the Route line and a short contract were kept. Cost 1.178× bare, context +3,171, recall not above 05_0035 | [report](analysis/notation-2026-10-09/report.md), [moves log](plans/next-moves-2026-10-08.md#notation-engine-contract-and-route-line-2026-10-09) |
| Harness void-run check | 0-turn runs are flagged, not scored | `evals/scripts/src/harness/run-validity.mjs` |

## Current: stage 3 base measured; waiting on the metrics-drift investigation (user)

[stage3-baseline.md](stage3-baseline.md): the current values, the loss point per case, gaps, and the stage-3 thresholds, re-based on the current cases (applied to TRAINING-PLAN).

| Row | Plan threshold | Now |
|---|---|---|
| map recall (core 20, capped macro delivered) | ≥ 0.435 | 0.290; micro 35/442 |
| empty maps | 0 | 7 / 20 cases (six: 2 / 6) |
| map time | ≤ 3 s | FE 3.9–4.7 s, BE 0.6–0.9 s (live; no offline timer) |
| `map-missed` / `first-call-broad` (26_1600) | ≤ 2/18 / ≤ 4/18 | 5 / 18, 18 / 18 |
| recall (26_1600) | ≥ 0.417 | 0.503 |
| python map recall (5 cases) | ≥ 40% | 0.542 (holds; guard) |

Before the first stage-3 change: add an offline map timer (free). Thresholds re-based and python cases repointed 2026-10-09.

## Stage 2: closed 2026-10-09, cost as debt

Closed by the user's decision. The gate failed on cost in every iteration, so this is an exception to the [floor rule](../../evals/TRAINING-PLAN.md#closing-a-stage-on-its-floor). Reference run: `26_1600_six` (6 cases × 3, chosen by signal over noise; $4.52).

| Row | Limit | 05_0035 (20 cases) | 26_1600 (6 cases) | Result |
|---|---|---|---|---|
| recall / precision | ≥ bare / ≥ bare − band | 0.557 / 0.696 | 0.503 / 0.806 (bare 0.436 / 0.759, band 0.086) | holds |
| cost vs bare | ≤ 1.1× | 1.141× | 1.1845× | **debt** |
| first-call context over bare | ≤ +3,200 (target +2,500) | +2,660 | +2,897 | pass |
| model calls p95 over bare | ≤ +2 | +5 | +1 (17 vs 16) | pass |
| failed tool calls | — | 0.31 | 0.00 | — |
| route step ready ≤ 5 s | ≥ 90% | 60/60 | 12/18 (FE map ≈ 4.5 s) | **debt** |
| task walk red/green | route closes | — | untested: every task ends `blocked (no-check)` | **debt** |

Debt rows and their retests: [§5 Debt](../../evals/TRAINING-PLAN.md#5-debt). Changes since 05_0035: notation reverted (Route line and a 952 B contract kept), task preflight `blocked (no-check)`, red hint names the check, Stop check carries the generated report block, scorer reads skipped-grader answers from the trace, context limit 3,200.

## Next

| Stage | Work | Detail |
|---|---|---|
| 3 Search map (next, after the drift investigation) | 3a offline: map recall, empty maps 0, map time ≤ 3 s. 3b paid on the six: `map-missed`, `first-call-broad`, recall, plus the stage-2 cost and route-ready debt. Current values above | [stage3-baseline.md](stage3-baseline.md), [Stage 3](../../evals/TRAINING-PLAN.md#stage-3--search-map-profile-index-locate-l4-search-l6-map-payload), [map analysis](analysis/24-25-26-27-analysis.md) |
| 4 Policy stages | `policies/*.yaml` | [Stage 4](../../evals/TRAINING-PLAN.md#stage-4--policy-stages-l4-policy-policiesyaml) |
| 5 Checks | baseline and test selection | [Stage 5](../../evals/TRAINING-PLAN.md#stage-5--checks-baseline-and-test-selection-l4-checks) |
| 6 Independent reviewer | review worker | [Stage 6](../../evals/TRAINING-PLAN.md#stage-6--independent-reviewer-l4-review-worker) |
| 7–12 Per skill | investigate, task, review, plan, rules, init | [Stages 7–12](../../evals/TRAINING-PLAN.md#stage-7--investigate) |
| 13 Wording | last | [Stage 13](../../evals/TRAINING-PLAN.md#stage-13--wording-l7) |

## Side items (no stage)

- 14 review cases have no reviewer recordings (about $1.6).
- 4 tests fail on unmodified HEAD (need `vendor/codeindex`).
- `fatal: ambiguous argument 'HEAD'` in walk logs and the TMPDIR split: not investigated.
