# Dispatch step 00 — harness

Copy the assignment below into a new implementation-agent session after filling metadata.
Then use [review-step.md](review-step.md) for an independent review.

```text
Implement step 00: gym/planing/new-architecture/migration-plan_v6/step-00-harness.md

Do not use the ambicode plugin. Work directly with repository files and tools.
Do not spawn additional agents from this assignment.

Dispatch metadata (dispatcher fills these before sending):
- Workspace: <absolute isolated worktree path>
- Primary checkout: /Users/KillBill/Documents/projects/mine/ai/ambicode
- Paid authorization: NONE; $0 additional model/eval/probe spend

Read CLAUDE.md and these repository-relative files:
- gym/planing/new-architecture/migration-plan_v6/00-README.md
- gym/planing/new-architecture/migration-plan_v6/01-contracts.md
- gym/planing/new-architecture/migration-plan_v6/02-scenarios.md
- the entire assigned step and all its listed design/code inputs
Read previous implementation/review reports before changing shared APIs.
All plan/migration-v6-reports paths resolve under PRIMARY, so reports are available to
the coordinator and subsequent agents. Create only your assigned report directory there;
do not overwrite another agent's report. Report pending prerequisites explicitly.

Verify the workspace contains the exact prerequisites. Do not assume another checkout's
uncommitted files exist here. Use the PRIMARY protocol in 00-README: ignored inputs stay
in primary; NDA generation/consumption commands execute there after code integration.
Worktree tests use synthetic inputs. Do not copy/link NDA inputs into the worktree.

Implement only the assigned step, extending the specified existing seams. Preserve
unrelated changes and the user's index. Report any architectural conflict with both source
references. Do not silently invent a fallback or weaken consent/ownership/assertions/budgets.
Continue independent model-free work when probes or measurements are pending.

Do not run claude -p, plugin eval, platform probes, live reviewers, LLM graders,
another baseline or the declined naked/without equivalence test. Preparing harness code
and synthetic tests is allowed. Paid items require a new explicit named authorization.
Do not commit, push, publish, deploy or install the candidate in the working host.

Prerequisites:
No earlier implementation step. Use the current integrated repository and updated migration plan.
Prior reports under plan/migration-v6-reports:
None
Attach plan/migration-v6-reports/decision-A.md for post-A steps.

Scope:
Reuse baseline and validity seams; build per-arm prompt transport, swap recovery, clean naked copies, neutral selection, dry run and trace/ledger scoring. Prepare P-S/P37/P47/P58 and 0-R probes; execute none without authorization.

Critical proofs (in addition to every proof in the step file):
Dry run never spawns or mutates; naked prompt bytes stay unchanged; interrupted swap and contaminated control cases refuse/recover; version/model/prompt mismatches refuse; infrastructure errors stay absent; external benchmark root resolves. Verify the localize-only gate regression.

Validation:
Reproduce behavior changes with meaningful synthetic fixtures/tests. Typecheck structural
edits in the end implementation; run affected tests, then npm run verify before hand-off.
Record commands, actual counts and exits. Measure built artifacts for caps/timings.
Do not claim pending platform probes passed or infer efficiency from unit tests.

Save the implementation report to:
plan/migration-v6-reports/step-00/implementation.md
Use 00-README's Required report and hand-off template. Include APIs/schema/error releases,
tests/scenarios, measurements, deviations, pending decisions and downstream limitations.
Do not put NDA values in the report or chat. Leave step output uncommitted.

Completion boundary:
Model-free harness implementation and independent review pass. Paid probes may remain pending; report their exact effect on step 03.
The dispatcher obtains independent review, resolves findings, integrates the exact patch
and verifies the integrated dependency set before dispatching the next step.
```
