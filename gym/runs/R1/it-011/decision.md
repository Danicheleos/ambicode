# it-011 decision — WP3 item 2, product half: **provisional accept**

A live review whose reviewer ran at most 2 turns is now `status: partial` with the reason "the reviewer ran at most 2 turn(s), so it made at most one tool call, the answer itself; it may have read no file" (`src/cli/commands/review.ts`, `applyStatus`). The gates are green, the reproducing tests fail without the change, and the T2 screening is not worse than the Sonnet reference. The screening cannot see this seam, so the T2 leg of the verdict is thin (below). Rule applied: 02 §5 row "T2 screening not worse than the Sonnet baseline − 0.05" (provisional accept), which is also the T4-type-claim row; the 3 runs/arm sweep runs at cp-3. The verifier found 0 disagreements (`handoffs/verifier.md`).

## Evidence (`metrics.json`; every number re-derived by the verifier)

```
G1  exit 0, 811 / 810 / 0 / 1      (it-009: 804; +7 = the new tests; verify.log)
G2  exit 0, zip 1585ac05…086ad     (reproducible x2; differs from bee92a9a…7033 because review.ts changed)
G3  exit 0, 573 files
reproduction  before.log: 3 new tests (turns 2, 1, 0) fail without the change; 4 guard tests pass before and after
preflight  Sonnet passed, $0.19
T2 screening, Sonnet, 1 run/arm, partial false, 0 run errors, $7.46 + judge $0.29
  localize with   F1 0.6015   reference median 0.5417 (pooled 0.5724); bound: 0.4917 / 0.5224   -> not worse
  localize without F1 0.5692  reference median 0.5715
  review with   recall 0.0938 reference 0.0938;  helper-ran 0 of 8
  review without recall 0.1667 reference 0.0938 (sweeps 0.0625 to 0.0938)
```

## What the numbers do and do not say

- **The screening cannot see this seam.** The T2 review cases replay a recording (`usage: null`), so the new branch never runs there, and the with-arm's `helper-ran` is 0 of 8. The localize arm never reaches `review`. The screening proves the build still runs the harness end to end and the localize control is not gross-broken; it says nothing about the flag. Review recall is "not measurable" (`cp-S0.md` note 1), not "within noise". The without-arm review recall 0.1667 is above its reference sweeps with no plugin in that arm; reported, not read as an effect and not a drift trigger (Δ 0.073 < 0.10, 03 §3 S4).
- **What carries the claim is the unit tests**, on synthetic reviewers: turns 2, 1, 0 → `partial` with the reason; turns 3, null, absent usage, a replay, and a failed reviewer → unchanged. No live review was run with the change (the worker and lead may not spend on `claude`, and none was budgeted).
- **Reach, measured before the change** (`brief.md`, `it-006/scratch/aa-{1,2}/usage.json`): live reviewer runs took exactly 2 turns in 12 of 23 and 12 of 23, at least 3 in the rest, never 1, never null. At the reference the flag would mark 24 of 46 live reviews (52 %) `partial`. This is the WP3 specification, stated as a consequence: about half of live reviews will now read `partial` with a stated gap, where they read `complete` before if no check was a gap.
- **B is an upper bound.** 3 or more turns cannot tell 0 reads from 1; 2 turns is "at most one tool call". The relation between `num_turns` and tool calls was checked on agent traces only (`it-004/decision.md`, "Not measured"), never on the reviewer's own envelope.

## Not measured

- A live review with the change (does the flag fire on a real envelope, and what does the report read like at 2 turns).
- T1 (no trigger surface touched), T3 re-record (`prompts/`, `policies/`, `src/review/` untouched; a recording would measure reviewer sampling noise), T4p (infeasible, it-007), the 3 runs/arm decision sweep (cp-3).

## Still open for WP3 (cp-3)

- cp-3 also requires "recordings carry a per-case usage sidecar and the upper-bound flag". The sidecar exists (`evals-record-core.mjs`, it-005, carries `turns`); the flag in it is **it-012**, a separate seam in `evals/scripts` (one seam per iteration, auditor F4 of it-003). Its T2 check is one screening (02 §4, `evals/scripts/**`).
- Auditor cadence: the cp-S0 audit ran at the start of this session; the next is due at cp-3 or three iterations later (it-013), whichever first, before the tag.

## Process notes

- Brief committed before any measure step (`6a531da`, then diff applied, gates, preflight, sweep).
- The worker's `npm run verify` failed one test (`bundle-split.test.mjs`, "still ships Fastify") because its worktree symlinked `node_modules` and esbuild labelled modules with `../ambicode/node_modules`; the worker showed it fails identically without the change, and the main-tree run is green (`verify.log`). Not a pre-existing failure of the campaign tree: the main tree passes.
- The worker added a `checklessFixture` inside the new describe block (the default fixture always has 3 non-passing checks and 2 policy diagnostics, so no existing test can reach `complete`); `review-fixture.ts` is unchanged. No existing assertion was removed or weakened (`grep '^-[^-]'` over the test diff is empty).
- The stale it-009 worktree (`ambicode-it-009`, auditor F13) was removed after confirming its diff equals the committed `it-009/diff.patch`.
- Owner-owned uncommitted edits to `gym/plan/supervisor/{policy.mjs,test/policy.test.mjs}` are untouched and not in this commit.
