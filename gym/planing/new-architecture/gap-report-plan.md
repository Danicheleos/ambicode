# Plan: closing the v6 gaps (A1–A9, B1–B19) and ledger instrumentation

## Context
The gap report (gym/planing/new-architecture/gap-report-v6-vs-implementation.md) lists the A breaks and B drifts.

User decisions on A:
- **A1:** no layer crossings. L1 holds pure capabilities and the harness (L2) orchestrates.
- **A2:** keep owner ids and record the session hand-over in the ledger.
- **A3:** reopen a route by re-typing its skill.
- **A4:** Stop is an engine entry point.
- **A5:** the ecosystem is measured on init.
- **A6:** configurable tuning.
- **A7:** no reviewer re-run or browser open without a human yes.
- **A8:** crash repair.
- **A9:** instrument only.

User decisions on B (2026-10-07):
- **Kept as is:** B1 (repeat reset), B3 (consent window), B4 (same-error counter) and B14. A human accepts every rerun.
- **Resolved:** B2, B5, B6, B7, B8, B9, B10, B11, B12, B13, B15, B16, B17, B18 and B19, as set out in the steps below.
- **New request:** the ledger records the commands and scripts that ran, and the context size.

Working rule: one step at a time, run the targeted tests, report, and wait for approval. Steps 1–2 are done and frozen. `npm run verify` runs only at hand-off.

## Layer rule
- **Ranks:** util and types are usable anywhere. Then platform 0, modules 1, harness 2, skills 3, composition 4, hook 5, cli 6.
- Imports point only downward.
- Enforced by `src/architecture.test.ts`, which now uses the TypeScript AST. Its `ALLOWLIST` only shrinks.

## Steps

### 1–2. Done (frozen)
- **Step 1:** the architecture test and mechanical moves (ddde0a9).
- **Step 2:** skill handlers moved out of the harness, plus `composition/engine.ts`.
- **Review fixes:** applied and staged: AST scanner, Windows paths, guard cap of 70 KiB measured in bytes, `HANDLER_NAMES` test, barrels.

### 3. Ledger schema (A2/A3/A8, B19, ledger instrumentation)
In `platform/ledger/kinds.ts`:
- `route` gets `reopens` and `rebind`;
- `exit` gets `complete`, `unverified`, `source`, and reason `dismissed`;
- `revise` gets via `reopen` and `source`;
- `limit` gets `source`;
- `step` gets `revise` args, `exit`, `ms`, `budget`, `payloadBytes` and `payloadTokens`;
- new kind `session {route, harnessSession, event:'end', reason}`.

New kinds for the instrumentation request (step 17 writes them):
- `command {argv, kind: ambicode|check|format|baseline|reviewer|worker|index, exit, ms, outBytes}`: a command the harness or the CLI ran;
- `turn {from, to, tools:{name:count}, commands:[{text, kind: package-script|node-script|git|ambicode|other}], context:{input, cacheRead, cacheCreate, output, peak}}`: what the model did between two Stops, read from the transcript.

Command text is capped at 200 chars, and secret-looking values are redacted (`*_TOKEN=`, `Authorization:`, URL credentials).

Tests: each new field and kind is accepted, a malformed value is rejected, and old ledgers still parse.

### 4. Exits and the fold (A3)
- **`finish()`:** when items are unverified, write `exit{complete, unverified:N}`.
- **`exitOf`:** ignores exits before the latest reopen.
- **Budgets:** count from the reopen.
- **`ownerOf`:** accepts a reopened chain.
- (B1 kept: no `cycleStart` change.)

### 5. Reopen (A3, B2)
- **`harness/engine/reopen.ts` `resolveReopen`:** the order is:
  1. `--task`;
  2. the session's latest route;
  3. a slug match after a `session` end, or with `--adopt`;
  4. a new route.
- **The reopen:** merged args, a revise of the step that ended the route with via `reopen`, and a `reopen:` key for complete exits.
- **B2:** `--fresh` supersedes only the caller's heads and heads whose session ended.
- **Scope question:** the investigate `scope` question explains how to come back with more context.
- **Late answers:** a late gate answer on a complete chain reopens it.

### 6. Session rebind in the ledger (A2)
- SessionEnd writes `session{end}`.
- `harnessEnded(entries, harness)` is a pure check.
- Same-id resume appends `route{adopts, rebind}`, idempotently.
- A new-id `clear`/`resume` attaches one orphan.
- Re-typing the skill adopts the chain once its harness has ended.

### 7. Crash repair (A8)
- `repairEffects(run)` repairs three gaps:
  - R1: an answer with no effect;
  - R2: a failed step with no `onFail` revise;
  - R3: a missing handler exit.
- It is idempotent via `source`.
- A gate print lost to a crash does not count toward the three-print default.
- `$raisedBy` is bounded by `maxRevises`.

### 8. Stop as an engine entry point (A4, B5, B19)
- **Entry point:** `engine.stopHook()` runs under one lock. `stop-check.ts` becomes a thin adapter, and the checks move to `harness/engine/stop.ts`.
- **B5 generated sections:** checked when either heading is present, or once the report has been written.
- **B5 "approved":** needs a current acting acceptance.
- **B19 dismissed question:** a pending gate print whose AskUserQuestion was dismissed is detected from the transcript at Stop (and at UserPromptSubmit) and writes `exit{human, reason: dismissed}`. Re-typing the skill reopens the route (step 5).
  - The gate print says: "If the user dismisses the question, end your turn; the route pauses."
  - First a $0 local probe to see how a dismissal appears in the transcript.

### 9. Guarded-command seam and pure L1 (A1, B17)
- **The seam:** `harness/engine/command.ts` `engine.command(spec, request, body)`. Each skill declares its commands in `COMMAND_SPECS`.
- **Migration:** commands move in the existing order, then `RouteContextPort` is deleted.
- **Orchestrators move to L3:** review bundle and estimate, doctor, init, rules and plan-check.
- **Facade:** `composition/app.ts` `createApp`. Rebind moves to `harness/session/rebind.ts`. `#cli/args` → `util/args.ts`, and `startTarget` → `composition/start.ts`.
- **B17:** every `prepare --activity X` maps to `route start X` with the deprecation notice. Delete:
  - the old prepare body;
  - the dead `prepare-on-skill` path and its allowlist entries;
  - the per-ecosystem LSP `GUIDANCE` table.

### 10. Reviewer and browser consent (A7, B13 final state)
- **Defaults:** `default-taken` never applies an `onAnswer` revise.
- **One acceptance, one reviewer run:** each reviewer run needs a fresh acting acceptance (`review-offer`, `estimate`, new `review-again`).
- **Fix rounds:** a fix round leads to `review-again`, default skip and `maxRevises` 2. Skip writes "fix not re-reviewed".
- **Browser:** `view --review` opens it only with `--open`. view.md asks first.
- (B3 kept: no consent-window change.)

### 11. Route ceremony, staging and visibility (B7, B9, B18, B15)
- **B7 chained code steps:** code steps that follow a model step run inside the same `route next`. fetch, write, read-back and view no longer end with an extra `route next`.
  - Target: task 1–2, review 1–2.
  - Tests count the round trips per route.
- **B7 no-red:** after one re-print with no red check, write `limit{no-red}` and stop for the human.
- **B9 staging, per the v6 11 §2 table:**
  - `before-work` goes at the read/implement step;
  - `before-checks` goes at the step before check/review (task `green`), not at `ground`;
  - `before-report` carries only before-report pack prompts (there is no presentation rule category);
  - investigate gets `before-report` on its last model step.
- **B18 headless:**
  - the start message says "headless (set by the model)" when the model passed the flag;
  - `route status` shows the mode, the channel and every default-taken or automatic decision.
- **B15 workers:**
  - `worker run <id>` refuses ids that are not in `workers.approved`;
  - a worker route step gets a run/inline/skip gate (default skip, never acting) and no longer throws `internal`.

### 12. Requirements (B6)
- **Generic URLs:** any asked URL is keyed by its normalized URL. A `WebFetch` PostToolUse capture produces that key, so a generic URL is no longer always `missingAsked`.
- **Relations:** add `mention` to the relation enum.
- **Disconnected server:** raise `requirements-server-disconnected` when the MCP tool result reports a missing or disconnected server.

### 13. Guard and hooks (B10, B11, B12)
- **B10:** remove `budget.toolTurns` from the DSL, investigate.yaml, the pointer and the guard (delete `tool-turns.ts`). Turns are reported, not steered: step 17's `turn` entry.
- **B11 matchers:** add `Bash(*ambicode.mjs*)` and `Bash(rm *)` matchers, so the root-deletion row can be reached.
- **B11 `--task`:** add `updatedInput --task` after a $0 local probe (P47).
- **B12 headless:** when the active route is headless, a guard `ask` becomes a deny whose message says to run `route stop --reason blocked --detail "permission-denied: …"`. Step texts say the same, and the report lists it. The guard stays ledger-free.
- Guard bundle size check: ≤ 70 KiB.

### 14. Init (B16)
- **Save first:** init writes the proposal as a draft file (`.ambicode/config.draft.yaml`) right away, then asks.
- **Pin by hash:** the draft's hash is bound to the answer. Apply writes exactly the approved draft. If re-detection now differs, it shows the diff and asks again; it never writes values the user did not see.
- **Separate choices:** one question with separate choices for MCP servers, runner and `search.index`, replacing typed `key=value`.
- **Binding:** overrides are bound through `ConsentBinding.set`, and the `Values:` line path is deleted.

### 15. Measured profile (A5)
- `DECLARATION_CANDIDATES` and `TEST_CANDIDATES` are measured into `SearchProfile`, with the catalog as fallback.
- A repo with no manifest becomes project `generic`.
- The LSP table removal is done in step 9.

### 16. Search tuning and map seeding (A6, B8)
- **Tuning:** `SEARCH_TUNING_DEFAULTS`, `search.tuning` overrides and `resolveTuning` with a hash. The map entry records tuning, profile and decisions. The leads header shows the tuning hash.
- **B8 seeding:** plan and task maps get the paths and symbols cited in the investigate note or brief, plus the acceptance-criteria identifiers. Terms rank from the brief or plan iteration text, never "iteration N of <slug>".
- Golden test: investigate output is unchanged.

### 17. Instrumentation (A9 + ledger request, no paid runs)
- **Commands:** `command` entries come from one wrapper around the project command runner (check, format, baseline, reviewer, worker, index) and from `cli/main.ts` for each ambicode invocation (with a task). Runs with no task go to `.ambicode/metrics.jsonl`.
- **Context size:**
  - `step.payloadBytes` and `payloadTokens` (bytes/4) for every printed step;
  - at Stop, a `turn` entry from the transcript since the stop cursor: tool counts, Bash commands classified (package script, node script, git, ambicode, other), and token usage (`input + cacheRead + cacheCreate` = context; `peak`).
- **Timing:** `step.ms` and `budget`, `exit.budget`, and a `hook {name, ms}` entry.
- **Metrics rows:** init and rules write rows.
- **`ledgerMetrics`:**
  - `stepMs`, `gateLatencyMs`, `budgetUsage`;
  - `mapDecisions`, `mapTuning`, `mapRetry`;
  - `initRuns`, `rulesRuns`;
  - `commands` (count, ms, failures by kind);
  - `contextPeak` and `contextByStep`.
- **Model-free runners:** `tuning-summary`, `task-suite` and `live-review` (dry-run and replay).

### 18. Docs
- **v7:** a copy of v6 plus a CHANGELOG with:
  - A2–A9 and the reopen, Stop, seam and tuning changes;
  - the new ledger kinds;
  - the kept B1/B3/B4/B14;
  - B13, recorded as the final fix-round mechanism after step 10.
- `refactoring/src/02-boundaries.md`.
- The gap-report status column.

## Verification
- **Per step:** targeted `node --test` runs. Key scenarios:
  - **Reopen:** investigate re-typed with more context reruns the map.
  - **Crash repair:** R1–R3 each give exactly one effect.
  - **Defaults:** a default runs no reviewer.
  - **Browser:** no browser opens without `--open`.
  - **B19:** a dismissed question gives `exit{human, dismissed}`, and re-typing the skill reopens.
  - **B7:** the round-trip count per route.
  - **B12:** a headless guard ask gives a deny with the stop text.
  - **B16:** apply writes only the approved hash.
  - **Ledger:** `command` and `turn` entries come from a fixture transcript.
  - **Tuning:** the golden leads output is unchanged.
- **Guard bundle check:** after steps 9 and 13.
- **Hand-off:** `npm run build`, then `npm run verify`.
