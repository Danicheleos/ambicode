# it-008 decision — inconclusive (B2 stop): the Sonnet preflight still fails `plugin-fired` and `helper-ran` with the new prompt

Plan revision R-2. The claim was "one Sonnet preflight that passes". It did not, in 2 of 2 runs. The gates were green; the claim was not met; the owner's line says stop and report (L-013: "If the preflight still fails with the new prompt, stop and report; do not weaken plugin-fired or helper-ran"). I stopped. No T2, no cp-S0, no Opus preflight, no second prompt edit, no further grader dropped.

## Evidence (`metrics.json`; every field re-derived from the two result JSONs with `jq`, `scratch/preflight-derived.jsonl`)

```
G1  exit 0, 804 / 803 / 0 / 1        (change applied; +9 tests over 795)
G2  exit 0, zip bee92a9a…7033        (identical to it-005/006/007)
G3  exit 0, 546 files

preflight, claude-sonnet-5-5 (suite.modelOverride), $0.1627 and $0.1704
                                 attempt 1   attempt 2 (--keep-temp)
p2  plugin-fired                 false       false      (Skill called 0x)
p2  helper-ran                   false       false      (grader text "Bash called 0x"; the trace has Bash calls, none of them an ambicode script, so the grader counts a narrower Bash pattern than any Bash call)
p2  unit-check-ran (NOTE)        false       false
p2  fixed-and-verified           false       true
p2  add-restored                 true        true
regression-ts  plugin-fired, helper-ran, reviewer-completed, unit-check-ran   all true, both attempts
```

- Cause, read from the kept trace of attempt 2 (`scratch/trace-B.jsonl`, agent `claude-sonnet-5-5`, 6 turns): Sonnet ran `git diff`, fixed `add` with `sed -i`, ran `npm test`/`jest`/`eslint` through Bash, wrote the answer. No Skill call. The `ambicode:task` skill was in the session's `system/init` skills list.
- The new prompt was the one that ran: the harness report for both attempts contains "implement the fix" (2 files each) and the old phrase in 0. The trace itself does not carry the prompt, so the report is the evidence.
- What this changes about R-2's premise: the owner and the replan expected "implement the fix" to fire the task skill because the skill's description names "implement". T1's `verb-implement` case fires it 3 of 3 on Sonnet (it-006). Here it fired 0 of 2, and 0 of 4 on the old prompt. The verb alone is not what decides it; the difference between the T1 prompt and this one (a bug hunt with a tested repository, "verify" in the sentence) is a candidate I did not test.
- The `judge` change (NOTE on Sonnet) is not the problem: `plugin-fired` and `helper-ran` are the failing gates, and they stay required as the owner said.

## What was not measured
- Opus preflight with the new prompt (brief step 4 needs a Sonnet pass first). The new prompt has therefore not been seen by an Opus run.
- T1, T2, T3, T4: null. Whether a prompt that names the skill outright would pass: not tried; that is the owner's route (L-015 option b).
- Whether `unit-check-ran` would pass if the skill fired: unknown (both attempts: false, with 0 Skill calls).

## Disposition
- Reset the three non-gym files to the `gym/R1/it-005` content (`diff.patch` keeps the change, `worker.patch` in scratch is the same bytes). The prompt edit and the judge relaxation existed only to support a passing preflight that did not happen; keeping the relaxation in the tree would leave a gate loosened for a repair that did not work.
- Label L-015 filed with options and a default. PHASE `blocked`.
- Everything downstream waits: H2-T2 (needs the preflight), cp-S0, WP3 item 2 and WP4 (their screening verdicts need the Sonnet reference, 02 §5, and the order is WPH → WP3). I did not start WP3 item 2 without a control reference; that would be an inconclusive by construction.

## Process notes
- The worker copied `node_modules` with `cp -Rc` after a symlink broke `bundle-split.test.mjs` (esbuild comments then read `../ambicode/node_modules/…`). Ignored by git; the worktree `../ambicode-it-008` and branch `gym/R1-it-008-work` are removed after the diff was saved.
- The worker's count in its own worktree was 793 before / 802 after because two git-state tests exist only in the main checkout; the gate numbers above are from the main tree.
- Two kept sandboxes remain under `/private/tmp/e-MJWE1k` and `/private/tmp/e-WgqMh9` (read-only, sealed `home/`); I copied only `out/trace.jsonl` from each and opened nothing sealed. Deleting them is outside the allowed `rm` roots.
- Verifier not spawned: the verdict rests on failed grader lines in two result JSONs that I re-derived directly, and nothing is accepted. Said plainly rather than skipped silently.
- Guard: 0 denials this session so far.
