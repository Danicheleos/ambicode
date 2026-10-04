# Dispatch step 05 — search

Copy the assignment below into a new implementation-agent session after filling metadata.
Then use [review-step.md](review-step.md) for an independent review.

```text
Implement step 05: gym/planing/new-architecture/migration-plan_v6/step-05-search.md

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

Implementation standards:
- Extend the existing authoritative mechanism. Avoid introducing a second
  parser, engine, state store, or competing implementation.
- Replace superseded code where the current phase permits it. Remove dead
  branches, redundant helpers, repeated scans, and obsolete comments.
- Consolidate duplicated validation and transformations around canonical data.
- Split large files when responsibilities have clear boundaries. Keep modules
  cohesive, dependencies explicit, and entry points understandable. Moving
  code without reducing coupling or duplication is insufficient.
- Preserve public behavior, required compatibility, safety checks, and failure
  semantics during refactoring.
- Avoid unnecessary abstractions, dependencies, wrappers, and unrelated cleanup.
- Assess performance on affected paths. Use comparable model-free measurements
  when changing execution cost or making performance claims.
- Add meaningful regression coverage for demonstrated defects. Do not weaken
  assertions, delete valid negative cases, or increase budgets merely to pass.
- Examine the complete resulting diff before declaring completion.

Implement only the assigned step, extending the specified existing seams. Preserve
unrelated changes and the user's index. Report any architectural conflict with both source
references. Do not silently invent a fallback or weaken consent/ownership/assertions/budgets.
Continue independent model-free work when probes or measurements are pending.

Do not run claude -p, plugin eval, platform probes, live reviewers, LLM graders,
another baseline or the declined naked/without equivalence test. Preparing harness code
and synthetic tests is allowed. Paid items require a new explicit named authorization.
Do not commit, push, publish, deploy or install the candidate in the working host.

Prerequisites:
Step 04 integrated and reviewed; decision A is proceed.
Prior reports under plan/migration-v6-reports:
step-00/implementation.md and review.md, step-01/implementation.md and review.md, step-02/implementation.md and review.md, step-03/implementation.md and review.md, step-04/implementation.md and review.md
Attach plan/migration-v6-reports/decision-A.md for post-A steps.

Scope:
Extend shared map/harvest/refs/find; add project-wide collision census, relates, optional codeindex adapter and one shared base-commit scaffold builder. Use PRIMARY paths for offline NDA inputs and generation.

Critical proofs (in addition to every proof in the step file):
Two-pass results, ambiguous names/import verification, unknown ecosystem fallback, no-index path and external-root resolution. Run offline recall only when local inputs exist after integration in primary. Prepare impact/reuse cases without paid execution.

Validation:
Reproduce behavior changes with meaningful synthetic fixtures/tests. Typecheck structural
edits in the end implementation; run affected tests, then npm run verify before hand-off.
Record commands, actual counts and exits. Measure built artifacts for caps/timings.
Do not claim pending platform probes passed or infer efficiency from unit tests.

Save the implementation report to:
plan/migration-v6-reports/step-05/implementation.md
Use 00-README's Required report and hand-off template. Include APIs/schema/error releases,
tests/scenarios, measurements, deviations, pending decisions and downstream limitations.
Do not put NDA values in the report or chat. Leave step output uncommitted.

Completion boundary:
Report 5-I evidence or pending status. Index default stays none until the user chooses; step 09 must not infer approval from an improvement.
The dispatcher obtains independent review, resolves findings, integrates the exact patch
and verifies the integrated dependency set before dispatching the next step.
```
