# it-014 verifier: independent re-measurement of T2 screening

Method: own node script (/tmp/ver014/v.mjs, outside the repo) reads `scratch/t2screen-sonnet.json` (byte-identical to `evals/evals-core/results/eval-2026-09-29T14-01-02-672Z.json`, cmp), reimplements the `namedFiles`/`scoreAnswer` definition, and reads truth from `evals/evals-core/cases/<name>/truth.json` or `benchmarks/cases/<name>/truth.json`. `score()` from evals-bench.mjs was run afterwards as a cross-check only. Did not use screen-numbers.mjs, trace-summary.mjs or t2-merge.mjs.

Result: 0 disagreements.

| # | Field | metrics.json T2 | Re-derived | Verdict |
|---|---|---|---|---|
| 1 | cases | 18 | 18 (10 localize, 8 with `-review-`) | agree |
| 1 | runs | 36 (18 x 2 arms x 1) | 36 | agree |
| 1 | runs with `error` | 0 | 0 | agree |
| 1 | partial | false | false | agree |
| 1 | model override | claude-sonnet-5-5 | `suite.modelOverride` = "claude-sonnet-5-5" | agree |
| 1 | claudeVersion | 2.1.284 | 2.1.284 | agree |
| 1 | skippedPaidGraders | not stated | 0 runs | n/a |
| 2 | Localize F1 with | 0.4754 | arm mean of per-run F1 = 0.475377 (score(): 0.475377, identical) | agree |
| 2 | Localize F1 without | 0.6231 | arm mean of per-run F1 = 0.623068 (score(): 0.623068) | agree |
| 2 | Localize precision / recall with | 0.5234 / 0.4974 | 0.523420 / 0.497381 | agree |
| 3 | Review recall with | 0.125 | mean of per-run recall = 0.125 (score(): 0.125) | agree |
| 3 | Review recall without | 0.0938 | 0.09375 (score(): 0.09375) | agree |
| 3 | Review with: plugin-fired / helper-ran | 8 / 8 of 8 | 8 / 8 of 8 | agree |
| 3 | Localize with: plugin-fired / helper-ran | 9 / 2 of 10 | 9 / 2 of 10 | agree |
| 4 | Model proof | 36 of 36 traces claude-sonnet-5-5, missingTraces 0 | 36 distinct `e-...` ids from tracePath, 36 trace files present, exactly 1 `system`/`init` row each, 36 rows model `claude-sonnet-5-5`, 0 other; also 533 of 533 assistant messages `claude-sonnet-5-5` | agree |
| 5 | Localize with F1 vs bound | ref median 0.5417, bound 0.4917 | reference read from baseline/metrics-R-1.json T2.localize.with.f1Median = 0.5417; 0.4754 < 0.4917 (by 0.0163): **below the bound** | agree (no disagreement on numbers) |
| 5 | Review with recall vs bound | ref 0.125, bound 0.0750 | T2review.review.with.recallMedian = 0.125; 0.125 >= 0.0750 (above by 0.05) | agree |
| 6 | Importers of evals-record-core | only its own test | see below | agree |
| 6 | diff.patch files | record-core + test only | 2 `diff --git` headers: evals/scripts/src/evals-record-core.mjs and evals/scripts/src/evals-record-core.test.mjs | agree |
| 7 | G1 | exit 0, 815 tests, 814 pass, 0 fail, 1 skipped | verify.log: `ℹ tests 815`, `pass 814`, `fail 0`, `skipped 1`, `exit=0`; it-013 was 813, +2 `it(` added in diff.patch = 815 | agree |
| 7 | G2 | exit 0, zip sha256 1585ac05...086ad, reproducible | g2.log: "Reproducible: 50 files ... identical zip sha256 (1585ac05ebf11f65d34674b82b7de99c0d353a22d3be6e676e9f0e8d213086ad) across two independent runs", exit=0; verify.log archive sha256 the same; same digest in it-011/012/013 g2.log | agree |
| 7 | G3 | exit 0, 602 files | g3.log: "line endings OK: 602 tracked text file(s), all stored as LF", exit=0 | agree |

## Two definitions of the aggregates (both reported)

Recorded numbers use the arm mean of per-run values (what `score()` defines). Pooled over all named/true files instead:

```
localize F1 with    mean-of-runs 0.4754   pooled 0.4220
localize F1 without mean-of-runs 0.6231   pooled 0.5649
review recall with    mean-of-runs 0.1250 pooled 3/19 = 0.1579
review recall without mean-of-runs 0.0938 pooled 2/19 = 0.1053
```

The bound verdicts are stated on the mean-of-runs definition, which is the one metrics-R-1.json's reference figures use (per-sweep values; f1Pooled there is 0.5724, a different quantity). With the pooled definition the localize with-arm value (0.4220) is also below the 0.4917 bound; the review with-arm pooled value (0.1579) is above 0.0750.

Review per-case hits (with / without): 0/1 0/1; 0/1 0/1; 0/2 0/2; 1/2 1/2; 1/4 0/4; 0/2 0/2; 0/3 0/3; 1/4 1/4 (order of the result file; each run's `raises-NN` grader count equals the truth.json thread count for all 16 runs).

Sample size caveat: 1 run per arm per case. Localize with-arm 0.4754 vs without 0.6231 differ by 0.148 on 10 single runs; the reference had 3 sweeps ranging 0.5359 to 0.6397 (spread 0.104), so 0.4754 is outside that observed range but this sweep alone cannot decide anything (the metrics.json kind line says the same).

## Item 6 detail

`grep -rIn evals-record-core .` excluding node_modules, .git, gym, benchmarks:

```
evals/scripts/src/evals-record-core.test.mjs:8:import {...} from './evals-record-core.mjs';   (its own test; the only import)
evals/scripts/src/evals-record-core.mjs:6, :111     (own header comment; own recordedFrom string)
evals/scripts/src/evals-bench.mjs:608               comment only: "a recording made by `evals-record-core.mjs` is the only way..."
evals/evals-core/README.md:97                       prose
package.json:22   "evals:record": "node evals/scripts/src/evals-record-core.mjs -j 4"   (npm script runs it; not an import)
```

Other hits: trace files under evals/evals-core/results/traces (recorded tool output text) and a copy under .claude/worktrees/agent-a21c0c8e882cf1657 (another agent's worktree, same shape). Neither imports it.

evals-bench.mjs: no `import` of evals-record-core (imports at lines 2 to 7 are node builtins only); `grep -n "record-core\|recordCore\|spawn("` gives line 608 (comment) and line 718 `const child = spawn('claude', args, { stdio: 'inherit', env });`, which spawns `claude`, not the recorder.

Not done: did not re-run verify/G2/G3 (instructed), did not re-run any eval. Item 1 model override is confirmed from `suite.modelOverride` in the result plus the traces; the run command line itself is not in t2screen.log.
