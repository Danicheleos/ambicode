# it-012 decision — inconclusive (B2 stop: the Sonnet preflight fails 2 of 2; T2 screening not run)

Verdict per 02 §5 row "not measured (skipped step)": **inconclusive, never accept.** The skipped step is the T2 screening that 02 §4 requires for `evals/scripts/**`. The change (`diff.patch`) is kept and reset out of the tree, as in it-008.

## What is established

```
G1  exit 0, 813 / 812 pass / 0 fail / 1 skipped     (it-011: 811; +2 = the two new tests)   verify.log
G2  exit 0, zip 1585ac05…086ad                        identical to it-011, reproducible x2     g2.log
G3  exit 0, 582 files                                                                          g3.log
reproduction  before.log: flag test, extended sidecar test and drift test fail against the unmodified recorder
flag reach    it-006 A/A sidecars: atMostOneToolCall true 24, false 22, null 0   (brief predicted 24 of 46)
```

The change does what the brief claims at unit level: each `usage.json` run entry carries `atMostOneToolCall` (true for turns ≤ 2, false above, null when turns is unknown), and a test pins the recorder's `SHORT_REVIEWER_TURNS` to the product's.

## Why it is not an accept

```
preflight 1  $0.20  FAIL  p2-task-regression-fix helper-ran: Bash called 0x
preflight 2  $0.19  FAIL  p2-task-regression-fix helper-ran: Bash called 0x   (--keep-temp)
```

`regression-ts` passed all four gated graders both times; `plugin-fired` passed on `p2-task-regression-fix` both times. The same case, prompt and model passed in it-009 and it-011. B2 allows one rerun; I made it. A third preflight and a T2 run behind the failure are forbidden by 02 §3.5 step 2, and I made neither. I did not change a grader, the prompt, or the gate.

## What the kept trace says (second run only)

The agent called `Skill ambicode:task` once, fixed `add` with `sed`, and ran `node /Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs review 2>&1 | tail -40`. So the helper ran. The grader's `input_match` is `ambicode(\.mjs\\")? review`, which matches `ambicode review` and a quoted `…ambicode.mjs" review`, not an unquoted path:

```
Bash inputs in the trace: 6      matching the grader regex: 0
regex on `node /x/scripts/ambicode.mjs review`        false
regex on `node "/x/scripts/ambicode.mjs" review`      true
regex on `ambicode review`                            true
```

Read this as a grader-brittleness finding, not as "the plugin did not run". Two limits: the first failing run's trace was not kept, so that it failed the same way is unverified; and the grader is an eval case file, which only an owner-confirmed replan may change (02 §3.3). Both preflights are counted as failures, not as "helper ran".

The diff cannot cause this: `evals-preflight.mjs` imports no local module (`grep '^import'` shows only `node:` modules), and `evals-record-core.mjs` is run by `evals:record` only.

## What was NOT measured

- T2 screening (required by 02 §4 for `evals/scripts/**`): not run. This is a gap in verification. The localize control and the harness end-to-end run are unchecked for this diff, though the diff touches a file no sweep imports.
- No live recording with the change (planned as not done in the brief).
- No verifier handoff: this iteration produced no T number to re-derive. G1/G2/G3 are read from their logs; the flag count is one script of mine. Say so rather than call it verified by a second party.

## Consequences

- WP3 item 2 (recorder half) is not accepted; cp-3 is not reachable until it is.
- Every remaining iteration needs a Sonnet preflight. With this grader the preflight is a coin flip that depends on whether the agent quotes the path (it-009, it-011 passed; it-012 failed twice).
- Label **L-017** asks the owner for a decision; options are in `labels/pending.md`. Default if unanswered by it-014: (c), the plan is unchanged; the next iteration that needs a T2 screening starts with its own ordinary preflight (a new iteration, not a rerun of this one) and stops at B2 again if it fails.
- The next non-blocked work is the R-4 replan the owner ordered in L-016 (a), which needs no measurement.

## Rollback

`git diff --stat` before the reset showed only `evals/scripts/src/evals-record-core.{mjs,test.mjs}` from this iteration (plus the owner's `gym/plan/supervisor/*` and `labels.json`, which are not touched). `diff.patch` is byte-identical to the worker's diff (`diff` printed nothing). Reset by reverting those two files only.
