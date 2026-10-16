# Stage 3 — search map: starting measurement (2026-10-09)

Sources:
- **Offline:** `evals:map-recall` on the current core set (20 investigate cases) at the working tree after the stage-2 close. Bundle rebuilt first. Free.
- **Paid, no new spend:** report of `26_1600_six` (the stage-2 reference run: 6 cases × 3, Sonnet 5.5, effort low). The bare arm is the locked `30_2248` plus walks `02_1738`, `03_1740` and `04_1742`. Noise band 0.086.
- **Python:** `evals:map-recall --cases evals/python/full` (5 cases), after the scaffolds were repointed (see Gaps).
- **Not covered:** the metrics-drift investigation, which is still pending. If drift moves the bare lock, the paid rows below move with it.

The stage-3 thresholds in [TRAINING-PLAN.md](../../evals/TRAINING-PLAN.md#stage-3--search-map-profile-index-locate-l4-search-l6-map-payload) were written on the old 18-case core (before 2026-10-07). Their "Now" column does not describe the current set. The current values are below. The re-basing at the end was approved and applied to TRAINING-PLAN on 2026-10-09.

## 3a offline: current values

```
evals:map-recall, core 20 cases (82 s)
all: true in map 35/442 (leads 31, feature 4); listed 166; ranked top 20 47, serialized top 20 35
macro recall: ranked20 0.250 delivered 0.221; cases with no true file delivered 7/20
```

| Row (plan) | Plan threshold | Plan "Now" (old 18 cases) | Core 20 now | Six cases now |
|---|---|---|---|---|
| map recall | ≥ 60% | 40% (21 of 53) | micro 7.9% (35/442); macro delivered 0.221; macro capped 0.290 | micro 4.1% (8/196); macro delivered 0.103; capped 0.177 |
| map recall, python | ≥ 40% | 26% (9 of 34) | 5 cases: micro 50% (17/34); macro delivered = capped 0.542; 0 empty maps | — |
| no case set drops > 1 truth file | none | — | reference: [map-recall-s3.json](raw/stage3/map-recall-s3.json) | — |
| empty maps | 0 | 2 cases | **7 / 20 cases** | 2 / 6 (fe-vs-6141, fe-vs-3571) |
| leads size ≤ 1,200 B, feature ≤ 400 B | holds | — | max 1,200 / 200 B | holds |
| map time | ≤ 3 s | ≈ 4.3 s | no offline timer | live: FE 3.9–4.7 s, BE 0.64–0.92 s |

"Capped" divides by min(truth, listed): a map of 8 leads cannot cover a 69-file truth list, so plain micro recall cannot reach 60% on this set by construction. Ten of the 20 cases have more than 20 truth files.

## 3b paid: current values (26_1600, 18 plugin runs)

| Row (plan) | Plan threshold (per 30 runs) | Plan "Now" | 26_1600 |
|---|---|---|---|
| `map-missed` runs | ≤ 3 / 30 | 7 / 30 | **5 / 18** (fe-vs-6406 ×2 `location-select.component.ts`; be-vs-5973 ×3 `est-niosh.service.ts`) |
| `first-call-broad` runs | ≤ 6 / 30 | 15 / 30 | **18 / 18** (grep 14, ls 4) |
| `outside-map` true files read | falls vs run 12 | — | 244 files in 18 runs |
| recall | ≥ run 12 − band | 0.731 (old cases) | 0.503 (bare 0.436, band 0.086) |
| cost (stage-2 debt) | ≤ 1.1× bare | — | 1.1845× |
| route ready ≤ 5 s (stage-2 debt) | ≥ 90% | — | 12 / 18 |

Read shape: 83 read requests, 32 of them single-file.

## Six cases: where the map loses

| Case | Truth | Ranked top 20 | Delivered (leads + feature) | Map ms (live) | Recall plugin / bare | Cost × bare | Where the loss is |
|---|---|---|---|---|---|---|---|
| fe-vs-6141 | 67 | 0 | 0 / 8 | 4,669–4,706 | 0.46 / 0.41 | 1.33 | ranking: no true file in top 20 |
| fe-vs-6406 | 21 | 3 | 1 / 9 | 3,881–3,952 | 0.14 / 0.10 | 1.07 | serialization drops 3 → 0 in top 20; the one lead is dropped from the answer in 2 of 3 runs |
| be-vs-6015 | 4 | 2 | 1 / 8 | 636–649 | 0.50 / 0.58 | 1.15 | delivery keeps 1 of 2 ranked |
| be-vs-5941 | 7 | 4 | 1 / 8 | 649–657 | 0.76 / 0.62 | 0.98 | delivery keeps 1 of 4 ranked |
| be-vs-5973 | 28 | 8 | 5 / 9 | 901–924 | 0.81 / 0.69 | 1.24 | the answer drops `est-niosh.service.ts` in 3 of 3 runs |
| fe-vs-3571 | 69 | 0 | 0 / 8 | 4,345–4,474 | 0.34 / 0.21 | 1.16 | ranking: no true file in top 20 |

The offline map matches the live map in every case: the same true files appear in the report's `mapTrue`.

Three loss points, each with its own lever:
- **Ranking:** 2 cases with 0 true files in the top 20. Both are FE cases with i18n-heavy truth lists.
- **Delivery:** 4 cases deliver fewer true files than ranking found (47 ranked → 35 delivered over the 20 cases).
- **Model use:** `map-missed` 5 runs, and `first-call-broad` in every run, even when the map held true files.

## Gaps

- **Python cases repointed (fixed).** The hand-picked scaffolds archived from `evals/benchmarks/python` and copied `evals/cases/python/config.yaml`, which no longer exist. They now archive the same parent commits from `../ambicode-evals-assets/benchmarks/python` (the git root; `project/` is not in those commits) and copy `evals/python/config.yaml`. Truth and prompts are unchanged. Python moved from 26% to 50% micro since the old measurement; I did not trace which map change caused that.
- **No offline map timer.** `map-recall` does not time `buildMap`, so "map time ≤ 3 s, offline" has no tool. Adding a per-case `ms` column is free and is the retest the stage-2 route-ready debt names.
- **Drift.** The paid rows use the bare lock `30_2248` plus walks. Pending your drift investigation.

## Re-basing (applied 2026-10-09)

| Row | Proposal | Why |
|---|---|---|
| map recall | capped macro delivered recall on core 20: 0.290 → ≥ 0.435 | keeps the plan's 1.5× step (40 → 60). Micro recall is bounded by 8 leads on 69-file truths |
| python | keep ≥ 40% | now 0.542, so it acts as a guard against a drop |
| empty maps | 7/20 → 0 | unchanged target |
| map time | ≤ 3 s per case, offline timer, FE included | today's misses are all FE |
| `map-missed` | ≤ 2 / 18 on the six | 3/30 scaled to 18 runs |
| `first-call-broad` | ≤ 4 / 18 on the six | 6/30 scaled (3.6, rounded up) |
| recall | ≥ 0.417 (26_1600 0.503 − band 0.086) | replaces run 12 (old cases) |
| cost, route ready | retest the stage-2 debt on the same 3b run | per §5 Debt |
