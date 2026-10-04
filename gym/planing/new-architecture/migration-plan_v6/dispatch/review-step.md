# Independent review assignment — one completed step

Use a separate agent after every implementation, then again for substantive fixes.

```text
Resolve all plan/migration-v6-reports paths under the primary checkout:
/Users/KillBill/Documents/projects/mine/ai/ambicode. Preserve other reports.

Independently review step <NN> of migration-plan_v6.
Workspace: <absolute path containing the implementation>
Comparison baseline: <exact revision/patch boundary before this step>
Implementation report: plan/migration-v6-reports/step-<NN>/implementation.md
Output: plan/migration-v6-reports/step-<NN>/review.md

Do not use the ambicode plugin. Do not spawn additional agents.
Do not edit implementation files, stage, commit or run paid/model calls.
Read CLAUDE.md, shared contracts/scenario matrix, the whole assigned step, relevant v6
sources, actual diff and implementation report. Do not rely on the report as proof.

Check every deliverable and proof, assigned ownership/API seams, meaningful regression
tests, preserved defaults, error releases and report accuracy. Check relevant session,
consent, object/instance, concurrency, crash, completion and tail invariants.
Inspect forbidden/protected changes and NDA leakage. Verify measured output comes from
built/shipped artifacts. Run relevant model-free tests to substantiate findings.

Give each finding severity, file/line, concrete triggering case and required correction.
Separate defects from pending platform probes/paid measurements. Name exact missing
prerequisites for the next step. Do not approve cost/context/speed claims without measurements.
Save a report with verdict, findings, commands/results and verification limits.
```
