# Measurement: what proves each module, what kills it, what it costs

Tiers from `evals/evals-core/README.md`: walk ≈ $1.2, decide ≈ $14, baseline ≈ $28; Sonnet 5.5
pinned, `--runs 3`, `--max-cost-usd`. Costs below for the new suites are estimates from measured
per-run costs and are marked so.

## 0. Harness fixes and probes first (no model spend, except the probes at ≤ $1 each)

1. **Restore `evals/scripts/src/reuse-score.mjs`** (and its test) from `git stash@{0}` (verified
   present there) or drop the import at `evals-bench.mjs:9`; `node --test evals/scripts/src/evals-bench.test.mjs`
   must pass; `npm run verify` green.
2. **Rewrite every case prompt to a typed command.** Under D2 a plain question fires nothing, so
   the plugin arm equals the naked arm. Each `prompt.md` becomes `/ambicode:investigate <question>`
   (localize), `/ambicode:review` (review), with `--headless` and the needed `--default` options.
   The forced-prompt twins are deleted.
3. **Probe P37**: does `UserPromptSubmit` fire and the command expand for a typed `/ambicode:…`
   (a) interactively and (b) inside `claude plugin eval`'s sandbox? One case, ≤ $1. If (b) fails,
   the sandbox arm starts the route from the skill body's fallback line, and that is written down.
4. Probes, one each, before the step that depends on them: P2 (`AskUserQuestion` hook payload;
   `ExitPlanMode` acceptance) before 41 step 6; P17 (`Stop` output fields) before 41 step 7; P21
   (subagent MCP) only if the appendix workers are revived; P24 (`claude plugin list` in the sandbox)
   before 41 step 9; P36 (does the LSP plugin push diagnostics after `Edit`) before 41 step 7.
5. Copy `.ambicode/task/*/ledger.jsonl` out of the sandbox with the traces; `score` gains
   `map-ran`, `map-pass2`, `route-steps`, `gates-default-taken{via}`, `stop-blocked`,
   `check-red-green`, `peak-context`, cost and turns.
6. Re-key reviewer recordings by the set of changed-file content hashes (P19), or budget a live
   reviewer tier (≈ $25–50 per decision for 24 cases × 3 runs at $0.33–0.67 per review).
7. A **second baseline** (≈ $28) to measure run-to-run noise on HEAD once; the band (0.101) comes
   from one baseline so far.

## 1. Overhead (walk, then decide) — gates the engine

Prediction (02 §5): ceremony turns fall to the route's budget; cost ratio from 1.42x to ≤ 1.15x.
Per-route ceremony budget, computed from the route file = model steps that end in a command + gates
asked + file-delivered steps: investigate **3 (+1 file, +1 per gate)**. Eval: `evals:walk` after 41
step 3, then `evals:decide` against the cached baseline. Turns are **reported** against the budget;
the **gate is the cost ratio** (≤ 1.15x) and recall (§2). **Kill**: cost ratio > 1.15x or turns above
budget + 2 on the decide tier → the route delivers too much; cut step payloads before building
anything on the engine (41's point of no return).

## 2. Investigate recall (decide, ≈ $14)

The bar (01 §1): recall(with) within the band of recall(without). 10 localize cases × 3 runs × 2
arms, typed prompts, `index: none`, pass 2 by regex harvest (so the measured map is the shipped
map). **Kill**: recall below the band → the map anchors the model; try pass 2 only (identifiers,
no pass 1), then text guidance without a map.

## 3. Index value (offline first; then decide)

- Offline, free: extend `shortlist-recall.mjs` to score `map` as **L2 only** vs **L2 + regex pass 2**
  vs **L2 + pass 2 + codeindex** on the 116 localize tickets (recall@15). Today L2 alone: BE 0.499,
  FE 0.123. **Kill** for codeindex: no gain ≥ 0.05 over the regex harvest on either side.
- Impact cases rebuilt with **colliding names only** (declared in ≥ 2 files), 3 arms: naked /
  `refs` (grep -w) / `refs --exact`. Grep tied on unique names (M10); collisions are the question.
- Reuse cases on the **merge-request base commit** (G28), 2 arms: naked / route with `find`. Work:
  a base-commit scaffold builder from the team clone (`prepare-reviews.mjs` has the sides).
- Decide tier on localize with codeindex vs `none` only if the offline step passes. Only a pass here
  makes the index default in `init`.

## 4. Plan quality (≈ $50–70 per decision, estimated: 3 epics × 3 runs × 2 arms × $1.8–2.5)

Runs outside the sandbox (needs live MCP) with the real-run runner **rebuilt as one process** (MCP
servers dropped on `--resume`). Arms: naked / route. Scorers: `score2.mjs` (file recall), `anchors2.js`
via `plan check` (anchor validity), AC coverage against **hand-labelled ACs** for the 3 epics (the
splitter is unvalidated, P23). Report cost, turns, peak context. **Kill**: the route does not beat
naked on the composite of the three; a tie on AC coverage is expected and is not a failure. The scout
arm (17 appendix) is added only if this shows the main session's context or cost is the bottleneck.

## 5. Task suite (new, `evals/evals-task`; ≈ $30–90 per decision, estimated: 10 × 3 × 2 × $0.5–1.5)

Construction (the largest single effort in the plan): 10 defect tickets from the benchmark set,
each with a **base-commit scaffold** (shared with §3's builder), dependencies installed (G22), the
merged fix's test identified by name and withheld as the hidden test, and the project's runner
proven to start in the sandbox (one walk first). Graders: hidden test passes (code); ledger has
`check {red, failed ≥ 1}` before `check {green, ran ≥ 1}` (code); no assertion weakened (diff of test
files against the merged version); cost and turns. Arms: naked / route; once, a third arm (route,
no LSP plugin) to isolate LSP. **Kill**: pass(with) − pass(without) inside the spread → cut `task` to
baseline + guard + review offer and let the base model edit.

## 6. Review (after §0.6)

Curated review cases, typed prompts, 2 arms, live or re-keyed reviewer. Measures for the claim:
`complete` share ≥ 90% when no check waits, location validity 100%, cost including the reviewer.
Finder hypothesis: thread recall vs naked. **Kill for the finder claim**: live-reviewer thread recall
≤ naked at > 1.5x cost over 3 runs → review is a publication and coverage tool, and 01 §1 and the
skill description say so. Dependents via index: planted caller-break cases (G7), index vs name search.

## 7. Harness overhead and context (unit-level, no model, plus trace reads)

Hook timings over 20 spawns: guard ≤ 50 ms, `$A hook` ≤ 120 ms. Byte ceilings on every route step
file and compact output. **Peak context per run, both arms**, read from traces for §1–2 and §4 (P32).

## 8. Gates and releases (unit, in `npm run verify`)

A table test enumerates every gate in every route file and drives: accept, release, `--answer`,
`--default`, headless, and three unanswered calls; asserts every default is non-acting. Guard
fixtures (15 §2). Stop fixtures: block on a bad citation in a report-shaped stop; allow on a
conversational stop; allow on the second failing stop; check the note file for note routes.

## 9. Run policy

Pinned model, `--runs 3`, `--max-cost-usd` per tier, `eval-gate` on every decide, results committed
next to the change with the loser's numbers. Opus only at a release.

## What this cannot show

LSP's own value except through §5's third arm; anything about Python; whether a human finds the
generated navigation line sufficient (P38).
