# it-008 worker-1 handoff

Worktree `/Users/KillBill/Documents/projects/mine/ai/ambicode-it-008`, branch `gym/R1-it-008-work`, nothing committed.

## Ran with exit codes

- `node --test evals/scripts/src/evals-preflight.test.mjs` before the implementation (tests written first): 18 tests, 13 pass, 5 fail, exit 1. The five failures were the ones that need the change: the PREFLIGHT declaration, Sonnet + `unit-check-ran` failing (NOTE), Sonnet + passing (NOTE), model case-insensitivity, and the `implement` prompt test. The Opus/absent-model, `plugin-fired`/`helper-ran`, absent-grader and `regression-ts` tests passed before the change, as they pin behaviour that already existed.
- Same command after: 18 tests, 18 pass, exit 0.
- `npm run typecheck`: no output, `tsc --noEmit` clean. The exit code shown in my shell was of a `| tail`, so it is not a measurement; the exit-0 measurement is the typecheck step inside `npm run verify`.
- `npm run verify` (full log `gym/runs/R1/it-008/scratch/worker-verify.log`): exit 0. build, typecheck, test:unit, validate:plugin all passed. "Validation passed".
- First `npm run verify` attempt: exit 1, one failure, `bundle-split.test.mjs` "still ships Fastify, in the chunk view imports". Cause measured: with `node_modules` symlinked to the main checkout, esbuild's module comments read `// ../ambicode/node_modules/@fastify/...` and the test's regex needs `// node_modules/fastify/`. Not one of my files. I replaced the symlink with `cp -Rc` of the main checkout's `node_modules` (APFS clone, 0.8 s, no install, git-ignored) and re-ran: exit 0. The brief said to symlink; this deviates from that, and the symlink breaks G1 in any worktree.

## Numbers with sources

- Tests before, in the worktree, with my three files stashed: 793 tests, 792 pass, 1 skipped (`npm run test:unit`, run at the worktree base `fddb5d0`).
- Tests before, in the main checkout: 795 tests, 794 pass, 1 skipped (`npm run test:unit`, run now; matches baseline G1).
- The 2-test difference between the two checkouts: a sorted diff of the spec lines shows exactly two tests present only in main: "has no ticket identifier in any tracked or addable file" and "is ignored as a whole". Both are git/ignore-state tests, and main has ignored dirs (`.ambicode/`, `benchmarks/`, `archive/`) the worktree lacks. That is why they don't run there. Their cause is read from the names and the ignored-directory list, not from their source.
- Tests after, in the worktree: 802 tests, 801 pass, 0 fail, 1 skipped (`worker-verify.log`). Delta +9 (793 -> 802), all in `evals-preflight.test.mjs` (9 -> 18 tests). Expected in the main checkout: 795 -> 804 (extrapolated, not run there).
- Zip sha256 from the `package:candidate` step in verify: `bee92a9a930c0cb4701473541c02ae910697df039f03a07cd69c7789e5487033`, identical to the brief's G2 value.
- `git diff --stat` (unstaged; same output for `git diff --stat gym/R1/it-005 -- . ':!gym'`): 3 files, 96 insertions, 6 deletions.

## Files touched

- `evals/scripts/src/evals-preflight.mjs` +15/-2
- `evals/scripts/src/evals-preflight.test.mjs` +80/-3
- `evals/evals-archived/typescript/p2-task-regression-fix/prompt.md` +1/-1

Source: `git diff --numstat` in the worktree.

What changed:
- `PREFLIGHT` entry `p2-task-regression-fix`: `require` is now `['plugin-fired', 'helper-ran']`; new `notGatedOnSonnet: { 'unit-check-ran': <reason> }`. The reason cites the it-006 measurement (Sonnet failed 4 of 4 on the old prompt, ran jest itself, never called the task skill). It is printed in the NOTE line.
- `judge`: `sonnet = /sonnet/i.test(result.suite?.modelOverride ?? '')`. On Sonnet each `notGatedOnSonnet` grader prints `NOTE  <where> <name>: <passed|failed>, not gated on Sonnet: <reason>`; absent from the result is a FAIL. On any other model or an absent field it is gated with the usual `PASS`/`FAIL` lines. `regression-ts` is untouched.
- `prompt.md` body: "Find it, implement the fix, and verify the fix." Frontmatter, `repo/` and `cd repo` sentences unchanged. It still wraps at the same width.
- Tests: `result()` takes an optional `model` (adds `suite.modelOverride` only when given); its grader list now includes `notGatedOnSonnet` names. The "names only graders the cases carry" test also walks `notGatedOnSonnet` (extended, not weakened). New describe block with 8 tests covering (a)-(f) plus a declaration test and a case-insensitivity test; one new test in "the cases it runs" for (g). (h): the existing "fails on each gated indicator" test is unchanged and still walks `require`.

## Could not do

- Did not run any eval or `claude` command (per the brief). So the Sonnet preflight, the real `suite.modelOverride` field name and its value format (`claude-sonnet-5-5`) are not verified against a real result JSON; the tests build that field by assumption from the brief.
- Did not run the tests in the main checkout after my change (worktree only).
- Comment/reason text is my wording; the brief did not fix it.

## Claims without evidence

(none)
