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

## Current: drift, before stage 3

Report: [drift-2026-10-09.md](24-25-26-27-next/drift-2026-10-09.md). Plan: [drift-plan-2026-10-09.md](plans/drift-plan-2026-10-09.md), revised after the plan review. A done 2026-10-09, including the review's two ruler gaps (change-decision scoring, frozen per-case floors); B1 next.

The engine's inputs are identical within each case; the model's choices drift. The biggest losses happen at answer time: evidence the model read but left out, and files it read for evidence but listed as changes. The ruler also has a defect: harness `costUsd` already includes judging (checked on e-c9VoUw), so 26_1600 is **1.1956×** bare agent-only, not 1.1845× (05_0035: 1.1446×, not 1.1408×).

| Step | Work | Cost |
|---|---|---|
| A Ruler (**done**) | agent cost without judging; drift gate (consistency); case floors against a frozen plugin reference (quality kept); change-decision scoring of `## Files`; per-run outcomes; reader receipts; re-scored 26_1600, 05_0035, 15, 16 | free |
| B1 File states | per truth path: future, unknown, discovered, served, proposed, excluded; build B2 only if `served ∧ ¬proposed` is ≥ 25% of missing existing-file truth | free |
| B2 Receipt | Stop check on the answer's change decisions (not citations), by file family, ≤ 5 families / 600 B, once per route; continuation calls and cost measured; offline replay first, silent on the controls | free |
| Check | 6 × 3 plugin-only (about $5, ask first): omission fe-vs-6404, fe-vs-6292, fe-vs-438; precision be-vs-6140; controls be-vs-5973, be-vs-5941. Case floors pass, drift above reference, omission recall above reference + band | paid |

Step A, re-scored (same recall and precision as before):

| Run | Agent cost × bare | Harness total × bare | Drift, cases in band |
|---|---|---|---|
| 26_1600 (six) | 1.1956 | 1.1845 | **0 / 6** |
| 05_0035 (20) | 1.1446 | 1.1408 | 6 / 20 |
| 15_1241 | 1.1170 | 1.1100 | 3 / 14 (+1 case with 1 run) |
| 16_1304 | 1.2713 | 1.2499 | 0 / 5 |
| bare 30_2248, same band | — | — | the six: 1 / 6; core: 4 / 20 |

**The bare model holds the band on 1 of the six and 4 of 20 cases**, so the 80% target asks the plugin to be steadier than the model it runs. The ledger's reader receipts match the command-text count on 26_1600 (1.71 per run on the 7 runs with a receipt); 16_1304 has 1 run where the text missed a `node "$N" read` call.

Moved to stage 3a: discovery families, and the shortlist default (`shortlistRules` leaves out markup and data).

## Stage 3 base (measured 2026-10-09)

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
| 3 Search map (next, after drift) | 3a offline: map recall, empty maps 0, map time ≤ 3 s. 3b paid on the six: `map-missed`, `first-call-broad`, recall, plus the stage-2 cost and route-ready debt. Current values above | [stage3-baseline.md](stage3-baseline.md), [Stage 3](../../evals/TRAINING-PLAN.md#stage-3--search-map-profile-index-locate-l4-search-l6-map-payload), [map analysis](analysis/24-25-26-27-analysis.md) |
| 4 Policy stages | `policies/*.yaml` | [Stage 4](../../evals/TRAINING-PLAN.md#stage-4--policy-stages-l4-policy-policiesyaml) |
| 5 Checks | baseline and test selection | [Stage 5](../../evals/TRAINING-PLAN.md#stage-5--checks-baseline-and-test-selection-l4-checks) |
| 6 Independent reviewer | review worker | [Stage 6](../../evals/TRAINING-PLAN.md#stage-6--independent-reviewer-l4-review-worker) |
| 7–12 Per skill | investigate, task, review, plan, rules, init | [Stages 7–12](../../evals/TRAINING-PLAN.md#stage-7--investigate) |
| 13 Wording | last | [Stage 13](../../evals/TRAINING-PLAN.md#stage-13--wording-l7) |

## Side items (no stage)

- 14 review cases have no reviewer recordings (about $1.6).
- 4 tests fail on unmodified HEAD (need `vendor/codeindex`).
- `fatal: ambiguous argument 'HEAD'` in walk logs and the TMPDIR split: not investigated.
