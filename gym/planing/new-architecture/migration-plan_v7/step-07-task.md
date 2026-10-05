# Step 07 — Task: `check --only` with summaries, model-run `format`, baseline-scoped review, the task route, Stop rules, the task suite

> Prerequisites: steps 00–06 and 09 integrated (default dispatch order 00, 01, 02, 03, A, 04, 05,
> 09, 06, 07, 08), with step 05's scaffold builder and step 09's format slot available. Attach the
> 0-R report. Spend: $0 by default. Every paid item below needs named authorization with its
> ceiling. An unrun eval is "measurement pending"; finish all model-free work regardless.
> Read [05-working-rules.md](05-working-rules.md) first; it governs this brief, the review and the report.
> Normative sources (read the sections, not the whole files): [01-contracts](01-contracts.md) §1, §3,
> §4, §5, §8; [02-scenarios](02-scenarios.md) S14; [v6/24](../v6/skills/24-task.md) whole (the route
> table is the specification; the ceremony table is a test); [v6/16](../v6/modules/16-checks-review.md)
> §2–§5; [v6/12](../v6/modules/12-route.md) §3.3–§3.5, §4, §5; [v6/15](../v6/modules/15-guard.md) §3;
> [v6/32](../v6/32-artifacts.md) §4; [v6/33](../v6/33-measurement.md) §5, §8; [v6/30](../v6/30-harness.md)
> §3, §6, §9; [v6/01](../v6/01-goals-and-constraints.md) §1; [v6/40](../v6/40-open-problems.md) P17,
> P18, P27, P28, P41, P49, P51; [v6/41](../v6/41-migration.md) step 7.

## Goal

Task is the one skill with no measurement (v6/01 §1: "no suite; 1 Edit/Write in 7,709 tool
calls"). This step gives it a record that proves a change: a test that failed first and ran, the
fix, format, the affected checks, an independent review offered, and a report whose Evidence comes
from the ledger. Build, in this order: `check --only` with per-runner summaries and proof rules;
model-run `format`; the task baseline and baseline-scoped `review --task`; the first
`review --estimate` seam; `routes/task.yaml` with its step texts and the review evaluation; the
task inputs of the Stop checks; the 2.5 KB skill body; the fixtures and the ceremony test; the task
suite and decision 7-T. The model runs every check, format and review; no hook or code step runs
them.

## Starting point

Recheck these at dispatch. Use the actual paths if an earlier integration moved them.

- `src/checks/run.ts` (419 lines): `runChecks(options: RunChecksOptions)` runs every configured
  check of a project. Options include `approvals: ReadonlySet<string>`, `declines`, `changed`,
  `watchedPaths`, `revisionNote`. It returns `{results: CheckResult[], pendingApprovals:
  PendingApproval[]}` with `PendingApproval{checkId, approvalKey, projectId, reason, scope,
  proposedArgv, cwd}`. Timeouts recover partial output through `adapter.parseCompletedRun`. There is
  no forced-selection option.
- `src/checks/adapters.ts` (128 lines): `CheckAdapter{id, role, executableNames, enumeration,
  parseEnumeration?, limitations?, parseCompletedRun?}` for eslint, ruff, generic, jest, vitest,
  pytest, playwright. `parseTestSummary` gives passed/failed/null for jest and vitest only.
- `src/checks/authorize.ts` (48 lines): `authorizeCommand({policy, commandId, approvalKey,
  approvals})` → `allowed | refused (forbid or undeclared) | needs-approval (propose)`;
  `checkApprovalKey(projectId, checkId)`, `selectorApprovalKey`.
- `src/checks/select.ts` (464 lines): `Selection{files, complete, limitations, approval}`,
  `expandFiles(argv, files)` replaces `{files}`. `src/checks/mutations.ts`:
  `fingerprintWorkspace({fs, git, repositoryRoot, paths})` → `{indexHash, statusHash, fileHashes}`,
  `watchWorkspace`, `describeMutations`. `src/checks/workspace-diff.ts`: `scanTree`, `compareTrees`.
- `src/review/bundle.ts` (602 lines): `AssembleOptions{runtime, target, requirementUrls, evidence,
  approvals, declines, task, excludePaths?, onlyPaths?, withTests?, contextPaths?}`; `assembleBundle`
  runs normalize requirements → findDependents → partitionChange → enforceReviewInputLimits →
  planSnapshot → writeSnapshot → runProjectChecks. `input-too-large` is thrown in
  `src/snapshot/limits.ts`; `snapshot-too-large` by `planSnapshot` in `src/snapshot/snapshot.ts`,
  before `writeSnapshot`. `writeBundleArtifacts` appends `{kind:'review', reviewId, status,
  statusReason, reviewerRan, findings, omissions, checks[], waiting}`.
- `src/cli/commands/review.ts` (294 lines): approvals come straight from `--approve` flags;
  pending approvals stop with "Answer each waiting check with --approve <key> or --decline <key>".
  `src/cli/target-option.ts` defines `--task`, repeated `--approve/--decline/--exclude/--only/--context`.
- `src/cli/main.ts` (400 lines): `SPECS`, `USAGE`, `dispatch`; multiword names resolved at the
  `const name = …` line. There is no `check` or `format` command.
- `src/contracts/review.ts`: `Finding.location {oldPath, newPath, side, line}`; findings are in
  `reviews/<id>/result.json`.
- `skills/task/SKILL.md`: 10,649 bytes. `src/util/skill-content.test.ts`: describe "P2.3 task
  skill" asserts the old body; "F3 documented outcomes" requires every literal
  `new AmbicodeError('<code>'` in a skills Markdown file. `skills/review/references/outcomes.md`
  documents `baseline-missing` for branch review (`--base`) only.
- `fixtures/definitions.mjs`: defect fixtures `ts-off-by-one`, `py-none-guard`,
  `ts-source-regression`.
- `evals/evals-triggers/`: positive task cases `build-ticket-casual`, `fix-bug-plain`, `fix-ticket`,
  `url-implement`, `verb-implement`; `url-bare` carries a diagnostic `fired-task` grader.
- `.gitignore` ignores `/evals/evals-core/*/*` and `/evals/**/results/`.
- From step 00 (`evals/scripts/src/harness/`): `prompt-transport.mjs` `writePluginPrompt(caseDir,
  command)`, `pluginPrompt`, `PROMPT`, `WITH_PROMPT`, `NAKED_COPY`, `swapInPluginPrompts`,
  `restorePrompts`; `run-options.mjs` `runSpec` (`--set curated|full`) and `casesDirOf`;
  `evals-bench.mjs` `harvestTraces` copies ledgers out of the sandbox;
  `analysis/ledger-metrics.mjs` `checkRedGreen` reads `{kind:'check', route, key, only?, phase,
  exit, summary:{ran ≥ 1, failed ≤ ran}}` and counts a check only through its `route` field.
- From step 01: hook sources in `src/hook/{guard,shell,events,session}/`; `src/route/ownership.ts`
  `ownerOf(entries, slug)` → `owned | none | unknown`.
- From step 02: `src/task/kinds.ts` (check schema above; `baseline` and `format` loosely typed,
  tightened by their owner, step-02 D4), `appendLedger`, `withLedgerLock`, `readLedgerStrict`,
  `taskDirFor`, `resolveTaskDir`, `buildReport(entries, {current})` (02-R2, 02-R3), `navigationLine`,
  `ConsentResult`.
- From step 03 ([step-03](step-03-route-engine-investigate.md) Contract, 01-contracts §2–§5):
  `src/route/{engine,fold,routes,gates,flags,consent,context,command-tail,handlers}.ts`;
  `RouteContextPort.consent(view, gateId, binding?)`; the gate-print writer `raiseGate(ledger, view,
  {gate, values, raisedBy})` (03-G13), also used by the engine for a handler `raise {gate, values}`;
  the `HandlerRegistry` in `src/route/handlers.ts`; the `check` qualifier `green` (03 D14, which this
  step refines, D4); `routes/gates.yaml` (complete registry from v6/32 §4,
  including `check-only-unauthorized` and `scope-expanding`); route/step loader for
  `routes/*.yaml` and `routes/steps/*.md`; the `when` predicate registry; needs-unmet delivery of the
  producing command; "missing produces ×3 records limit/advance"; permission-denied after a headless
  guard ask records `blocked`; `policyStage` in `src/policy/stage.ts` (before-work, before-report);
  the Stop module `src/hook/events/stop-check.ts` (03 D17) with the bounded reason, the
  `stop-check.md` fallback, the 03-K3 "tests pass" predicate and `redBeforeGreen(entries, key)`
  applied when called with `defectBrief: true` (03-K4); `runCommandTail(deps, {task, cause,
  session})` with step 06's `produced` extension; `refs`/`find`/`map`; `routes/investigate.yaml` and
  its read step text `routes/steps/investigate-read.md`; `RouteArgs.plan`/`fromDraft` (no CLI flag
  or `StartInput` field for them in step 03).
- From step 04: `requirements normalize` and the normalized requirement `type` field.
- From step 05: `IndexAdapter` and `indexAdapterFor` in `src/code-intelligence/index/`;
  `startIndexBuild(deps, project)` (called by `Engine.start`, 05-B6) and `refreshIndex(deps, project)`
  (for this step, 05-B5);
  `refs` results carry `collides`; the base-commit scaffold builder under `evals/scripts/src/` with
  its withheld-test exclusion hook.
- From step 06: the plan's per-iteration brief shape (Goal, Changes path:line, Tests (fails first),
  Accept, Checks by key, Leaves out) and `src/workers/process-runner.ts`.
- From step 09: `projects[].commands.format: null | {argv}` written by `init`.

## Files

| File | Change | Source budget | Purpose |
|---|---|---|---|
| `src/checks/run.ts` | change | +35 | `only` forced-selection option (07-C2) |
| `src/checks/adapters.ts` | change | +90 | `parseSummary` for jest, vitest, pytest, playwright (07-P1) |
| `src/checks/proof.ts` | new | 50 | `classifyProof` (07-P2, 07-P3) |
| `src/checks/check-command.ts` | new | 150 | `runCheckOnly`: authorization, consent, limit, entry (07-C, 07-K) |
| `src/checks/format.ts` | new | 90 | `runFormat` (07-F) |
| `src/checks/baseline.ts` | new | 70 | `captureBaseline`, `touchedSet` (07-B1, 07-B2) |
| `src/checks/review-evaluation.ts` | new | 100 | `evaluateReview` (07-V) |
| `src/review/bundle.ts` | change | +60 | `preexisting` option; `dryRun` stop before `writeSnapshot` (07-B3, 07-E1) |
| `src/review/estimate.ts` | new | 70 | `estimateReview`, the ≤ 2 KiB text (07-E) |
| `src/cli/commands/check.ts` | new | 60 | CLI wrapper, one command tail (07-C1) |
| `src/cli/commands/format.ts` | new | 40 | CLI wrapper, one command tail (07-F1) |
| `src/cli/commands/review.ts` | change | +50 | `--task` consent, baseline, `--estimate` (07-B, 07-E, 07-K5) |
| `src/cli/main.ts` | change | +25 | `SPECS`/`USAGE` for `check`, `format`, `review --estimate` |
| `src/task/kinds.ts` | change | +20 | tighten `baseline` and `format` (07-B1, 07-F3) |
| `src/task/report.ts` | change | +20 | Not verified lines (07-R9) |
| `src/task/task-route.ts` | new | 130 | task code handlers: start, ground, report-step glue (07-R) |
| `src/route/handlers.ts` | change | +10 | register the task handlers, `checks.baseline` and `review.evaluate` (07-R4, 07-R7) |
| `src/route/routes.ts`, `src/route/fold.ts` | change | ±10 | `check` qualifier field `green` → `phase` (D4 refines 03 D14) |
| `src/route/gates.ts` | change | +5 | register the `review-offer` question text on step 09's question-text seam (07-E4) |
| `src/cli/commands/route.ts`, `src/route/engine.ts` | change | +15 | `route start task --plan <file> \| --from-draft <file>` and the launch's tokenized args → `StartInput.plan`/`fromDraft` → `RouteArgs.plan`/`fromDraft` (07-R2, 07-R3) |
| `src/hook/events/prepare-on-skill.ts` | change | ±5 | drop `task` from the slash-command set step 03 kept (03-H3); `/ambicode:task` launches the route (07-R1) |
| `src/policy/stage.ts` (step 03's file) | change | +30 | before-checks stage, task code-style placement (07-G4) |
| `src/hook/events/stop-check.ts` (step 03's file, 03 D17) | change | +60 | task inputs of the Stop checks (07-S) |
| `routes/task.yaml` | new | ≤ 90 | the route (07-R1) |
| `routes/steps/task-*.md` | new | each ≤ 1,500 chars | red, green, review-offer, fix, write and ground texts (07-R) |
| `routes/steps/investigate-read.md` (step 03's file) | change | +1 sentence | Diagnostics sentence (07-I1) |
| `skills/task/SKILL.md` | rewrite | ≤ 2,560 bytes | body (07-M1) |
| `skills/review/references/outcomes.md` | change | — | codes in Contract |
| `docs/compatibility.md` | change | ≤ 6 lines | P17 result, only when the probe ran (07-S6) |
| `evals/evals-task/README.md` | new | — | suite README (07-T7) |
| `.gitignore` | change | +1 | `/evals/evals-task/*/*` |
| `evals/scripts/src/cases/task-cases.mjs` | new | 160 | case generator (07-T1 … 07-T3) |
| `evals/scripts/src/analysis/task-score.mjs` | new | 150 | graders (07-T5) |
| `evals/scripts/src/harness/run-options.mjs` | change | +10 | `--set task` (07-T4) |
| `evals/scripts/src/harness/prompt-transport.mjs` | change | +3 | `TASK_COMMAND` (07-T4) |
| `evals/scripts/src/harness/evals-bench.mjs` | change | +15 | harvest the workspace patch (07-T4) |
| `evals/evals-triggers/<5 task cases>` | change | — | "no AMBICODE skill fires" (07-G5) |

Total new or changed runtime source: about 1,450 lines (TypeScript and route files; tests,
Markdown and eval scripts excluded). Eval scripts: about 340 lines. A budget overrun above 50%
stops the implementer (05-working-rules).

Test-size guide: `adapters` summary fixtures and `proof` ≈ 250 lines; `check-command` ≈ 350;
`format` ≈ 150; `baseline` and scoped review ≈ 250; `estimate` ≈ 120; `review-evaluation` ≈ 300;
route, ceremony and integration walk ≈ 450; Stop ≈ 150; skill content ≈ 120 (rewrite of the
"P2.3 task skill" block); eval scripts ≈ 300.

Unchanged in this step (byte-identical, 01-contracts §8, v6/41 Kept): `src/checks/select.ts`,
`src/checks/authorize.ts`, `src/review/prompt.ts`, `src/review/report.ts`, `src/review/validate.ts`,
`src/review/claude-reviewer.ts`, `src/snapshot/*`, `src/providers/*`, `src/publication/*`,
`policies/*.yaml`, `prompts/reviewer-role.md`, `templates/*.eta`, `hooks/hooks.json`,
`src/route/ownership.ts`, the guard's parser and decisions, `routes/gates.yaml` (the registry
entries already exist from step 03), every other skill body.

## Contract

```ts
// src/checks/adapters.ts
export interface RunnerSummary { ran: number; failed: number; loadErrors: number }
export interface CheckAdapter { /* existing fields */ parseSummary?(output: string): RunnerSummary | null }

// src/checks/run.ts — RunChecksOptions gains:
only?: { checkId: string; files: readonly string[] };

// src/checks/proof.ts
export type ProofCause = 'no-summary' | 'zero-tests' | 'load-error' | 'no-failure' | 'nonzero-exit';
export function classifyProof(phase: 'red' | 'green', exit: number, summary: RunnerSummary | null):
  { proven: true } | { proven: false; which: 'red-unproven' | 'green-unproven'; cause: ProofCause };

// src/checks/check-command.ts
export interface CheckOnlyInput { task: string; key: string; only: string[]; phase: 'red' | 'green';
  approve: string[]; decline: string[] }
export type CheckOnlyOutcome =
  | { outcome: 'ran'; entry: CheckEntry; proof: ReturnType<typeof classifyProof> }
  | { outcome: 'not-run'; status: 'timeout' | 'spawn-failed'; detail: string }
  | { outcome: 'waiting'; gate: 'check-only-unauthorized'; key: string }
  | { outcome: 'declined'; key: string };
export function runCheckOnly(deps: NoteDeps, input: CheckOnlyInput): Promise<CheckOnlyOutcome>;

// src/checks/format.ts
export function runFormat(deps: NoteDeps, input: { task: string; paths: string[] }):
  Promise<FormatEntry[]>;                      // one entry per project in the touched set

// src/checks/baseline.ts
export interface BaselineEntryFields { head: string | null; dirty: { path: string; hash: string | null }[] }
export function captureBaseline(runtime: Runtime): Promise<BaselineEntryFields>;
export function touchedSet(runtime: Runtime, baseline: BaselineEntryFields):
  Promise<{ touched: string[]; preexisting: string[]; headMoved: boolean }>;

// src/checks/review-evaluation.ts
export type ReviewEvaluation =
  | { next: 'waiting'; keys: string[]; raisedBy: string }
  | { next: 'scope'; findings: string[]; more: number }
  | { next: 'revise-fix'; findings: string[] }
  | { next: 'proceed' };
export function evaluateReview(view: RouteView, review: ReviewEntry, result: ReviewResult | null,
  touched: readonly string[]): ReviewEvaluation;   // pure

// src/review/estimate.ts — the shape step 08 extends; this step leaves `history` null and
// `refusal.suggestions` empty (step 08 fills both, 08-E3, 08-E4)
export interface ReviewEstimate {
  target: string; files: number; changedLines: number;
  checks: { key: string; decision: 'run' | 'waiting' | 'skip' | 'forbid'; reason: string | null }[];
  waitingKeys: string[]; snapshotBytes: number | null;
  history: { reviews: 5; medianDurationMs: number; medianCostUsd: number | null } | null;
  refusal: { code: 'input-too-large' | 'snapshot-too-large'; message: string; suggestions: string[] } | null }
export function estimateReview(runtime: Runtime, options: AssembleOptions): Promise<ReviewEstimate>;
export function renderEstimate(estimate: ReviewEstimate): string;  // ≤ 2,048 bytes
```

`NoteDeps` is step 02's injected bundle `{runtime, session, context}`, filled by step 03 with the
real session binding and `ledgerRouteContext` (03-T5).

**CLI.**

```
$A check --task <slug> <projectId>/<checkId> --only <file>… --phase red|green [--approve <key>] [--decline <key>] [--json]
$A format --task <slug> [paths…] [--json]
$A review --task <slug> [existing flags]          # baseline-scoped (07-B3)
$A review --estimate [--task <slug>] [target]     # read-only (07-E)
```

**Persisted fields** (additive, through step 02's `passthrough` schemas; `route` and `session` as
01-contracts §1):

| kind | fields written here |
|---|---|
| check | key, argv, only, exit, phase, summary (`{ran, failed}` or null), ms, mutations?, route?, session |
| limit | which `red-unproven\|green-unproven\|check\|check-forbidden`, count, step, cause?, key? |
| declined | gate `check-only-unauthorized`, instance, answer `approve`, via `flag`, reason `acting-needs-human`, key |
| format | key `<projectId>/format`, files[], exit (number or null), via `model`, outcome `formatted\|unconfigured\|failed\|refused` |
| baseline | head (sha or null), dirty[] `{path, hash}` |
| review | existing fields, plus `preexisting[]` and `baseline` (the baseline entry id or null) under `--task` |

**Error codes and outcomes** (documented in `skills/review/references/outcomes.md` with releases):
- `check-only-unauthorized` — refusal under `forbid`, undeclared, or `propose` with no route.
  Release: "configure the check's policy, or run it inside `/ambicode:task`".
- `check-limit` — sixth run of a phase in the current cycle. Release: "state the gap in the report;
  `$A route next --task <slug>`".
- `review-not-accepted` — routed `review --task` without an honoured `review-offer=run`. Release:
  "answer the review-offer question".
- `baseline-missing` — second cause: `review --task` in an open task route with no task baseline. Release:
  "`$A route next --task <slug>` (ground records it), then run the review again".
- `format-unconfigured` — successful outcome, exit 0, documented and not raised.
- Unknown `<projectId>` reuses `unknown-project`; unknown `<checkId>` or a malformed key reuses
  `bad-argument`.

## Rules

**C — `check --only`**
- 07-C1 `check` requires `--task`, exactly one positional `<projectId>/<checkId>`, at least one
  `--only`, and `--phase red|green`. A missing or malformed item refuses `bad-argument`. The CLI
  wrapper invokes the command tail exactly once (01-contracts §3).
- 07-C2 `runChecks` with `only` runs that one check and no other. Its selection is exactly the given
  files with reason "named with --only", `complete: true`, and no selector or enumeration runs.
  argv expansion goes through the existing `expandFiles`. Without `only`, behaviour is byte-for-byte
  unchanged (existing tests stay green unmodified).
- 07-C3 The order of checks inside `runCheckOnly`: parse key → resolve project and check → repeat
  limit (07-C5) → authorization (07-K) → run → classify (07-P) → append → warm index (07-G3). The
  wrapper passes the appended `check` entry id to the command tail as `produced` (step 06's seam). A
  refusal or wait at any stage appends nothing except the records the rule names.
- 07-C4 When the runner produced an exit code, append one `check` entry with the fields in the
  Contract; `phase` is the requested phase; `summary` is `{ran, failed}` from `parseSummary` or null;
  `only` is the list as given; `mutations` reuses the existing mutation report. When no exit code
  exists (timeout, spawn failure), append no `check` entry, print the status and, in route mode,
  append `limit {which: '<phase>-unproven', count: 1, step, cause: 'no-summary'}`.
- 07-C5 At most 5 `check` entries per phase in the current cycle of the current step window
  (v6/12 §5). The sixth call runs nothing, appends `limit {which: 'check', count: 5, step}` once per
  window and refuses `check-limit`. Standalone (no route on the slug) has no limit.

**P — summaries and proof**
- 07-P1 `parseSummary` reads the runner's own final summary line from combined output.
  jest: `Tests:` line; vitest: `Tests` line and `Test Files` line; pytest: the `=== … in <n>s ===`
  line; playwright: the `<n> passed` / `<n> failed` lines. `ran = passed + failed` (skipped and todo
  excluded). `loadErrors` counts suites or files that failed to load or collect (jest `Test Suites:
  N failed` with zero failed tests, vitest failed files with no tests, pytest `error`/`errors`).
  eslint, ruff and generic have no `parseSummary` → `summary: null`. No summary line → null.
- 07-P2 `classifyProof`: red is proven iff `summary !== null && summary.failed ≥ 1`. Green is proven
  iff `exit === 0 && summary !== null && summary.ran ≥ 1`. Otherwise cause, first match:
  `no-summary` (summary null), `load-error` (loadErrors ≥ 1 and failed 0), `zero-tests` (ran 0),
  `no-failure` (red with failed 0), `nonzero-exit` (green with exit ≠ 0).
- 07-P3 An unproven run in route mode appends `limit {which: 'red-unproven'|'green-unproven',
  count: 1, step, cause}` after the `check` entry. The check line of the CLI output always states
  `proof: met` or `proof: not met (<cause>)`. A syntax error in a new spec, zero selected tests and a
  null summary are never red or green proof (02-scenarios supporting rule).

**K — authorization and consent**
- 07-K1 Authorization calls `authorizeCommand` with `checkApprovalKey(projectId, checkId)` as the key.
  `allowed` → run. `refused` (forbid or undeclared) → refuse `check-only-unauthorized` with the
  policy reason, raise no gate, and in route mode append `limit {which: 'check-forbidden', count: 1,
  step, key}`. Nothing bypasses forbid.
- 07-K2 `propose` with a route on the slug: the check is authorized iff
  `context.consent(view, 'check-only-unauthorized', {key})` is `honoured`. `--approve` never adds to
  the approvals set by itself. An honoured answer runs without another question.
- 07-K3 `propose`, not honoured, `--approve <key>` typed: append `declined {gate:
  'check-only-unauthorized', instance: <latest print id or null>, answer: 'approve', via: 'flag',
  reason: 'acting-needs-human', key}`, then raise and print the gate again (07-K4). This holds in every
  mode and on every channel, trusted headless included (01-contracts §5, C1).
- 07-K4 `propose`, not honoured: raise `check-only-unauthorized` through step 03's `raiseGate`
  (03-G13) with `key`, `files` (the `--only` list) and `raisedBy` = the current step id; print the registry question
  "Run {key} on {files}? (policy: propose)". The registry's `onAnswer {approve: revise $raisedBy}`
  re-enters that step. `--decline <key>` or a bound decline appends nothing further; the run is
  `declined` and shows under Not verified (02-R3).
- 07-K5 `propose` with no route on the slug (standalone) refuses `check-only-unauthorized` and writes
  nothing. `session: null` while the slug has an open route refuses `session-unbound` (if 0-S is
  pending: injected sessions only, as step 03). `review --task <slug> --approve <key>` with a route on
  the slug applies 07-K2 … 07-K4 to each waiting key.

**F — format**
- 07-F1 `format --task <slug> [paths…]` takes the touched set (07-B2), narrows it to `paths` when
  given, and groups it by project. For each project it reads `commands.format`.
- 07-F2 Slot null → append `format {key, files, exit: null, via: 'model', outcome: 'unconfigured'}`
  and print `format-unconfigured`; exit 0. Slot set → authorize through `authorizeCommand` under key
  `<projectId>/format` (07-K1 … 07-K5 apply, with gate `check-only-unauthorized`; `format` has no
  `--approve` flag). Run the argv with `{files}` expanded by `expandFiles`; when the argv has no
  `{files}`, append the files. Exit 0 → `outcome: 'formatted'`; nonzero → `'failed'`; refused →
  `'refused'` with `exit: null`.
- 07-F3 `files` lists the passed files whose content hash changed across the run. Other workspace
  changes go through the existing mutation report, not `files`. The engine and every code step never
  call `runFormat` (01-contracts §3, v6/30 §9).

**B — baseline and scoped review**
- 07-B1 `captureBaseline` writes `baseline {head, dirty}`: `head` from `git.revParse('HEAD')` (null on
  an unborn branch); `dirty` = every path of `git.status()` with its content hash from
  `fingerprintWorkspace` (null for a deleted path). The `ground` step records it once per route; a
  baseline is never captured after the first model step.
- 07-B2 `touchedSet`: the paths changed against HEAD now, minus baseline-dirty paths whose hash is
  unchanged, plus baseline-dirty paths whose hash changed. `preexisting` = the removed paths.
  `headMoved` = HEAD differs from `baseline.head`. A pre-existing dirty file edited by this task is
  in `touched` (hash comparison, never HEAD dirty status alone).
- 07-B3 `review --task <slug>` with a baseline passes `preexisting` to `assembleBundle`; those paths
  are dropped from the reviewed change and from check selection and listed in one omission "not
  covered: pre-existing changes: <paths, first 10, then (+N more)>". `headMoved` adds the omission
  "HEAD moved since the task baseline". Without `--task`: unchanged.
- 07-B4 `review --task` while the slug has an open **task** route with no `baseline` entry in its
  chain refuses `baseline-missing` before any work. Baseline scoping (07-B3) and this refusal apply
  only to a task route; with an open review route on the slug, `review --task` reviews the route's
  target with no baseline scoping and no baseline omission (step 08, 08-R8). Standalone `review --task` with no baseline: today's behaviour
  plus the omission "no task baseline: pre-existing changes included".
- 07-B5 Routed `review --task` in a task route refuses `review-not-accepted` unless
  `context.consent(view, 'review-offer')` is `honoured` with answer `run` (01-contracts §5:
  "Consumer commands independently call consent").

**E — estimate seam**
- 07-E1 `estimateReview` runs `assembleBundle` with `dryRun: true`: the same steps up to and
  including `planSnapshot`, then it stops before `writeSnapshot` and before running checks.
  `input-too-large` and `snapshot-too-large` become `refusal {code, message, suggestions: []}` with
  no throw.
- 07-E2 It reports `target`, `files`, `changedLines`, each check with its decision from
  `authorizeCommand` (`allowed` → `run`; `needs-approval` without an honoured answer → `waiting`;
  `refused` → `forbid`; not selected → `skip` with the limitation as `reason`), `waitingKeys`, and
  planned `snapshotBytes`. `--task` applies 07-B3's exclusion.
- 07-E3 `review --estimate` writes nothing (no ledger entry, no snapshot, no review directory) and
  acknowledges no step (01-contracts §3). `history` is null in this step and `renderEstimate` prints
  `history: no history`; step 08 fills it. Output ≤ 2,048 bytes; overflow truncates the check list
  with "(+N more)".
- 07-E4 The `review-offer` question's `{estimate}` text is `renderEstimate(estimateReview(…))`,
  registered on step 09's question-text seam in `gates.ts` (step 03 instantiates options only).

**R — route and step texts** (v6/24 table)
- 07-R1 `routes/task.yaml` declares, in order: `template` and `fetch` (`when:
  args.hasRequirement`), `start`, `ground`, `red`, `green`, `review-offer`, `review-run`, `fix`,
  `report-step`, `write`; the declared gate `draft-ok`; the raised gates `check-only-unauthorized`
  and `scope-expanding` from the registry; `budget.modelSteps: 18`. The build validates it with
  step 03's loader.
- 07-R2 `start` (code): slug from args, else from the `--plan <file>` task directory; plan = `--plan
  <file>` or the latest `plan` note; iteration = 1 + the latest notes `iteration`, else 1. It records
  `planPath`, `iteration` and `iterations` (count of `## Iteration <n>` headings, 1 when none) as
  additive fields on its completed `step` record. `iteration > iterations` → `exit {reason:
  'iterations-complete'}`. Start output ≤ 4 KiB.
- 07-R3 `draft-ok`: `when: plan.isDraft`; options *implement anyway* / *stop*; default *stop*;
  non-acting. `--from-draft` at start is recorded as `preanswer {gate: 'draft-ok', option: 'implement
  anyway'}` on any channel. *stop* → `exit {reason: 'draft-stop'}`.
- 07-R4 `ground` (code), in order: requirements normalize when captures exist; `checks.baseline`
  (07-B1); `search.map` (context); caller inventory (07-G1); `policy.stage(before-work)`; detached
  index build (step 05's `startIndexBuild`, a no-op when the start's call (05-B6) is still building
  or fresh, 05-B4). Payload ≤ 9 KiB, through a step file when larger than the inline cap.
- 07-R5 `red` (model): `produces: [check{red}]`; payload includes `policy.stage(before-checks)`. The
  text says: write the failing test, run `$A check --task <slug> <key> --only <spec> --phase red`;
  if no failing test is possible, state the observation in one line and run `$A route next --task
  <slug>` (step 03's produces-missing ×3 records `limit {missing-produces}`, shown as "no-red", P27).
- 07-R6 `green` (model): `produces: [check{green}, format]`; the text ends with "then `$A format
  --task <slug>`".
- 07-R7 `review-offer` (human, declared): options *run* / *skip — verification incomplete*; default
  *skip*; `acting: [run]`; question includes `{estimate}`. `review-run` (code, `run: review.evaluate`,
  `repeat: 2`, `when: gate.review-offer.is(run)`, `needs: [review]`): unmet needs deliver `$A review --task <slug>`;
  then it calls 07-V1. `fix` (model, `repeat: 2`, `when: gate.review-offer.is(run)`, `produces:
  [check{green}, review]`). `report-step` (code): 07-V1 first, then `policy.stage(before-report)`,
  then the generated Evidence and Not verified; `onFail: revise fix`; output ≤ 3 KiB. `write`
  (model): Done and Remaining; `$A note save --task <slug> --kind notes --iteration <n>` when
  `iteration < iterations`.
- 07-R8 Every step text ≤ 1,500 characters after inclusion. The ceremony for the synthetic walk
  matches v6/24: review skipped 1–2 questions; one fix round 1–3; +1 for a red check under propose.
- 07-R9 `report.ts` adds to Not verified: a bound or defaulted `review-offer` *skip* → "independent
  review skipped — verification incomplete"; a `format` entry with outcome other than `formatted` →
"not formatted: <key> (<outcome>)"; a `limit {which: 'missing-produces', step: 'red'}` (step 03's
  name) → "no-red: no failing-first test recorded" (the model's stated observation is in its prose report).

**V — review evaluation (review-run and fix re-entry)**
- 07-V1 `evaluateReview` reads the latest `review` entry in the chain, its `result.json` findings,
  the touched set, and the answers recorded after that review entry. Order, first match wins:
  1. waiting keys without an answer → `waiting`; the caller raises `check-only-unauthorized` per key
     with `raisedBy` = the step that was current when the review was recorded (`review-run` for the
     first review, `fix` for fix-round reviews);
  2. findings whose `location.newPath` (else `oldPath`) is outside `touched`, with no
     `scope-expanding` answer after this review → `scope`; the caller raises `scope-expanding` once
     with up to 3 findings and "(+N more)";
  3. in-scope findings, plus out-of-scope ones answered *include* → `revise-fix`; the caller appends
     `revise {from: <current step>, via: 'code', reason: 'review-findings'}` targeting `fix`;
  4. otherwise → `proceed`.
- 07-V2 It is pure and idempotent: the same ledger gives the same result. A review with
  `reviewerRan: false` gives `proceed` (the report shows it under Not verified, 02-R3).
- 07-V3 Fix entry: the first entry to `fix` comes only from 07-V1 at `review-run` (#103). The engine
  bounds automatic revises by `fix`'s `repeat: 2`; the third refuses with `limit {which: 'repeat',
  step: 'fix'}` and the remaining findings go to Remaining. A human revise from an approved waiting
  key starts a new cycle (v6/12 §4).
- 07-V4 `review-run` never runs the reviewer; it evaluates the model-run command's recorded result
  (01-contracts §3). On a skipped or defaulted offer, `review-run` and `fix` are skipped by `when` and
  no reviewer runs.

**G — ground inputs, warm index, policy, triggers**
- 07-G1 Caller inventory: up to 8 code-shaped identifiers taken from the iteration brief (else the
  request text), each through `refs`; one line per name `name — N refs[, collides]`. The ground text
  contains "a `collides` caller → verify its import before editing" (P51).
- 07-G2 With `index: none`, ground states "index: none — grep fallback" (P28).
- 07-G3 After a `check` entry and after a `review --task` entry, when the project's index adapter is
  not none, call step 05's `refreshIndex(deps, project)` (detached) without awaiting it. A failure of
  that call is ignored by the command.
- 07-G4 Policy adds the `before-checks` stage (≤ 1.5 KiB) through step 03's stage API. Task's
  code-style rules go to `before-work` when there are ≤ 8, else to `before-checks`.
- 07-G5 In the same change that sets `disable-model-invocation: true` on task, convert the five
  positive task cases in `evals/evals-triggers/` to "no AMBICODE skill fires", the same conversion
  step 03 applied to investigate; handle `url-bare`'s `fired-task` grader as step 03 handled its
  diagnostic grader. Preserve case inputs and validity checking; add synthetic assertions for the
  changed expectations.

**I — investigate closure**
- 07-I1 Add v6/22's Diagnostics sentence to investigate's read step text (reproduce with `$A check
  --task <slug> <key> --only <spec> --phase red`). The registry options stay *approve* / *decline*;
  the text names decline "don't run — inconclusive". This closes step 03's temporary deviation.

**S — Stop task inputs and P17**
- 07-S1 A report-shaped stop in a task route fails when a "tests pass" phrase appears
  (`/\btests? (pass|passed|passing|are green)\b/i` or `/\ball tests pass/i`, widening step 03's
  "tests pass(ed)" phrase set) and the chain has no `check {phase: 'green'}` that meets step 03's
  03-K3 predicate (`exit 0`, `summary.ran ≥ 1`, `summary.failed = 0`). The predicate is not
  duplicated.
- 07-S2 A defect brief (request or iteration brief matches `/\bdefect\b/i`, or a normalized
  requirement `type` is `Bug` or `Defect`) makes the task route call Stop with `defectBrief: true`,
  so step 03's `redBeforeGreen(entries, key)` (03-K4) applies to each key with a green check: the stop
  fails when no `check {phase: 'red', summary.failed ≥ 1}` precedes the first green one. This step
  adds the detection only.
- 07-S3 Declined keys must appear in the unchanged generated Not verified section; a stop whose
  generated sections differ from `buildReport` fails (step 03's hash check).
- 07-S4 Blocking follows step 03: block once with `limit {stop-block}`; the second failure allows.
- 07-S5 Until P17 runs, step 03's bounded reason plus `stop-check.md` stays as built.
- 07-S6 After P17 (≤ $0.50, needs go): reason reached the model → keep the reason and the file;
  `additionalContext` reached → the list may also go there; neither → file only, with the reason
  naming the file; a field the schema rejected → drop that field. Record the result in
  `docs/compatibility.md`.

**M — skill body and docs**
- 07-M1 `skills/task/SKILL.md` ≤ 2,560 bytes: the judgments (smallest coherent change; reuse before
  adding; never weaken a test; ask when a finding expands scope), the git boundary with its reason,
  the two prose report parts (Done, Remaining), the fallback start line.
  `disable-model-invocation: true`. `allowed-tools` unchanged (`Edit(**)`, `Write(**)`, scoped
  Bash). No LSP, no `prepare`.
- 07-M2 Every new code and outcome in the Contract is in `outcomes.md`; the F3 test passes.

**T — task suite** (v6/33 §5)
- 07-T1 `task-cases.mjs` selects defect tickets from `$PRIMARY/benchmarks` whose merged fix
  contains a named test, takes the first 10 in stable id order, and writes them under
  `evals/evals-task/cases/` (gitignored). It prints counts only.
- 07-T2 Each case uses step 05's base-commit scaffold builder with dependencies installed (G22).
  The merged fix's named test is withheld through the builder's exclusion hook and stored outside
  the model-visible scaffold. The hidden test must fail at base and pass at merged (local, free);
  a case failing that check is skipped and counted.
- 07-T3 No case content is committed; no merged implementation is copied into a prompt.
- 07-T4 `TASK_COMMAND` = `/ambicode:task --headless --answer review-offer=run …`, written through
  `writePluginPrompt`. `run-options` gains `--set task` (cases dir `evals/evals-task/cases`, eval
  dir `evals/evals-task`). Harvest copies the run's workspace patch beside its ledger.
- 07-T5 `task-score.mjs` graders (code): hidden test passes (replay the patch on a fresh scaffold,
  add the withheld test, run it); the ledger has `check {red, failed ≥ 1}` before `check {green, ran
  ≥ 1}` (step 00's `checkRedGreen`); no assertion weakened (an assertion line present in both the
  base and merged test files is absent in the run's version); cost and turns. Arms: naked / route;
  **no third arm** (D8).
- 07-T6 Reviewer under 0-R: a sandbox reviewer that fails to authenticate records `reviewer-error`
  and incomplete verification, includes attempt cost and turns, and leaves hidden-test grading
  independent. Never use old reviewer recordings for these task changes.
- 07-T7 The README states the detectable effect: ≈ 20 pp at 10 × 3 (33 §5), and the
  correlated-case uncertainty as v6/33 §5.
- 07-T8 The run is conditional on P37(b) or P58 proving trusted launch. If neither holds, report
  "blocked eval"; do not force the offer through `route next`.
- 07-T9 **Decision 7-T**: gain ≥ 20 pp → stands; inside ±20 pp → inconclusive, presented with the
  cost of 30 cases (≈ $90–270, detectable ≈ 12 pp) so the user chooses between enlarging and cutting
  task to baseline + guard + review offer; loss beyond 20 pp → cut proposed. The agent presents; the
  user decides. A gain of 20 pp alone is insufficient without cost ≤ 1.2x.

## Decided readings

- D1 `check` and `format` are new CLI command modules with one tail each (01-contracts §3 lists
  both among the evidence-writing wrappers; 00-README "one existing CLI command module per surface").
- D2 Forced selection is an `only` option on `runChecks`, not a new runner (v6/16 §2 "Reuses
  `runChecks` with a forced selection … no new runner"); `select.ts` stays unchanged (v6/41 Kept).
- D3 `summary` persists `{ran, failed}` only; `loadErrors` is used for `cause` (step 02 schema;
  v6/16 §2 "a syntax error in a new spec is not red").
- D4 An unproven check keeps its requested `phase`, so the produces qualifier is met and the route
  advances. This refines step 03's D14: the `check` qualifier field becomes `phase` (`check{red}`,
  `check{green}` match on `phase` alone), and proof lives in `classifyProof` and the `limit`; the gap is the `limit` under Not verified (v6/16 §2 "Unparseable summary → `limit
  {red-unproven|green-unproven}`, visible in Not verified"; P41).
- D5 No exit code → no `check` entry (step 02's schema requires `exit`; 01-contracts §3 "Failed
  commands do not create successful outputs").
- D6 The check limit is 5 entries per phase in the current cycle and window (v6/12 §5).
- D7 Consent for `propose` is the predicate alone; a typed `--approve` matters only for writing the
  `declined` record (01-contracts §5 "Never from a model-typed flag … They record
  acting-needs-human decline").
- D8 Standalone `propose` refuses; there is no standalone consent source (01-contracts §5
  "Consumer commands independently call consent, including standalone invocations").
- D9 `format` uses the same gate `check-only-unauthorized` for `propose`, under key
  `<projectId>/format` (v6/16 §3 "same authorization").
- D10 `format-unconfigured` is a successful outcome with a `format` entry, so green's `produces`
  stays satisfiable; it shows under Not verified (v6/16 §3; 07-R9).
- D11 The touched set comes from baseline hashes, never HEAD dirty status alone (V6 step 07 §4 "reuse
  workspace-diff and baseline fingerprints").
- D12 `baseline-missing` is reused for the routed task case, documented as a second cause (V6 step
  07 §4 names the code); the route collects it by re-running `ground`, never after edits.
- D13 Routed `review --task` checks `review-offer=run` consent (01-contracts §5); the code is
  `review-not-accepted`.
- D14 The estimate is a dry path inside `assembleBundle` that stops before `writeSnapshot`
  (v6/16 §5 "Catches `input-too-large` and `snapshot-too-large` before the snapshot is written");
  `src/snapshot/*` stays byte-identical.
- D15 One pure `evaluateReview`, called by `review-run` for the first review and by `report-step`
  for fix-round reviews (`onFail: revise fix` is a revise to an earlier step); no engine feature for
  a consumer at another position (01-contracts §3 "A code actor named review-run evaluates the
  model-run command's recorded result").
- D16 `--from-draft` is a non-acting preanswer; *implement anyway* is non-acting (v6/24 row 1
  "implement anyway (recorded)"; 01-contracts §5 lists acting options, draft acceptance is not one).
- D17 The no-red path uses step 03's produces-missing ×3 rule; the report labels it "no-red" (P27).
- D18 Iterations are `## Iteration <n>` headings in the plan; resume reads the notes iteration header
  (step-02 02-N2) and starts at N+1.
- D19 Defect brief detection: the word "defect" in the request or brief, or requirement type Bug or
  Defect (V6 step 07 §6 "the brief says 'defect' or the ticket type does").
- D20 Formatted files are passed files whose bytes changed (V6 step 07 §3 "formatted files reported
  as such, not as `mutations`").
- D21 Paid items: P17 (≤ $0.50), the runner walk, the decision run and the trigger suite run only
  with named authorization; without it each is reported "awaiting go" with its downstream
  limitation.

## Non-goals (a reviewer may not raise these)

- Running a check, `format` or the reviewer from a hook or a code step; honouring any model-typed
  acting flag.
- A sandbox: the plugin is not a security boundary (01-contracts §5). No defence against a model
  that edits the ledger, the scaffold or the hidden-test location by other means.
- Edit-time asks (`guard.askOutsideMap` stays off, P18) and the LSP diagnostics item (D8).
- Summary parsing for runners beyond the four, for every historic output format, for localized
  output, for custom reporters or for watch mode. Fixture strings come from the runners' own docs or
  test suites; versions not covered return null (P41).
- Review history, the standalone review route, `review --approve` without `--task`, and the review
  with-prompts (step 08).
- Changing `select.ts`, `authorize.ts`, the snapshot, the reviewer, the review prompt or report.
- A third eval arm, an LLM grader, a reviewer replay recording, or more than 10 cases in this step.
- Weakening a test, raising a check limit or a byte cap to make a fixture green.
- Building cases from anything other than step 05's base-commit scaffold; an independent builder.
- Generalising the review evaluation for other routes; refactoring `bundle.ts` beyond the two seams.
- The tmpdir fallback of step 01 (not used here).
- Proving the P17 result before the probe runs; claiming the task bar is met without the decision run.

## Tests

Unit tests use synthetic fixtures only. No runtime or test dependency on `gym/`. Test names start
with the rule id.

1. `adapters.summary.test.ts` (07-P1): per runner, a passing, a failing, a zero-test, a load/syntax
   error and an unrecognised output → expected `RunnerSummary` or null; eslint/ruff/generic → null.
2. `proof.test.ts` (07-P2, 07-P3): every cause, first-match order; a syntax-error red, a zero-test
   green and a null summary are unproven.
3. `run.only.test.ts` (07-C2): only the named check runs; selection reason and `complete`; no
   selector runs; existing `run` tests unmodified.
4. `check-command.test.ts` (07-C1, 07-C3 … 07-C5, 07-K1 … 07-K5; S14): argument errors; allowed run
   appends the entry; timeout → no entry plus limit; sixth run → `check-limit`; forbid → refusal and
   limit, no gate; propose without consent → gate with key, files, raisedBy; typed `--approve` on
   hook, cli and harness channels in interactive and headless modes, trusted included → `declined`
   plus reprint, no run; honoured bound answer → runs, asks nothing again; consumed trusted
   preanswer → runs; standalone propose → refusal, no record; `session-unbound`; the command tail
   runs once.
5. `format.test.ts` (07-F1 … 07-F3): null slot → `unconfigured`, exit 0; formatted files listed;
   failure → `failed`; propose → gate; paths narrow the set; no code step calls `runFormat`.
6. `baseline.test.ts` (07-B1, 07-B2): unrelated pre-existing dirty file excluded; a pre-existing
   dirty file edited by the task included; HEAD moved flagged; unborn branch.
7. `review.task.test.ts` (07-B3 … 07-B5, 07-K5; S14): omission text; checks skip pre-existing files;
   task route with no baseline → `baseline-missing`; open review route on the slug → no refusal, no
   scoping (07-B4); standalone with no baseline → omission; without
   `--task` unchanged; `review-not-accepted` without honoured *run*; model `--approve` on waiting
   keys → declined.
8. `estimate.test.ts` (07-E1 … 07-E4): writes nothing and acknowledges no step; both stops caught;
   decisions per check; `history: no history`; ≤ 2,048 bytes with 50 checks.
9. `review-evaluation.test.ts` (07-V1 … 07-V4): each branch in order; idempotence; `raisedBy` is
   review-run for the first review and fix for a fix-round review; `reviewerRan: false` → proceed.
10. `task-route.test.ts` (07-R1 … 07-R9, 07-G1, 07-G2, 07-G4; S14), on the fake engine:
    - `draft-ok` default stop; `--from-draft` preanswer honoured on the cli channel;
    - iteration resume N+1 and `iterations-complete`;
    - ground order, payload ≤ 9 KiB, inventory with `collides`, "index: none — grep fallback";
    - review-offer default skip headless; trusted start without preanswer plus model `route next
      --answer review-offer=run` → declined, default skip, no reviewer spend; trusted preanswer →
      honoured at the gate;
    - fix first entry from review-run, one revise from report-step, third refused with `limit`;
    - approved waiting key re-enters review-run through `$raisedBy` and the review reruns;
    - `scope-expanding` default *out of scope*; *include* → revise fix;
    - `limit {missing-produces, step: red}` path, labelled no-red;
    - `check{red}`/`check{green}` qualifiers match on `phase`, an unproven green still completes
      `green` (D4);
    - `route start task --plan <file>` and `--from-draft <file>` set `RouteArgs.plan`/`fromDraft`
      and change `hash`; a synthetic UserPromptSubmit `/ambicode:task …` starts the route without
      `prepareForSlashCommand`;
    - ceremony counts: review skipped 1–2, one fix round 1–3, +1 for a red check under propose;
    - every step text ≤ 1,500 chars; start ≤ 4 KiB; report step ≤ 3 KiB; before-checks ≤ 1.5 KiB.
11. `report.test.ts` additions (07-R9): skip line; not formatted; no-red; check/format failure and
    absence stay Not verified.
12. Guard interplay (step 03 behaviour, task route): a denied headless guard ask → `blocked` with
    detail and report lead, and no `check` entry.
13. `index.warm.test.ts` (07-G3): with a fake adapter whose `build` never resolves, `check` and
    `review --task` return and the tail completes; `refreshIndex` was called and not awaited.
14. Stop tests (07-S1 … 07-S5): "tests pass" without a green ran ≥ 1 check blocks once; with it
    allows; defect brief without red-before-green blocks; a declined key missing from Not verified
    blocks; second failure allows.
15. `investigate.diagnostics.test.ts` (07-I1): synthetic investigate proposal; the gate defaults to
    decline ("don't run"); a bound approval revises read through `$raisedBy`, then the exact
    authorized check runs; a model `--approve` is declined.
16. `skill-content.test.ts` "P2.3 task skill" rewritten (07-M1, 07-M2): body ≤ 2,560 bytes,
    frontmatter, judgments, git boundary, Done/Remaining; F3 passes.
17. Eval scripts (07-T1 … 07-T5, 07-G5): generator on a synthetic benchmark (selection, stable order,
    hidden test fail-at-base/pass-at-merged check, counts only); graders on synthetic patches and
    ledgers (weakened assertion detected, red-before-green order); `--set task` paths; trigger cases
    parse and validate with the new expectation.
18. Integration on materialized `ts-off-by-one`: `route start task "<synthetic defect text>"` →
    ground (baseline, map, inventory) → red; `check … --only <spec> --phase red` on a failing spec
    written by test code → `check {red, failed ≥ 1}`; green after the fix → `check {green}`; `format`
    with a null slot → `format-unconfigured`; `review-offer` printed; synthetic *skip* → report step
    with Evidence and Not verified generated; the Stop fixture blocks a "tests pass" claim when the
    green check is missing. The report shows the ledger.

Paid and probe items (named authorization each; otherwise "awaiting go"):
- P17 (≤ $0.50): a throwaway plugin whose `Stop` hook returns `{"decision":"block","reason":"PROBE-P17 list","hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"PROBE-P17 ctx"}}`;
  one `claude -p`; record which fields reached the model (reason, additionalContext, neither) and
  whether the schema rejected anything. Reference: `docs/compatibility.md:383-387`. Keep only what
  works and keep the file fallback.
- Task suite runner walk (one walk first, proving the runner starts in the sandbox), then the
  decision run: 10 × 3 × 2 arms; cost ≈ $30–90 per decision (10 × 3 × 2 × $0.5–1.5); through step
  00's harness with `--no-publish`, from the primary checkout. Conditional on P37(b) or P58.
- The evals-triggers suite: not run without named authorization.

## Done when

- [ ] Every rule id above appears in at least one test name, and all pass.
- [ ] `npm run verify` is green; the report states the counts.
- [ ] Files changed ⊆ the Files table, plus mechanical changes listed in the report; budgets are
      reported with actual line counts.
- [ ] `git diff` of the protected files listed under Files is empty.
- [ ] The integration ledger (test 18) is shown in the report.
- [ ] The 10 cases exist locally under `evals/evals-task/cases/` (or the shortfall is counted and
      reported), with the README stating the detectable effect.
- [ ] P17, the walk and the decision run are reported as run with their results, or as "awaiting
      go"; decision 7-T is presented as v6/33 §5 says only when the decision run ran.
- [ ] Measurement status is separate from implementation acceptance. If a paid proof is not
      authorized, report it as pending with its exact downstream limitation; do not claim the
      skill's bar is met.
- [ ] The report follows 05-working-rules §4.

## Hand-off to step 08

- Step 08 extends `estimateReview`/`renderEstimate` with history (median duration and cost of the
  last 5 reviews) and builds the standalone review route on them; it does not write a second dry
  bundle.
- Step 08 reuses 07-K2 … 07-K4 (one consent check and one `declined` writer) for `review --approve`
  without `--task`, and the review-run re-entry pattern (`evaluateReview` style, `repeat: 2`).
- The review runner already runs through step 06's process runner (06-W3); step 08 consumes it and
  invocation stays identical.
- Step 08 reuses the `review.evaluate` handler registered here on its review route, and the
  `ReviewEstimate` shape of this step's Contract unchanged.
- `classifyProof`, `parseSummary`, `touchedSet` and the `format` entry are stable inputs for the
  report and the suites; step 08 adds no parallel parser.
- Open items handed on: P17 result (or pending), decision 7-T result (or pending), the 0-R reviewer
  outcome in the suite.

## Coverage of the v6 brief

| v6 step-07 requirement | Here |
|---|---|
| Probe P17: payload, one `claude -p`, record fields and rejection, keep what works, file fallback | Tests (paid), 07-S5, 07-S6 |
| `check --only` syntax; reuses `runChecks` with forced selection; no new runner | Contract CLI, 07-C1, 07-C2, D2 |
| Authorization under the check key; propose → raised gate with `onAnswer revise $raisedBy`; forbid refuses | 07-K1, 07-K4 |
| Summary per runner; eslint/ruff/generic null; fixtures from runners' docs, not NDA | 07-P1, Non-goals, test 1 |
| Ledger `check {key, argv, only, exit, phase, summary, ms, mutations}` | Contract table, 07-C4 |
| Red failed ≥ 1; green exit 0 and ran ≥ 1; unparseable → limit visible under Not verified | 07-P2, 07-P3, D4 |
| `--approve` only with bound hook answer or consumed trusted preanswer for the exact key; model flag declines in any mode/channel; prior honoured answer asks nothing again; tail advance | 07-K2, 07-K3, 07-C1, D7 |
| Investigate Diagnostics sentence and its synthetic test; closes step 03's deviation | 07-I1, test 15 |
| `format` syntax; `commands.format` slot; `format-unconfigured`; touched files; same authorization; formatted not mutations; ledger; engine never runs it | 07-F1 … 07-F3, D9, D10, D20 |
| `checks.baseline` at start; `review --task` excludes untouched dirty files, "not covered: pre-existing changes"; without `--task` unchanged | 07-B1 … 07-B3 |
| `baseline-missing` → route collects baseline first; document and test the code | 07-B4, D12, Contract codes |
| Touched dirty files from fingerprints, not HEAD status | 07-B2, D11, test 6 |
| Caller inventory via refs, collisions flagged, P51 sentence; detached index build | 07-G1, 07-G3, 07-R4 |
| `routes/task.yaml` steps start … write; draft-ok; scope-expanding; budget 18; ≤ 1,500 chars; green ends with format | 07-R1 … 07-R8 |
| review-run evaluates; first fix entry from review-run (#103); waiting keys gate per key | 07-V1 … 07-V4, D15 |
| Stop: generated sections unchanged; "tests pass" ⇔ green ran ≥ 1; red before green for a defect brief; declined keys; fixtures | 07-S1 … 07-S4, D19, test 14 |
| Skill body ≤ 2.5 KB, judgments, git boundary, report parts, fallback start, flags, allowed-tools, no LSP/prepare | 07-M1, test 16 |
| Fixtures: fix twice then limit; review-run re-entry via `$raisedBy`; typed approve declined on every channel; review-offer default skip and trusted preanswer; draft-ok stop; scope-expanding out of scope; no-red; ceremony | test 10, 07-R8 |
| Suite construction: 10 defect tickets, base-commit scaffold from step 05, G22, withheld hidden test, one walk first | 07-T1 … 07-T3, Tests (paid) |
| Graders: hidden test, red before green, no weakened assertion, cost and turns; naked/route; no third arm | 07-T5 |
| Plugin prompt `/ambicode:task --headless --answer review-offer=run …` via step 00 | 07-T4 |
| Conditional on P37(b)/P58; else blocked, no forcing via route next | 07-T8 |
| 0-R reviewer-error; no old recordings | 07-T6 |
| README detectable effect ≈ 20 pp; decision 7-T verbatim | 07-T7, 07-T9 |
| Proofs: verify green; integration on `ts-off-by-one`; warm index timing with fake adapter | Done when, tests 13 and 18 |
| Do not: checks/format from hook or code step; model approval flags; reviewer on skipped offer | 07-F3, 07-K3, 07-V4, Non-goals |
| Do not: edit-time asks, LSP item; weaken tests or raise limits; cases only from scaffold; no committed case content | Non-goals, 07-T3 |
| Hand-off acceptance: deliverables built, ledger shown, cases with README, walk/decision or awaiting go, 7-T presented | Done when |
| Shared seam: estimate seam extended by 08, no duplicate bundle | 07-E1 … 07-E4, Hand-off |
| review-run consumes the model-run review; no second reviewer | 07-V4 |
| Authorization never bypasses forbid; record decline/incomplete, not clean | 07-K1, 07-K4 |
| Summary distinguishes syntax error, zero tests, null, failed | 07-P1, 07-P2 |
| Policy before-checks and task code-style staging via step 03's stage API | 07-G4 |
| Warm rebuild after check/review via step 05's detached API, never blocking the tail | 07-G3, test 13 |
| S14: review-offer run absent/present at trusted start and later model flags | tests 4, 7, 10 |
| Tests: draft-ok, iteration N+1, fix entry/revise/third refusal, approved key rerun, pre-existing dirty files, edits to dirty files | tests 6, 10 |
| Check/format failure or absence stays Not verified; denied headless guard ask → blocked, no fabricated check | 07-R9, tests 11, 12 |
| Suite reuses step 05's builder; build/grader free; walk paid; hidden tests outside scaffold; no merged code in prompt; correlated-case uncertainty; 20 pp needs cost ≤ 1.2x | 07-T2, 07-T3, 07-T7, 07-T9, D21 |
| Measurement status separate from implementation acceptance | Done when |
| Trigger-suite migration (D2): convert positive cases, preserve inputs, synthetic assertions; step 03 retires the gate script; no paid run | 07-G5, Tests (paid) |
