# AMBICODE migration plan — architecture v6

Prepared: 2026-10-04. **Implementation hand-off; not an implementation or an authorization to spend.**
Repository inspected at `ae45901782c1a953b1f182b579c2ada72d6a8836` after the eval update.
The user's later authorization of the 2026-10-04 baseline supersedes v6's historical baseline
choice for this hand-off; all route/consent/ownership architecture contracts remain unchanged.
Normative design: [v6](../v6/00-README.md), including its in-place post-review edits.
This directory replaces [the v5 migration hand-off](../migration-plan/00-README.md);
do not combine instructions from the two plans.

The eval scripts now use [purpose folders](../../../../evals/scripts/README.md).
Flat script paths elsewhere in this hand-off refer to the same filenames in
that layout; input digests retain the paths from the inspected revision.
Run all harness tests with `node --test 'evals/scripts/src/**/*.test.mjs'`.

## Requested outcome and sources

Migrate the v0.4.0 plugin to v6's user-invoked routes, ledger-derived evidence, bounded
revisions, staged policy, two-pass search and draft-first planning. Preserve the existing
review pipeline's isolation, validation and human publication. Implement R17 (origin,
instance and object bound consent) and R18 (completion by the step's own record).
Smaller fixed payloads, faster work and lower model cost are hypotheses until measured.

Read this file, [01-contracts.md](01-contracts.md), [02-scenarios.md](02-scenarios.md)
and your step file before starting. Each step also lists its design and code inputs.
The architecture overrides this hand-off. A discrepancy must be reported with the two
references; do not silently redesign a contract. The old plan is historical evidence only.
[03-review-resolution.md](03-review-resolution.md) tracks all findings #116–#131 and v6 changes.

Navigation: targeted-search fallback — repository files, exported symbols and tests were read
directly. No AMBICODE plugin command, reviewer, probe, eval or project test was run to write this plan.

## Step files and dispatch order

Copyable agent assignments for every step, decision A, independent review and core acceptance
are in [dispatch/00-README.md](dispatch/00-README.md). Fill dispatch metadata before sending;
the packet grants no paid authorization.

| Order | Assignment | Primary hand-off |
|---|---|---|
| 1 | [00 — Harness](step-00-harness.md) | Reuse new baseline/validity; add prompt transport, dry run, scoring and launch probes |
| 2 | [01 — Guard](step-01-guard.md) | Structural parser and route-aware decisions |
| 3 | [02 — Evidence](step-02-evidence.md) | Schemas, ids, notes, exact promotion predicate and report |
| 4 | [03 — Engine and investigate](step-03-route-engine-investigate.md) | Shared runtime contracts, first route and decision A |
| 5 | [04 — Requirements](step-04-requirements.md) | Complete intake, coverage, expansion and ACs |
| 6 | [05 — Search](step-05-search.md) | Collision census, optional index and scaffold builder |
| 7 | [09 — Init and rules](step-09-init-rules.md) | First-install bootstrap, accepted config migration and packs |
| 8 | [06 — Plan](step-06-plan.md) | Durable drafts, checker, bound acceptance and plan experiment |
| 9 | [07 — Task](step-07-task.md) | Red/green proof, format, review offer and task suite |
| 10 | [08 — Review](step-08-review.md) | Live review route, coverage, metrics and review prompts |
| 11 | [Core acceptance](04-release-acceptance.md) | Integrated contracts, package and measured claim status |
| Optional | [10 — Experiments](step-10-experiments.md) | One separately authorized experiment per assignment |

Dispatcher message template:

```text
Implement step <NN> from gym/planing/new-architecture/migration-plan_v6.
Read 00-README, 01-contracts, 02-scenarios and the whole assigned step.
Base revision: <commit>. Workspace: <isolated path>.
Primary checkout (ignored inputs): <absolute path>.
Prerequisites delivered as: <authorized commit | explicit patch paths>.
Plan revision: <commit containing migration-plan_v6 | explicit plan patch path>.
Prerequisite reports: <paths>. Integration owner: <name>.
Paid runs: none unless explicitly listed here with individual ceilings.
Leave changes uncommitted. Return the prescribed implementation/measurement report.
Do not implement other steps or change the normative architecture.
```

## Confirmed starting state

The current repository differs from the old plan's HEAD. Recheck these facts at dispatch;
do not copy old line numbers or assume that an old failure still exists.

| Boundary | Confirmed code seam | Consequence |
|---|---|---|
| CLI | `src/cli/main.ts`: `SPECS`, `main`, `dispatch`; `src/cli/args.ts`: `OptionSpec` | Extend the existing parser and dispatch; no second option parser |
| Evidence | `src/task/ledger.ts`: `appendLedger/readLedger`, legacy `L<n>` ids | Extend this ledger, preserve legacy readers |
| Runtime | `src/composition/root.ts`: `Runtime/openRepository/openWorkspace` | Inject filesystem, runner, clock, ids and environment; init uses repository-only bootstrap |
| Config | `src/contracts/config.ts`: strict schema version 1, `requirements.lsp` | Introduce the runtime-compatible v3 schema before the engine depends on new fields |
| Harness | `evals/scripts/src/evals-bench.mjs`: `withBaseline/runArgs/harvestTraces/infrastructureError`; `naked-arm.mjs`, `run-validity.mjs` | Reuse implemented empty-control builder, automatic arm selection and validity classification; add per-arm transport/scoring |
| Reuse helpers | Four `evals/scripts/src/reuse-{cases,score}{,.test}.mjs` files are already tracked | Validate them; do not restore `stash@{0}` blindly |
| Stashes | `stash@{0}` is now `On eval: GYM-CACHE` | Historical stash ordinal is invalid; never pop, drop or apply the whole stash |
| Packaging | `package-candidate.mjs`: `DIRECTORY_ALLOWLIST` lacks `routes/` | Add route YAML and Markdown to the candidate, validate the packaged files |
| Hook/guard | `src/hook/guard-core.ts`, `run-hook.ts`, `markers.ts`, `hooks/hooks.json` | Replace classification; use existing state location and event dispatch |
| Review/checks | `src/review/bundle.ts`, `claude-reviewer.ts`, `src/checks/{run,select,authorize,adapters}.ts` | Extend the existing pipeline, authorization and process seams |

No implementation correctness or latency is inferred from these reads.
Use [input-sha256.txt](input-sha256.txt) to identify the v6 inputs used for this hand-off.
Recheck document links, scenario/finding coverage and source digests with
`node gym/planing/new-architecture/migration-plan_v6/validate-plan.mjs`.
This validates the hand-off document; it runs no plugin tests or model calls.

## Dispatch defaults and execution boundaries

Unless the user supplied a different instruction, work in an isolated local branch/worktree,
leave changes uncommitted, spend **$0**, and do not publish, deploy or change defaults based on
an unrun measurement. These defaults allow all model-free work to proceed without a question.
A dispatcher may authorize a named paid run with its ceiling and provide commit permission.
An omitted paid authorization means skip that run and report it, not stop all unit-testable work.

**Ignored inputs stay in the primary checkout.** The dispatcher supplies
`PRIMARY=<absolute path of the primary checkout>`. A new worktree has no ignored
`benchmarks/`, core cases/results, investigation archive or `.tmp/naked`, and no uncommitted
files, including this plan. Read those inputs only via `$PRIMARY/…`; never copy or link
ignored inputs into a worktree. Harness commands use `--benchmarks "$PRIMARY/benchmarks"`
(step 00 adds the same flag to `naked-arm.mjs`); the baseline uses its absolute primary path.
Generated NDA cases, control copies, traces and results stay in the primary's existing ignored
locations. Commands that generate or consume those artefacts, including paid runs, execute
from the primary only after the dispatcher integrates the step's code there. Synthetic tests
run in the worktree. Existing control-builder symlinks are confined to the primary checkout.

Prerequisites reach a later worktree as an authorized commit or an explicitly named patch,
including the plan if it is uncommitted. The dispatcher checks patch application and supplies
the resulting revision and reports. “Leave uncommitted” applies to the assigned step's output;
it does not promise that uncommitted prerequisites appear automatically in another checkout.

For each dispatch record: step id; base commit and prerequisite delivery; workspace;
prerequisite report paths; authorized paid items and ceilings (default none); integration owner.
Never infer authorization from a cost estimate or from a passing probe. A model call includes
`claude -p`, `claude plugin eval`, a live reviewer and an LLM grader, even with a zero cost flag.
During implementation these platform calls are permitted only by the dispatch authorization;
writing this plan uses none of them.

The implementing agent must:

1. Read `CLAUDE.md`, the shared contracts and its whole step file; inspect existing symbols/tests.
2. Reproduce changed behavior with synthetic failing fixtures; retain unrelated changes.
3. Implement only its assigned files and contract. Runtime failures that disprove an assumption
   are reported; routine naming/format choices follow the existing repository conventions.
4. Typecheck structural edits, run affected tests, then `npm run verify` before handing off.
   New behavior and its tests land together. Never weaken assertions or inflate budgets to pass.
5. Record what was built, what was tested and what was measured separately. A skipped eval is
   `implementation ready; measurement pending`, never `criterion met`.
6. Pass its exact APIs, schema fields, failure codes, fixtures and unresolved prerequisites to
   the next agent in the report. Integration must run on the actual merged dependency set.

Keep NDA values under the existing gitignored locations. Never put ticket text, case names,
benchmark paths, hidden tests or credentials in committed files or chat. Synthetic fixtures
may reproduce shapes. Model evals go through the harness with `--no-publish`; no direct run
against the NDA suite. Reuse the user-authorized 2026-10-04 working baseline; do not generate
another or run the declined paid naked/without equivalence test. Archived eval stays unchanged.

## Dependency graph and ownership

Step numbering follows v6/41; execution order accounts for shared-file dependencies.

```text
00 harness → 01 guard → 02 evidence → 03 engine + investigate → decision A
                                                                |
                       +----------------------------------------+
                       |                                        |
                  04 requirements → 05 search → 09 init + rules
                                           \          /
                                            → 06 plan → 07 task → 08 review
                                                                      |
                                                               release acceptance
                                                                      |
                                                         10 optional experiments
```

**Default dispatch is serial: 00, 01, 02, 03, A, 04, 05, 09, 06, 07, 08.**
Moving 09 before 06 supplies the first-install path and finalized format/config behavior
before plan/task end-to-end validation. This is scheduling, not an architectural change.
Do not dispatch steps 04–09 until A has an explicit proceed decision. If A fails, finish
independent evidence work and present v6/41 step 3's options: proceed, cut down, or abandon
the engine with steps 4–5 on v0.4.0's slash and MCP hooks. A chosen fallback receives its own
step file and scope before dispatch; it is not implemented implicitly.

Parallel work is optional, and requires explicitly separated assignments and an integration
owner. Even independent modules share `main.ts`, config, error documentation and the gate tests.
A dispatcher may split step 04 and step 05 module work after 03; their integration and step 09
remain serial. This plan does not require parallel agents or silently delegate tasks.

| Contract/file group | First owner | Later owner/action |
|---|---|---|
| Per-arm prompts, dry run, baseline/validity reuse, trace/ledger scoring | 00 | 08 creates review with-prompts; 07 creates task suite prompts |
| Structural guard, import-free ownerOf predicate and fs reader | 01 | 03 reuses ownerOf in assertOwner; guard retains fs reader; 06 exercises real plan writes |
| src/route/context.ts typed exports | 02, types only | 03 takes ownership and implements the ledger-backed port |
| 21-kind schemas, session ids, promotion predicate, report | 02 | 03 supplies fold/consent ports; 06 binds real plan route |
| Shared chain/window/consent/ownership APIs, engine, registry, command tail | 03 | All later agents consume; no duplicate predicates |
| Config v3 reader/defaults; minimal ecosystem table | 03 | 04 adds named acceptance-field interpretation; 09 migrates/writes and extends detection |
| Requirements intake, template, normalize, first AC splitter | 03 | 04 extends same symbols, completes coverage and stable-id tests |
| Two-pass map, harvest, first refs/find | 03 | 05 extends same symbols, adds relates/index/global collisions |
| Policy resolver projection | 03 | 07 adds remaining stages; 09 adds draft authoring |
| Shared base-commit scaffold builder | 05 | 07 uses it for task cases; no independent builder |
| Model-free plan checker, process runner, worker CLI | 06 | 08 preserves reviewer behavior through runner |
| Checks/format, baseline-scoped review, estimate seam | 07 | 08 completes review estimate/history and route |
| Live review runner and review with-prompts | 08 | 10 uses same runner only for authorized experiments |

## Fixed implementation layout

Keep existing module directories and ports. New route files go in `src/route/`:
`engine.ts`, `fold.ts`, `routes.ts`, `gates.ts`, `flags.ts`, `consent.ts`,
`ownership.ts`, `context.ts`, `command-tail.ts`. Evidence stays in `src/task/`:
`kinds.ts`, `notes.ts`, `report.ts`, `navigation-line.ts`, `task-dir.ts`.
Search stays in `src/code-intelligence/`, optional adapters in `index/`.
Requirements stay in `src/requirements/`; policy stays in `src/policy/`.
Ecosystem facts belong to `src/config/ecosystems.ts`; worker runner/checker to `src/workers/`.
One existing CLI command module per surface, and `SPECS/USAGE` updated in the same step.
Use `AmbicodeError{code}`, injected `Runtime`, existing YAML document APIs, zod and node:test.

File splitting inside an assigned module is routine; creating parallel engines, evidence
stores, parsers, runners or authorization logic is outside the assignment. The shared interfaces
in 01-contracts are the boundary. Code line numbers are intentionally omitted because prior
steps move them; find the named existing symbols before editing.

## Decisions and probes

| Id | Owner | Fixed rule / pending evidence |
|---|---|---|
| 0-V | user; check in 00 before measurement | No old-version bypass. Pinning 2.1.289 or authorizing another baseline is pending; neither is authorized by this plan. Recheck version at dispatch and before A; a mismatch blocks measurement A until a new user instruction, while model-free work continues |
| P37(a,b,c), P58 | 00 | Probe all launch surfaces and sandbox token transport; unsupported surface remains conditional |
| P47 | 00/01 | Task input rewrite optional; if 0-S selects updatedInput session transport, P47 is a hard prerequisite of 03 |
| P-S, 0-S | 00 probe; 03 adapter; user chooses | Prove session transport to model Bash children: environment binding, PreToolUse updatedInput, or discoverable hook-written association. Record isolation and ambiguity handling. Until 0-S, use injected sessions only; routed CLI calls fail session-unbound, paid walk/decide waits |
| 0-R | 00/08 | Credential transport vs outside-sandbox live runner; report evidence, user chooses paid execution |
| P2/P48 | 03 | Acting hook answers require bindable question+option+instance; no acting flag fallback |
| A | 03 | Proposed population: 10 localize cases (v6/33 §1 names the whole decide run); user confirms before paid decide. Recall within recomputed band, cost ≤ 1.15x; turns reported; user decides continuation and any platform fallback |
| 5-I | 05/09 | Offline index improvement ≥ 0.05 on either side; default remains none until user decision |
| 6-P | 06 | Predeclared plan composite over 3 epics × 3 runs × 2 arms |
| P17 | 07 | Stop schema support; bounded reason/file fallback remains available |
| 7-T | 07 | Gain ≥ 20 pp at cost ≤ 1.2x; smaller effect inconclusive, not failure-proof |
| 8-F | 08 | Review safety thresholds; finder claim decided separately against naked at ≤ 1.5x |
| P21 | 10 only | Collector appendix entry condition and authorization first |

Working baseline: evals/evals-core/results/eval-2026-10-04T19-44-56-791Z.json, naked arm with,
18 cases/54 runs, model claude-sonnet-5-5, version 2.1.289. Naked/true-without equivalence was
not tested; the user declined that paid comparison. Every measurement report names this assumption.
Compute the noise band from the actual compared runs, not the historical 0.101 constant.

Decision record: user, 2026-10-04, in the supplied conversation that produced the baseline:
«archived оставь там же обнови baseline» and «нет» to the paid naked-vs-without comparison.
This authorizes the existing `eval-2026-10-04T19-44-56-791Z.json` reference, superseding D19
for this hand-off. It authorizes no further baseline or equivalence run. The same source is
recorded in [the independent review](../review-migration-plan-v6.md), verdict and #152.

An unavailable probe is not a pass. Unknown P2 permits non-acting CLI answers only;
unknown P37/P58 prevents acting sandbox evals. Unknown P47 disables input rewrite.
Measure current platform behavior; do not hard-code the previously installed Claude version.

## Compatibility, rollout and rollback

Load legacy v1/v2 configs with notices; write schemaVersion 3 only through accepted init.
Read legacy `L<n>` note/review ledgers as no route; new route chains start beside them.
Keep review artifacts compatible. Deprecate `prepare` for one release through the existing CLI
seam; remove after that release only when scheduled. Retain old plan saves temporarily through
step 02; step 06 removes `note save --kind plan` when the new plan route is integrated.
No LSP, exact-reference child, RAG, automatic publication or appendix worker ships in the core.

Keep each integrated step independently reviewable with its report. Rollback is a user decision:
restore code/config from an identified pre-migration revision in an isolated checkout, retain
drafts/ledgers/review evidence, and report compatibility notices. No script deletes evidence,
changes the user's index or automatically abandons the engine after a failed criterion.

Final core acceptance: [04-release-acceptance.md](04-release-acceptance.md).
Step 10 is optional and does not block a core release.

## Required report and hand-off

```text
# step-NN report — <date>
Implementation: ready | partial | blocked (<contract>)
Verification: affected commands + exit codes; npm run verify result and actual count
Measurements: performed | pending authorization | blocked by probe (<id>)
Inputs: base commit; v6 manifest; prerequisite reports
Contracts delivered: exported APIs; persisted schema; new codes and releases
Scenarios: ids passed/failed/not run; fixture paths; injected crash points
Measured values: command + numbers for both sides; limits; loser detail
Interpretations/deviations: source section + chosen reading + evidence (or none)
Decisions: taken / pending, options + measured cost + recommendation
Not done: item + why + downstream effect
Spend: actual amount + specific authorization (or $0)
Files: touched paths; protected-file diff; package evidence when applicable
Next: eligible step(s), precise prerequisites still missing
```
