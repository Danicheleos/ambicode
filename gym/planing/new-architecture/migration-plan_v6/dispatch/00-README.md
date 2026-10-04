# Agent dispatch packet — migration v6

These are copyable assignments, not authorization to run paid checks or start agents.
Read [the migration overview](../00-README.md) first. Each assignment still requires its
full step file; this packet does not replace the normative plan.

Before sending a prompt, fill every angle-bracket metadata field. Deliver its exact
prerequisite code and plan revision as authorized commits or named patches. Use separate
worktrees for implementation; keep ignored inputs in PRIMARY. Paid/NDA commands run in
primary only after integration. Reports use `plan/migration-v6-reports/` and contain no NDA
values; the coordinator supplies them to each next agent. Reports are local artifacts,
not automatically committed. A named paid budget covers additional probes/evals/reviewers,
not the ordinary cost of the implementation agent's own session.

| Order | Assignment | Required prior boundary |
|---|---|---|
| 1 | [Step 00](step-00.md) | Current repository and plan |
| 2 | [Step 01](step-01.md) | 00 reviewed and integrated |
| 3 | [Step 02](step-02.md) | 01 reviewed and integrated |
| 4 | [Step 03](step-03.md) | 02 reviewed and integrated; 0-S or explicit pending status |
| 5 | [Decision A](decision-A.md) | 03 reviewed and integrated; named authorization for measurements |
| 6 | [Step 04](step-04.md) | Explicit user continuation at A |
| 7 | [Step 05](step-05.md) | 04 reviewed and integrated |
| 8 | [Step 09](step-09.md) | 05 reviewed and integrated; 5-I pending means none |
| 9 | [Step 06](step-06.md) | 09 reviewed and integrated |
| 10 | [Step 07](step-07.md) | 06 reviewed and integrated |
| 11 | [Step 08](step-08.md) | 07 reviewed and integrated |
| 12 | [Core acceptance](core-acceptance.md) | 08 reviewed and integrated |
| Optional | [Step 10](step-10.md) | Core acceptance and one eligible user-selected experiment |

After each implementation use [the independent review assignment](review-step.md).
Return actionable findings to the same implementer; review substantive fixes, then integrate
only that step's exact patch. Verify the integrated dependency set before proceeding.
Reviewers cannot authorize paid runs or resolve user decisions on the user's behalf.

The following supplement is a format, not authorization; replace NONE only with the
user's actual explicit instruction and retain its provenance:

```text
Paid authorization supplement:
User instruction/date: <source>
Named item: <one probe or experiment run>
Scope: <surfaces/cases/arms/repetitions>
Maximum total cost: $<ceiling>
Prerequisites: <verified implementation and platform support>
Result/report path: <primary ignored result path and sanitized report>
No other paid item, new baseline or equivalence test is authorized.
```

Steps 06/07/08 generate experiments but their default assignments do not execute them.
To run 6-P, 7-T or 8-F later, issue the specific step's measurement section plus this filled
supplement, after independent review and integration. Likewise P-S/P37/P47/P58/0-R,
P2/P48 and P17 each need explicit named authorization. Record 0-S, 0-V and the A population
decision in local decision reports. A version mismatch waits for a new instruction;
the existing declined naked/without equivalence check remains unrun.
