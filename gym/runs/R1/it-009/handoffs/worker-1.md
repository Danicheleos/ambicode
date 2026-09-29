# worker handoff — it-009 — 15f7efb (worktree HEAD, nothing committed; changes are uncommitted in the working tree)

## Ran
| command | exit | seconds | output |
|---|---|---|---|
| `git apply gym/runs/R1/it-008/diff.patch` (worktree) | 0 | <1 | none (touched the same three files) |
| `cp -Rc <main>/node_modules <worktree>/node_modules` (real copy, gitignored) | 0 | not timed | none |
| `npm run typecheck` (worktree) | 0 | 3 | /tmp/it009-typecheck.log (no errors) |
| `npm run verify` (worktree) | 0 | 33 | /Users/KillBill/Documents/projects/mine/ai/ambicode/gym/runs/R1/it-009/verify-worker.log |
| `node --test evals/scripts/src/evals-preflight.test.mjs` (worktree) | 0 | not timed | terminal only: tests 18, pass 18, fail 0 |
| `git diff > gym/runs/R1/it-009/worker.patch` | 0 | <1 | /Users/KillBill/Documents/projects/mine/ai/ambicode/gym/runs/R1/it-009/worker.patch |

Not run, as instructed: any `claude` command, `evals:preflight`, T1/T2/T3.

## Numbers
| field | value | from |
|---|---|---|
| verify tests | 802 (pass 801, fail 0, skipped 1, suites 135) | verify-worker.log lines 1110-1115 |
| `not ok` lines | 0 | `grep -c "not ok"` on verify-worker.log |
| main-checkout counts, for comparison | it-007 verify.log 795; it-008 verify.log 804 | gym/runs/R1/it-007/verify.log:1102, gym/runs/R1/it-008/verify.log:1113 |
| worktree vs it-008 main | 802 vs 804, difference 2 | the two git-state tests that exist only in the main checkout (as the lead said); I did not identify them by name |
| net new tests over 795 | +7 (802 − 795) | 795 is main's it-007 count, which includes the 2 main-only tests, so the worktree-only delta is not exactly comparable; the test-file diff adds 8 `it` blocks in the new describe and replaces (g) 1-for-1 |
| G2 archive sha256 | bee92a9a930c0cb4701473541c02ae910697df039f03a07cd69c7789e5487033 | verify-worker.log ("Archive sha256"); same prefix/suffix as the brief's `bee92a9a…7033` (full digest of the reference not compared) |
| plugin validation | passed | verify-worker.log ("Validation passed") |
| diff, prompt.md | +2 −2 | `git diff --numstat` |
| diff, evals-preflight.mjs | +15 −2 | `git diff --numstat` |
| diff, evals-preflight.test.mjs | +82 −3 | `git diff --numstat` |
| `git status --short` in worktree | exactly the three files, ` M` | terminal |

## Files touched
- evals/evals-archived/typescript/p2-task-regression-fix/prompt.md +2/−2
- evals/scripts/src/evals-preflight.mjs +15/−2
- evals/scripts/src/evals-preflight.test.mjs +82/−3

(Figures are relative to `gym/R1` HEAD 15f7efb, i.e. they include the it-008 patch.)

Changes beyond the it-008 patch:
- prompt.md body is now "Find it." / "Use the ambicode task skill to implement the fix, and verify the fix." The exact phrase sits on one line. The strings "Find it, implement the fix, and" and "fix it, and" no longer occur in the file. The frontmatter is unchanged.
- `notGatedOnSonnet['unit-check-ran']` reason: `Sonnet ran jest itself and never called the task skill on 6 of 6 preflights (old prompt 4, "implement the fix" 2); the prompt now names the skill`.
- Test (g) replaced by "names the ambicode task skill in the p2 prompt, and that skill exists in this plugin". It asserts the body contains "Use the ambicode task skill to implement the fix", with whitespace runs collapsed so wrapping cannot break it. It asserts the body does not match /fix it, and/i, SKILL.md frontmatter `name` === `task`, and plugin.json `name` === `ambicode`.
- The it-008 tests (a)-(f), (h) are untouched, and no assertion was removed. The old (g) asserted `\bimplement\b` in the prompt body and in the skill description. It was replaced as the brief directs, so those two assertions are gone with it.

## Could not do
- Nothing from the brief was skipped. The `--stat` comparison against `gym/R1/it-005` was not run (the brief's rollback and diff checks are the lead's); I compared only against `gym/R1` HEAD.
- I did not run the preflight or any eval, per instructions. Whether the changed prompt makes Sonnet call the task skill is therefore unmeasured.

## Claims without evidence
(none)
