# Dispatch step 10 — one explicitly selected optional experiment

Do not dispatch this automatically. It requires core acceptance and one selected experiment.

```text
Resolve all plan/migration-v6-reports paths under the primary checkout:
/Users/KillBill/Documents/projects/mine/ai/ambicode. Preserve other reports.

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

Implement only the explicitly selected experiment from migration-plan_v6/step-10-experiments.md.
Do not use the ambicode plugin or spawn additional agents.
Read CLAUDE.md, shared contracts, the whole step, v6/50-backlog and cited entry conditions.

Workspace: <absolute isolated path>
Base revision/prerequisites: <integrated core revision and reports>
Primary: /Users/KillBill/Documents/projects/mine/ai/ambicode
Selected item: <E1 | E2 | E3 | E4; exactly one>
Entry-condition evidence and user request: <report/date/numbers and explicit instruction>
Paid authorization: <NONE | explicitly authorized named runs with total ceilings>
Output: plan/migration-v6-reports/step-10-<item>/implementation.md

Verify the item's precise entry conditions before building it. Missing entry evidence
means report ineligible; do not substitute another item. With no paid authorization,
perform only eligible design/fixture work and report experiment measurement pending.

Preserve all defaults. Add the item behind its prescribed flag and consent path.
Test default behavior against integrated core, then affected tests and npm run verify.
Run only named authorized measurements in integrated primary and report both arms,
loser detail, real cost and limitations. Present any default-change proposal to the user.
Do not revive other backlog items, edit frozen v6, commit, publish or install.
Use 00-README's implementation report template. Independent review uses review-step.md.
```
