# Stage 0 audit — 2026-10-07

Free, read-only. Sources: `evals/common/core/`, `evals/scripts/`, `../ambicode-evals-assets/` iterations of 2026-10-07,
report of `03_0142_curated-naked-sonnet-5-5` (27 cases × 3, $14.20, CC 2.1.292, sonnet-5-5).

## Work items

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | `walk`/`decide` serve `--prompt with` | done | `package.json` `evals:run` = `evals:bench run --prompt with`; `walk` and `decide` go through it |
| 2 | Review cases carry `prompt.with.md` | done | 28 of 28 case dirs have `prompt.with.md` (and `prompt.naked.md`) |
| 3 | Graders read the ledger, not `plugin-fired`/`helper-ran` | mostly done | no case grader uses them. Still named in `bench-score.mjs:166` (counts only if a grader has them), `impact-cases.mjs`/`reuse-cases.mjs` (delete them), `evals/common/archived/typescript/README.md` |
| 4 | `select` ranks by discrimination | **open** | `selection.json` criteria: minTruth 2, maxTruth 15, ticket chars, changed lines. No baseline input, no recall band, no threads ≥ 3 rule |
| 5 | `assets/`, `reviews/`, config restored | done | `benchmarks/{BE-express,FE-angular}/{assets,project,reviews}` exist; python has `project` only |
| 6 | Naked baseline, current model and CC | done, one gap | `03_0142` 27 cases × 3, 0 infra/error/absent runs. Its "bare" in reports is `02_0141`, 1 run (1 case) |

## Thresholds

| Threshold | Now | Pass |
|---|---|---|
| `infra`, `untraced`, `naked-prompt`, `unrouted`, `version`, `model` findings = 0 | baseline 03: `naked-prompt` ×1 (expected: it is the naked arm). Walks 07, 18 and curated 19, 20: none of the six | pass for with-prompt runs |
| ≤ 1 of 10 cases saturated or at floor | see below: 9 of 23 localize cases and 3 of 4 review cases are saturated or at floor on the naked arm alone | **fail** |
| baseline: same model and CC, ≥ 3 runs per case | 3 runs per case (81 runs) | pass |
| noise band on recall ≤ 0.10 | 0.030 as reported (widest repetition range of the mean). Per-case ranges are up to 0.50 (be-vs-4606, fe-vs-5494, fe-vs-6253) | pass by the report's definition; the per-case spread is the reason to read `unstable` |
| unit tests of `evals/scripts` | 310 pass, 1 fail | **fail** |

### Saturation and floor, naked arm (3 runs, mean recall)

Plugin arm with `--prompt with` over all 27 cases has not run, so "both arms" cannot be counted yet. The naked arm
alone gives the upper bound.

| Class | Cases |
|---|---|
| localize ≥ 0.95 (7) | be-vs-4264, be-vs-5071, be-vs-5546, be-vs-5850, be-vs-6140, fe-vs-5164, fe-vs-6168 |
| localize ≤ 0.2 (2) | fe-vs-5494 (0.17), fe-vs-6334 (0.17, also the 1.63× cost case in walk 07) |
| localize in the 0.3–0.8 band (11) | be-vs-4606, 4814, 4855, 4875, 5075, 5766, 5783, 5928; fe-vs-438, 6253, 6269 |
| localize 0.8–0.95 (3) | be-vs-4384 (0.90), be-vs-5941 (0.86), fe-vs-6181 (0.89) |
| review floor, recall 0 in all 3 runs (3 of 4) | be-vs-4895-review-1111, fe-vs-6086-review-2553, fe-vs-6253-review-2557 |
| review with signal (1 of 4) | fe-vs-6292-review-2537 (0.25 on all 3 runs; the with-prompt arm scores 0.00, `quality-loss`) |

## Failing unit test

`evals/scripts/src/console/server.test.mjs` imports `./server.mjs`, which does not exist (`ERR_MODULE_NOT_FOUND`).
The git status was clean at session start, so the failure is in HEAD, not caused by this session. The directory holds
only the test. Either the console was removed and the test is stale, or the module was lost. Not decided.

## Open items to close Stage 0

1. `select`: add the discrimination input (baseline recall 0.3–0.8, truth 3–7, review ≥ 3 threads, one version per
   merge request), then regenerate `selection.json`. This removes the saturation/floor failure.
2. Resolve `console/server.test.mjs`.
3. Finish grader cleanup: `impact-cases.mjs`, `reuse-cases.mjs`, `bench-score.mjs:166`, archived README.
4. Re-run the naked baseline on the new selection (3 runs, about $14 for 27 cases; fewer after replacement) and a
   `--prompt with` run on the same cases, so that `naked-prompt`-free reports have a full-size bare.
   Paid, needs your approval.

## Not done

- No paid run, no code edit. The "both arms saturated" count needs the with-prompt run (item 4).

## Update — select by discrimination (same day)

Correction: item 4 was not open in code. `select --baseline` and `--candidates` already existed (`bench-cases.mjs`,
`DISCRIMINATE`, 0.2–0.9 recall, one version per merge request). It was never applied: `evals:select` ran with no
baseline, so every `walk`/`decide` regenerated the 27-case candidate pool.

Decisions from the user: drop `console/server.test.mjs`; replace all review cases (rebuilt for stage 9); be-vs-4814,
4855, 4875 are near-duplicates.

Measured on the 27-case pool, ticket word overlap (Jaccard): 4384, 4606, 4814, 4855, 4875 pair at 0.84–0.99. No other
pair exceeds 0.56. So the cluster is five cases, not three.

Changes:
- `ticketOverlap` + `DUPLICATE_TICKET_OVERLAP = 0.7`: in discriminating mode a localize ticket that overlaps a kept one is dropped.
- `select` saves per-case bare recall from `--baseline` to `evals/common/core/bare-recall.json` and reads it when no flag is given.
- `evals:baseline` now selects with `--candidates --localize 15`, so the baseline keeps measuring the wide pool.
- `SELECT` defaults: localize 10 per side, review 0.
- `console/server.test.mjs` removed (the module it imports is not in the repo).

Result of `select` against `03_0142` (naked mean recall in brackets):

| side | cases |
|---|---|
| BE-express (6) | 5766 (.43), 5075 (.57), 5928 (.50), 4855 (.74), 5783 (.73), 5941 (.86) |
| FE-angular (4) | 6253 (.75), 6269 (.78), 6181 (.89), 438 (.76) |

Saturated (≥ 0.95) or at floor (≤ 0.2) on the naked arm: 0 of 10. Threshold ≤ 1 of 10 holds, naked arm only.

Decision-A set (run 12): 6 of its 10 cases are in the new selection (be 5766, 5075, 5928; fe 6253, 6269, 6181). The four
others cannot replace the dropped cases: be-vs-5546 (1.00), be-vs-6140 (1.00), fe-vs-5164 (1.00) are saturated and
fe-vs-6334 (0.17) is at the floor on the naked baseline.

Not measured: be-vs-5915 and be-vs-5903 enter the candidate pool but have no baseline data until `evals:baseline` runs again.

## Update — new baseline 22_0553, 50/50 selection, grader cleanup

- Baseline `22_0553_curated-naked-sonnet-5-5`: 21 cases x 3 runs (63), exit 0.
- `select` now ranks by least bare recall, then least bare precision, and gives every side the same count.
  `bare-recall.json` carries `recalls` and `precisions`.
- Selected (6): BE 5766 (.29, truth 7), 5903 (.33, 4), 5075 (.57, 7); FE 438 (.48, 14), 6269 (.78, 3), 6181 (.89, 3).
  FE is capped at 3 by the filters: 27 of 57 FE tickets list >15 true files (`maxTruth` 15, no recorded rationale),
  28 are under 300 chars. Kept at 15 by the user.
- fe-vs-6253 scored 0.75 in 03_0142 and 1.00 in 22_0553: single-baseline recall is noisy.
- Grader cleanup done: `plugin-fired`/`helper-ran` removed from `bench-score.mjs`, `impact-cases.mjs`,
  `reuse-cases.mjs`, core README (archived README left as history). evals/scripts tests 313 pass, 0 fail.
- Open: `--prompt with` run on the 6 cases to confirm saturation on both arms (paid).
