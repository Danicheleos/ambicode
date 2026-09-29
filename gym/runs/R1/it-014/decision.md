# it-014 decision — reject (02 §3.5 step 3: the with-arm localize F1 of the T2 screening is below the bound)

**The screening's with-arm localize F1 is 0.4754, below the bound 0.5417 − 0.05 = 0.4917 by 0.0163. The rule makes this a reject, so the change is reset.** The evidence says the change cannot have caused it. That is a reading, and the rule stays as written until the owner answers L-018.

## Numbers (`it-014/metrics.json` `T2`; verifier 0 disagreements, `handoffs/verifier.md`)

```
Sonnet screening, 1 run/arm, 18 cases, 36 runs, 0 errors, partial false, $6.89 (judge cost not included), 672 s
                       it-014      reference (baseline/metrics-R-1.json)     bound
localize with F1       0.4754      0.5417 (per run index 0.5359 0.6397 0.5417)   0.4917   BELOW
localize without F1    0.6231      0.5715
localize with helper   2 of 10, plugin-fired 9 of 10
review with recall     0.1250      T2review 0.1250                              0.0750   ok
review without recall  0.0938      T2review 0.0938
review with            plugin-fired 8 of 8, helper-ran 8 of 8
```

Gates: G1 815/0 fail (813 + the patch's 2 tests), G2 zip `1585ac05…086ad` identical to it-011, it-012, it-013, G3 602 files. Preflight passed on the first attempt, $0.21. Reproduction: with only the code hunk reverted the test file fails at import (`before.log`), same form as it-012.

## Why the number is probably noise, and what that does not prove

- Nothing on the T2 path loads the changed file. Verifier: only `evals-record-core.test.mjs` imports `evals-record-core.mjs`; `evals-bench.mjs` mentions it in a comment (line 608) and spawns only `claude`; `npm run evals:record` is the only entry that runs it. The sweep cannot see this diff.
- One-run with-arm localize F1 on code this diff does not touch: 0.5359, 0.6397, 0.5417 (cp-S0 run indexes), 0.6015 (it-011 screening; its product change is `src/cli/commands/review.ts`), 0.4754 (this). The spread is 0.16 and the bound is 0.05 under the median, so a 1-run screening of unchanged code fails this bound in some fraction of runs. One in these five did. That is a count, not a rate: n is 5.
- The without arm moved the other way in the same sweep (0.6231 against 0.5715, +0.052) with the same cases.
- What it does not prove: that the with-arm drop is noise. I did not re-run the screening. Doing so until it passes would make the rule meaningless, and 02 §5 allows no retry on a reject.

## Consequences

- The recorder half stays unshipped: `it-014/diff.patch` (identical to `it-012/diff.patch`) is kept, and I reset only its two files after confirming the tree held nothing else of mine (the owner's uncommitted `gym/plan/supervisor/*` and `labels.json` are untouched).
- Rejections: it-012 inconclusive, it-013 accept, it-014 reject. S3 (3 in a row, or 5 of 7) is not reached.
- **L-018** is filed in `labels/pending.md`: the screening rule for a tooling-only change that no T2 path can see. Default if unanswered: (c), the reject stands and nothing changes.
- cp-3 needs "T3 recordings carry a per-case usage sidecar and the upper-bound flag". The sidecar already carries `turns`, and the flag is `turns ≤ 2`, so the flag is computable from any sidecar after the fact (it-012 counted 24 of 46 that way). Whether that satisfies cp-3's text is the owner's reading, not mine.
- Not measured: T1, T3, T4p (no surface touched); no re-screening; no live recording with the change.
