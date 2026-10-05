# Working rules: implementing and reviewing one step

These rules apply to steps 02–10, decision A and core acceptance. They change how a step is
specified, built and reviewed. They do not change any contract. If anything here conflicts with
[01-contracts.md](01-contracts.md) or v6, the contract wins, and the conflict is reported.

## 1. How a step brief is written

Every brief from step 02 on has the same sections in the same order:

| Section | What it fixes |
|---|---|
| Goal | The outcome in three lines. |
| Starting point | The repository facts the step builds on: files, symbols, step outputs. Recheck them at dispatch. |
| Files | Every file the step creates or changes, each with a size budget. Every file not listed is out of scope. |
| Contract | Exported signatures, persisted fields and error codes, written out in full. |
| Rules | Numbered behaviour rules (`<step>-<letter><n>`, e.g. `02-P3`). Each one is testable. |
| Decided readings | The choices the brief makes where v6 or 01-contracts leaves something open. These are not for the implementer to reopen. |
| Non-goals | Things a reasonable person might expect here that this step does **not** do. A reviewer may not raise them. |
| Tests | The tests to write, each named after the rule it proves. Also the scenario mechanisms the step owns. |
| Done when | A closed checklist. Nothing outside it is needed for hand-off. |
| Hand-off | What the next step receives and must not redo. |
| Coverage of v6 brief | A table mapping each requirement of the v6 brief to a rule or a non-goal here. It shows that nothing approved was dropped. |

Where the brief and its listed v6 sources disagree, the brief wins **unless** the source is
01-contracts, v6/12 §8 or a review finding in [03-review-resolution.md](03-review-resolution.md).
In that case the implementer stops on that point, reports both texts, and continues with the rest.

## 2. Implementer rules

1. **Build what the rules require, nothing more.** If the brief is silent on a detail, choose the
   simplest behaviour that satisfies every rule. Record it as one line under *Decisions* in the
   report. Do not generalise for later steps unless a rule asks for it.
2. **Stay inside Files.** Do not move, rename or regroup files that are not listed. Do not refactor
   code you did not need to change. A file outside the list may change only for a mechanical
   reason, such as an import path or a renamed symbol. List each such change under *Files*.
3. **Budgets.** Each listed file has a soft budget in lines, tests excluded. If a file goes more than
   50% over its budget, stop adding to it. Report the overrun with one sentence on what forced it.
   A reviewer treats an unexplained overrun as a SCOPE finding.
4. **Tests prove rules.** Write at least one test per rule and name it after the rule
   (`02-P3: superseding Reject refuses`). Use table-driven tests for variants. Do not add
   combinatorial or adversarial cases beyond the rules and the brief's test list. If you find a
   real defect outside the rules, list it under *Follow-ups*; do not fix it.
5. **Non-goals are closed.** Do not implement a non-goal, even partly, even if it looks cheap.
6. **Existing behaviour.** Existing tests keep passing unless the brief names the behaviour change.
   Never weaken an assertion, a budget, a consent check or an ownership check to make a test pass.
7. **Report final state only.** The report describes the patch as it stands. Fix rounds update the
   report in place. There is no revision history: the round-2 changes are a short list at the end.
   Keep the report under 150 lines.
8. **Boundaries.**
   - Do not use the ambicode plugin. Do not spawn agents.
   - Do not run `claude -p`, plugin eval, probes, live reviewers or graders unless the dispatch
     names the paid item.
   - Do not commit, push or install.
   - Ignored and NDA inputs stay in PRIMARY (00-README). No NDA values go in the report or chat.
   - Save the report to `plan/migration-v6-reports/step-NN/implementation.md` under PRIMARY.

## 3. Review rules

The reviewer checks the patch **against the brief**, not against the reviewer's own idea of a
complete solution. Every finding has exactly one class:

| Class | Meaning | Required content | Blocks hand-off |
|---|---|---|---|
| BLOCKER | Breaks a numbered rule, a 01-contracts clause the brief cites, a v6/12 §8 invariant, an existing test or behaviour the brief does not change, or `npm run verify`. | The rule or clause id, plus a failing test or an exact reproducing command. | yes |
| SCOPE | Code or tests that no rule requires, a non-goal that was implemented, a file outside Files, or a budget overrun with no stated reason. | The location, and what to remove or simplify. | yes |
| PLAN | The brief itself looks wrong or incomplete: a rule contradicts a contract, or a realistic case is unspecified. | Both texts, and the realistic case. | no: it goes to the dispatcher, who asks the user. The implementer does not act on it. |
| NOTE | Anything else: style, an edge case outside the rules, an idea for later. | One line. | no: it goes to *Follow-ups*. |

A finding with no rule id and no reproduction is NOTE, whatever its severity sounds like. A
"realistic case" means input that a model or a user produces in ordinary use of the plugin. It
does not mean input built to defeat the check. The plugin is not a security sandbox
(01-contracts §5).

**At most two rounds.**

1. **Round 1** is a full review against the brief.
2. The implementer fixes the BLOCKER and SCOPE findings and answers each by its id.
3. **Round 2** checks only two things: each round-1 BLOCKER and SCOPE finding, and the diff of the
   fix. A new BLOCKER in round 2 must come from the fix diff, or be a missed violation of a
   numbered rule with a failing test.
4. After round 2, the dispatcher takes whatever is still open to the user. There is no round 3
   without the user's instruction.

The reviewer runs the tests that are needed to substantiate each finding. The reviewer does not
edit files and does not run anything paid.

## 4. Report template (replaces 00-README's template for steps 02–10)

```text
# step-NN report — <date>
Status: ready | partial | blocked (<rule or contract>)
Verify: npm run verify → exit <n>, <tests> tests, <pass> pass, <skip> skipped
Rules: <n>/<n> covered by named tests; missing: <ids or none>
Files: path — lines (budget) — one-line purpose; out-of-list changes with reason
Contract delivered: signatures, persisted fields, error codes (only what changed)
Decisions: one line each (brief was silent → chosen behaviour)
Deviations: rule id → what differs → why (or none)
Measurements: command → numbers, or "none required"
Not done / pending: item → reason → which step it affects
Follow-ups: one line each (NOTEs and defects outside the rules)
Spend: $0 or the named authorization
Fix round (only after review): finding id → change
```
