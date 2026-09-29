# it-001 — record the 8 curated review cases with `--exclude 'main/assets/i18n/**'`, to 3 recordings each
WP: WP1 item 1 (01 §4; 07 K1)   Seam: none in the plugin. Harness input `benchmarks/reviewer-recordings.json` (gitignored; baseline copy at `archive/benchmarks__reviewer-recordings.json`, sha256 `c6022188…a666af`)
Claim: T3 recorded cases 5/8 → 8/8, with 3 recordings per case (cp-1 T3 criterion)
Must not move: nothing in the plugin changes (`git diff --stat` outside `gym/` stays empty); G1–G3 run as a sanity check
Measurement plan:
- G1–G3 ($0).
- T1: skipped, because no `skills/*/SKILL.md` frontmatter, `hooks/` or `src/hook/` change (02 §3.5 step 1). T2: none, because no code changes. T4: none, because no new human cycle.
- T3, staged so that spend can end between steps, reusing the 5 existing recordings as recording #1 of their cases (L-002: "do not repeat spend that already produced usable evidence"). This is valid because `prompts/`, `policies/` and `src/review/` are unchanged since the commit they were recorded at (`git diff --stat 6bde81c HEAD -- prompts policies src/review` → empty, verifier session 4):
  1. `npm run evals:record -- --exclude 'main/assets/i18n/**'`, all 8 cases → `it-001/scratch/record-1.log`: the first recording for the 3 FE cases (fe-vs-6086-review-2553-d1f112e5, fe-vs-6086-review-2553-d7c43dc5, fe-vs-6292-review-2537-3a49a0d3), the second for the other 5.
  2. The same command → `record-2.log`: the second recording for the 3 FE cases, the third for the other 5.
  3. The same command limited to the 3 FE case names → `record-3.log`: their third.
  In total 19 recordings. Per case: the median of findings over its 3 recordings, from the `<case>: ok, N finding(s)` log lines and, for the 5 reused cases, `baseline/metrics.json` T3.
Budget for this iteration: **$15** (19 × $0.67, the high end of 01 §3's per-case range, = $12.7). Stop rule: after step 1, if (measured cost per recording × recordings left) would take the iteration over $15, stop and record the partial result as inconclusive.
Files allowed to change: `gym/runs/R1/**`; `benchmarks/reviewer-recordings.json` (gitignored, by the recorder only).
Known side effect: later T2 review with-arm sweeps replay the new recordings, so their review numbers are not directly comparable to the cp-0 baseline, which replayed the 5 old ones. Any later decision on review recall has to name this.
Rollback: `cp gym/runs/R1/archive/benchmarks__reviewer-recordings.json benchmarks/reviewer-recordings.json`, then `shasum -a 256` must equal `c6022188…a666af`. There is no git reset, since nothing tracked changes.
