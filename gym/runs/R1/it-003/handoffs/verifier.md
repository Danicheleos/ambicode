# verifier handoff — it-003 — 01f626f + working tree

## Ran
- `npm run verify` → exit 0, 25 s wall (`time`); output file: /tmp/v-verify.log (outside repo)
- `npm run package:reproducible` → exit 0, ~1 s wall; output file: /tmp/v-g2.log
- `node check-line-endings.mjs` → exit 0; stdout ("line endings OK: 491 tracked text file(s)")
- `tr -cd '\r' < <file> | wc -c` on the 4 new files → 0 each; stdout
- `git diff --stat gym/R1/it-002 -- . ':!gym'`, `git diff gym/R1/it-002 -- . ':!gym' | cmp - gym/runs/R1/it-003/diff.patch`, `git diff gym/R1/it-002 c4ec3d5 -- . ':!gym' | cmp - diff.patch` → all identical; stdout
- `node /tmp/vv/t2.mjs` (my script: rebuilds the merge from the two raw files, compares it with `t2-merged.json`, computes per-run-index means, medians, helper-ran, costs; localize F1 uses the exported `score()` of `evals-bench.mjs`, review recall is also recomputed from the raw `raises-N` graders with jq-style code) → exit 0; stdout
- `npm run evals:score -- gym/runs/R1/it-003/scratch/t2-merged.json` → exit 0; stdout
- T3: `grep` of `record-{1,2,3}.log` + `sha256sum benchmarks/reviewer-recordings.json`; stdout
- `node gym/runs/R1/it-003/scratch/prompt-diff.mjs <../ambicode-it-003-base> <repo root>` (no model calls, about 4-5 min, not timed) → exit 0; output file: /tmp/vv/pd.log
- Model count over the 108 traces named by `t2-merged.json` (`evals/evals-core/results/traces/e-XXXX.jsonl`, jq on the system/init row); stdout
- Path-existence scan of `brief.md` and `metrics.json` (`/tmp/vv/paths.mjs`); stdout

## Numbers
| field | value | from |
|---|---|---|
| G1 | exit 0; tests 776, pass 775, fail 0, cancelled 0, skipped 1 | /tmp/v-verify.log:1071-1076; `verify.log:1071-1076` has the same 5 numbers |
| G1 vs gate | 776 >= 755 (cp-1 752 + 3) | `it-002/metrics.json` G1.tests = 752 |
| G1 new tests | +24 (776 - 752). `git diff gym/R1/it-002 -- '*.test.ts'` adds 24 `it(`/`test(` declarations and removes 0. | `git diff ... \| grep -cE "^\+\s*(test\|it)\("` → 24 |
| G2 | exit 0; 50 files identical across two runs; zip sha256 bee92a9a930c0cb4701473541c02ae910697df039f03a07cd69c7789e5487033 | /tmp/v-g2.log |
| G3 | exit 0; 491 tracked text files, all LF | `node check-line-endings.mjs` |
| new files CR bytes | `src/cli/init-mcp-server.test.ts` 0, `src/cli/prepare-size.test.ts` 0, `src/requirements/receipt.ts` 0, `src/snapshot/preflight.ts` 0 | `tr -cd '\r'` |
| untracked outside gym | none. The 4 new files are intent-to-add (`A`); the only `??` is `gym/runs/R1/it-003/`. | `git status --short`, `git ls-files -o --exclude-standard \| grep -v ^gym/` (empty) |
| scope | 24 files, +725/-36. All fall under the brief's list plus the addendum (`src/review/bundle.ts`, `src/cli/main.ts`). Test files: cli.test.ts, init-mcp-server.test.ts (new), prepare-size.test.ts (new), config.test.ts, render.test.ts, requirements.test.ts, report.test.ts, review.test.ts. | `git diff --stat gym/R1/it-002 -- . ':!gym'` |
| diff.patch | byte-identical to the current working-tree diff, and to the worker commit c4ec3d5's diff | `cmp` |
| `git diff --stat gym/R1/it-002 01f626f -- . ':!gym'` | empty | git |
| T1 overall | 8 cases, 7 passed, overallScore 0.925, passRate 0.875, cost $4.1767642, 268 s, partial false, 0 run errors | `scratch/triggers/2026-09-29T03-59-23-433Z/aggregate-result.json` (.aggregates, .costUsd, .durationSeconds, .partial) |
| T1 with-arm mean score, cost, seconds per case (3 runs) | unrelated-question 1.0, $0.4371, 88 s; url-bare 0.4, $0.5351, 131 s; url-implement 1.0, $0.5131, 107 s; url-plan 1.0, $0.5271, 118 s; url-question 1.0, $0.4965, 104 s; url-review 1.0, $0.5314, 116 s; verb-implement 1.0, $0.6121, 189 s; verb-review 1.0, $0.5244, 165 s | jq over `.cases[].arms.with[]` |
| T1 scored mean | 1.0 over the 7 non-url-bare cases; per-case `partial` is not a field, run-level `error` null in 24/24 | jq |
| T1 url-bare | 3/3 runs fired `ambicode:investigate` only (passed graders any-skill-fired + fired-investigate; plan, review, task 0x); score 0.4 each; matches `t1.log:25-53` | aggregate-result.json graders; `scratch/t1.log` |
| T1 baseline | cp-0 scoredMean 1.0, overallScore 0.925, url-bare investigate 3/3, cost $4.2107 | `baseline/metrics.json` T1 |
| preflight | exit 0, $0.40 | `scratch/preflight.log:9,19` |
| T2 run errors | 1, in the sweep file: be-vs-5075, with arm, run index 2, started 2026-09-29T04:09:32.647Z, 13 s, $0, ENOENT ("a plugin, case or version-control path could not be examined"). Rerun file: 0 errors. | my script `ERR` line |
| T2 merge | Rebuilding "sweep minus be-vs-5075 plus the rerun's be-vs-5075" gives 18 cases, and each case is byte-identical to the case in `t2-merged.json` (18 of 18). `t2-merged.json` `mergedFrom[0].used` lists 17 sweep cases without be-vs-5075. | my script line "own-merge cases 18 identical to merged 18 diff []" |
| T2 localize with, F1 per run index 0/1/2 | 0.6328 / 0.6417 / 0.6248; median 0.6328; pooled 0.6331; precision 0.6941; recall 0.6667 | my script; `evals:score` "localize/with" f1 0.6331, precision 0.6941, recall 0.6667 |
| T2 localize without, F1 per run index | 0.6403 / 0.6408 / 0.6563; median 0.6408; pooled 0.6458; precision 0.6731; recall 0.7045 | same |
| T2 localize helper-ran (with) | 9/9/9 per run index = 27 of 30, median 9 of 10; without arm 0 (no helper grader) | my script; `evals:score` helper-ran 27 |
| T2 localize cost/run, turns (with) | $0.5265 / $0.5397 / $0.5455 per run index; mean $0.5373; turns 16.40. Without: $0.4136, turns 11.70 | my script |
| T2 review with, recall per run index | 0.0938 / 0.1563 / 0.1875; median 0.1563; pooled 0.1458 (both by `score()` and by direct `raises-N` counting) | my script; `evals:score` "review/with" recall 0.1458 |
| T2 review without, recall per run index | 0.0938 / 0.0938 / 0.0938; median 0.0938; pooled 0.0938 | same |
| T2 review helper-ran (with) | 8/7/8 per run index = 23 of 24, median 8 of 8 | my script; `evals:score` helper-ran 23 |
| T2 review cost/run, turns (with) | $0.6538 / $0.6872 / $0.6547; mean $0.6652; turns 18.46. Without $0.5806, turns 14.71 | my script |
| T2 cost and time | sweep file $57.8306174, rerun file $2.8228528, total $60.6534702; 3202 + 228 = 3430 s. Per-run `costUsd` sums equal the file `costUsd`. `judgeCostUsd` is NOT in either (sweep $0.8561, rerun $0.0242, sum $0.8803). | jq sums |
| T2 cp-0 comparison | localize with median 0.6565, without 0.6198; review with median 0.1563, without 0.1250; helper-ran 28 of 30 (median 9) and 23 of 24 (median 8); with-arm cost/run $0.5442 and $0.6305 | `baseline/metrics.json` T2 |
| T3 findings per case (rec 1, 2, 3) → median, cp-1 median, delta | be-vs-3571 7,6,1 → 6 (4, +2); be-vs-5075 5,4,3 → 4 (4, 0); be-vs-5546 3,3,4 → 3 (6, **-3**); be-vs-6261 1,3,1 → 1 (2, -1); fe-vs-6086-d1f112e5 5,4,5 → 5 (3, +2); fe-vs-6253 3,4,3 → 3 (4, -1); fe-vs-6086-d7c43dc5 2,4,3 → 3 (3, 0); fe-vs-6292 4,2,4 → 4 (2, +2) | `record-{1,2,3}.log`; cp-1 medians from `it-001/metrics.json` T3.perCase (findings [6,6,5] for be-vs-5546 at cp-1) |
| T3 cost | $2.37 = sum of the 24 per-recording costs in the three logs; all three runs "refused 0", "wrote 8 recording(s)" | logs |
| T3 file hashes | `benchmarks/reviewer-recordings.json` sha256 = b4d778c9ab0e3a6d8264dc0ac31bb92f3abf9b8e399f1c59ce36cfb6d4c12805 = `metrics.json` T3.fileSha256After. `recordings-before.sha256` = 6b7157a5bdfbc58b7050546211da14b15c0b3884b8778d64b6b7703596d0463c = `it-001/metrics.json` T3.fileSha256After | `sha256sum`; `cat` |
| reviewer input identity | My re-run of `prompt-diff.mjs` gave 16 of 16 `identical` (8 cases x system and user prompt), 0 DIFFERENT, 0 NONDETERMINISTIC. Every hash/size field is the same as `scratch/prompt-diff.log`. | /tmp/vv/pd.log vs `scratch/prompt-diff.log` (diff of columns 1-5: empty) |
| prompt-diff positive control | Shipped scripts in `../ambicode-it-003-base` hold `receivedAt` 0 and `mcp-server` 0 times; the repo root holds 5 and 6 (`grep -o` over `scripts/ambicode.mjs` and `scripts/chunks/*.mjs`, after my `npm run verify` rebuilt the root) | shell counts, same as the lead's log |
| unchanged reviewer files | `git diff --stat 01f626f -- src/review/claude-reviewer.ts prompts policies` empty; the same against `gym/R1/it-002` empty | git |
| models.agent | 108 traces named by `t2-merged.json`, all present in `evals/evals-core/results/traces/`, 108 system/init rows, 108 x `claude-opus-5-5`, 0 other, 0 missing | jq loop |
| paths | 28 backticked or quoted paths in `brief.md` and `metrics.json` resolve. Those that do not resolve are not file paths (see Could not do). `tools/t2-merge.mjs` (metrics.json) exists at `gym/runs/R1/tools/t2-merge.mjs`. Refs `gym/R1/it-002`, `c4ec3d5`, `34284c4`, `01f626f` all resolve. | `/tmp/vv/paths.mjs`; `git rev-parse` |
| costUsd arithmetic | 4.1768 + 0.40 + 57.8306 + 2.8229 + 2.37 = 67.6003; metrics.json says 67.60 and the breakdown adds up | node/bc by hand |

## Disagreements (verifier/auditor only)
| field | lead's value | mine | source of difference |
|---|---|---|---|
| G1 explanation of +24 | "22 new tests from the worker plus 2 benchmark-presence tests that register only where benchmarks/ exists" | The total 776 agrees. The diff adds **24** test declarations (`git diff gym/R1/it-002 -- '*.test.ts'`, 0 removed), so 752 + 24 = 776 without a special case. The 2 benchmark-conditional tests are pre-existing (`evals/scripts/src/evals-bench.test.mjs:515`, `skip: !existsSync(REAL)`) and are already inside cp-1's 752, which was measured in this tree. The worker's 774 in a tree without `benchmarks/` is 752 - 2 + 24. | Wrong attribution in the note only. Not verified by running the base tree; from the diff and the skip condition. |
| G1 seconds | 59 | 25 (wall of `npm run verify`, warm caches) | Timing only, not a gate. |
| costUsd 67.60 | "Eval-harness spend" | 67.60 excludes `judgeCostUsd` of T2, $0.88 (sweep 0.8561 + rerun 0.0242); with it 68.48. The harness `costUsd` of each result file is the sum of per-run `costUsd` only. | The lead's arithmetic is right for the field it sums; the field is short of the true spend by $0.88 (1.3 %). |
| T3 "within ±2 of cp-1" (brief must-not-move) | metrics.json lists delta -3 for be-vs-5546 and attributes it to reviewer sampling on identical input | Agree with the number. It is **outside** the brief's ±2 bound on 1 of 8 cases (be-vs-5546, 6 → 3); three more cases are at exactly +2. Under 01 §2's own T3 rule (a difference of >= 2 is real) 4 of 8 medians are "real" (+2, +2, -3, +2). | Stated for the decision, not a data disagreement. The change is not the cause by prompt identity (see Signal-rule reading). |

## Could not do
- Verify that the recorder's `review` command builds the same reviewer prompts as `bundle` for these cases. `prompt-diff.mjs` hashes the files `ambicode bundle --json` writes; the recorder (`evals-record-core.mjs:92-93`) calls both `bundle` and `review`. The prompts are hashed from the bundle only. Running `review` needs the model (spend).
- Run the base tree's test suite to check the 752 count, or count tests per file at `gym/R1/it-002`. I used the test-declaration count in the diff instead.
- Check `brief.md` tokens `SKILL.md`, `bundle.ts`, `prepare.ts`, `decision.md`, `gym/R1/it-002` as paths: they are a generic file name, short names for files under `src/`, a decision file that does not exist yet, and a git ref (which resolves).
- Explain why be-vs-5546 recorded 3,3,4 findings against 6,6,5 at cp-1 (no overlapping run) on byte-identical prompts. That needs a model run.
- Time the prompt-diff re-run (I did not time it).

## Claims without evidence
- (none)

## Signal-rule reading
Thresholds from `gym/plan/01-goals-and-metrics.md` §3, decision table `02 §5`. All comparisons are it-003 against cp-0 (`baseline/metrics.json`).

| control | it-003 | cp-0 | delta | threshold | reading |
|---|---|---|---|---|---|
| localize with-arm F1 (median of 3) | 0.6328 | 0.6565 | -0.0237 | real if \|d\| >= 0.05 and without-arm within +-0.03 | **within noise** |
| localize without-arm F1 (drift control) | 0.6408 | 0.6198 | +0.0210 | within +-0.03 | **within noise**, so the with-arm reading stands |
| review with-arm recall (median of 3) | 0.1563 | 0.1563 | 0.0000 | real if \|d\| >= 0.105 | **within noise** |
| review without-arm recall (context only) | 0.0938 | 0.1250 | -0.0312 | 01 §3 noise 0.06 (one thread of 19 = 0.053) | within noise |
| localize helper-ran, pooled / median | 27 of 30 / 9 of 10 | 28 of 30 / 9 of 10 | -1 / 0 | real if change >= 2 | **within noise** |
| review helper-ran, pooled / median | 23 of 24 / 8 of 8 | 23 of 24 / 8 of 8 | 0 / 0 | real if change >= 2 | **within noise** |
| with-arm cost/run, localize | $0.5373 | $0.5442 | -1.3 % | reject if > +25 % | within (also +11.9 % against 01's $0.48) |
| with-arm cost/run, review | $0.6652 | $0.6305 | +5.5 % | reject if > +25 % | within (+0.8 % against 01's $0.66) |
| T1 7 scored cases | 1.0 in 3 of 3 runs each | 1.0 | 0 | any scored case < 1.0 in >= 2 of 3 runs = regression | **within noise**, no regression |
| T1 url-bare | investigate 3/3 | investigate 3/3 | none | diagnostic | unchanged |
| T3 median findings per case | see table above | cp-1 medians | -3 (be-vs-5546), +2 x3, others -1..0 | brief: within +-2; 01 §2: >= 2 is real | **beyond the brief's bound on 1 of 8 cases** (be-vs-5546). cp-3's no-go rule (drop >= 3 on >= 2 cases) is not met: 1 case. The reviewer prompts are byte-identical to the base on 16 of 16 (my re-run), and `claude-reviewer.ts`, `prompts/`, `policies/` are unchanged, so the prompt files and reviewer code cannot explain the move. Not shown: `review`-path identity (see Could not do). Attribution to sampling is consistent with the evidence but unproven for be-vs-5546, where all 3 new runs are below all 3 cp-1 runs. |
| G2, G3 | exit 0, identical zip sha256; exit 0 | | | | pass |

Two caveats that touch the T2 reading. (1) The recordings replayed in T2 are it-001's 8 recordings for it-003 and 5 for cp-0, so review with-arm numbers are not like-for-like with cp-0 (brief names this); the review recall median is equal anyway. (2) T2 exercised only item 3 of the change (0 of 19 cases carry a requirement source, per the brief), so "within noise" says nothing about items 1 and 2; those rest on their unit tests (24 new, all passing in my `npm run verify`).
