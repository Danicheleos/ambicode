# Dispatch core acceptance — integrated candidate

```text
Resolve all plan/migration-v6-reports paths under the primary checkout:
/Users/KillBill/Documents/projects/mine/ai/ambicode. Preserve other reports.

Perform migration-plan_v6/04-release-acceptance.md in full after step 08 integration.
Do not use the ambicode plugin or spawn additional agents.
Workspace: <integrated checkout>
Primary: /Users/KillBill/Documents/projects/mine/ai/ambicode
Base/protected-file reference: <exact pre-migration revision>
Paid authorization: NONE.
Report: plan/migration-v6-reports/core-acceptance.md

Read CLAUDE.md, shared contracts/scenarios, all step reports/reviews, decision-A.md,
and the full acceptance file. Identify exact integration revisions; ensure no temporary
fake authority/session implementation remains. Record outstanding platform limitations.

Run integrated affected tests and npm run verify. Run S1–S14 against actual shipped
route YAML with synthetic fixtures, plus full registry/default/release/revision checks.
Audit CLI completeness, legacy compatibility, first-install and consent/crash recovery.
Compare protected paths byte-for-byte against the pre-migration reference.

Run npm run package:candidate and npm run package:reproducible. Inspect dist inventory
and validate packaged routes/gates/texts, standalone guard and CLI. Assert NDA/design,
obsolete references and unshipped workers are excluded. Smoke packaged CLI on throwaway
fixtures as specified in the acceptance file; no live model calls.

Report implementation and measurements separately for investigate/plan/task/review.
Pending paid proofs do not establish faster/cheaper/lower-context claims. Name failures,
inconclusive evidence and limitations. Do not publish, install in the working host or commit.
Save the full acceptance evidence and actual command outputs/results to the report.
```
