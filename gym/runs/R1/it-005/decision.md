# it-005 decision — accept, with one required step unmet (T2 smoke)

Plan revision R-1. Verdict rows: 02 §5 "WP0-type change (tooling, no behaviour claim)" for the change, plus the named gap below. Tag `gym/R1/it-005`.

## What was measured (from `metrics.json`)
- G1: 795 tests / 794 pass / 0 fail / 1 skipped, exit 0 (`verify.log`). Base on the unmodified tree: 776 / 775 / 0 / 1 (`base-verify.log`). +19, all in `evals/scripts/src/evals-record-core.test.mjs`.
- G2: identical zip sha256 `bee92a9a…7033`, exit 0 (`g2.log`). G3: 514 files LF, exit 0 (`g3.log`).
- Scope: `git diff --stat gym/R1/it-004 -- . ':!gym'` lists exactly `evals-record-core.mjs` (+151/−13) and the new `evals-record-core.test.mjs` (+185).
- Claim (H1): per-run findings, stability and the usage sidecar exist. Proof on the shipped path, final build, `scratch/keep2`, case `be-vs-5546-review-996-d520e3ca`, 2 runs: counts 4, 5; medium-and-above 2, 2; stability 0.333 (3 distinct keys, 1 in both runs); turns 2, 2; cost $0.0669, $0.0679. I re-derived every number from `run-1.json` and `run-2.json` with my own `jq`. The recordings file entry equals run 2's recording (checked on the first build's run).
- Reuse of a finished directory is refused before any spend: exit 1, "summary.json already exists; use a new directory".

## The verifier found three defects; all fixed with reproducing tests
`handoffs/verifier.md` (numbers agree on the first build; three defects): (1) stability 0 with one successful run of three, unmeasurable rather than unstable; (2) the `scratch` path-segment guard accepted `evals/scratch/keep` and `src/scratch`, which git does not ignore, so NDA reviewer output could have been committed; (3) a second `--keep-runs` call into the same directory replaced `summary.json` and `usage.json` and dropped the other cases. The worker wrote a failing test for each first (3 failed on the old code, 1 failed on a missing export), then fixed them (`handoffs/worker-1.md`). The verifier did not re-run on the final diff; I re-ran G1–G3 and the proof myself.

## What was NOT met, and it is a gap, not a pass
- **T2 smoke did not run.** 02 §4 requires "one T2 screening to prove the harness still runs" for `evals/scripts/**`. 02 §3.5 step 2 requires preflight before any T2. `npm run evals:preflight -- --model claude-sonnet-5-5` FAILED 3 of 3 (`scratch/preflight*.log`): `p2-task-regression-fix` shows Skill called 0x, Bash called 0x, unit-check pattern not found (5 turns each; the agent's own answer says it fixed the bug and ran jest and eslint with `node`), while `regression-ts` passed 4/4 each time. The same case passed on Opus at 04:04Z (`it-003/scratch/preflight.log`). I did not spend a T2 sweep behind a failed gate.
- Why this is not this change: nothing imports `evals-record-core.mjs` (verifier item 5); `evals-preflight.mjs`, `evals-bench.mjs` and the case files are unmodified (`git status`). I did not run the preflight on the base tree; that attribution rests on those two facts. That the cause is the model is inferred from the Opus pass and the 3-of-3 Sonnet fail, not measured, and the trace files were already deleted.
- Substitute evidence, weaker than what the plan requires: `regression-ts` (plugin fires, helper runs, the review completes through replay, the unit check runs) passed 4/4 on the changed tree three times.
- **I accept anyway** because the claimed metric is measured and the T2 harness is not touched. That is my reading of 02 §5 (the "skipped step" row speaks of the claimed metric). If the owner reads it the other way, the correct verdict is inconclusive and `gym/R1/it-005` should be bisected out; nothing after it depends on it except H2's A/A, which needs exactly this option.

## Other things not measured or not done
- The reviewer system prompt md5 and the `policies/` tree hash are not in `summary.json` (the prompt exists only inside the deleted scaffold; the plan does not define the tree hash). 01 §3 says `metrics.json.T3` carries them; H2 must decide how.
- No `--model` on the recorder: which reviewer model recorded these runs is the review config's (H2 settles).
- T1: no trigger surface touched. T4: none.

## Findings for H2 (recorded here, not acted on)
1. Sonnet fails preflight's `p2-task-regression-fix` 3 of 3 (plugin not fired). cp-S0 needs a T2 that runs behind a passing preflight; this is a blocker for H2's T2 until understood. It also bears on T1 (does the task skill trigger on Sonnet).
2. Both proof runs of the final build used 2 turns, and 2 of the 4 runs so far did ("a review with turns <= 2 is flagged `partial`", WP3 item 2).

## Recordings file
`benchmarks/reviewer-recordings.json` differs from `scratch/recordings-before.json` in one entry (`be-vs-5546…`: 4 findings before, 5 after): the proof runs overwrite it by design. The owner restored it at 10:09:09Z (`labels.json` owner-note-1); my second proof run came after that restore, so it differs again (sha256 `db893056…94f3`, was `b4d778c9…c12805`). The lead's own restore was denied by the guard (nda-data, denial 2 of 5) and was not retried.
