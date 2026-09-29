# it-013 verifier report (04 §2)

Own commands only: node script /tmp/ver/a.mjs (reads result JSON and the 48 traces in evals/evals-core/results/traces), jq, git, npm. No T2/T3, no `claude`, no paid command. Files edited: this one.

Disagreements: 0. Two notes that are not disagreements are at the bottom.

## 1. Input: scratch/t2review-sonnet.json and its traces

| field | my value | recorded value | agree |
|---|---|---|---|
| cases | 8 | 8 (`T2review.cases`) | agree |
| runs per arm per case / total per arm | 3 / 24 | runsPerArm 3, 24 | agree |
| runs with `error` | 0 of 48 | runErrors 0 | agree |
| `partial` | false | false | agree |
| model override (`suite.modelOverride`) | claude-sonnet-5-5 | claude-sonnet-5-5 | agree |
| traces named / found | 48 / 48 (0 missing, 0 duplicate) | "48 traces, missingTraces 0" | agree |
| system/init rows, with arm | 24 x claude-sonnet-5-5, no other model | 48 of 48 claude-sonnet-5-5 | agree |
| system/init rows, without arm | 24 x claude-sonnet-5-5, no other model | (in the 48 of 48) | agree |
| with arm: runs calling `Skill` | 24 of 24, all `ambicode:review` | skillCalls {ambicode:review: 24} | agree |
| without arm: runs calling `Skill` | 2 of 24, both `ambicode:review` | skillCalls {ambicode:review: 2}, skillCallRuns 2 | agree |
| with arm: runs with Bash matching /ambicode(\.mjs)?\s+(prepare\|finish\|review\|localize)\|scripts\/ambicode/ | 24 of 24 | helperRan 24 (grader-based) | agree (independent trace check matches the grader count) |
| without arm: same Bash match | 0 of 24 | (no field; the without arm has no helper) | n/a, consistent with the note "no plugin" |

## 2. Grader outcomes and recall vs `T2review.review`

Recall of a run = passed raises-NN graders / total raises-NN graders. The 8 cases have 1,1,2,2,4,2,3,4 raises graders. Arm mean is over the 24 runs. Run-index means are over the 8 cases.

| field | my value | recorded value | agree |
|---|---|---|---|
| with `plugin-fired` passes | 24 of 24 | pluginFired 24 | agree |
| with `helper-ran` passes | 24 of 24 | helperRan 24 of 24 | agree |
| with `helper-ran` per run index (0,1,2) | 8, 8, 8 (median 8) | helperRanMedian 8 of 8 | agree |
| without `plugin-fired` / `helper-ran` passes | 0 / 0 | (not recorded; cp-S0 recorded none either) | n/a |
| with recall, mean over runs | 0.125 | recallPooled 0.125 | agree |
| with recall, run-index means | 0.125, 0.15625, 0.09375 | recallSweeps 0.125, 0.1563, 0.0938 | agree |
| with recall, median of run-index means | 0.125 | recallMedian 0.125 | agree |
| without recall, mean over runs | 0.09375 | recallPooled 0.0938 | agree |
| without recall, run-index means | 0.09375, 0.0625, 0.125 | recallSweeps 0.0938, 0.0625, 0.125 | agree |
| without recall, median of run-index means | 0.09375 | recallMedian 0.0938 | agree |
| with cost per run / turns | 0.1452 / 6.625 | 0.1452 / 6.625 | agree |
| without cost per run / turns | 0.2047 / 9.75 | 0.2047 / 9.75 | agree |
| sweep cost / duration | 8.39579 USD / 731 s | 8.3958 / 731 | agree |

Reference block: `T2.review` at HEAD has recallMedian 0.0938 with and without, helperRan 0 of 24, pluginFired 0, skillCalls {}. The brief's "reference before the change" line agrees with it. Movement: with-arm helper-ran 0 to 24 of 24, with recall median 0.0938 to 0.125, without unchanged at 0.0938.

## 3. `T2` unchanged

| field | my value | recorded value | agree |
|---|---|---|---|
| `T2` key of the working-tree metrics-R-1.json vs `git show HEAD:` (jq -S, `cmp`) | byte-identical, 2455 bytes each | "T2 untouched" | agree |
| diff of metrics-R-1.json | 57 insertions, 0 deletions | new `T2review` block only | agree |

## 4. Gates, re-run by me

| field | my value | recorded value | agree |
|---|---|---|---|
| `npm run verify` exit | 0, "Validation passed" | verify.log: validation passed | agree |
| tests / pass / fail / cancelled / skipped | 813 / 812 / 0 / 0 / 1 | verify.log: 813 / 812 / 0 / 0 / 1 | agree |
| the two new tests | both pass | before.log: review-prompt test fails, localize pin passes | agree (fail before, pass after) |
| verify zip sha256 | 1585ac05ebf11f65d34674b82b7de99c0d353a22d3be6e676e9f0e8d213086ad | verify.log same | agree |
| `npm run package:reproducible` | "50 files ... identical zip sha256 (1585ac05...086ad)" | g2.log same line | agree |
| digest vs it-012 (brief: `1585ac05...086ad`) | equal | equal | agree |
| `node check-line-endings.mjs` | exit 0, 591 tracked text files, all LF | g3.log: same | agree |

## 5. Code diff vs the brief

| field | my value | recorded value | agree |
|---|---|---|---|
| files under `evals/scripts/src` touched | 2: evals-bench.mjs, evals-bench.test.mjs (`git diff --stat`: 41 insertions, 2 deletions) | brief: those two only | agree |
| evals-bench.mjs hunks | 1 hunk, inside `reviewPromptFile` (lines 249-275): the task sentence, 2 lines replaced by 2 lines | "`reviewPromptFile` only" | agree |
| test file `^-` lines other than the header | 0 (the only `^-` is `--- a/...`) | "no assertion removed" | agree |
| test file additions | 39 lines: 2 new `it` blocks (review sentence; localize prompt pinned byte for byte) | brief: two reproducing tests | agree |

## 6. Paths cited in brief.md

All exist: evals/scripts/src/evals-bench.mjs, evals-bench.test.mjs, gym/runs/R1/baseline/metrics-R-1.json, it-013/before.log, it-013/scratch/cases-before.sha, it-013/verify.log, it-012/diff.patch, gym/runs/R1/STATE.md, gym/runs/R1/labels/labels.json, gym/plan/supervisor, evals/evals-core/cases, cases/selection.json, tags cp-S0 and gym/R1/it-011, commit 4ca0f6f. it-013/diff.patch exists too (untracked). No missing path.

## Notes (not disagreements)

1. Brief step "The existing review-case test is extended, not loosened": the diff adds two new tests and leaves the existing review-case test byte-identical. No assertion is loosened; the wording "extended" is looser than what happened.
2. Brief cites `reviewPromptFile` at lines 249-274. The function ends at line 275. Cosmetic.
3. The metrics field `recallPooled` is the mean of per-run recalls (equals the mean of the run-index means), matching cp-S0's definition. Pooling by grader count would give with 8 of 57 = 0.1404 and without 6 of 57 = 0.1053. Both give with > without; neither changes the verdict (verdict rule is helper-ran >= 3 of 24, met at 24).
4. CLAUDE.md says the suite has 751 tests; it has 813. The repo instruction is stale, not this iteration's fault.
5. Case regeneration, checked from the recorded hashes (I did not re-run `evals:select`): `diff scratch/cases-before.sha scratch/cases-after.sha` shows exactly the 8 review `prompt.md` lines differ; the 10 localize `prompt.md` lines and the `selection.json` line (whole file, so `chosen` too) are identical (19 lines each). The `prompt.md` and `selection.json` files now on disk hash to cases-after.sha. Agrees with the brief.
6. Not verified by me: the sweep exit code 1 (taken from scratch/t2review.log `sweep-exit=1`, not re-derived).
