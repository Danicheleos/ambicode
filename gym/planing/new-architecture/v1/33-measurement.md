# Measurement: what proves each module, and what kills it

The design is a set of predictions. This file names the eval that confirms or kills each one,
in the order they should run, with the spend tier (`evals/evals-core/README.md`: walk ≈ $1.2,
decide ≈ $14, baseline ≈ $28, all Sonnet 5.5, pinned, `--runs 3`, `--max-cost-usd`).

## 0. Fix the harness first (no model spend)

- **`evals-bench.mjs` does not load at HEAD**: it imports `./reuse-score.mjs`, which is not in the
  repository (`git log` shows it was never committed). `node --test evals/scripts/src/evals-bench.test.mjs`
  fails. Found 2026-10-03 while measuring for this design. Until it is restored, `npm run verify`
  cannot be green and no tier below can run.
- Copy `.ambicode/task/*/ledger.jsonl` out of the sandbox with the traces, so hook-run steps are
  visible to `score` (G12).
- Re-key reviewer recordings by the set of changed-file content hashes (P19), or add a live
  reviewer tier with its own cap and report its cost.
- Add `ledger`-derived measures to `score`: `map-ran`, `map-pass2`, `route-steps`, `gates-default-taken`,
  `stop-blocked`, `check-red-green`, cost and turns as today.

## 1. Overhead (walk, then decide)

Prediction (02 §5): ceremony turns fall from 3–6 to 2; cost ratio from 1.42x to ≤ 1.15x.
Eval: `evals:walk` on the 6 walk cases after the route engine lands with `search.index: none`;
then `evals:decide` against the cached baseline. **Kill**: if the route arm is not within +2 turns
of the naked arm on the decide tier, the route delivers too much; cut step payloads before anything
else is built.

## 2. Investigate recall (decide)

Prediction: tie or better on recall at ≤ 1.15x. Eval: 10 localize cases × 3 runs × 2 arms, gate with
`eval-gate`. **Kill**: recall below the naked arm beyond the band → the map anchors the model; try
`map` without pass 1 (identifiers only), then without the map (text search guidance only).

## 3. Index value (offline first, then decide)

- Offline, free: extend `shortlist-recall.mjs` to score `map` with `index: none` vs `codeindex` vs
  `agentmap` on the 116 localize tickets (recall@15 of the true files). Today's L2 alone: BE 0.499,
  FE 0.123. **Kill** for an adapter: no gain ≥ 0.05 on either side.
- Impact cases rebuilt with **colliding names only** (names declared in ≥ 2 files, `impact-cases.mjs
  --collisions`), 3 arms: naked / `refs` (grep) / `refs --exact`. The naked arm scored 1.00 on unique
  names (M10); the question is colliding names.
- Reuse cases rebuilt on the **merge-request base commit** (G28), 2 arms: naked / route with `find`.
- Decide tier on localize with the winning adapter vs `none`. Only a pass here makes an index the
  default in `init`.

## 4. Plan quality (the real-run runner, 3 epics × 3 runs)

Scorers exist (`real-run-VS-6735/score2.mjs`, `anchors.js`, `anchors2.js`); add AC coverage from
`requirements acs`. Arms: naked / route (scout declined) / route (scout approved). Report file
recall, anchor validity, AC coverage, cost, turns, and peak context. **Kill**: the route without the
scout does not beat naked on AC coverage → expansion is not working; stop and look at the traces.

## 5. Task suite (new, `evals/evals-task`)

10 defect tickets from the benchmark set with a hidden failing test each (the merged fix's test,
withheld). Graders: hidden test passes (code); ledger has `check {red}` before `check {green}` (code);
no assertion weakened (diff of test files against the merged version, code); cost and turns.
Arms: naked / route. **Kill**: pass(with) − pass(without) inside the spread → cut `task` to baseline
+ guard + review offer and let the base model edit (the walkthrough's fallback).

## 6. Review (after §0's replay fix)

Curated review cases, neutral prompt only, 2 arms, live or re-keyed reviewer. Report thread recall,
`complete` share, cost including the reviewer. **Kill**: none for the pipeline (M18); a failure here
points at the estimate gate or the dependents step, each toggled separately.

## 7. Harness overhead (unit-level, no model)

- Time each hook handler over 20 spawns: guard ≤ 50 ms, recorder ≤ 50 ms, `$A hook` ≤ 120 ms.
- Time the recorder's total over a replayed 30-call trace: ≤ 2 s or it ships off.
- Context ceilings: every route step file and every compact output has a byte ceiling test
  (`context-cost.test.ts` pattern); a ceiling is raised only with the number in the commit message.

## 8. Gates and releases (unit, in `npm run verify`)

A table test enumerates every gate in every route file and drives both the accepting and the
releasing answer through the engine, plus the headless default; every guard rule has an allow and
a deny fixture (15-guard §2); the Stop hook has a block fixture, an allow fixture, and a
"second stop allows" fixture.

## 9. Run policy

Pinned model, `--runs 3`, `--max-cost-usd` per tier, `eval-gate` on every decide, results committed
next to the change with the loser's numbers (CLAUDE.md). Opus only at a release.

## What this cannot show

- LSP value in `task`: the sandbox can run an LSP plugin (probed), but the naked arm has no LSP;
  comparing route+LSP against naked measures both at once. A third arm (route without LSP) isolates
  it, at 1.5x the suite cost; run it once after §5 passes.
- Anything about Python: no Python benchmark exists.
