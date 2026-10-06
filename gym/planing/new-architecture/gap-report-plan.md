# Plan: closing the v6 gaps (A1–A9)

## Context
The gap report (gym/planing/new-architecture/gap-report-v6-vs-implementation.md) found nine places where the implementation breaks the v6 design. The user's decisions:
- **A1:** no layer crossings. L1 holds only capabilities, and the harness (L2) controls all orchestration.
- **A2:** keep the owner ids, but record the session hand-over in the ledger.
- **A3:** a stopped route can be reopened by re-typing its skill with more context.
- **A4:** Stop becomes a declared engine entry point.
- **A5:** the ecosystem is measured on init.
- **A6:** configurable tuning.
- **A7:** no reviewer re-run or browser opening without a human yes.
- **A8:** crash repair.
- **A9:** record everything useful for tuning, with no paid runs.

The plan merges three design passes. Work goes **one step at a time**: implement the step, run the targeted tests, report, and wait for approval before the next step. The user runs all reviews. `npm run verify` runs only at hand-off.

## Layer rule (applies to all steps)
- **Ranks:** util/types are usable anywhere; platform 0, modules 1, harness 2, skills 3. cli, composition and the hook adapter sit on top.
- Imports point only downward. L2→L1 capability calls are fine.
- L1 must not know about routes, ledgers-as-route-state or consent.
- Enforced by `src/architecture.test.ts`. Its `ALLOWLIST` starts with today's violations and only shrinks, and a stale entry fails the test.

## Steps

### 1. Architecture test and mechanical moves (A1)
- **Architecture test:** add `src/architecture.test.ts`: the layer map, the allowlist, the guard bundle closure, and a size check (≤ 72 KB, no zod).
- **Moves:**
  - ledger, ledger-lock and kinds → `src/platform/ledger/`, with the types in `types/platform/ledger.ts`;
  - `Runtime` → `types/platform/runtime.ts`;
  - `openRepository` and `findSessionRepository` → `platform/git`;
  - `openWorkspace` and the project lookups → `modules/config/workspace.ts`;
  - `resolvePolicyFor` → `modules/policy/resolve-for.ts`;
  - exclusions → `util/path-classes.ts`, `describeIssues` → `util/schema-issues.ts`, `tokenize` → `util/text.ts`;
  - `process-runner` → `platform/ports`;
  - `HookInput` → `types/platform/claude.ts`;
  - the pure hook markers → `platform/claude/hook-state.ts`.
- These are import rewrites only, with no behavior change.

### 2. Skill handlers out of the harness (A1)
- `defaultHandlers` and `EVIDENCE_HANDLERS` → `src/skills/index.ts` as `skillHandlers()`.
- `planCheckStep` → `skills/plan/handlers.ts`.
- The engine is built in a new `composition/engine.ts` `createAppEngine`.

### 3. Ledger schema for the lifecycle (A2/A3/A8)
In `kinds.ts`:
- `route` gains `reopens` and `rebind`;
- `exit` gains `complete`, `unverified` and `source`;
- `revise` gains via `reopen` and `source`;
- `limit` gains `source`;
- `step` gains `revise` args and `exit`;
- new kind `session {route, harnessSession, event:'end', reason}`.

Tests: each new field is accepted, a malformed value is rejected, and old ledgers still parse.

### 4. Exits and the fold (A3, plus the cycle drift)
- **`finish()`:** when items are unverified, write `exit{complete, unverified:N}`, so the route is no longer live.
- **`exitOf`:** ignores exits before the latest `reopens` route entry.
- **Budgets:** `modelDeliveries` and the clock count from the latest reopen.
- **`ownerOf`:** accepts a chain that was closed and then reopened when its `reopens` matches.
- **`cycleStart(def, entries, step)`:** resets only for steps the revise covered. Used by answers.ts, execute.ts and status.ts.

### 5. Reopen (A3)
- **New `src/harness/engine/reopen.ts` `resolveReopen`:**
  - Order: `--task`, then this session's latest route, then a slug match across sessions (only after a `session` end entry, or with `--adopt`), then a new route.
  - Reopenable exits: human, blocked, inconclusive, budget, draft-stop, and complete with unverified items.
  - `--fresh` skips the lookup.
  - A CLI `route start` reopens only with `--reopen`.
- **Writing the reopen** (in the start lock):
  - Append `route{resumes, reopens, args: merged}`.
  - Revise the step that ended the route:
    - a human step with `onAnswer['*']` (for investigate `scope`, that means re-grounding with the new text);
    - a code or model step gets the new text as `Context`;
    - a `complete` exit goes to the route's new `reopen:` key (task → `fix`, investigate → `read`).
  - The revise uses via `reopen`, writes no acceptance and does not count against `repeat`.
- **`--fresh` reach:** supersedes only the caller's heads and heads whose session ended.
- The investigate `scope` question tells the user how to come back with more context.
- **Late gate answer on a completed route:** a hook answer that binds to a print in the last cycle of a `complete`-exited chain reopens it. It is a human answer, so it is allowed.

### 6. Session rebind recorded in the ledger (A2)
- **SessionEnd:** writes `session{end}` for every live head of that harness session. The tmp mark stays only as a cache.
- **`harnessEnded(entries, harness)`:** a pure check, used by rebind and start.
- **Same-id resume/compact:** always appends `route{adopts, rebind}`, idempotently.
- **New-id `clear`/`resume`:** attaches exactly one orphan. `startup` never attaches.
- **Retyping the skill:** adopts the chain when its owner's harness has ended.
- **CLI start:** takes `harnessSession` from the single association.

### 7. Crash repair (A8)
`repairEffects(run)` replaces `applyRaisedAnswers`. It is idempotent through the `source` field, with a legacy fallback by position. It covers three gaps:
- R1: an answer with no effect;
- R2: a failed step with no `onFail` revise;
- R3: a handler exit that was never written.

Two related fixes:
- **Lost gate prints:** a print lost to a crash does not count toward the three-print default.
- **`$raisedBy` limit:** the `$raisedBy` exemption is removed, so it is bounded by `gate.maxRevises`, and `limit{repeat}` is written when the limit is spent.

### 8. Stop as an engine entry point (A4)
- **Engine entry:** `engine.stopHook()` runs under one lock. It handles an unreadable transcript, the one-time block, and saving the note and advancing with cause `answer`.
- **Hook as adapter:** `stop-check.ts` becomes a thin adapter, and its pure checks move to the harness (`harness/engine/stop.ts`).
- **Generated sections:** they are checked when either heading is present, or once the report has been written.
- **"Approved" claims:** an "approved" claim needs a current acting acceptance.

### 9. Guarded-command seam and pure L1 (A1 "cut off L1")
- **The seam:** add `harness/engine/command.ts` with `engine.command(spec, request, body)`.
  - The engine resolves the binding, the refusals, the view and the owner.
  - Then it runs the body, handles consent and gates, appends route-tagged and declined/limit entries, and runs the tail.
- **Command specs:** each skill declares its commands in `skills/<skill>/commands.ts` as `COMMAND_SPECS`.
- **Migration order** (one sub-step each): `policy check --drafts`, requirements, notes, init apply, rules, format, check-command, plan-check/worker-run, review evaluation, report predicate, conflict (→ `harness/gates/conflict.ts`, registered explicitly).
- **End state:** delete `RouteContextPort` from the module types.
- **Orchestrators move to L3:**
  - review bundle and estimate → `skills/review/bundle/`;
  - doctor, init and proposal → `skills/init/`;
  - rules → `skills/rules/`;
  - plan-check → `skills/plan/`.
- **Hook and CLI cleanup:**
  - The hooks call a `composition/app.ts` `createApp` facade.
  - Rebind moves to `harness/session/rebind.ts`.
  - `#cli/args` → `util/args.ts`; `startTarget` → `composition/start.ts`.

### 10. Reviewer and browser consent (A7), after the seam
- **Defaults:** `default-taken` never applies an `onAnswer` revise, so `review-checks` `without` no longer starts a reviewer.
- **One acceptance, one reviewer run:** each reviewer run needs a fresh acting acceptance (`review-offer`, `estimate`, new `review-again`). Enforced through the seam.
- **Fix rounds:** `fix` produces only a green check. `review.evaluate` then raises `review-again` (default skip, `maxRevises` 2). Skip writes "fix not re-reviewed" into Not verified.
- **Consent window:** a raised gate's consent window is the window of the step that raised it.
- **Browser:**
  - Under a review route, `view --review` opens the browser only with `--open`.
  - routes/review/view.md uses `--no-open` and then asks "Open the review page now?".

### 11. Measured profile and generic projects (A5)
- **Declaration candidates:** `DECLARATION_PATTERNS` becomes `DECLARATION_CANDIDATES {id, pattern}`. Add `TEST_CANDIDATES`.
- **Profile measurement:** `buildProfile` measures which patterns apply and stores them in `SearchProfile.declarations/tests/measuredWith`.
  - Readers use `declarationPatterns(profile)` and `testMatcher(profile)`, with the catalog as fallback.
- **Generic projects:** a repo with no manifest becomes project `generic`.
- **LSP leftovers:** remove the per-ecosystem LSP `GUIDANCE` table, and the LSP lines in config/prepare.

### 12. Search tuning options (A6)
- **Defaults and overrides:** `SEARCH_TUNING_DEFAULTS` lives in `types/defaults.ts`. `search.tuning` holds overrides only, as a strict, validated schema. `layers` becomes an enum.
- **Resolution:** `modules/config/tuning.ts` `resolveTuning` returns `{tuning, overrides, hash}`.
  - `config` prints each effective value with its source.
  - The tuning slices are threaded through search, and `mapWithRetry` moves into `map.ts`.
- **Recorded on the map entry:** the ledger map entry records `tuning {hash, overrides}`, `profile` and `decisions`.
- **Leads header:** the leads text starts with a "Layers … · tuning <hash>" line.
- **Golden test:** the default output is unchanged.

### 13. Instrumentation (A9, no paid runs)
- **Ledger timing:** `step` gains `ms` and `budget`; `exit` gains `budget`; add a `hook {name, ms}` entry.
- **Metrics rows:** init and rules append rows to `.ambicode/metrics.jsonl`.
- **`ledgerMetrics`:** adds `stepMs`, `gateLatencyMs`, `budgetUsage`, `mapDecisions`, `mapTuning`, `mapRetry`, `initRuns` and `rulesRuns`.
- **Model-free runners** under evals/cases/scripts/src, each with tests:
  - `analysis/tuning-summary.mjs`;
  - `harness/task-suite.mjs` (dry-run/score);
  - `harness/live-review.mjs` (dry-run/replay).

### 14. Docs
- Create v7 (copy of v6 plus a CHANGELOG): owner and session entries, reopen, the Stop entry point, the command seam, the tuning block, and the new ledger fields.
- Write `refactoring/src/02-boundaries.md`.
- Update the gap report's status column.

## Critical files
- **Engine:** src/harness/engine/{engine,execute,fold,context}.ts and src/harness/gates/answers.ts.
- **Session and hooks:** src/harness/session/ownership.ts, src/hook/events/{stop-check,rebind,run-hook}.ts.
- **Ledger:** src/modules/evidence/ledger/kinds.ts (→ platform/ledger).
- **Routes:** routes/gates.yaml, routes/task/task.yaml, routes/review/view.md.
- **Search:** src/modules/search/**, src/types/modules/ecosystems.ts, src/types/defaults.ts.
- **CLI:** src/cli/commands/{route,review,config,prepare,view}/*.
- **Evals:** evals/cases/scripts/src/**.

## Reuse
- `canonicalArgs` hashes the merged args.
- `saveNote(..., {ledger})` (notes.ts) is used by the Stop entry point.
- `raisedAnswerHandler` is already idempotent.
- `answers.gateWindow` provides the consent window.
- `evaluateConsent` backs the "approved" check.
- `associationSessionSource` supplies the CLI `harnessSession`.
- `selection-metrics.test.ts`, `guard.test.ts` and `ownership.test.ts` serve as test templates.

## Verification
- **Per step:** targeted `node --test` runs for the touched tests. Key scenarios:
  - **Reopen:** investigate with an empty map, pause, then `/ambicode:investigate auth.ts` reruns the map with the merged context.
  - **Crash repair:** R1–R3 each give exactly one effect after two advances.
  - **Defaults:** taking a default runs no reviewer.
  - **Browser:** no browser opens without `--open`.
  - **Tuning:** the golden leads output is unchanged.
  - **Session end:** writes a `session` entry.
  - **Architecture test:** the allowlist shrinks every step.
- **After steps 1, 8, 9:** the guard bundle size check.
- **Hand-off:** `npm run build`, then `npm run verify`. A local $0 eval repro is used only if the user asks.
