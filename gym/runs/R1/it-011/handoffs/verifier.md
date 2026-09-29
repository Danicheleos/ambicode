# it-011 verifier handoff

Result: 0 disagreements. Every checked field agrees with metrics.json and the brief. Three non-blocking observations at the end.

## 1. Applied change equals diff.patch
`git diff -- src docs | cmp - gym/runs/R1/it-011/diff.patch` printed nothing (identical). Agree.
Modified tracked files: docs/review.md, src/cli/commands/review.ts, src/review/review.test.ts (all on the brief's allowed list), plus gym/plan/supervisor/{policy.mjs,test/policy.test.mjs} (owner's, ignored). Untracked: gym/runs/R1/it-011/{diff.patch,metrics.json} (allowed) and gym/runs/R1/supervisor.out (supervisor artifact, not product). STATE.md unmodified. No file outside the allowed list is modified by this iteration.

## 2. Gates (re-run by verifier)
| Field | metrics.json | verifier | |
|---|---|---|---|
| G1 tests/pass/fail/skipped | 811/810/0/1 | 811/810/0/1, exit 0 (scratch/verifier-verify.log) | agree |
| G2 zipSha256 | 1585ac05...086ad | 1585ac05ebf11f65d34674b82b7de99c0d353a22d3be6e676e9f0e8d213086ad, `package:reproducible` "identical ... across two independent runs", 50 files | agree |
| G3 files | 573 | `line endings OK: 573 tracked text file(s)` | agree |

## 3. Diff read
- `applyStatus` returns the error branch before the gap list when `!reviewerOk`, so the turns gap is only evaluated for a reviewer that ran. Agree.
- `turns !== null && turns !== undefined && turns <= 2`: null and undefined are not flagged; `usage?.turns` is undefined for `usage: null` (replay, absent), so those are not flagged. turns 0 is flagged (schema allows nonnegative int; the tests cover 0). Agree.
- `git diff -- src/review/review.test.ts | grep -c '^-[^-]'` = 0: no existing line removed or weakened. Agree.
- Reproduction: before.log has 59 tests, 56 pass, 3 fail (the turns 2, 1, 0 tests); the guard tests are not among the failures. Agree with metrics.json.
- Constant comment ("2 in 24 of 46, never 1") recomputed with jq over it-006/scratch/aa-{1,2}/usage.json: each set n=23, turns==2 in 12, ==1 in 0, >=3 in 11, null in 0. Sum 24 of 46; brief's "22 at >=3" is 11+11. Agree.
- The comment's "upper bound" and the message's "it may have read no file" match the brief's wording rule. The status text says "turn(s)" with a constant 2 interpolated, matching the tests' regex.

## 4. T2 screening re-derived (score recomputed; output byte-identical to scratch/score.out)
| Field | metrics.json | verifier | |
|---|---|---|---|
| localize with F1 | 0.6015 | 0.60154 | agree |
| localize without F1 | 0.5692 | 0.56918 | agree |
| review with / without recall | 0.0938 / 0.1667 | 0.09375 / 0.16667 | agree |
| helper-ran localize with | 1 of 10 | 1 (runs 10) | agree |
| helper-ran review with | 0 of 8 | 0 (runs 8; plugin-fired 0) | agree |
| partial | false | false | agree |
| run errors | 0 | 0 of 36 arm-runs have a non-null error | agree |
| costUsd | 7.4556 | 7.4556 | agree |
| judge cost | 0.2942 | sum of 36 per-run judgeCostUsd = 0.29418 | agree |
| model override | claude-sonnet-5-5 | suite.modelOverride = claude-sonnet-5-5 | agree |
| agent model in traces | (not itemised for it-011) | the 36 tracePaths in the result are gone from /tmp; the same traces are kept at evals/evals-core/results/traces/<id>.jsonl. 36 of 36 exist, 36 of 36 have exactly one system/init row, all claude-sonnet-5-5. All 608 `"model":"..."` occurrences across the 36 traces are claude-sonnet-5-5. | agree |

## 5. Baseline comparison
baseline/metrics-R-1.json T2: localize with median 0.5417 (sweeps 0.5359, 0.6397, 0.5417; pooled 0.5724), without median 0.5715; review with 0.0938 / without 0.0938. Matches the brief. Bound arithmetic: 0.5417-0.05 = 0.4917, 0.5724-0.05 = 0.5224; observed 0.6015 is above both. Agree. Review is "not measurable" (helper-ran 0 of 8), correctly not read as an effect. Without-arm 0.1667 is above the reference sweeps (0.0625..0.0938), reported as such.

## 6. Paths
All paths cited in brief.md and metrics.json exist (baseline/metrics-R-1.json, it-004/decision.md, it-006/scratch/aa-{1,2}/usage.json, it-010/decision.md, it-011/{before,verify,g2,g3}.log, scratch/{score.out,preflight.log,t2-screen.json}, the result eval-2026-09-29T13-05-42-582Z.json, cp-S0.md, STATE.md, src/contracts/review.ts with `ReviewerUsage.turns` nullable). Tags gym/R1/cp-S0 = b545318, gym/R1/it-010 = b80bd72, gym/R1/it-003 exist.

## 7. Fixtures untouched
`git status` shows nothing under benchmarks/ or evals/. evals/evals-core/cases hash = 2f7470fdb24fa1259e9a970b2b32358d6f817ae0f6d9cad064ecb663f9df8212, equal to it-010/scratch/cases.sha256. Agree.

## Observations (not disagreements)
1. scratch/t2-merge.err, t2-merge.out and t2-merged.json are leftovers of a failed t2-merge.mjs invocation (usage error, `cases` length 0). They are unused by any cited number; consider deleting or noting them.
2. metrics.json says the brief's reference sweeps for review are "0.0938 0.0625 0.0938"; the baseline file lists with = 0.0938, 0.0938, 0.0625 and without = 0.0938, 0.0625, 0.0938. Median and range are unaffected.
3. The T2 run does not exercise the change at all (review with-arm helper-ran 0 of 8; T2 replay usage is null), so the screening supports only "no gross localize break", as the brief states. The new flag's evidence is the 7 unit tests plus G1.
