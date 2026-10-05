# Step 10 — Experiments behind flags; backlog items only on their entry conditions

> Prerequisites: core acceptance complete ([04-release-acceptance](04-release-acceptance.md)); one
> named experiment, its entry evidence and its paid ceiling, all in the dispatch. Default spend: $0.
> Read [05-working-rules.md](05-working-rules.md) first; it governs this brief, the review and the report.
> Normative sources (read the sections, not the whole files): [01-contracts](01-contracts.md) §3, §5, §8;
> [v6/50](../v6/50-backlog.md) whole (the entry conditions are the gate for this step);
> [v6/41](../v6/41-migration.md) step 10; [v6/33](../v6/33-measurement.md) §4 (scout condition), §6
> (`onInvalid` experiment), §9; [v6/16](../v6/modules/16-checks-review.md) §7;
> [v6/17](../v6/modules/17-workers.md) §1 and appendix; [v6/40](../v6/40-open-problems.md) P21, P22, P36;
> [v6/30](../v6/30-harness.md) §3, §6, §7; [v6/12](../v6/modules/12-route.md) §3 step 4, §3.4.

## Goal

Everything here is an experiment behind a flag (default off) or a backlog item with an entry
condition. Nothing changes a default without a measurement and a user decision (R10, D10). One
dispatch carries exactly one experiment or one backlog presentation; each is its own hand-off.
Core release does not wait for any of it.

## Starting point

Recheck these at dispatch. Code planned by steps 03–09 is named as the V7 step briefs,
[01-contracts](01-contracts.md) and [00-README](00-README.md) name it; use the actual paths from
their reports.

- Reports that may meet an entry condition (under PRIMARY, `plan/migration-v6-reports/`): step 03
  (investigate overhead and recall, 33 §1–2, decision A), step 05 (impact run, 33 §3; index 5-I),
  step 06 (plan eval, decision 6-P, peak context per run), step 07 (task suite, decision 7-T),
  step 08 (live reviewer tier, decision 8-F), core acceptance (integrated revision, package inventory).
- From step 08 ([step-08](step-08-review.md) 08-V1 … 08-V3, 08-L1 … 08-L6, 08-P1): config flag
  `review.onInvalid: void | drop`, default `void`, with the `drop` branch in `validateFindings`
  (`src/review/validate.ts`, today 233 lines, returns `ok | invalid {reason, rejections}`; step 08
  adds `partial` under `drop`); the live-tier runner `evals/scripts/src/harness/live-review.mjs`
  (0-R branch ii) for 8 review cases × 3 runs × 2 arms with the live reviewer; review
  with-prompts (`REVIEW_COMMAND`); decision 8-F.
- From step 06 ([step-06](step-06-plan.md) 06-W1 … 06-W7, 06-E1 … 06-E3, D8, D10):
  `runWorkerProcess` in `src/workers/process-runner.ts` (allowlisted env, cwd, `--tools`,
  `--json-schema`, output cap, `maxBudgetUsd`, `maxTurns`, failure reasons); `worker run <id> --task
  <slug>` (`src/cli/commands/worker.ts` over `runWorker`/`loadWorkerDefinition` in
  `src/workers/worker-run.ts`; `argv` definitions from `<pluginRoot>/workers/<id>.yaml`; fixture
  model-free definition only; invalid artifact → `worker-output-invalid`, inline continuation;
  artifact ≤ 64 KiB); the `worker` kind already widened by 06 D8 (`outcome: 'ran' | 'inline' |
  'skipped'`, `artifact: string | null`, optional `summary`); the one-process plan-eval runner
  `evals/scripts/src/harness/plan-run.mjs`; `evals/scripts/src/analysis/plan-composite.mjs`, frozen
  with provenance; hand AC labels (NDA, PRIMARY). No `worker` gate exists; the `worker` step kind
  is schema-only.
- From step 03: `src/route/routes.ts` (build validation; `gate` only on `human` steps, "future
  workers deferred"), `routes/gates.yaml`, `src/route/engine.ts`, `src/route/consent.ts`,
  `src/route/context.ts` (`RouteContextPort.consent`), acting metadata `acting: [...]` on normalized
  gates, trusted-start preanswer conversion to `via: prompt` acceptance, the config v3 reader
  (`workers.approved`, `review.onInvalid`) in `src/contracts/config.ts`; `raiseGate` (03-G13);
  `src/route/handlers.ts`.
- From step 09: config v3 writer; the `init-apply` gate; `init --apply --set k=v…` honoured only with
  an `acceptance {gate: init-apply}` whose printed `Values:` line carries the exact accepted values
  (09-G4.4); default `workers.approved: []`. `SETTABLE_KEYS` (09-G3) does not include
  `workers.approved`.
- From step 02 ([step-02-evidence](step-02-evidence.md)): the `worker` kind `{worker, outcome, ms,
  artifact, costUsd?}` (definition id serialized as `worker`, D3), `parseEntry`, `withLedgerLock`,
  `appendLedger`; `skills/review/references/outcomes.md` holds every error code with its release.
- From step 00: probe conventions (named ceiling per probe, synthetic payload shapes only, an
  unavailable probe is not a pass); `--no-publish`; `eval-gate`; immutable naked prompt bytes.
- Today: `package-candidate.mjs` `DIRECTORY_ALLOWLIST` has `skills`, `prompts`, `policies`,
  `templates`, `scripts/chunks`; no `workers/` and no `agents/` directory exists. `hooks/hooks.json`
  registers no `PostToolUse(Edit|Write)` hook. Hook sources are in `src/hook/{guard,shell,events,session}/`
  (step 01 as built); this step does not touch them.

## Files

Budgets are source lines, tests excluded (05-working-rules §2.3). Only the rows of the dispatched
experiment are in scope; every other row is out of scope for that dispatch. As a guide, tests total
about 150 lines for E1, 600 for E2 and 120 for the P21 probe.

| Experiment | File | Action | Budget | Purpose |
|---|---|---|---|---|
| E1 | the step-08 live-tier runner (`evals/scripts/src/harness/live-review.mjs`, or the path from step 08's report) | change | +30 | `--on-invalid drop` writes `review: {onInvalid: drop}` into the plugin arm's scaffold config only |
| E1 | `evals/scripts/src/analysis/oninvalid-compare.mjs` | create | 90 | reads two live-tier result files, prints the 10-E4 table |
| E2 | `workers/scout.yaml` | create | 25 | the scout definition (10-S1) |
| E2 | `routes/experiments/scout.yaml` | create | 25 | the overlay: step `scout`, gate `worker-scout`, insertion point |
| E2 | `src/route/routes.ts` | change | +60 | `gate` on `worker` steps; the overlay merge when the flag is on |
| E2 | `src/route/engine.ts` | change | +50 | the `worker` position: gate print, answer handling, delivery |
| E2 | `src/route/consent.ts` | change | +50 | the `workers.approved` preanswer binding (D3) |
| E2 | `src/contracts/config.ts` (step 03's v3 schema) | change | +10 | optional `experiments.scout: boolean`, absent = false |
| E2 | `src/cli/commands/worker.ts` (step 06) | change | +30 | consent check before a model worker spends; `worker-not-approved` |
| E2 | `src/workers/worker-run.ts` (step 06) | change | +10 | optional `maxOutputBytes` on `WorkerDefinition` (scout: 8,192, 10-S2) |
| E2 | the step-06 plan-eval runner (`evals/scripts/src/harness/plan-run.mjs`, or the path from step 06's report) | change | +40 | third arm `route+scout` |
| E2 | `skills/review/references/outcomes.md` | change | — | `worker-not-approved` with its release |
| E3 | `evals/scripts/src/validation/probe-p21.mjs` | create | 90 | the P21 probe and its dry run |
| E3 | `evals/scripts/src/validation/fixtures/p21/` | create | 60 | throwaway plugin with one `agents/` subagent and a stub stdio MCP server |
| E3 build, E4 | — | — | — | files are named by a later authorizing dispatch (10-C4, 10-J2) |
| Backlog | none | — | — | presentation only (10-B) |

Unchanged in every experiment: every default value; `hooks/hooks.json`; `package-candidate.mjs`
(neither `workers/` nor `agents/` enters the candidate); `plan-composite.mjs` and its tests; the
naked prompt bytes; the frozen v6 directory; `src/hook/**`; the v6/41 protected paths
([04-release-acceptance](04-release-acceptance.md) §3).

## Contract

```ts
// E2 — normalized gate on the scout worker step (routes/experiments/scout.yaml)
// step: { id: 'scout', actor: 'worker', run: workers.run(scout), produces: [worker{scout}],
//         gate: { id: 'worker-scout', question: <17 appendix proposal text, verbatim>,
//                 options: ['run','inline','skip'], acting: ['run'],
//                 default: 'inline', release: 'inline' } }
// overlay: { insertBefore: 'design' }   // applied to the plan route only when experiments.scout === true

// E2 — config v3 additive field
interface ExperimentsConfig { scout?: boolean }        // absent or false → plan route unchanged

// E2 — worker ledger record (step 02 kind as widened by step 06 D8; no kinds.ts change here)
// { kind: 'worker', worker: 'scout', outcome: 'ran' | 'inline' | 'skipped', ms: number,
//   artifact: string | null, costUsd?: number, route: <route id> }
```

`workers/scout.yaml`: runner `process` (an `argv` definition run through `runWorkerProcess`, 06 D10); tools `Read, Grep, Glob` plus `$A map`, `$A refs`,
`$A find`, `$A relates`; output cap 8,192 bytes; `maxBudgetUsd: 0.5`; `maxTurns: 15`;
`outputSchema` = `{files: [{path, why}], symbols: [{name, path, line}], notes: string}`.

**CLI.** E1: `--on-invalid drop` on the step-08 live-tier runner. E3:
`node evals/scripts/src/validation/probe-p21.mjs --dry-run | --run --max-cost-usd 1`.

**New error code** (E2 only), documented in `outcomes.md`: `worker-not-approved` — release: "answer
*run* when the `worker-scout` question is printed, or start the route from your own prompt with
`--answer worker-scout=run`; a flag typed later never approves spend".

## Rules

**G — every experiment**
- 10-G1 A dispatch names exactly one item: E1, E2, E3, E4 or one backlog row. It records the entry
  evidence (report path, numbers, date) and, for any paid item, its own ceiling. Without a named
  ceiling the item runs at $0: design and fixture work only, and the measurement is reported as
  pending. Never infer authorization from a cost estimate or a passing probe.
- 10-G2 If the entry condition is not met by the attached evidence, build nothing and report
  `blocked (entry condition)` with the missing number.
- 10-G3 Every flag defaults off. With the flag absent or off, behaviour is byte-identical to the
  integrated core revision (step 08 plus core acceptance): same outputs, same ledger lines, same
  loaded route objects. A test proves it per flag.
- 10-G4 No default changes in this step, whatever the result. The result is presented; the user
  decides.
- 10-G5 Every experiment's result is a report with both arms' numbers and the loser's detail (R13),
  the provenance (model, Claude Code version, cases, runs), cost and turns. A version or model
  mismatch with the compared run is stated; such numbers are reported as not comparable and are not
  pooled.
- 10-G6 Measurement status is separate from implementation acceptance. If a paid proof is not
  authorized, report it as pending with its exact downstream limitation; do not claim the skill's
  bar is met. An unrun eval is measurement pending; finish independent model-free work.
- 10-G7 Model evals go through the harness with `--no-publish`, from PRIMARY after integration
  (00-README PRIMARY protocol). NDA values stay in gitignored locations; the report gives counts.

**E — E1 `review.onInvalid: drop`** (16 §7; 33 §6)
- 10-E1 Entry: step 08's live tier ran (its result file exists and is named in the dispatch).
- 10-E2 The flag is step 08's `review.onInvalid`; this experiment adds no new runtime flag. If
  step 08's `drop` branch is missing, stop and report PLAN; do not build it here.
- 10-E3 The runner writes `review: {onInvalid: drop}` into the plugin arm's scaffold config only.
  The naked arm's scaffold and prompt bytes are unchanged.
- 10-E4 Run the same 8 × 3 with `onInvalid: drop` on. Compare against step 08's recorded run on the
  same cases: `complete` share, location validity, accepted rate, plus the count of dropped findings
  per run. `oninvalid-compare.mjs` prints one table with both arms and per-case detail.
- 10-E5 Decision: presented; the default stays `void` unless the user changes it.

**S — E2 scout worker** (17 appendix)
- 10-S1 Entry: **only if** 33 §4's traces show the main session's context or cost is the
  bottleneck (step 6's decision 6-P said so **and** the user asked for it).
- 10-S2 Build `workers/scout.yaml` per the Contract (process runner, tools Read/Grep/Glob +
  `$A map/refs/find/relates`, ≤ 8 KB output, `maxBudgetUsd`). Output over 8,192 bytes or failing
  `outputSchema` → `worker-output-invalid` and inline continuation (17 Failure modes).
- 10-S3 `routes.ts` accepts `gate` on a `worker` step (v6/32 schema rules), with the same build
  checks as a human gate: non-acting `default` and `release`, `acting` metadata present. Build
  fails on an acting default, and on `gate` on a `code` or `model` step.
- 10-S4 The flag is `experiments.scout`. When true, the loader inserts the overlay's `scout` step
  before plan's `design` step. When absent or false, the loaded plan route is deep-equal to the
  integrated one (10-G3).
- 10-S5 At the `scout` position the engine prints the declared gate with the 17 appendix proposal
  text as its question (*run* / *inline* (default) / *skip*), and writes the `gate` print record.
- 10-S6 Answers:
  - honoured *run* (bound hook answer, or trusted-start preanswer, or D3's `workers.approved`
    binding) → the next delivery is the command `$A worker run scout --task <slug>`;
  - *inline* or *skip* (answered, defaulted, headless default, or an acting-needs-human decline) →
    the engine appends `worker {outcome: 'inline'|'skipped', ms: 0, artifact: null}` and delivers
    the next model step unchanged.
- 10-S7 Headless: inline, unless a trusted-start preanswer for *run* was recorded (01-contracts §5;
  S14 pattern). A model-typed `route next --answer worker-scout=run` records acting-needs-human
  decline on every channel and mode.
- 10-S8 `worker run scout` calls `context.consent(view, 'worker-scout')` before invoking the runner,
  also when run standalone. Not honoured → `worker-not-approved`; the runner is not called and no
  `worker` entry is written. Honoured → run, write the artifact `workers/scout-<ts>.json` and
  `worker {outcome: 'ran', ms, artifact, costUsd}`.
- 10-S9 After *ran*, the next model delivery appends one line naming the artifact path. Nothing
  else in the delivery changes.
- 10-S10 Measure as a third plan arm (+$16–23 per decision): arms naked / route / route+scout; the
  scout arm's prompt carries `--answer worker-scout=run` at a trusted start. The plugin arms stay
  conditional on P37(c) or verified harness transport, as in step 06. D3: nothing spends without a
  human on record.
- 10-S11 `workers/` stays out of the package candidate; 04-release-acceptance §4's "unshipped worker
  definitions absent" assertion stays green.

**C — E3 collector subagent and probe P21**
- 10-C1 Entry: **only if** P21 is probed true (a plugin subagent inherits the session's MCP
  servers) **and** 30 §3's peak measurement shows requirement text is the problem. P21 is run only
  for an explicitly authorized collector revival with requirement-context bottleneck evidence.
- 10-C2 Probe P21 first (≤ $1, needs go). The probe loads the throwaway fixture plugin, runs one
  session that calls its subagent, and records only whether the subagent's tool list contains the
  stub server's tools: `true | false | unavailable`. It saves synthetic payload shapes only.
  `--dry-run` spawns nothing and prints the planned command and ceiling.
- 10-C3 Failed or unrun P21 means no collector build. `unavailable` is not a pass.
- 10-C4 Build only on a true result and a user go. The build is a separate dispatch that names its
  files; it follows 10-W1 … 10-W3.

**J — E4 plan-judge**
- 10-J1 Entry: **only if** a calibrated judge exists (κ ≥ 0.6 on ≥ 60 labels). Not before.
- 10-J2 Below that, nothing is built. At or above it, present the calibration evidence; a build is a
  separate dispatch that names its files and follows 10-W1 … 10-W3.

**W — any revived model worker** (E2, and a later E3/E4 build)
- 10-W1 No appendix worker ships in core. Do not build a model worker without the gate, the
  `workers.approved` preanswer path and a human on record (D3).
- 10-W2 If model workers are revived, extend DSL gate support and explicit acting metadata with
  tests; worker config approval must be authored by the human and bound through a reviewed trusted
  path, never a model-edited config setting used as silent spend authority. R17 and consumer
  consent still apply.
- 10-W3 All experiment runs need separate ceilings; $0 default performs design/fixture work only.

**B — backlog items** (v6/50; reopened only when the entry condition is written down with its number)
- 10-B1 For each row, do exactly what the third column says:

| Item | Entry condition (verbatim from 50) | What this step does |
|---|---|---|
| LSP tool in `task` (passive diagnostics) | investigate passes 33 §1–2 **and** the task suite shows a gain or an inconclusive band the user accepts; then probe P36 | Nothing until both reports say so; then present the probe plan and cost to the user |
| Exact references by a language-service child | the colliding-name impact cases (33 §3) show the plugin arm losing with collision flags alone | Nothing until step 5's impact run says so; then present |
| `ExitPlanMode` as acceptance channel | a user asks for plan mode, or 33 §4's traces show `AskUserQuestion` acceptance is a bottleneck | Present |
| Recorder of model reads | a measurement needs the model's reads | Present |
| agentmap adapter | someone investigates the 65/179 gap | Nothing |
| `claude plugin list` for LSP advice | with the LSP item | Nothing |
| `PostToolUse(Edit\|Write)` reminder hook | a pack sets `remindOnEdit` | Present the named pack, hook re-registration and measured/per-edit estimate; the user approves reopening. Keep the path unregistered until that decision (G18: historical 89–143 ms) |
| `budget.codeCalls`, interactive `wallMinutes` | none — dropped | Nothing |

- 10-B2 "Present" means: write the entry condition's evidence (numbers, report, date), the
  measurement in 33 that would decide it, and the cost; the user approves the spend; only then the
  item returns to a new authorized design revision and implementation assignment.
- 10-B3 Do not edit frozen v6 or build a backlog item in this hand-off. An agent does not build a
  backlog item in this step. Do not build an LSP or language-service item under any name (D8)
  before its entry condition is met **and** the user approves.

## Decided readings

These choices are fixed by this brief. Do not reopen them; report a conflict as PLAN instead.

- D1 "Byte-identical to step 8's behaviour" (v6 Proofs) means the integrated core revision the
  dispatch names, because the prerequisite is core acceptance.
- D2 E1 runs only the `drop` arm and compares it with step 08's recorded `void` run ("Run the same
  8 × 3 with `onInvalid: drop` on"). A version or model mismatch follows 10-G5; rerunning the `void`
  arm needs its own named ceiling.
- D3 `workers.approved: [scout]` is honoured as a preanswer for *run* only when the current config
  value equals a value carried by an honoured `acceptance {gate: init-apply}` (exact accepted
  `--set` values, 01-contracts §7, step 09). That is the reviewed trusted path 10-W2 requires. A
  value with no such acceptance, or changed after it, is not honoured: the gate is printed as usual
  (interactive) or takes `inline` (headless), and the report says why. If the dispatch names a
  different reviewed path, that path replaces this one and nothing else changes.
- D4 17's "Headless: inline" is the headless default. A trusted-start preanswer is still honoured
  in headless (01-contracts §5, S14). The scout eval arm uses that preanswer, not `workers.approved`.
- D5 The flag for E2 is the additive config field `experiments.scout`. A model can set it, which only
  makes the gate appear; spend still needs honoured consent (10-S8).
- D6 The scout step sits immediately before plan's `design` step: the scout replaces the main
  session's own reading for design. Its artifact is named in the next delivery (10-S9).
- D7 The third arm is scored with the frozen `plan-composite.mjs` unchanged, applied pairwise
  (route+scout vs naked, route+scout vs route). Its digest is checked before the run.
- D8 `maxBudgetUsd: 0.5` and `maxTurns: 15` are the scout's defaults (17 appendix: "≈ $0.2–0.5").
  The dispatch ceiling bounds the whole arm.
- D9 Reports go to `plan/migration-v6-reports/step-10/<E1|E2|E3|E4|backlog-<item>>/implementation.md`
  under PRIMARY.

## Non-goals (a reviewer may not raise these)

- Any experiment other than the dispatched one; running two experiments in one hand-off.
- Changing any default, including `review.onInvalid`, `workers.approved` or the plan route.
- Building `drop` itself (step 08), the process runner or `worker run` (step 06), or a new runner.
- A collector or plan-judge build in this brief; P21 run without its entry evidence and go.
- Shipping `workers/scout.yaml` or any `agents/` definition in the package.
- Changing `plan-composite.mjs`, its thresholds, the hand labels or the naked prompt.
- Running the reminder hook, LSP, language-service, `ExitPlanMode`, reads recorder or agentmap work.
- Worker gates on routes other than plan; a generic experiment framework; more worker ids.
- Protection against a hostile local process editing config or ledgers (01-contracts §5).
- The tmpdir-fallback decision from step 01 and any hook change.

## Tests

Name each test after its rule. Inject runners, clocks, sessions and the context port. No test reads
anything under `gym/`. Step 10 owns no scenario in [02-scenarios](02-scenarios.md); E2's consent tests
follow the S14 pattern.

E1:
1. `validate`/review default: with `onInvalid` absent and `void`, artifacts and status are
   byte-identical to the integrated golden (10-G3, 10-E2).
2. Runner: `--on-invalid drop` changes only the plugin arm's scaffold config; naked prompt and
   scaffold bytes unchanged (10-E3).
3. `oninvalid-compare.mjs` on two synthetic result files: both arms, per-case rows, drop counts,
   mismatch line when versions differ (10-E4, 10-G5).

E2:
4. Build: `gate` on a `worker` step accepted; acting default refused; `gate` on a `code` step
   refused (10-S3).
5. Flag off: the loaded plan route deep-equals the integrated one, and a synthetic walk writes the
   same ledger lines (10-S4, 10-G3).
6. Flag on: the gate prints the 17 appendix proposal verbatim and writes the `gate` record (10-S5).
7. Answers: bound *run* → delivery names `worker run scout`; *inline*, *skip*, default → `worker`
   entry with `artifact: null` and an unchanged next delivery (10-S6).
8. Headless without preanswer → inline, runner calls = 0; model `--answer worker-scout=run` →
   acting-needs-human decline; trusted preanswer → honoured (10-S7).
9. `worker run scout` standalone without consent → `worker-not-approved`, runner calls = 0, no entry;
   with consent → artifact and `worker {outcome: 'ran'}` (10-S8).
10. D3: `workers.approved` with no `init-apply` acceptance → not honoured; with a matching synthetic
    acceptance → honoured; value changed after it → not honoured (10-W2).
11. Output of 8,193 bytes or schema-invalid → `worker-output-invalid`, inline (10-S2).
12. After *ran*, the next delivery differs only by the artifact line (10-S9).
13. Plan-eval runner dry run lists three arms, the scout arm's prompt carries the preanswer, and the
    `plan-composite.mjs` digest equals the frozen one (10-S10, D7).
14. Package: the candidate contains no `workers/` file (10-S11). The F3 outcomes test passes with
    `worker-not-approved` documented.

E3:
15. `probe-p21 --dry-run` spawns nothing and prints the command and ceiling; the result parser maps
    synthetic payloads to `true`, `false`, `unavailable` (10-C2, 10-C3).

## Done when

- [ ] The dispatch's item, entry evidence and ceiling are quoted in the report (10-G1), or the report
      says `blocked (entry condition)` with the missing number (10-G2).
- [ ] Every rule id of the dispatched group appears in at least one test name, and all pass.
- [ ] `npm run verify` is green; harness tests (`node --test 'evals/scripts/src/**/*.test.mjs'`) are
      green when an eval script changed; the report states the counts.
- [ ] Files changed ⊆ the dispatched rows of the Files table, plus mechanical changes listed in the
      report; budgets are reported with actual line counts.
- [ ] `git diff` of `hooks/hooks.json`, `package-candidate.mjs`, `plan-composite.mjs`, the naked prompt
      files and the v6 directory is empty; no default value changed.
- [ ] The measurement ran with both arms and the loser's detail, or is reported pending with its
      limitation (10-G5, 10-G6).
- [ ] The report follows 05-working-rules §4 and states spend against the named ceiling.

## Hand-off to the user

- The named experiment ran with its flag, its numbers are presented, and no default changed.
- Each result goes to the user as a decision with numbers and options; no agent changes a default,
  ships a worker or reopens a backlog item on its own.
- A collector or plan-judge build, and any presented backlog item, needs a new authorized design
  revision and a new dispatch. This brief is not that authorization.

## Coverage of the v6 brief

| v6 step-10 requirement | Here |
|---|---|
| Prerequisites: core acceptance, one named experiment, entry evidence, paid ceiling; every paid item named | Header, 10-G1, 10-G2 |
| Unrun eval is measurement pending; finish model-free work | 10-G6 |
| Nothing changes a default without measurement and user decision (R10, D10) | Goal, 10-G4 |
| Read-first sources and the step 3/5/6/7/8 reports | Header, Starting point |
| Each experiment behind a flag, default off, own hand-off | Goal, 10-G1, 10-G3 |
| E1: entry, same 8 × 3 with `drop`, compare complete/location validity/accepted rate; default stays `void` | 10-E1 … 10-E5, D2 |
| E2: entry (33 §4 traces, 6-P **and** user ask) | 10-S1 |
| E2: `workers/scout.yaml` with process runner, tools, ≤ 8 KB, `maxBudgetUsd` | 10-S2, Contract, D8 |
| E2: declared gate run/inline/skip, `workers.approved` preanswer, headless inline, proposal text | 10-S3, 10-S5 … 10-S8, D3, D4 |
| E2: third plan arm, +$16–23 per decision; D3 human on record | 10-S10, D7 |
| E3: entry (P21 true **and** 30 §3 peak); probe ≤ $1 with go; build only on true and go | 10-C1 … 10-C4 |
| E4: only with κ ≥ 0.6 on ≥ 60 labels | 10-J1, 10-J2 |
| Backlog table, verbatim entry conditions and actions | 10-B1 |
| Meaning of "Present"; return via new authorized design revision | 10-B2 |
| Do not edit frozen v6 or build a backlog item | 10-B3, Non-goals |
| Proof: every flag default off, byte-identical default test | 10-G3, D1, tests 1, 5 |
| Proof: report with both arms and the loser's detail (R13) | 10-G5, Done when |
| Do not change any default | 10-G4, Done when |
| No LSP/language-service item before entry and approval (D8) | 10-B3 |
| No model worker without gate, `workers.approved` path and human on record (D3) | 10-W1 |
| Acceptance: experiment ran with its flag, numbers presented, no default changed | Hand-off |
| No appendix worker ships in core | 10-W1, 10-S11 |
| P21 only for authorized collector revival with evidence; failed/unrun P21 → no build | 10-C1, 10-C3 |
| Revived workers: DSL gate support, acting metadata, human-authored approval via reviewed trusted path; R17 and consumer consent | 10-W2, 10-S3, 10-S8, D3 |
| Separate ceilings; $0 default is design/fixture work only | 10-G1, 10-W3 |
| Core release does not wait for an optional experiment | Goal |
| Measurement status separate; pending with limitation; no claim the bar is met | 10-G6 |
