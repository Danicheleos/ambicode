# Measurement: what proves each module, what the decision points are, what it costs

Tiers from `evals/evals-core/README.md`: walk ≈ $1.2, decide ≈ $14, baseline ≈ $28; Sonnet 5.5
pinned, `--runs 3`, `--max-cost-usd`. Costs below for the new suites are estimates from measured
per-run costs and are marked so.

**Decision points, not kills (D10, R13).** Every criterion below says what number is compared to
what. When it fails, the eval prints both arms' numbers with the loser's detail and **stops**; the
user decides whether to proceed, cut, or roll back. Nothing in the plan abandons itself.

## 0. Harness fixes and probes first (no model spend, except the probes at ≤ $1 each)

1. **Restore the four files from `git stash@{0}`** — `reuse-cases.mjs`, `reuse-score.mjs` and both
   tests (verified: `git stash show --name-only 'stash@{0}'`; `evals-bench.mjs:9` imports and `:704`
   calls `scoreReuse`, so dropping the import is not a fix, #67); `node --test
   'evals/scripts/src/**/*.test.mjs'` must pass; `npm run verify` green.
2. **Per-arm prompts (#46), no new baseline (D19).** The runner serves one `prompt.md` to both arms
   (`evals-bench.mjs:169, 189, 201` `arm: both`; the only switch is `--plugin`, `:971`). Add
   `prompt.with.md`: the plugin arm reads it when present (`/ambicode:investigate <question>
   --headless [--answer …]`); the naked arm keeps `prompt.md` **unchanged**. `evals:gate` refuses a case
   whose **recorded** prompt differs from the baseline's (`withBaseline`, `evals-bench.mjs:674`,
   compares `promptMarkdown`, which `claude plugin eval` records from the prompt it served;
   `evals-core/README.md:198-204`). The runner therefore records the naked `prompt.md` as
   `promptMarkdown` for every case and the served `prompt.with.md` under a new
   `pluginPromptMarkdown` field; `withBaseline` keeps comparing `promptMarkdown`, so the cached
   2026-10-02 baseline is accepted and a changed naked prompt is still refused. **This is a step-0
   harness change with its test** (#101); the user's ruling "the last eval is current, no new run"
   holds without a run. The forced-prompt twins are
   deleted. **Limitation stated**: the noise band (0.101) still comes from one baseline; a second
   one is not planned (P56).
3. **Probe P37**: does `UserPromptSubmit` fire and the command expand for a typed `/ambicode:…`
   (a) interactively, (b) inside `claude plugin eval`'s sandbox, and (c) under `claude -p` with the
   command in the prompt — (c) decides whether S2 and P42 have a real-use path; until probed, acting
   preanswers exist only through the harness channel (P58, #136)? One case, ≤ $1. If (b) fails,
   the sandbox arm starts the route from the skill body's fallback line, and that is written down.
4. Probes, one each, before the step that depends on them: **P2/P48** (`AskUserQuestion` hook
   payload — question text and chosen option present? — and whether `PostToolUse` may return the
   next step as `additionalContext`) before 41 step 3; **P47** (`updatedInput` on `PreToolUse`)
   before 41 step 1 — fallback already in place; **P17** (`Stop` output fields) before 41 step 7;
   **P58** (can the harness pass a per-run token into the sandbox environment of the model's Bash
   children? — run with P37, same case, no extra spend; decides whether the sandbox fallback start
   can be `channel: harness`, 12 §2.4, G1) before any review or task eval; P21 (subagent MCP) only
   if the appendix workers are revived. Dropped: P24 (`claude plugin list`), P36 (LSP diagnostics
   push) — backlog.
5. **Re-run `measurements-2026-10-03/compare.mjs`** on the three repos and commit its stdout as
   `compare.log` (#50); until then every number it produced is labelled "unlogged re-run" (10 §3).
6. Copy `.ambicode/tasks/*/ledger.jsonl` out of the sandbox with the traces; `score` gains
   `map-layers`, `map-pass2`, `route-steps`, `revises`, `gates{class, via}`, `preanswers` (#147), `stop-blocked`,
   `check-red-green`, `envelope-builtFrom`, `permission-denied`, `peak-context`, cost and turns.
7. Review: a **live reviewer tier** — 8 review cases × 3 runs = 24 reviews at $0.33–0.67 ≈ **$8–16**
   per decision (#60) — replaces re-keying the recordings (P19).

## 1. Overhead (walk, then decide) — the point of no return's input

Prediction (02 §5): ceremony falls to the route's budget; cost ratio from 1.42x to ≤ 1.15x. Per-route
ceremony is computed from the route file under 12 §3.1's rule (a code step after a model step costs
one command; evidence-writing commands advance at their tail): investigate **2 (sandbox) / 3 (with
a requirement)**, +1 per file-delivered step, +1 per gate, +1 for the expansion early stop. Eval
sequence (#87): `evals:walk` after 41 step 3 (≈ $1.2, plugin arm, a mechanics read), then
`evals:decide` — **26 cases × 3 runs, plugin arm only, ≈ $14** — gated against the cached
2026-10-02 baseline's naked arm (D19). **Decision point**: cost ratio ≤ 1.15x **and** recall within
the band (§2); **turns are reported against the budget and do not decide** (#45, #58, D10). If the
criterion fails the numbers are presented and the user decides whether the engine proceeds (41's
point of no return).

## 2. Investigate recall (decide)

The bar (01 §1): recall(with) within the band of recall(without). This is the `evals:decide` run
of §1 (26 cases, plugin arm, ≈ $14; the "10 × 3 × 2 ≈ $11" of v3 was a tier that does not exist,
#87). Typed prompt in the plugin arm (`prompt.with.md`), `--headless` with no `--requirement` so no
fetch step runs (D17, #76), `index: none`, pass 2 by regex harvest (so the measured map is the
shipped map), `builtFrom: args`. Decision point: recall below the band → the map anchors the model;
the options presented are pass 2 only (identifiers, no pass 1), then text guidance without a map.

## 3. Index value (offline first; then decide)

- Offline, free: extend `shortlist-recall.mjs` to score `map` as **shortlist only** vs **shortlist +
  harvest + shortlist** vs **+ index.find** on the 116 localize tickets (recall@15). Today shortlist
  alone: BE 0.499, FE 0.123. Decision point for codeindex: no gain ≥ 0.05 over the regex harvest on
  either side → stays `none` (the user may still enable it per repo).
- Impact cases rebuilt with **colliding names only** (declared in ≥ 2 files), 2 arms: naked / `refs`
  with collision flags and the "verify imports" instruction (P51). Grep tied on unique names (M10);
  collisions are the question. If the plugin arm loses here, the backlog's exact-reference item is
  the candidate fix (50).
- Reuse cases on the **merge-request base commit** (G28), 2 arms: naked / route with `find`. Work:
  a base-commit scaffold builder from the team clone (`prepare-reviews.mjs` has the sides); the
  restored `reuse-cases.mjs` is the generator.
- Decide tier on localize with codeindex vs `none` only if the offline step passes.

## 4. Plan quality (≈ $32–45 per decision: 3 epics × 3 runs × 2 arms × $1.8–2.5, #59)

Runs outside the sandbox (needs live MCP) with the real-run runner **rebuilt as one process** (MCP
servers dropped on `--resume`). Arms: naked / route. Scorers: `score2.mjs` (file recall), `anchors2.js`
via `plan check` (anchor validity), AC coverage against **hand-labelled ACs** for the 3 epics (the
splitter is unvalidated, P23). Report cost, turns, peak context, revises.

**Composite, defined before the first run (#62):** for each metric, the naked arm's run-to-run
spread (max − min over its 3 runs per epic, averaged) is the noise. The route **wins** when it is
above naked by more than the noise on ≥ 2 of the 3 metrics and not below naked by more than the
noise on the third. A tie on AC coverage is expected and counts as "not below". Decision point:
not a win → presented; the scout arm (17 appendix, +$16–23) is proposed only if the traces show
the main session's context or cost is the bottleneck.

## 5. Task suite (new, `evals/evals-task`; ≈ $30–90 per decision, estimated: 10 × 3 × 2 × $0.5–1.5)

Plugin arm conditional on P37(b) or P58 for its acting preanswer (`review-offer=run`, 30 §6, #147).
Construction (the largest single effort in the plan): 10 defect tickets from the benchmark set,
each with a **base-commit scaffold** (shared with §3's builder), dependencies installed (G22), the
merged fix's test identified by name and withheld as the hidden test, and the project's runner
proven to start in the sandbox (one walk first). Graders: hidden test passes (code); ledger has
`check {red, failed ≥ 1}` before `check {green, ran ≥ 1}` (code); no assertion weakened (diff of test
files against the merged version); cost and turns. Arms: naked / route. No third arm (no LSP, D8).

**Detectable effect (#61, #99):** a pass rate over 30 binary runs has SD ≈ 9 pp near 0.5 if the
runs were independent, so a difference under ≈ 20 pp is inside the noise of this suite size — and
**more** than 20 pp when the 3 runs of a case agree (the effective n is between 10 and 30). The
decision point therefore reads: gain ≥ 20 pp → the route's claim stands; gain inside ±20 pp → **inconclusive at this size**, presented with the
cost of a larger suite (30 cases ≈ $90–270 per decision, detectable ≈ 12 pp) for the user to choose
between enlarging and cutting task to baseline + guard + review offer; loss beyond 20 pp → cut
proposed. P49.

## 6. Review (live tier, §0.7)

Curated review cases, typed prompt in the plugin arm, 2 arms, live reviewer (plugin arm conditional
on P37(b) or P58 for its acting preanswer `estimate=run`, 30 §6, #147). Measures for the claim:
`complete` share ≥ 90% when no check waits, location validity 100%, cost including the reviewer.
Finder hypothesis: thread recall vs naked. Decision point for the finder claim: live-reviewer
thread recall ≤ naked at > 1.5x cost over 3 runs → the user decides whether review is described as
a publication and coverage tool (01 §1 and the skill description then say so). Dependents via index:
planted caller-break cases (G7), index `relates` vs name search.

## 7. Harness overhead and context (unit-level, no model, plus trace reads)

Hook timings over 20 spawns: guard ≤ 50 ms, `$A hook` ≤ 120 ms (two prior figures disagree: 89 ms
M15 vs ~190 ms `docs/compatibility.md:395`, #88), the MCP hook's no-route exit ≤ 90 ms and the
**count of no-route MCP spawns per session** (#90, P53). **`route start` synchronous work inside
`UserPromptSubmit`** (ground in the no-requirement path), target ≤ 3 s on the three repos (#88).
Byte ceilings on every route step file and compact output. **Peak context per run, both arms**,
read from traces for §1–2 and §4 (P32), with the requirement bytes that entered the window counted
separately (does the field list get obeyed?). **`permission-denied` exits per headless run** (G20, #74).

## 8. Gates, revises and releases (unit, in `npm run verify`)

A table test enumerates every declared gate in every route file **and every raised gate in
`routes/gates.yaml`** and drives: accept, release, `--answer`, `--default`, headless, three advances
with `asked = 0` (→ `never-asked`), a late answer superseding a default; asserts every default is
non-acting. **Every declared `onAnswer`/`onFail` revise** is driven to its bound and the route must
still complete (#42): automatic revises to `repeat`; human revises to `maxRevises`; **two `plan
check` failures then a human *Revise* must re-open `design` with fresh counters** (#75, D14); a
model `--revise design` must not consume the human's allowance; `fix` re-entry from `review-run` and
`review-run` re-entry from an approved waiting key (#77). A `preanswer` is consumed only when its
gate is reached and survives an earlier revise (#78). Guard fixtures (15 §2). Stop fixtures: block
on a bad citation in a report-shaped stop; allow on a conversational stop; allow on the second
failing stop; check the note file for note routes; a `plan-draft` exists before any `plan-accept`
**acceptance** entry (D11; a `preanswer` is not an acceptance).

**End-to-end scenarios (G1–G6, C1, C2, H2, 12 §8 invariants)** — each runs a whole route on a materialized
fixture through the engine's entry points, not a gate in isolation:

| # | Scenario | Must hold |
|---|---|---|
| S1 | interactive session; the model runs `route start plan … --headless --answer plan-accept=Accept` | `route {channel: cli, trusted: false}`; `declined {acting-needs-human}`; the gate is printed when reached; nothing promoted (G1) |
| S2 | the same line arrives through the `UserPromptSubmit` hook (a `claude -p` prompt) | `trusted: true`; `preanswer`; promotion at the gate; report says "answered in the prompt" (G1) |
| S3 | *Accept* on draft A (hash recorded); a new `plan-draft` B saved; `note promote` | `plan-not-accepted {object-changed}`, nothing promoted; the gate re-prints for B (`revise plan-accept`, #134) **without a new `plan-write` or `plan-check`** — B is found in `plan-check`'s window (H3); *Accept* on B → exactly one `plan_<ts>.md`, for B; a second `note promote` → `plan-already-promoted` (G2, #133) |
| S4 | two `plan check` failures, then a passing write | 3 `plan-write` deliveries, 3 `plan-check` completions, 2 `revise {via: code}`; a **third** failure would make the third automatic revise refused with `limit {repeat, step: plan-write}` and the route moves on with Known limitations (G3, #139) |
| S5 | model `--revise design` then a human *Revise* | the model's revise consumed `design`'s `repeat`, not the human's `maxRevises`; the human cycle resets `design`/`plan-write` and re-runs `plan-step` (default 1) without a `limit` (G3, D14); and a model-typed `--answer plan-accept=Revise` at an untrusted start revises `design` `via: model`, consuming `design`'s `repeat` (#146) |
| S6 | clean repository, no config | `/ambicode:investigate` first → `config-missing` naming init; `/ambicode:init` (no route): scaffold, scout, one config Write, `config validate` passes, `context list` shows the files; running it again reports `configExisted`; not a git repository → exit 2, nothing written; `.ambicode/` is gitignored; `/ambicode:investigate` now starts and loads that config (M1) |
| S7 | review with two `--requirement`, one captured | `envelope {missingAsked: [one]}`; ⛔ `requirements-missing` naming it as a refusal of `ground` — **no `exit` entry**, the route stays at `ground`; no reviewer run; then the second source is captured → `route next` → normalize succeeds and the route reaches `estimate`; a typed `route stop` is the only way to an `exit` here (G5, #143, M3) |
| S8 | review, bound server connected, no recognisable capture after two advances | `requirements-not-captured-twice` → `policy {review: stop}` → no quality review (G5) |
| S9 | investigate with `template` (no `produces`) | `step {template, completed}` once; `route next` ×2 and a resume do not re-run it; the `scope` gate's `revise ground` re-runs `ground` only and `template` stays completed (it is before the window, M1); a fixture route with `revisable: [template]` (`repeat: 2`) and `route next --revise template` re-runs it exactly once, with a second `step {template, completed}` (G6) |
| S10 | a crash injected between a code step's outputs and its `completed` record; then between `note promote`'s rename and its entry | the step re-runs once; the `note {plan}` entry is appended on the next call without a second rename or a second answer (12 §8) |
| S11 | two sessions on one slug: `investigate` same args → adopt, different args → side by side; `plan`, **same args** → `route-busy` (no silent adoption); `plan … --adopt` → `route {resumes, adopts}`, the fold continues, and the first session's next `note save --from steps/plan-body.md`, `plan check` and `route next` → `route-taken-over`; after the first route has an `exit`, a plain `plan` start adopts nothing and starts fresh; 60 idle minutes on the first session open nothing for the second | as 12 §2.3 (G2, P54, P59, H2) |
| S12 | a late answer after `default-taken {never-asked}` | the acceptance supersedes the default; `onAnswer` applies; the object check (G2) uses the instance the late answer binds to, not the latest print (P3, C2) |
| S13 | `plan-accept` printed for draft A (instance 19); a revise saves draft B and prints again (instance 27); the human answers A's question | the answer carries `instance: 19` and A's hash; `note promote` → `plan-not-accepted {object-changed}`, nothing promoted; the gate re-prints for B; *Accept* on B's instance promotes B only; the same with the answer to A arriving after a `default-taken` and after a resume; a marker with instance 99 (no entry) → `unbound`, re-print, nothing acts (C2) |
| S14 | a user's trusted `--headless` start **without** `--answer review-offer=run`; at the gate the model runs `route next --answer review-offer=run`; the same with `plan-accept=Accept` in a headless plan | `declined {via: flag, reason: acting-needs-human}` in both; `default-taken {via: headless}` with *skip* / the draft stays; no reviewer spend, nothing promoted; the same start **with** the preanswer → honoured at the gate; `note promote` after an honoured Accept asks nothing again (C1) |

## 9. Run policy

Pinned model, `--runs 3`, `--max-cost-usd` per tier, `eval-gate` on every decide, results committed
next to the change with the loser's numbers. Opus only at a release. A decision point that fires
ends the run with a report; no script deletes or disables a component.

## What this cannot show

Anything about LSP or exact references (backlog); anything about an ecosystem other than
TypeScript — the design is language-agnostic by construction (R16) and every measurement here runs
on the TypeScript benchmarks because the user can judge those results precisely (D18, P57); whether
a human finds the generated navigation line sufficient (P38); a task-suite effect under ≈ 20 pp at
the planned size; run-to-run noise beyond the one baseline (P56).

## v7 changes (A9, instrumentation only)

- **Ledger.** `command`, `turn`, `hook` entries; `step.ms/budget/payloadBytes/payloadTokens` (tokens = bytes/4); `exit.budget`. `turn` is read from the transcript between two Stops: tool counts, Bash commands classified (package-script, node-script, git, ambicode, other) and token usage (`input + cacheRead + cacheCreate` is the context, plus `peak`). `.ambicode/metrics.jsonl` holds taskless command rows.
- **`ledgerMetrics`** (evals `ledger-metrics.mjs`) adds `stepMs`, `gateLatencyMs`, `budgetUsage`, `mapDecisions`, `mapTuning`, `mapRetry`, `initRuns`, `rulesRuns`, `commands`, `contextPeak`, `contextByStep`.
- **Model-free runners:** `tuning-summary`, `task-suite`, `live-review` (dry-run and replay). No decision run (5-I, 6-P, 7-T, 8-F/0-R) was executed; A9 stays the user's call.
