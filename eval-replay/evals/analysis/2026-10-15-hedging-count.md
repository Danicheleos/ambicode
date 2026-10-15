# Hedging count: plugin vs bare finals (2026-10-15)

Question: does "State uncertainty instead of raising your confidence..." make plugin finals hedge more than bare, especially on points the run had evidence for?

Script: `eval-replay/evals/raw/tools/hedging.mjs` (re-run it to reproduce). Data: plugin traces from 2026-10-13T07 on (126 finals, 3 runs per case per ts, mixed flow versions); bare = the single bare run 2026-10-14T00-14 (12 finals, 1 per case). Bare n is tiny: per-case bare numbers are anecdotes.

Type (a) = sentence also matches a gap pattern ("I ran no tests", "did not check", "not verified"). Type (b) = every other hedge phrase. The split is a regex heuristic; the 10-final sample below is the manual check.

## Result

Plugin type-b is not above bare. Plugin 1.57 per 1k words, bare 2.23. Plugin type-a is higher (2.64 vs 1.71), driven by task-fix and task-multi ("I ran no tests") and plugin routes that disclose what the navigator did, not by doubt on read material.

## Manual check of the 10 highest type-b plugin finals (against trace tool calls)

- 5 are investigate-nomatch: the greps ran and found nothing; hedge is "can't say where / may be in another repo". Honest, evidence-consistent. Mild over-hedge only in that a negative search is stated as "can't say" instead of "not in this repo".
- 3 are investigate-files (12T24-23 runs 1,3; 14T00-23 run 1): files were read via `cat -n`; hedge is "inferred from shape, did not confirm" about the route flags, which the code does not show. Correct. "The service probably doesn't change" is the one soft hedge on a point the run read.
- plan-accept-1 ("did not confirm the Accept answer"): the route output was only "complete"; honest gap.
- investigate-how-2: "inferred from the object's shape, not confirmed" on HTTP mounting; no handler exists in the files read. Correct.
- Real type-b over-hedge in the sample: 2 of 10 (investigate-files, "probably"/"may").

## Correlation with failing LLM graders (answer-correct, plan-quality, finding-correct)

Pearson r of type-b per 1k with fail: plugin r=-0.14 (n=86, 31 fails), bare r=0.71 (n=7, 3 fails; meaningless). Plugin failing finals hedge less (0.53) than passing (1.10).

## Full output of the script
```
plugin ALL: n=126 words/final=206.06 hedgeA/1k=2.64 hedgeB/1k=1.57 share(B>=1)=0.23
bare ALL: n=12 words/final=294.67 hedgeA/1k=1.71 hedgeB/1k=2.23 share(B>=1)=0.33
plugin common-cases: n=126 words/final=206.06 hedgeA/1k=2.64 hedgeB/1k=1.57 share(B>=1)=0.23
bare common-cases: n=12 words/final=294.67 hedgeA/1k=1.71 hedgeB/1k=2.23 share(B>=1)=0.33

investigate-files plugin: n=8 words/final=196.25 hedgeA/1k=1.55 hedgeB/1k=4.78 share(B>=1)=0.50
investigate-files bare: n=1 words/final=132.00 hedgeA/1k=0.00 hedgeB/1k=15.15 share(B>=1)=1.00
investigate-how plugin: n=11 words/final=204.18 hedgeA/1k=2.46 hedgeB/1k=2.00 share(B>=1)=0.36
investigate-how bare: n=1 words/final=138.00 hedgeA/1k=7.25 hedgeB/1k=0.00 share(B>=1)=0.00
investigate-nomatch plugin: n=11 words/final=136.82 hedgeA/1k=0.90 hedgeB/1k=7.52 share(B>=1)=0.73
investigate-nomatch bare: n=1 words/final=130.00 hedgeA/1k=0.00 hedgeB/1k=7.69 share(B>=1)=1.00
investigate-trace plugin: n=8 words/final=397.50 hedgeA/1k=4.22 hedgeB/1k=0.65 share(B>=1)=0.25
investigate-trace bare: n=1 words/final=530.00 hedgeA/1k=0.00 hedgeB/1k=0.00 share(B>=1)=0.00
plan-accept plugin: n=17 words/final=248.88 hedgeA/1k=1.60 hedgeB/1k=1.73 share(B>=1)=0.35
plan-accept bare: n=1 words/final=654.00 hedgeA/1k=0.00 hedgeB/1k=1.53 share(B>=1)=1.00
plan-reuse plugin: n=23 words/final=259.17 hedgeA/1k=2.86 hedgeB/1k=0.87 share(B>=1)=0.22
plan-reuse bare: n=1 words/final=855.00 hedgeA/1k=0.00 hedgeB/1k=2.34 share(B>=1)=1.00
review-clean plugin: n=5 words/final=131.00 hedgeA/1k=0.00 hedgeB/1k=0.00 share(B>=1)=0.00
review-clean bare: n=1 words/final=94.00 hedgeA/1k=0.00 hedgeB/1k=0.00 share(B>=1)=0.00
review-defect plugin: n=5 words/final=131.80 hedgeA/1k=0.00 hedgeB/1k=0.00 share(B>=1)=0.00
review-defect bare: n=1 words/final=204.00 hedgeA/1k=0.00 hedgeB/1k=0.00 share(B>=1)=0.00
review-regression plugin: n=8 words/final=128.63 hedgeA/1k=0.00 hedgeB/1k=0.00 share(B>=1)=0.00
review-regression bare: n=1 words/final=172.00 hedgeA/1k=5.81 hedgeB/1k=0.00 share(B>=1)=0.00
review-subtle plugin: n=14 words/final=183.93 hedgeA/1k=2.34 hedgeB/1k=0.00 share(B>=1)=0.00
review-subtle bare: n=1 words/final=441.00 hedgeA/1k=0.00 hedgeB/1k=0.00 share(B>=1)=0.00
task-fix plugin: n=8 words/final=115.00 hedgeA/1k=8.73 hedgeB/1k=0.00 share(B>=1)=0.00
task-fix bare: n=1 words/final=52.00 hedgeA/1k=0.00 hedgeB/1k=0.00 share(B>=1)=0.00
task-multi plugin: n=8 words/final=179.00 hedgeA/1k=6.78 hedgeB/1k=0.00 share(B>=1)=0.00
task-multi bare: n=1 words/final=134.00 hedgeA/1k=7.46 hedgeB/1k=0.00 share(B>=1)=0.00

plugin corr(hedgeB/1k, llm-grader fail): r=-0.14 n=86 fails=31
bare corr(hedgeB/1k, llm-grader fail): r=0.71 n=7 fails=3
plugin hedgeB/1k failing=0.53 passing=1.10
bare hedgeB/1k failing=1.29 passing=0.00
plugin phrases/1k: not verified=1.08 may=0.42 inferred=0.39 can't confirm=0.35 inference=0.31 did not confirm=0.27 i did not check=0.27 i didn't check=0.27 can't say=0.23 not confirmed=0.15 probably=0.12 likely=0.08 might=0.08 didn't confirm=0.04 cannot say=0.04 appears to=0.04 unverified=0.04
bare phrases/1k: may=1.13 could be=0.57 i didn't check=0.57 can't confirm=0.28

TOP10 plugin by type-B/1k
2026-10-13T12-25-09-547Z investigate-nomatch-2 B/1k=19.87 fail=null :: I can't say where the reconnect backoff is or what its maximum delay is. | The code may be in another repository or package, or the question may be about a different project..
2026-10-13T12-35-49-023Z investigate-nomatch-1 B/1k=14.81 fail=null :: - The repo appears to have no WebSocket client and no reconnect backoff, so I can't give a maximum delay. | - The implementation may be in another repository or in a dependency..
2026-10-14T00-11-31-143Z investigate-nomatch-1 B/1k=14.49 fail=null :: So I can't say where a WebSocket reconnect backoff is implemented or what its maximum delay is, and nothing in this repo supports a guess. | The code may live in another repository or in a dependency that isn't checked in..
2026-10-14T00-23-11-856Z investigate-files-1 B/1k=13.51 fail=null :: The service may need an edit only if you want validation.. | I inferred that from the shape and did not confirm it.
2026-10-13T12-24-23-354Z investigate-files-3 B/1k=12.00 fail=null :: The service probably doesn't change.. | That is my inference.
2026-10-13T12-26-14-720Z plan-accept-1 B/1k=8.73 fail=false :: I recorded the supplied `plan-accept=Accept` answer but did not confirm it myself, so I can't say whether the plan is saved as accepted or still a draft.
2026-10-13T11-36-32-875Z investigate-how-2 B/1k=8.51 fail=false :: Whether anything mounts it as an HTTP route is inferred from the object's shape, not confirmed.
2026-10-13T11-37-03-447Z investigate-nomatch-1 B/1k=8.47 fail=null :: - a symbol or word the code probably uses, such as `reconnect`, `backoff`, `retryDelay`, `maxDelay` or `WebSocket`.
2026-10-13T12-24-23-354Z investigate-files-1 B/1k=7.75 fail=null :: The `currency: true` and `tax: true` entries look like flags for which fields the route exposes, so the matching change is probably a `dueDate: true` entry. | That is my inference from the shape.
2026-10-13T12-35-49-023Z investigate-nomatch-2 B/1k=6.90 fail=null :: If the code might be in another repository, or under a different name such as SSE or a polling client, say so.
```
