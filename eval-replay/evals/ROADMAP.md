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

## Done: drift ruler and answer-side levers (2026-10-09); the fix continues in stage 3a

Report: [drift-2026-10-09.md](24-25-26-27-next/drift-2026-10-09.md). Plan: [drift-plan-2026-10-09.md](plans/drift-plan-2026-10-09.md), revised after the plan review. A done 2026-10-09, including the review's two ruler gaps (change-decision scoring, frozen per-case floors). B1 done: the answer lever fails its rule (3.2% < 25%). The directory-level replay also fails (fires on 15/18 control runs, 1 true file per 5 shown), so B2 is not built. The drift target stays absolute (user, 2026-10-09); the loss is what the model sees: 58% of missing truth never appears in the run, 2.8% is in the map.

The engine's inputs are identical within each case; the model's choices drift. The biggest losses happen at answer time: evidence the model read but left out, and files it read for evidence but listed as changes. The ruler also has a defect: harness `costUsd` already includes judging (checked on e-c9VoUw), so 26_1600 is **1.1956×** bare agent-only, not 1.1845× (05_0035: 1.1446×, not 1.1408×).

| Step | Work | Cost |
|---|---|---|
| A Ruler (**done**) | agent cost without judging; drift gate (consistency); case floors against a frozen plugin reference (quality kept); change-decision scoring of `## Files`; per-run outcomes; reader receipts; re-scored 26_1600, 05_0035, 15, 16 | free |
| B1 File states (**done**) | `served ∧ ¬proposed` = 51 / 1583 missing existing truth (3.2%; bare 12 / 765, 1.6%). Discovered only 39.2%, unseen 57.5%, excluded 0. Below 25%: B2 dropped. [raw](raw/drift/b1-file-states.txt) | free |
| B2 Receipt (**dropped: B1 and the directory replay**, [raw](raw/drift/b2-replay.txt)) | Stop check on the answer's change decisions (not citations), by file family, ≤ 5 families / 600 B, once per route; continuation calls and cost measured; offline replay first, silent on the controls | free |
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

## Stage 3a: paused 2026-10-09

**Status: paused. Drift is the critical blocker: no tuning is meaningful while one run of a case scores 0.2 and another 0.8 on identical engine input. Next work is drift-only; recall-coverage ranking is closed.**

Inventory offline measurements (free). Core 20, K=8 directory families. Cohort-missing = 1583 truth files missed by plugin runs 05_0035, 15_1241, 16_1304, 26_1600. Raw files (gitignored): [inventory-v0.txt](raw/stage3/inventory-v0.txt), [inventory-v0-rankers.txt](raw/stage3/inventory-v0-rankers.txt), [inventory-v1.txt](raw/stage3/inventory-v1.txt), [inventory-v2.txt](raw/stage3/inventory-v2.txt), plus the matching `.json` files in [raw/stage3/](raw/stage3/).

```
list                                     truth macro  missing reached  cases w/o truth fam
delivered map                            0.395        144 (9.1%)       6
filter ON, dir families                  0.420        150 (9.5%)       6
filter OFF, top-6 files                  0.194         80 (5.1%)       8
filter OFF, dir families "terms" (v0)    0.502        298 (18.8%)      5
v0 + 4 linked families (A+B), 914 B      0.607        347 (21.9%)      3
best other ranker (7 tried, v2)          0.484        288 (18.2%)      4
ceiling all matched dirs                 0.835        851 (53.8%)      1
ceiling matched + linked                 0.903       1080 (68.2%)      0
```

Findings:

- The map's loss is the shortlist filter (`locate.ts` `shortlistRules` drops markup and data). Lifting it doubles reach. Directory grouping alone adds 0.4 pts.
- Linked-file expansion (A: path/stem references, B: shared string keys, generic df caps 25/20) adds 1–3 pts at about 914 B, over the 600 B limit. It rescues be-vs-4835 and fe-vs-6141.
- No generic ranker beats "terms" (distinct terms x100 + max score). In fe-vs-3571, 5164, 6406 and 6141 the best truth family ranks 9–17.
- Cost: unfiltered locate 1.0–1.6 s FE, 0.15–0.27 s BE. Expansion adds 0.6–1.0 s FE.
- Candidate if the inventory is used: v0 "terms", top 8, ≤ 600 B.
- Correction to earlier notes: the fifth no-truth case is fe-vs-6406 (not fe-vs-5948). v0 noise is 46/153 listed families.
- These measure recall coverage, not drift. Coverage of unstable files (proposed by some runs, missed by others) has not been measured.

Open next step (not started; an attempt was stopped before results): drift decomposition on saved runs, grouped by identical engine input.

1. Unstable true files U (proposed by ≥ 1 run, missed by ≥ 1): per missing run, state unseen / discovered / served. This splits exploration from attention from decision.
2. Unstable wrong files W: are read-as-evidence files promoted to changes (the be-vs-6140 pattern)?
3. Exploration divergence: Jaccard of files served in the first 3 and 6 tool calls. Per-run recall against map leads served and own searches.
4. Recall spread per case explained by U state. Inventory v0 coverage of U and W.

| Outcome | Lever |
|---|---|
| exploration | engine fixes the exploration path: serves evidence, limits free search in the read step |
| decision | Stop check per read family |
| promotion | path role (change vs evidence) validated at Stop |

Reference: [drift-2026-10-09.md](24-25-26-27-next/drift-2026-10-09.md) (first divergence at tool 1), [b1-file-states.json](raw/drift/b1-file-states.json), and the B1/B2 results in [raw/drift/](raw/drift/).

3a thresholds remain unset in [TRAINING-PLAN.md](../../evals/TRAINING-PLAN.md). The proposed 35% recall threshold is withdrawn pending the drift split.

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
| 3 Search map (**current**, carries the drift fix) | 3a offline: candidate inventory first (**paused — see [state above](#stage-3a-paused-2026-10-09)**; coverage, noise, then the Stop check replayed: ≤ half of control runs), map recall, empty maps 0, map time ≤ 3 s. 3b paid on the six: `map-missed`, `first-call-broad`, recall, drift ≥ 5 / 6 in band, case floors, plus the stage-2 cost and route-ready debt. Current values above | [stage3-baseline.md](stage3-baseline.md), [Stage 3](../../evals/TRAINING-PLAN.md#stage-3--search-map-profile-index-locate-l4-search-l6-map-payload), [map analysis](analysis/24-25-26-27-analysis.md) |
| 4 Policy stages | `policies/*.yaml` | [Stage 4](../../evals/TRAINING-PLAN.md#stage-4--policy-stages-l4-policy-policiesyaml) |
| 5 Checks | baseline and test selection | [Stage 5](../../evals/TRAINING-PLAN.md#stage-5--checks-baseline-and-test-selection-l4-checks) |
| 6 Independent reviewer | review worker | [Stage 6](../../evals/TRAINING-PLAN.md#stage-6--independent-reviewer-l4-review-worker) |
| 7–12 Per skill | investigate, task, review, plan, rules, init | [Stages 7–12](../../evals/TRAINING-PLAN.md#stage-7--investigate) |
| 13 Wording | last | [Stage 13](../../evals/TRAINING-PLAN.md#stage-13--wording-l7) |

## Side items (no stage)

- 14 review cases have no reviewer recordings (about $1.6).
- 4 tests fail on unmodified HEAD (need `vendor/codeindex`).
- `fatal: ambiguous argument 'HEAD'` in walk logs and the TMPDIR split: not investigated.
