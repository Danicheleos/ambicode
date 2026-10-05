# Step 06 — Plan: draft first, `plan check` with re-entry, promotion, decision gates, the plan eval

> Prerequisites: 04, 05 and 09 integrated (dispatch order: 06 runs after 09); P2/P37/P58 reports
> attached. Spend: $0 unless the dispatch names a paid item. Every paid item below needs named
> authorization; an unrun eval is "measurement pending", and model-free work continues without it.
> Read [05-working-rules.md](05-working-rules.md) first; it governs this brief, the review and the report.
> Normative sources (read the sections, not the whole files): [01-contracts](01-contracts.md) §1–§6, §8;
> [02-scenarios](02-scenarios.md); [v6/23](../v6/skills/23-plan.md) whole; [v6/32](../v6/32-artifacts.md)
> §3 (the plan route; quoted and with `acting: [Accept]` in this brief's Contract), §4 (`decision:*`), §8; [v6/12](../v6/modules/12-route.md) §3.1, §3.4,
> §3.5, §4, §8; [v6/17](../v6/modules/17-workers.md) §1–§2 and Failure modes; [v6/13](../v6/modules/13-evidence.md)
> §3; [v6/15](../v6/modules/15-guard.md) §1; [v6/33](../v6/33-measurement.md) §4, §8; [v6/30](../v6/30-harness.md)
> §3, §8; [v6/31](../v6/31-cli.md) (`plan check`, `worker run`, `note save`); [v6/01](../v6/01-goals-and-constraints.md)
> §1, M13, M19, M20, D11, D12, D14, R15; [v6/40](../v6/40-open-problems.md) P23, P26, P42, P45, P46, P50, P55.

## Goal

Ship the live `plan` route. The model writes `steps/plan-body.md` once; `plan check` saves it as a
`plan-draft` **before** anything else, verifies anchors, AC coverage and duplicate names by code, and
re-enters `plan-write` at most twice per human cycle. Acceptance is a bound `plan-accept` answer and
promotion runs step 02's predicate through step 03's real port. Generalize the reviewer's process
invocation into one runner with `worker run` on top. Build, freeze and unit-test the plan-eval
composite and runner; the paid runs wait for authorization.

## Starting point

Recheck these at dispatch. Steps 03, 04, 05 and 09 are described from their v6 step files and
[01-contracts](01-contracts.md); use the symbols as actually integrated and list any rename under
*Decisions*.

- `skills/plan/SKILL.md`: 169 lines, 9,853 bytes at `ae45901` (step 03 removed its references to the
  deleted shared files). Frontmatter `allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)`, no
  `disable-model-invocation`. Its line 158 tells the model to `note save --kind plan`.
- `src/util/skill-content.test.ts` (602 lines): 24 `it(...)` blocks mention `plan`; most read `plan/SKILL.md`
  (old note boundary, brief fields with `mini-prompt`, draft/accepted, `ExitPlanMode`, boundary
  phrases, `ambiguous-project`, prepare/`--term`/`sharedOperatingContract`/LSP loops that include
  `plan`). Step 03 may already have edited the prepare-related ones.
- `src/review/claude-reviewer.ts` (453 lines): `ClaudeReviewer` with `assertIsolationAvailable`,
  `argvFor(request, systemPromptFile)`, private `run`, `reviewerEnvironment()` (replacement policy over
  `REVIEWER_ENV_ALLOWLIST`, sets `MAX_STRUCTURED_OUTPUT_RETRIES`), failure reasons `spawn-failed`,
  `timed-out`, `truncated`, `nonzero-exit`, default output cap 4 MiB. The argv contains `--tools` and
  `--json-schema` and no budget or turn flag.
- `src/ports/process.ts` (59 lines): `ProcessRunner.run(ProcessRequest) → ProcessOutcome`,
  `EnvironmentPolicy`, `resolveEnvironment`. `src/ports/node-process-runner.ts`: `NodeProcessRunner`.
- No `src/workers/` directory and no `workers/` definition directory exist.
- From step 01: `src/hook/guard/guard-core.ts` allows `Write|Edit|MultiEdit` of
  `.ambicode/task/<slug>/steps/plan-body.md` only to the session that owns the live plan chain
  (`planBodyDecision`, `ownerOf`); `src/hook/guard/guard.test.ts:358` still uses the string
  `note save --task T --kind plan --from …` as a pass-through fixture.
- From step 02 ([step-02](step-02-evidence.md) Contract): `saveNote` (kinds `investigation`,
  `plan-draft`, `notes`, deprecated `plan`), `promotePlan`, `listNotes` in `src/task/notes.ts`;
  `resolveTaskDir`, `resolveFrom`, `TaskDir.planBody`/`workers` in `src/task/task-dir.ts`;
  `withLedgerLock`, `appendLedger`, `readLedgerStrict`; the `worker` kind (`worker`, `outcome`, `ms`,
  `artifact`, optional `costUsd`); `buildReport`, `navigationLine`; the 02-N4 ownership branch;
  `noteSaveReason` already names `investigation|plan-draft|notes` and `note promote` (02-G1).
- From step 03 ([step-03](step-03-route-engine-investigate.md) Contract, 01-contracts §2–§5):
  `createEngine({runtime, routes, handlers, pointer})` with `start/advance/status/stop`;
  `ledgerRouteContext({runtime, routes})` in `src/route/context.ts`; the `HandlerRegistry` in
  `src/route/handlers.ts` (`HandlerInput {view, context, dir, args, params, ledger, runtime,
  raisedBy}`, `HandlerResult` `ok | failed | raise`); `runCommandTail(deps, {task, cause, session})`
  in `src/route/command-tail.ts`, the exported seam for later commands (03-T2), which passes no
  entry ids; `src/route/routes.ts` (build-time route validation); `routes/gates.yaml` and
  `src/route/gates.ts` (including `decision:*`); the full gate table test; the AskUserQuestion hook
  binding (exact instance, `decision:*` minting); UserPromptSubmit launch (`channel: hook`); the
  harness token adapter (P58); the 0-S session transport or, with 0-S pending, injected sessions
  only; delivery overflow (step file + 300-character preview); `route status` orphan list;
  package-candidate inclusion of `routes/*.yaml` and `routes/steps/*.md`; fixture-only plan-shaped
  routes with S2/S3/S4/S5/S10/S13 mechanism tests and concurrent claim/takeover tests; the
  investigate route and body as the pattern for a migrated skill; removal of `evals:triggers:gate`.
- From steps 03/04: handlers `requirements.template`, `requirements.normalize`, `requirements.acs`
  (AC units `{id, key, quote, where}`, ids `AC-<key>-<nn>`). From 03/05: `search.map(context)` and
  `find(name, {kind?})` (harvest or `index.find`). From 03: `policy.stage(before-work|before-report)`.
- From step 09: config v3 writing and first-install `init`, so fixture repositories can be configured
  through the shipped CLI; init/rules trigger cases already converted.
- Eval inputs: `evals/scripts/src/{harness,analysis}/` (purpose folders), `analysis/trace-analysis.mjs`
  (`traceMetrics`, peak context), `harness/run-validity.mjs`. The real-run runner and scorers are
  ignored files under PRIMARY: `$PRIMARY/gym/planing/investigation/archive/real-run-VS-6735/`
  `run.mjs` (multi-session, uses `--resume`), `score2.mjs` (file recall), `anchors2.js` (±3-line
  identifier rule), and `…/real-run-VS-6735-2026-10-02.md` §5 and session B.
- `evals/evals-triggers/`: plan positives `plan-think`, `plan-roadmap`, `url-plan` (grader
  `graders/plan-fired.md`, `min: 1`) and the diagnostic `url-bare/graders/fired-plan.md`.

## Files

Budgets are source lines, tests excluded (05-working-rules §2.3). As a guide, tests for this step
should total about 1,900 lines.

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/workers/process-runner.ts` | create | 90 | `runWorkerProcess`: one invocation path over `ProcessRunner` |
| `src/workers/plan-check.ts` | create | 260 | `checkPlan` (anchors, ACs, duplicates) and `runPlanCheck` (draft first, artifact, `worker` entry) |
| `src/workers/worker-run.ts` | create | 140 | worker definitions, `runWorker`, artifact validation |
| `src/review/claude-reviewer.ts` | change | ±40 | `run` and `assertIsolationAvailable` go through `runWorkerProcess`; nothing else |
| `src/cli/commands/plan-check.ts` | create | 80 | `plan check` wrapper and rendering; one command tail |
| `src/cli/commands/worker.ts` | create | 60 | `worker run` wrapper and rendering |
| `src/cli/commands/note.ts` | change | ±15 | remove `--kind plan` |
| `src/task/notes.ts` | change | ±20 | drop the `plan` save kind; export the 02-N4 ownership check (step 02 does not export it) |
| `src/task/kinds.ts` | change | ±10 | `worker`: `outcome` enum, nullable `artifact`, optional `summary` (D8) |
| `src/task/report.ts` | change | ±10 | the "answered in the prompt" Decisions text (06-H4); step 03 adds only the status line (03-E12) |
| `src/cli/main.ts` | change | +25 | `plan check`, `worker run` in SPECS, USAGE and dispatch |
| `src/route/command-tail.ts` | change | ±30 | register `plan check`; `runCommandTail` input gains `produced?: readonly string[]` (the command's entry ids), passed to the consuming code step (D1) |
| `src/route/handlers.ts` | change | +15 | `HandlerInput` gains `produced: readonly string[]` (empty unless the tail passed ids); register `workers.planCheck`, `evidence.notes.save(plan-draft, from)`, `evidence.notes.promote` |
| `src/hook/events/prepare-on-skill.ts` | change | ±5 | drop `plan` from the slash-command set step 03 kept (03-H3), so `/ambicode:plan` launches the route through `prompt-launch.ts` (06-R11); a one-line change there too if step 03 placed the `plan\|task` exclusion in that file |
| `routes/plan.yaml` | create | — | the Contract YAML (v6/32 §3, quoted, `acting: [Accept]`) |
| `routes/steps/plan-fetch.md`, `plan-design.md`, `plan-write.md` | create | ≤ 1,500 chars each | step texts |
| `skills/plan/SKILL.md` | rewrite | ≤ 2,560 bytes | judgments, shape, boundary, fallback start line |
| `skills/review/references/outcomes.md` | change | — | `worker-output-invalid` with its release |
| `evals/evals-triggers/{plan-think,plan-roadmap,url-plan}/graders/`, `url-bare/graders/fired-plan.md`, `README.md` | change | — | plan positives → "no AMBICODE skill fires" (06-T1) |
| `evals/scripts/src/analysis/plan-composite.mjs` | create | 60 | the 33 §4 composite rule |
| `evals/scripts/src/analysis/plan-score.mjs` | create | 120 | file recall, anchor validity via `plan check`, AC coverage |
| `evals/scripts/src/harness/plan-run.mjs` | create | 200 | one-process real-run runner, NDA inputs by configuration |

Test-only edits: `src/util/skill-content.test.ts` (06-S4), `src/hook/guard/guard.test.ts:358` (the
fixture string becomes `--kind plan-draft`), `evals/scripts/src/testing/evals-suite.test.mjs` (06-T1).

Unchanged in this step (`git diff` empty): `hooks/hooks.json`, `src/hook/guard/guard-core.ts`,
`src/route/ownership.ts`, every existing test under `src/review/` and `src/ports/process.test.ts`, the
v6/41 protected paths (`src/review/prompt.ts`, `src/review/report.ts`, `src/snapshot/`,
`src/providers/`, `src/publication/`, `policies/*.yaml`, `prompts/reviewer-role.md`, templates except
`review.eta`), `package-candidate.mjs`, every other `SKILL.md`. No `workers/` directory is added.

## Contract

```ts
// src/workers/process-runner.ts
export interface WorkerProcessRequest {
  argv: readonly string[];            // complete; the caller builds it
  cwd: string; timeoutMs: number; maxOutputBytes: number; stdin?: string;
  env?: EnvironmentPolicy;            // default: defaultWorkerEnvironment()
  tools?: readonly string[];          // appended as `--tools a,b` only when present
  jsonSchema?: object;                // appended as `--json-schema <json>` only when present
  maxBudgetUsd?: number;              // appended as `--max-budget-usd <n>` only when present
  maxTurns?: number;                  // appended as `--max-turns <n>` only when present
}
export type WorkerProcessResult =
  | { kind: 'ok'; outcome: ProcessOutcome; argv: readonly string[] }
  | { kind: 'failed'; reason: 'spawn-failed' | 'timed-out' | 'truncated' | 'nonzero-exit';
      outcome: ProcessOutcome; argv: readonly string[] };
export function defaultWorkerEnvironment(): EnvironmentPolicy;   // = today's reviewerEnvironment()
export function runWorkerProcess(runner: ProcessRunner, request: WorkerProcessRequest): Promise<WorkerProcessResult>;

// src/workers/plan-check.ts
export interface PlanCheckResult {
  anchors: { checked: number; bad: BadAnchor[]; badTotal: number };     // bad ≤ 50 entries
  acs: { mapped: number; unmapped: string[]; unmappedTotal: number };   // unmapped ≤ 50
  duplicates: { name: string; declaredAt: string }[];                    // ≤ 50
}
export interface BadAnchor { path: string; line: string; reason: 'missing-file' | 'outside-repository'
  | 'line-out-of-range' | 'identifier-not-near'; identifier?: string }
export function checkPlan(input: { body: string; repositoryRoot: string; acIds: readonly string[];
  find: (name: string) => Promise<readonly { path: string; line: number }[]> }): Promise<PlanCheckResult>;
export function runPlanCheck(deps: NoteDeps, input: { task: string; body: string | null; from: string | null }):
  Promise<{ draft: LedgerEntry; worker: LedgerEntry; result: PlanCheckResult; artifact: string }>;

// src/workers/worker-run.ts
export interface WorkerDefinition { id: string; argv: string[]; timeoutMs: number; tools?: string[];
  maxBudgetUsd?: number; maxTurns?: number;
  outputSchema: { type: 'object'; required: string[];
    properties: Record<string, { type: 'string' | 'number' | 'boolean' | 'array' | 'object' }> } }
export function loadWorkerDefinition(fs: FileSystem, directory: string, id: string): Promise<WorkerDefinition>;
export function runWorker(deps: NoteDeps & { runner: ProcessRunner; definitions: string },
  input: { id: string; task: string }): Promise<{ entry: LedgerEntry; artifact: string }>;
```

**CLI** (both accept `--json`; exit codes unchanged: 0, 2 coded, 70 unexpected):

```text
$A plan check --task <slug> [--from steps/plan-body.md]     # body from stdin when --from is absent  ⤵
$A worker run <id> --task <slug>
$A note save --task <slug> --kind investigation|plan-draft|notes [--from …] [--iteration N]   # no `plan`
```

**Persisted.** The plan-check draft is step 02's `{kind:'note', note:'plan-draft', path, contentHash,
from?, route}`. The check result is `{kind:'worker', worker:'plan-check', outcome:'ran', ms, artifact:
'workers/plan-check-<localTimestamp>.json', summary: {failed, anchorsBad, acsUnmapped, duplicates},
route}`. `worker run` writes `{kind:'worker', worker:<id>, outcome:'ran'|'inline', ms, artifact:
<path>|null, costUsd?, reason?}`. The artifact `workers/plan-check-<ts>.json` holds `PlanCheckResult`
and is ≤ 65,536 bytes.

**New error code**, documented in `skills/review/references/outcomes.md`: `worker-output-invalid`
(release: "continue inline — do this work in the session; the worker's output was not used").
Removed behaviour: `note save --kind plan` → `bad-argument` (field `kind`).

**Route** (`routes/plan.yaml`, exactly this text). It is v6/32 §3 with two changes: the values that
hold `{`, `}`, `,` or `: ` inside a flow sequence are quoted, because the block in v6/32 §3 does not
parse as YAML (`MISSING_CHAR` at `produces: [policy{before-report}]`); and `plan-accept` declares
`acting: [Accept]`, which 01-contracts §5 requires ("Mark Accept …"). Without that line step 03
would treat *Accept* as non-acting and accept an untrusted preanswer (03-G2, 03-G11).

```yaml
skill: plan
version: 3
budget: { modelSteps: 14, wallMinutes: 45 }      # wallMinutes applies in --headless only
exits: [done, blocked, human, inconclusive, superseded, budget]
revisable: [design]                               # the model may `route next --revise design`
steps:
  - id: template
    actor: code
    when: args.hasRequirement
    run: requirements.template
  - id: fetch
    actor: model
    when: args.hasRequirement
    instruction: file:routes/steps/plan-fetch.md
  - id: ground
    actor: code
    run: [requirements.normalize, requirements.acs, "search.map(context)", "policy.stage(before-work)"]
    produces: [envelope, map, policy]
    repeat: 2                                     # one automatic re-run; a human scope answer starts a new cycle
  - id: design
    actor: model
    instruction: file:routes/steps/plan-design.md
    payload: [map, "policy:before-work", acs]
    repeat: 2
  - id: plan-step
    actor: code
    run: ["policy.stage(before-report)", evidence.navigationLine]
    produces: ["policy{before-report}"]           # qualified: a before-work policy entry is already in the window
  - id: plan-write
    actor: model
    instruction: file:routes/steps/plan-write.md
    repeat: 3
  - id: plan-check
    actor: code
    run: ["evidence.notes.save(plan-draft, from: steps/plan-body.md)", workers.planCheck]
    produces: ["note{plan-draft}", worker]
    onFail: revise plan-write                     # bounded by plan-write's repeat (3), not by this step's
  - id: plan-accept
    actor: human
    gate:
      question: "Accept this plan?"
      object: "note{plan-draft}"                  # the latest draft in plan-check's window; the answer carries its hash
      options: [Accept, Revise, Reject]
      acting: [Accept]                            # 01-contracts §5: Accept is an acting option
      default: Reject                             # non-acting: the draft stays a draft
      release: Reject
      onAnswer: { Revise: revise design }         # a human cycle: resets design/plan-write repeats
      maxRevises: 3                               # printed as "Revise (N left)"
  - id: promote
    actor: code
    when: gate.plan-accept.is(Accept)             # the latest answer in this step's window
    run: evidence.notes.promote                   # the bound predicate of v6/13 §3
    onFail: revise plan-accept                    # plan-not-accepted {object-changed}: re-print the gate for the current draft
    produces: ["note{plan}"]                      # a note{plan-draft} does not satisfy it
```

## Rules

**W — process runner and `worker run`** (v6/17 §1)
- 06-W1 `runWorkerProcess` calls `runner.run` exactly once with `{argv', cwd, timeoutMs,
  maxOutputBytes, env, stdin}`, where `argv'` is `argv` followed, only when present and in this order,
  by `--tools`, `--json-schema`, `--max-budget-usd`, `--max-turns`. `env` defaults to
  `defaultWorkerEnvironment()`.
- 06-W2 Classification: `spawn-failed` and `timed-out` from the outcome kind; then `truncated` when
  `outcome.truncated`; then `nonzero-exit` when the exit code is not 0; else `ok`. This is the order
  `ClaudeReviewer.run` uses today.
- 06-W3 `ClaudeReviewer` uses `runWorkerProcess` for both of its process calls, passing its own complete
  argv (from the unchanged `argvFor`) and no optional flag. `reviewerEnvironment()` stays exported and
  returns the same value as `defaultWorkerEnvironment()`. For the same input, the `ProcessRequest` the
  runner receives is deep-equal to the one at the dispatch baseline, and every returned
  `ReviewerInvocation` (reasons and detail strings) is unchanged.
- 06-W4 `worker run <id>` loads `<pluginRoot>/workers/<id>.yaml` (zod-validated `WorkerDefinition`).
  A missing file, an `id` outside `^[a-z0-9-]+$`, or an invalid definition → `bad-argument` (field
  `id`). The literal `{taskDir}` in an argv element is replaced by the absolute task directory; nothing
  else is substituted.
- 06-W5 Before anything is written, `worker run` applies the 02-N4 ownership check (`ownerOf` on the
  strict ledger, inside `withLedgerLock`), with the same refusals.
- 06-W6 A valid run: stdout parses as one JSON object, satisfies `outputSchema` (every `required` key
  present; each listed property has its JSON type), and serializes to ≤ 65,536 bytes. It is written to
  `workers/<id>-<localTimestamp>.json` and recorded as `worker {outcome: 'ran', artifact}`.
- 06-W7 Anything else (process failure, non-JSON, schema mismatch, over 64 KiB) records `worker
  {outcome: 'inline', artifact: null, reason}` and throws `worker-output-invalid`. No artifact file is
  written. `worker run` has no command tail (it is not on the v6/31 ⤵ list).

**C — `checkPlan`** (v6/17 §2, P26; port of `anchors2.js`)
- 06-C1 Code blocks (between ``` fences) are skipped. An **anchor** is a repository-relative path with
  an extension followed by `:N` or `:N-M` (code anchor), or a line under a Markdown heading that names
  a path and carries `line N`, `lines N-M` (also `–`) or `LN` (prose anchor).
- 06-C2 Paths resolve against `repositoryRoot`. A path that is absolute or contains `..` →
  `outside-repository`. An anchored path that does not exist → `missing-file`. A path with no anchor
  is not checked (it may be a new file).
- 06-C3 Range: `1 ≤ N ≤ M ≤ file line count`, else `line-out-of-range`.
- 06-C4 Identifier (code anchors only): take the backtick spans on the anchor's line, the first word
  matching `[A-Za-z_][A-Za-z0-9_]{4,}` that is not `lines`, `line`, `replace`, `import`, `export`,
  `const`, `function` or `return`. If one exists and it does not occur in file lines `N-3 … M+3`
  (clamped) → `identifier-not-near`. Prose anchors get the range check only.
- 06-C5 `checked` counts every anchor examined. `bad` keeps the first 50 in document order;
  `badTotal` is the full count.
- 06-C6 ACs: an id from `acIds` is mapped when it appears on a Markdown table row (a line starting
  with `|`) or on a line under a heading whose text contains `Not covered` (until the next heading of
  the same or higher level). `unmapped` lists the others in `acIds` order (first 50; `unmappedTotal`).
  With no ACs (no requirement), `mapped = 0` and `unmapped = []`.
- 06-C7 Duplicates: a candidate is a backtick identifier (06-C4 word rule) on a line that matches
  `\b(new|add|adds|create|creates|introduce|introduces)\b` (case-insensitive). Each candidate for which
  `find` returns at least one declaration is listed once with its first `path:line` (first 50).
  Duplicates are reported; they never make the check fail.
- 06-C8 `failed = badTotal > 0 || unmappedTotal > 0` (v6/17 §2). Same input, same result.

**P — `plan check` and the plan-check step** (v6/23 rows 6–7, 01-contracts §3, D11)
- 06-P1 Body: `--from` through step 02's `resolveFrom` (only `TaskDir.planBody`), otherwise stdin
  (262,144-byte cap). Neither → `bad-argument`.
- 06-P2 Order inside `runPlanCheck`: (1) `saveNote(kind: 'plan-draft', from)`, which runs the 02-N4
  ownership check and appends the draft **before** the checker starts; (2) `checkPlan` with the ACs from
  step 04's `acs` for this task and step 05's `find`; (3) write the artifact; (4) append the `worker`
  entry with `summary`. If (2) or (3) throws, the draft and its entry stay and the command fails with
  that error; no `worker` entry is written.
- 06-P3 A refusal in (1) (`session-unbound`, `route-busy`, `route-taken-over`, `ledger-unreadable`)
  writes nothing and runs no check.
- 06-P4 With an active route for the calling session, the wrapper then invokes the command tail exactly
  once with `cause: 'plan check'` and `produced` = the ids of the draft and `worker` entries. Without one, there is
  no tail (standalone).
- 06-P5 The tail records `step {plan-write, actor: model, status: completed}` (a model step without
  `produces`), folds, and reaches the `plan-check` code step. That step **consumes** the two entries
  passed in: it does not save or check again. Every other entry point (`route next`, resume, adoption)
  that reaches `plan-check` not done runs its declared `run` list (save, then check) through the same
  tail-free handlers.
- 06-P6 After its outputs (`note{plan-draft}`, `worker`) are in its window, `plan-check` writes
  `step {plan-check, completed}`, for a passing **and** a failing check. Then, when `summary.failed`, the
  engine applies `onFail: revise plan-write` (`via: code`), bounded by `plan-write`'s `repeat: 3` within
  the human cycle; `plan-check`'s own default 1 is never consulted. A refused revise records `limit
  {repeat, step: plan-write}` and the route moves to `plan-accept`.
- 06-P7 The re-printed `plan-write` step carries the bad anchors and unmapped ACs (from the latest
  artifact, first 50 each). When the next failure would exceed the bound, that print also says: "last
  automatic round: list anything you cannot fix under `## Known limitations`".
- 06-P8 A `plan check` exits 0 whenever the check ran, pass or fail, and prints the counts, the artifact
  path and the tail's next step.
- 06-P9 No code path deletes, renames or overwrites a `plan-draft` file other than promotion
  (02-P7). Drafts of failed rounds stay listed by `note list`; a draft file without an entry appears in
  `route status`'s orphan list.
- 06-P10 The `plan-check` code step and the `promote` code step run inside the engine's advance,
  which holds the ledger lock (03-O6). Their handlers call `runPlanCheck`/`saveNote`/`promotePlan`
  with `NoteDeps.ledger = HandlerInput.ledger` (02-L7); `plan check`, `note save` and `note promote`
  run from the CLI acquire the lock once. A test runs the whole S1 walk through the engine with the
  real lock and asserts no `ledger-busy` and no nested-acquisition error.

**R — route, gates and step texts** (v6/32 §3–§4, v6/23)
- 06-R1 `routes/plan.yaml` is the Contract YAML, byte for byte. It parses with the `yaml` package
  with no errors, passes step 03's build validation, and the package candidate contains it.
  `plan-accept` has `acting: [Accept]`; an untrusted `route start plan … --answer plan-accept=Accept`
  (channel `cli`, headless or not) records `declined {via: flag, reason: acting-needs-human}` and no
  preanswer (03-G2), so no `via: prompt` acceptance can promote.
- 06-R2 Step texts, each ≤ 1,500 characters after inclusion, each carrying `--task <slug>`:
  - `plan-fetch.md`: fetch each source with the field lists from the template, then `route next`.
  - `plan-design.md`: a reuse sweep with `$A find`; the design and its alternatives; one
    `AskUserQuestion` per **material** decision ending with `[ambicode gate decision:<slug>]`; one
    sentence on material versus routine; then `route next`.
  - `plan-write.md`: write `steps/plan-body.md` once, in this shape: an AC → section table (every AC
    id from the design payload, or under "Not covered"); per iteration *Goal*, *Changes* (`path:line`),
    *Tests* (fails first), *Accept*, *Checks* (by key), *Leaves out*; then run
    `$A plan check --task <slug> --from steps/plan-body.md`.
- 06-R3 Decision gates go through step 03's hook: `gate {class: decision, gate: 'decision:<slug>'}`
  plus `acceptance {via: hook}`; the registry default and release are *keep open* (the plan stays a
  draft). Nothing in step 06 adds a decision-gate path.
- 06-R4 `plan-accept` prints *Accept* / *Revise (N left)* / *Reject*, the draft's file name and the
  first 12 characters of its hash, and the marker with its instance. The object is the latest
  `note{plan-draft}` in `plan-check`'s window. The default and release are `Reject` (the draft stays).
- 06-R5 *Revise* → `revise design`, a human cycle: `design` and `plan-write` counters reset. The fourth
  *Revise* shows "(0 left)" and records `declined {max-revises}` (P55).
- 06-R6 *Accept* → the `promote` code step calls step 02's `promotePlan` with step 03's real
  `RouteContextPort` and the entry point's session; success leaves `note {plan, promotedFrom}` and the
  route completes. A `plan-not-accepted` from it → `onFail: revise plan-accept`: the gate re-prints for
  the current producer object **without** another `plan-write` or `plan check`; two identical
  `plan-not-accepted {object-changed}` from one command → step 03's same-error release.
- 06-R7 Standalone `note promote` (step 03's wiring) and the route's `promote` step reach the same
  `promotePlan`. After an honoured *Accept*, `note promote` asks nothing again.
- 06-R8 Acting authority for *Accept*: only a hook answer bound to the printed instance, or a preanswer
  from a trusted start converted at the reached print. A model-typed `--answer plan-accept=Accept`
  records `declined {acting-needs-human}` on every channel and in every mode, including a trusted
  headless route, and in headless the gate takes `default-taken {via: headless}` (`Reject`).
- 06-R9 A trusted preanswer survives `revise plan-write` and is consumed only at the reached print,
  bound to the draft then current.
- 06-R10 `ExitPlanMode` is not an acceptance channel; no file in this step names it as one.
- 06-R11 `/ambicode:plan …` typed by the user starts the plan route through step 03's UserPromptSubmit
  launch (03-H3, `channel: hook`); `prepare-on-skill.ts` no longer handles `plan` (it keeps `task`
  until step 07).

**N — notes and ownership**
- 06-N1 `note save --kind plan` → `bad-argument` (field `kind`) naming the three remaining kinds;
  `saveNote` no longer accepts `plan`. Legacy plan notes stay readable and listed (02-K2, 02-N6).
- 06-N2 Write-time ownership on the shipped route: `route next` (step 03), `note save --from`,
  `plan check`, `note promote` and the guard's plan-body row refuse a session in `takenOver` with
  `route-taken-over`, and any other non-owner with `route-busy`. Time since the last write is never
  consulted.

**H — headless and report**
- 06-H1 Every new CLI output and both payload files obey 01-contracts §8: plan start delivery ≤ 4,096
  bytes; ground/design delivery ≤ 9,216 bytes, else step file plus 300-character preview; plan-write
  delivery ≤ 3,072 bytes; CLI inline ≤ 8,000 characters.
- 06-H2 The integration ledger shows the ceremony of v6/23's table: 3 + N ceremony calls for N
  decisions, plus 1 work command (`plan check`) per write.
- 06-H3 Without hook support (P2 unproven) only non-acting answers are available interactively; no
  code path substitutes a flag for a bound answer.
- 06-H4 The report's Decisions line for an `acceptance {via: prompt}` on `plan-accept` reads
  "answered in the prompt (before the artifact existed)" (P42).

**S — skill body**
- 06-S1 `skills/plan/SKILL.md` ≤ 2,560 bytes: the judgments (material versus routine; reuse over new;
  independently reviewable iterations), the plan shape (06-R2's six fields), the planning boundary
  with reasons, and the fallback start line `$A route start plan $ARGUMENTS`.
- 06-S2 Frontmatter: `disable-model-invocation: true`; `allowed-tools` is today's list plus
  `Write(.ambicode/task/*/steps/plan-body.md)`. The guard row stays the real boundary.
- 06-S3 The body keeps one line: "never call a plan accepted merely because it was generated".
- 06-S4 `skill-content.test.ts`, for each block that reads `plan/SKILL.md` at dispatch:
  - keep: argument hint and `$ARGUMENTS`; `--requirement <url>` and no plural flag; the four "do not"
    boundary phrases; evidence never authorization; no `locate`; draft/accepted with 06-S3's line;
  - rewrite: the note boundary (assert the body contains no `--kind plan\b`); the brief fields (the six names appear in the body and in
    `routes/steps/plan-write.md`; the `^  - *Field*:` format and `mini-prompt` go); the acceptance gate
    (`ExitPlanMode` absent; `plan.yaml`'s `plan-accept` has options Accept, Revise, Reject and
    default/release Reject); the primary-request block (for plan: the fallback line passes
    `$ARGUMENTS` unchanged);
  - remove `plan` from: the prepare/`--term`/`sharedOperatingContract`/LSP-navigation loops, and the
    `ambiguous-project` block (the route's `project-ambiguous` gate replaces it and the gate table
    covers it). Add: byte cap, frontmatter, grant.

**T — trigger suite** (D2)
- 06-T1 In `plan-think`, `plan-roadmap` and `url-plan`, `plan-fired.md` becomes a grader with
  `input_match: '"ambicode:(investigate|plan|task|review|init|rules)"'`, `min: 0`, `max: 0`; case
  inputs, scaffolds and `sibling-fired.md` are unchanged. `url-bare/graders/fired-plan.md` becomes
  `max: 0`. The README says plan no longer fires on phrasing. A synthetic test asserts that no
  `evals-triggers` grader expects `ambicode:plan` (or investigate, init, rules) with `min ≥ 1`. The
  suite is not run.

**E — the plan eval** (v6/33 §4; model-free build, paid runs gated)
- 06-E1 **Define the composite before the first run** (#62, P50): write
  `evals/scripts/src/analysis/plan-composite.mjs` with the rule verbatim from 33 §4 (per metric, noise
  = the naked arm's run-to-run spread, max − min over its 3 runs per epic, averaged; the route wins
  when above naked by more than the noise on ≥ 2 of 3 metrics and not below by more than the noise on
  the third; a tie on AC coverage counts as "not below"). Unit-test it on synthetic numbers. Freeze its
  code and tests (commit only if authorized; otherwise record hashes) **before** any run.
- 06-E2 Hand-label the ACs of the three epics (33 §4, P23): the labels live beside the benchmark data
  (NDA, gitignored); the report gives counts only. The labels' SHA-256 is recorded before the first
  paid run.
- 06-E3 `harness/plan-run.mjs` rebuilds the real-run runner **as one process** (MCP servers are
  dropped on `--resume`, 33 §4): one `claude -p` session per run, no `--resume`. It reads the epics and
  labels from the NDA location by configuration (`--benchmarks "$PRIMARY/benchmarks"`), never by a
  committed list. Arms: naked / route. The route arm's prompt starts the plan route from the user's
  prompt; any acceptance comes from a trusted-start `--answer plan-accept=Accept` in that prompt,
  never from a model flag.
- 06-E4 `analysis/plan-score.mjs`: file recall (`score2.mjs` port), anchor validity through the built
  `plan check`, AC coverage against the labels. Per run it reports cost, turns, peak context (from the
  trace, P32), revises, and whether the scored text is a promoted plan or the latest draft.
- 06-E5 Paid smoke run first (1 epic × 1 run × 2 arms) if authorized; then 3 × 3 × 2.
- 06-E6 **Decision 6-P**: win → report; not a win → present per-metric means and spreads for both arms
  (P50 asks for the spreads with every result), and propose the scout appendix (17; +$16–23) **only
  if** the traces show the main session's context or cost is the bottleneck. The user decides.
- 06-E7 Live plan-acceptance evals require P2 support, or an explicit trusted-start preanswer with
  P37(c)/verified harness transport. Otherwise the acceptance part is reported conditional/pending; it
  never falls back to model-flag authorization.

## Decided readings

These choices are fixed by this brief. Do not reopen them; report a conflict as PLAN instead.

- D1 `plan check` writes its result first and the tail consumes it; other entry points run the `run`
  list. This reconciles 01-contracts §3 ("the registered code step consumes the result … must not run
  the check twice at the command tail") with v6/12 §8 Interruption ("the step re-runs"). A crash after
  the `worker` entry and before completion is repaired by the next `route next`, which saves and checks
  again (S10). Step 03's tail passes no entry ids, so this step adds `produced` to `runCommandTail`
  and `HandlerInput` as the tail's extension seam; step 07 reuses it; no second path is built.
- D2 `plan-check` records completion for a failing check too, then the revise. This gives S4's "three
  plan-check completions, two via:code revises".
- D3 Code never edits a saved draft: that would break its hash (02-D6). "Known limitations" is written
  by the model on the last automatic round (06-P7). The `limit` entry puts the remainder in the report's
  Not verified (02-R3).
- D4 Anchor syntax follows `anchors2.js` (06-C1–C4). An un-anchored missing path is not "bad". This
  implements v6/17's "every existing path exists" without failing proposed new files.
- D5 AC mapping is textual (06-C6). The AC list comes from step 04's `acs`; with no requirement there is
  nothing to map.
- D6 New names are recognised by verb lines (06-C7). Duplicates are reported and do not trigger
  `onFail`, because v6/17 §2 names only bad anchors and unmapped ACs as the failure.
- D7 Lists are capped at 50 with totals (v6/17 Failure modes: "the first 50 and the count"). With caps,
  the artifact stays under 64 KiB.
- D8 The `worker` kind gains `outcome: 'ran'|'inline'|'skipped'`, `artifact: string | null` and an
  optional `summary`. The plan-check step reads `summary.failed`, so it must be a schema field, not a
  passthrough field (02-K5).
- D9 The runner appends optional flags only when they are given. The reviewer passes none and keeps
  `argvFor` unchanged, so its argv is byte-identical (01-contracts §8: "invocation behavior must be
  identical").
- D10 Worker definitions live in `<pluginRoot>/workers/` and none ships (v6/17 appendix; core
  acceptance excludes unshipped definitions from the package). `worker run` supports `argv` workers
  only. A model-free worker in tests is a fixture definition whose argv runs `node <fixture>.mjs`.
  Every failure to get a valid artifact uses the one code `worker-output-invalid`, with the reason in
  its details.
- D11 `default: Reject` in the route YAML is the "keep the draft" default: Reject is non-acting and
  leaves the draft a draft.
- D12 The AC ids reach the model in the `design` payload (`payload: [map, policy:before-work, acs]`).
  The route YAML gives `plan-write` no payload. The plan-write delivery carries `plan-step`'s
  before-report policy and navigation line.
- D13 The new eval scripts go in the purpose folders (`analysis/`, `harness/`). Flat names in the v6
  text map to these folders (00-README).
- D14 `plan check`'s exit code is 0 for every completed check. Failing is a route outcome, not a
  command error (v6/31 exit codes).
- D15 With 0-S pending, runtime routed CLI calls refuse `session-unbound` (01-contracts §1). The
  integration walk and the scenarios drive Engine, CLI wrappers and hook handlers with injected
  sessions through step 03's test seam. With 0-S decided, one additional CLI-process walk uses the
  real transport.
- D16 P2 unproven: the bound-answer tests use synthetic hook payloads (unconditional), and the report
  marks the platform assertion conditional. S2's platform half is conditional on P37(c). Harness trust
  requires P58.

## Non-goals (a reviewer may not raise these)

- No scout, collector or plan-judge worker, no shipped worker definition, no `worker` gate, no
  `workers.approved` handling (v6/17 appendix; step 10).
- No `module:` workers in `worker run`; `plan check` is a code step, not a worker definition.
- No `ExitPlanMode` path (D12); no change to `hooks/hooks.json` or guard decisions.
- No change to the engine algorithm, fold, windows, counters, consent, ownership predicate or hook
  binding beyond the D1 seam and handler registration. Gaps there are step 03 defects: report them
  as PLAN.
- No new promotion predicate and no notes-only fold: `promotePlan` and the real port are reused.
- No code edit of a saved draft; no draft deletion; no compaction of failed rounds.
- No parser for arbitrary Markdown or other anchor forms beyond 06-C1; no language-aware duplicate
  detection beyond `find`.
- No `task --plan`/`--from-draft` (step 07), no review route (step 08).
- No change to `ClaudeReviewer`'s argv, prompts, schema, parsing or messages.
- No run of the trigger suite, the plan eval, a probe or any model call without named authorization.
- No committed epic ids, AC texts, labels or benchmark paths.
- Not a security sandbox (01-contracts §5): no defence against a hostile local process or crafted
  plan text.

## Tests

Name each test after its rule. Use real temporary directories and materialized fixtures. Inject
clocks, sessions, the process runner and hook payloads. No test reads anything under `gym/` or NDA
locations; expected structures (the plan YAML, the composite rule) are embedded as synthetic literals.

1. `process-runner.test.ts`: flag order and omission (06-W1); the four failure classes in order
   (06-W2); a capturing fake runner records the reviewer's `ProcessRequest` for a fixed request and
   asserts deep equality with the literal captured at the dispatch baseline (06-W3). All existing
   `src/review/` and `src/ports/process.test.ts` tests pass unedited.
2. `worker-run.test.ts`: definition loading and refusals (06-W4); ownership refusal writes nothing
   (06-W5); a fixture `node` worker → `ran` with artifact (06-W6); non-JSON, schema mismatch, 64 KiB +
   1 and nonzero exit → `inline`, `worker-output-invalid`, no artifact (06-W7).
3. `plan-check.test.ts` (`checkPlan`, table-driven on a small fixture tree): code and prose anchors,
   fences skipped (06-C1); outside, missing, un-anchored new path (06-C2); range (06-C3); identifier
   at ±3 hit and miss, prose range-only (06-C4); 60 bad → 50 + `badTotal` (06-C5); table, Not covered,
   unmapped, no ACs (06-C6); duplicate found and not failing (06-C7); determinism (06-C8); worst-case
   artifact ≤ 65,536 bytes (D7).
4. `plan-check.test.ts` (`runPlanCheck` and the wrapper): the draft entry precedes the `worker` entry
   and exists when the checker throws (06-P2, D11); refusal writes nothing (06-P3); tail invoked once
   with the ids, none standalone (06-P4); stdin versus `--from`, `--from` elsewhere refused (06-P1);
   exit 0 on failing check (06-P8).
5. `plan-route.test.ts`, on the shipped `routes/plan.yaml` through Engine, CLI wrappers and hook
   handlers (S-ids from [02-scenarios](02-scenarios.md); step 03's fixture-route tests are rerun here
   against the shipped route):
   - the file equals the Contract YAML, parses with the `yaml` package with no errors; build
     validation; candidate contains it; `plan-accept.acting` is `[Accept]` (06-R1);
   - S1 on this YAML: `route start plan … --headless --answer plan-accept=Accept` from the CLI
     (untrusted) → `declined {acting-needs-human}`, no preanswer, headless `default-taken` *Reject*,
     no `note{plan}` (06-R1, 06-R8);
     each step text ≤ 1,500 characters and names `--task` (06-R2);
   - S4: two failures then a pass → 3 deliveries, 3 completions, 2 `revise {via: code}`; a third
     failure → `limit {repeat, step: plan-write}`, the route reaches `plan-accept`, the last-round
     sentence printed (06-P5, 06-P6, 06-P7, D2);
   - exactly one save and one check per `plan check` call; a `route next` at `plan-check` runs both
     once (06-P5, D1);
   - S5: model `--revise design` consumes `design`'s repeat, not `maxRevises`; then a human *Revise*
     resets counters and reruns `plan-step` without `limit`; an untrusted model `--answer
     plan-accept=Revise` revises `via: model` (06-R5);
   - two `plan check` failures then a human *Revise* re-open `design` with fresh counters (#75, D14);
     the fourth *Revise* → "(0 left)", `declined {max-revises}` (06-R5);
   - a `plan-draft` exists before any `plan-accept` **acceptance** entry; a `preanswer` is not one (D11);
   - S3 and S13 on the shipped route: accept A, save B → `object-changed`, re-print for B with no new
     `plan-write`/`plan-check` entry; Accept B → one plan; a second `note promote` →
     `plan-already-promoted`; instance 99, foreign chain, logical-id mismatch → unbound, re-print
     (06-R4, 06-R6, 06-R7);
   - *Accept* with `note{plan-draft}` already in the window still runs `promote` (#105);
   - S1, S2 (synthetic adapter; platform half conditional on P37(c)), S14: model flags decline on
     every channel and mode; trusted preanswer honoured at the reached print and surviving `revise
     plan-write`; no second question after an honoured Accept; report text of 06-H4 (06-R8, 06-R9,
     06-H4);
   - S12: a late bound answer after `default-taken {never-asked}` supersedes it and uses the answered
     instance's object (06-R6);
   - decision gate through a synthetic hook payload: `gate {class: decision}` + `acceptance {via: hook}`,
     default *keep open* (06-R3);
   - S10: crash after the `worker` entry before completion → next `route next` reruns once; crash after
     the promotion rename before the entry → `repaired`, no new consent or rename; no draft deleted,
     the orphan listed by `route status` (D1, 06-P9);
   - S11: second session same args → `route-busy`; `--adopt` keeps the fold; the old session's `route
     next`, `note save --from`, `plan check`, `note promote` and guard plan-body write → `route-taken-over`;
     clock + 60 minutes changes nothing; step 03's simultaneous start and takeover/write tests on the
     shipped route (06-N2);
   - the full gate table (step 03's) now enumerates `plan-accept` and stays green;
   - a synthetic UserPromptSubmit `/ambicode:plan <text>` starts the plan route with `channel: hook`
     and `prepareForSlashCommand` is not called (06-R11).
6. `plan-integration.test.ts`: materialize `ts-feature-boundary` with a synthetic request; `route
   start plan "<text>"` → ground → design; a decision gate answered through a synthetic hook payload;
   `route next` → plan step; test code writes a plan body; `plan check` with one bad anchor → write
   step re-printed with the bad list; a corrected body → `plan check` passes → draft saved →
   `plan-accept` printed with "(3 left)"; synthetic *Accept* via hook → `plan_<ts>.md` exists, the
   ledger shows `note {plan, promotedFrom}`. Print the ledger. Assert the ceremony count 3 + N, +1 work
   command per write (06-H2) and the byte caps (06-H1).
7. Notes: `--kind plan` → `bad-argument`; legacy plan notes still listed (06-N1). Guard fixture
   string updated; F3 outcomes test passes with `worker-output-invalid`.
8. `skill-content.test.ts` per 06-S1–S4; `evals-suite.test.mjs` per 06-T1.
9. `plan-composite.test.mjs`: synthetic numbers for win, loss, tie on AC coverage, and a "below by more
   than the noise on the third" case (06-E1). `plan-score.test.mjs` on a synthetic plan, truth list
   and label file (06-E4). `plan-run.mjs`: dry-run argv test that shows one session, no `--resume`,
   inputs from configuration (06-E3).

## Done when

- [ ] Every rule id above appears in at least one test name, and all pass.
- [ ] `npm run verify` and `node --test 'evals/scripts/src/**/*.test.mjs'` are green; the report
      states the counts.
- [ ] Files changed ⊆ the Files table plus listed mechanical changes; budgets reported with actual
      line counts; `skills/plan/SKILL.md` bytes reported.
- [ ] `git diff` of the "Unchanged" list is empty.
- [ ] The integration ledger (test 6) is in the report.
- [ ] `plan-composite.mjs` and its test, and the label file, are frozen with recorded SHA-256 (or
      commit, if authorized) before any paid run; the scorer paths `score2.mjs` and `anchors2.js` under
      PRIMARY are cited.
- [ ] The plan eval has run with authorization, or is reported "awaiting go" with its exact
      limitation. Decision 6-P is presented as 33 §4 says; no claim that the skill's bar is met
      without the measurement.
- [ ] The report follows 05-working-rules §4, and lists 0-S, P2, P37(c) and P58 status.

## Hand-off to step 07 and later

- Step 07 opens the latest `note{plan}` (or a draft with `--from-draft`); it must not write a second
  plan reader or promotion path.
- Step 08 runs the live reviewer through `runWorkerProcess`, with the reviewer's argv unchanged.
- Step 10's scout (if ever authorized) is a `workers/scout.yaml` definition run by `worker run`, plus
  a declared worker gate there. Nothing in step 06 pre-builds it.
- The S3/S4/S5/S10/S11/S13/S14 fixtures on the shipped plan route are the regression set for later
  engine changes. Core acceptance reruns them from the package candidate.

## Coverage of the v6 brief

| v6 step-06 requirement | Here |
|---|---|
| Why: headless release, unsaved plan, double emission, code-checked anchors; draft before asking, re-entry, human Revise, promotion on record | Goal, 06-P2, 06-P6, 06-R5, 06-R6, 06-H1 |
| Read first: CLAUDE.md, v6 sections, code, real-run report and scorers; cite scorer paths | Header sources, Starting point, Done when |
| D1 runner generalized from `ClaudeReviewer` on the existing port: env allowlist default, cwd, tools, schema, cap, failure reasons, budget, turns | 06-W1, 06-W2, Contract, D9 |
| `ClaudeReviewer` unchanged behaviour, tests green unchanged; model-free worker in-process; no model worker | 06-W3, test 1, 06-P2, Non-goals |
| D2 `plan check` code only: paths, `:LINE`, ±3 identifiers, prose ranges range-only, AC mapping, duplicates via `find`; output shape; > 50 bad | 06-C1 … 06-C8, D4–D7 |
| Execution order: draft before checks, worker and completion records, `onFail: revise plan-write` with bad list, past repeat → Known limitations and `plan-accept`; artifact ≤ 64 KB | 06-P2, 06-P5 … 06-P7, D2, D3, Contract |
| D3 YAML (quoted for the parser, `acting: [Accept]` per 01-contracts §5) with produces/repeats/maxRevises/onAnswer/default/when; three step texts with their contents, ≤ 1,500 chars | 06-R1, 06-R2, D11, D12 |
| D4 decision gates via hook, keep open | 06-R3 |
| `plan-accept` options, keep-draft default, human-cycle Revise, fourth Revise (0 left), Accept → promote → complete; `plan-not-accepted`; onFail reprint without rewrite/recheck | 06-R4 … 06-R7 |
| Headless: only trusted preanswer acts; model line declined with `--headless`; preanswer consumed and bound; report wording (P42) | 06-R8, 06-R9, 06-H4 |
| `ExitPlanMode` not a channel | 06-R10, Non-goals |
| D5 body ≤ 2.5 KB with judgments, shape, boundary, fallback; `disable-model-invocation`; grant; remove `--kind plan`; guard message and tests; rewrite skill-content assertions with the boundary line | 06-S1 … 06-S4, 06-N1, Files (guard fixture; 02-G1 already changed the text) |
| D6 fixtures: two failures + human Revise; model revise vs allowance; draft before acceptance; Accept with draft in window; preanswer survives revise; CLI headless never acting; no second question; byte ceilings | Test 5, 06-H1 |
| D7 composite before first run, verbatim rule, unit test, freeze/hashes | 06-E1, Done when |
| Hand-labelled ACs beside benchmark data, counts only | 06-E2 |
| One-process runner under `evals/scripts/src/`, epics by configuration | 06-E3, D13 |
| Scorers and per-run cost/turns/peak context/revises | 06-E4 |
| Paid smoke then 3 × 3 × 2 | 06-E5 |
| Decision 6-P | 06-E6 |
| Proofs: verify, table test, reviewer tests through runner; integration walk with ledger; ceremony count | Tests 1, 5, 6; 06-H2 |
| Do not: workers/gates; acceptance only from bound hook or trusted preanswer; engine never writes plan-body or source; no eval before freeze; no committed epics/labels; no `ExitPlanMode` | Non-goals, 06-R8, 06-E1, 06-E2 |
| Hand-off acceptance: deliverables built and tested, ledger shown, composite frozen, eval run or awaiting go | Done when |
| Add. 1: real route on shared ports; producer vs consent windows; reask B without rewrite; same bytes different entry; S3/S13 through engine/CLI/hook | 06-R4, 06-R6, test 5 |
| Add. 2: draft saved before any checker result including failure; tail-free handlers; tail consumes; S4 counts; human Revise resets (S5) | 06-P2, 06-P5, 06-P6, D1, D2, test 5 |
| Add. 3: owner at write time on check, `--from`, promote, guard; S11 incl. adopt, idle 60 min, concurrent tests | 06-N2, 06-P3, test 5 |
| Add. 4: S10 crash points; orphan files reported; no draft deletion | 06-P9, D1, test 5 |
| Add. 5: `worker run` through the same runner; fixture-only model-free definition; `worker-output-invalid` inline; ≤ 64 KiB; documented code | 06-W4 … 06-W7, D10, Contract |
| Add. 6: ledger id is not the worker id; `worker` field reading | Contract (Persisted), D8, step 02 D3 |
| Add. 7: reviewer invocation/env/tools/schema/budget unchanged; captured argv comparison; boundary tests unchanged | 06-W3, D9, test 1 |
| Add. 8: synthetic integration mandatory; live acceptance evals need P2 or trusted preanswer with P37(c); unsupported → pending, never flag | Test 6, 06-E7, 06-H3, D15, D16 |
| Runner and composite built even without spend; digests instead of commit; labels gitignored | 06-E1 … 06-E3, Done when |
| Rollout assumes step 09 integrated | Prerequisites, Starting point |
| Measurement status separate; pending with limitation; no bar claimed | Done when, 06-E7 |
| Trigger-suite migration: convert plan positives, keep inputs and validity, synthetic assertions, no paid run | 06-T1 |
| (V7 reconciliation) `/ambicode:plan` launches the shipped route, not the step-03 slash-command adapter | 06-R11 |
