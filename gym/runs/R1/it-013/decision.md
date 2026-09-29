# it-013 decision — accept (02 §5 WP0-type row: measurement tooling, no behaviour claim)

**With the review sentence naming the skill, Sonnet's review with-arm `helper-ran` is 24 of 24 (it was 0 of 24 at cp-S0). The B2 exit (at most 2 of 24) does not apply.** T2 review is no longer blind to the plugin on Sonnet.

## Numbers (`baseline/metrics-R-1.json` `T2review`, `it-013/metrics.json`; verifier 0 disagreements, `handoffs/verifier.md`)

```
                         cp-S0 (old sentence)   it-013 (new sentence)
review with  plugin-fired     0 of 24               24 of 24
review with  helper-ran       0 of 24               24 of 24     (median 0 of 8 -> 8 of 8)
review with  Skill calls      {}                    ambicode:review 24
review with  recall median    0.0938                0.1250       sweeps 0.125 / 0.1563 / 0.0938
review without recall median  0.0938                0.0938       sweeps 0.0938 / 0.0625 / 0.125
review with  $/run, turns     0.1982, 8.75          0.1452, 6.625
review without $/run, turns   0.1917, 8.58          0.2047, 9.75
sweep                         (in the 18-case T2)   8 cases, 48 runs, 0 errors, partial false, $8.40, 731 s
agent model                   108 of 108 Sonnet     48 of 48 init rows claude-sonnet-5-5
```

Gates: G1 813/0 fail (811 + 2 new tests), G2 zip `1585ac05…086ad` identical to it-011 and it-012, G3 591 files. Reproduction: with the code hunk reverted the review-sentence test fails (`before.log`, 33 of 34 pass), the localize pin passes. `npm run evals:select` after the change: exactly 8 review `prompt.md` differ; 10 localize prompts and `selection.json` are byte-identical (`scratch/cases-{before,after}.sha`). Preflight (Sonnet) passed on the first attempt, $0.19 (L-017 c: no retry was allowed and none was needed).

## Which of prompt template and model caused helper-ran 0 of 24 (L-016)

The prompt template. Same model (Sonnet 5.5, every init row in both sweeps), same 8 cases, same graders, same plugin build: the sentence was the only difference, and the with-arm went from 0 to 24 of 24 skill calls. This does not say why Opus called the skill unprompted (23 of 24 at it-003) and Sonnet did not; it says the description alone does not make Sonnet call the review skill on this prompt. T1 remains the trigger metric.

## Not established, read with care

- **Recall did not move beyond noise.** With-arm 0.1250 against 0.0938 is Δ 0.031, under the 0.105 threshold (01 §3), and with against without in this sweep is the same 0.031. n is 3 sweeps of 8 cases. No quality claim rests on it.
- **The without arm was changed too.** Both arms read the sentence; the without arm has no plugin and tried to call `ambicode:review` in 2 of 24 runs. Its recall median is 0.0938, unchanged, but its turns rose from 8.58 to 9.75 and its cost from $0.1917 to $0.2047 per run. Old without-arm numbers and these are not the same treatment.
- **`recallPooled` is the mean of per-run recalls**, as in the cp-S0 block. Pooled by grader count it would be 8/57 = 0.1404 (with) and 6/57 = 0.1053 (without) (verifier).
- **What helper-ran proves here:** a Bash call matching the review helper ran, with the reviewer replay set. It does not show the review output was used well.
- Not measured, on purpose: T2 localize (the plan re-measures review only; the `T2` block and the `cp-S0` tag are untouched), T1, T3, T4p. The `it-012/diff.patch` recorder half is not re-applied here.

## Consequences

- From the next iteration, review recall of a screening or a decision sweep is compared with `T2review` (02 §3.5 step 3).
- WP3 item 2's recorder half (`it-012/diff.patch`) is next, with its own Sonnet preflight (L-017 c: a fail is a B2 stop). cp-3 then has a T2 control that can see the review seam.
- Guard: 1 denial this session, a false positive: a `cd evals/evals-core/cases` followed by a `../../../gym/...` redirect was read as a write outside the repo. Not retried in that form.
