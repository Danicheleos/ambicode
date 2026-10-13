# review-subtle regression after the policy rework (2026-10-13)

Plugin arm, Sonnet 5.5, effort low, ×3 per run. Runs: A = `2026-10-12T23-42-00-110Z` (before the rework, score 0.800), B = `2026-10-13T00-26-05-744Z` (0.622), C = `2026-10-13T00-39-16-517Z` (0.511; history.jsonl:167, run3 log). C is in. Bare: `2026-10-12T23-34-20-594Z` (0.704).

## Findings

1. **Every error is a reviewer error. None is a relay error.** In all 9 runs the main model relayed reviewer-answer.txt faithfully, with no dropped caller and no added claim. The one exception is C3, where the answer was voided and the main model showed it as unvalidated.
2. **The reviewer leads with the `percentOf` decoy in 8 of 9 runs**, including 2 of the 3 runs in A. Only A2 made the callers outside the diff its headline finding. A's 2/3 on finding-correct is one solid pass (A2) and one borderline pass (A3). A3 and B3 have the same structure: percentOf leads and invoice/report callers follow. The judge passed A3 and failed B3. Fisher one-sided: finding-correct A 2/3 vs B+C 0/6 gives p=0.083; no-false-defect A 3/3 vs 1/6 gives p=0.048. The baseline was fragile. Part of the drop is judge noise, and part is a real shift (point 3).
3. **What did shift: fewer, merged findings that cite the new rules.** Findings per reviewer went A 1/2/3 → B 2/1/1 → C 1/1/1. After the rework, the callers are folded into the percentOf finding as a sub-clause, and no run gives them a finding of their own. Two things plausibly drive this. One is the new reviewer.md line "A problem that recurs is one finding at its clearest location". The other is the new `callers` and `scope` rules: 5 of 7 findings in B and C cite one of them, and the percentOf finding is framed as "not everything was updated". In A, the rule refs were reuse-before-reimplementing, cohesion and need. I can't separate this from noise with n=3.
4. **The cause shows in the search, not in the brief.** 9/9 reviewers grep `round\(`, which hits `Math.round` in percentOf (money.js:29) first. 0/9 open `src/invoices/service.js` or any test. A2 is the only reviewer that grepped the whole repo for `half`. It found tests/reports/service.test.js:69 and tests/factory.js:14, and it is the only one that led with callers. Bare #2 read the tests and computed 1005 × 10% = 100.5 → 100. The reviewer.md "Dependents" bullet covers only names that are *removed, renamed or re-typed*. It says nothing about a change in behaviour.
5. **C3 lost its whole answer to a hallucinated rule id**, `common-rules/callers`, which validate.ts:54-57 rejects. Splitting the rules into 5 packs adds 5 prefixes the model can misremember. A1–A3 used a single prefix.
6. **convention-finding is 0/9 plugin and 0/3 bare, before and after.** The brief carries no project convention. `.ambicode/context/conventions.md` (849 B) states "never throw new Error(...)", but neither the reviewer nor the main model reads it in any run. B1 and A2 come close ("rather than a ValidationError") and still fail.

## Per-run outcomes

| run | reviewer lead | findings | ruleRefs | caller `src/(invoices\|reports)/…:N` in answer | failing graders |
|---|---|---|---|---|---|
| A1 | percentOf + legacy | 1 | reuse-before-reimplementing | only in coverageNotes, no `src/` | cites-caller, finding-correct, convention |
| A2 | **callers + tests + docs** | 2 | cohesion, error-honesty | yes | convention |
| A3 | percentOf | 3 | cohesion, need | yes (sub-clause) | convention |
| B1 | percentOf ("still drift upward") | 2 | callers, scope | yes (in f2) | finding-correct, no-false-defect, convention |
| B2 | percentOf | 1 | fix-the-cause | no | cites-caller, finding-correct, convention |
| B3 | percentOf, callers as sub-clause | 1 | callers | yes | finding-correct, no-false-defect, convention |
| C1 | percentOf | 1 | — | "line 55", no path:line | cites-caller, finding-correct, no-false-defect, convention |
| C2 | percentOf | 1 | scope | no | same 4 |
| C3 | percentOf (voided) | 1 | scope, `common-rules/callers` | yes | finding-correct, finding-recorded, no-false-defect, convention |

## Reviewer inputs, A vs B/C

- brief.md: 6385 B → 8040 B. The changed.diff, the Agent prompt (the route template; three runs append "Cite path:line") and the context are identical.
- Rules: the 16 rules from A are all still present, plus 8 new ones. A had 4038 B under the 4096 B cap, with no "N more" pointer, so the cap never cut anything in A.
- agents/reviewer.md: +2 sentences (recurring problem → one finding; judgement vs fact).

| section | A bytes | B/C bytes |
|---|---|---|
| header | 363 | 363 |
| Changed files (diff) | 1803 | 1803 |
| Policy rules | 4057 (16 rules) | 5712 (24 rules) |
| Requirements + checks | 162 | 162 |
| **total** | **6385** | **8040** |

Rules in B, by pack: common-design 2297, common-code 981, common-errors 831, common-security 791, common-verification 787. The largest rules are fix-the-cause 506 B, reuse-before-reimplementing 438 B, comment-reasons 351 B and no-check-evasion 295 B. The 8 added rules total 1760 B. Of the B/C rule bytes, 71% has nothing to trigger on in this diff: no network, logger, async, or untrusted input.

## Options, ranked by expected quality per cost

Byte effects are measured on this case's brief. Quality effects are predictions.

1. **Edit the reviewer.md Dependents bullet** (0 B brief, about +250 B agent prompt). Extend it from "removes, renames or re-types" to "changes the behaviour of". Then require one caller outside the diff with an input and its before/after result. Also add: code the change does not touch is a finding only when its result changes. That second sentence excludes percentOf, whose result is unchanged, and keeps the callers, whose results change. This targets finding-correct, cites-caller and no-false-defect together. Predicted: the largest gain. It is language-agnostic and edits the existing seam.
2. **Carry the project's conventions file in the brief** (+849 B). brief.mjs already gets `context.list`. Add a `## Project conventions` section with `conventions.md`. This is the only lever on convention-finding (0/12 across both arms). The facts come from the repo's measured context, not from a table.
3. **Re-tag rules by activity in the pack YAML** (rules 5712 → ~2830 B, brief 8040 → ~5160 B):
   - Drop the 7 review-activity rules that reviewer.md already states (callers, reuse, unjustified-complexity, dead-surface, no-secret-exposure, untrusted-input-allowlist, honest-gaps): −1617 B.
   - Restrict the authoring-process rules (fix-the-cause, no-check-evasion, need, scope; honest-gaps already counted above) to task/plan: −1265 B more.

   This removes the callers and scope rules that 5 of 7 findings in B and C cite. Predicted: neutral to positive, and fewer ids to misremember.
4. **Stop voiding the whole answer on an unknown ruleRef.** In validate.ts:54-57, drop the bad ref and list it as an omission. A rule ref is not a location. This would have recovered C3 (finding-recorded 0.67 → 1). It loosens a deliberate strictness, so it is your call.
5. **Render the rules shorter** by removing ` (inherited)` (−288 B). Grouping under pack headers saves up to 356 B more, but it may increase id errors. Small.
6. **appliesTo filter against the changed files: −0 B.** Every common pack is `"**/*"`.
7. **Per-rule relevance from diff content** would cut about 1518 B here. It needs per-rule triggers that cannot be made language-agnostic without a classifier. I don't recommend it.
8. **Move the rules to a file read on demand** (−5600 B). Reviewers open 3–5 files at effort low, so I predict the rules would mostly go unread. A byte cap has the same problem unless its pointer is a readable file, because the reviewer has no Bash.

## Other cost

- Plugin $0.126–0.163 per run vs bare $0.072–0.091 (+56–70%). Context peak 23.5–29.0k vs 19.7–21.5k.
- The main model spends 1–2 Bash calls per run (all 9 runs) trying to run jest in a repo with no node_modules.
- 9/9 reviewers Read changed.diff (1721 B) right after brief.md, which already contains the whole diff. agent.md could say the brief holds the diff.
- C3 costs $0.163 and 9 turns: after the void, the main model looked up `invalid-output` in outcomes.md, which does not list that code.

## Rerun after the 7-step fix (raw/2026-10-13-review-fix/run.log)

```
case               score  outcome  bare   lift   $/run
review-subtle      0.822  0.778    0.704  +0.07  0.147   finding-correct 1/3, no-false-defect 2/3
review-clean       1      1        0.7    +0.30  0.108
review-defect      1      1        0.8    +0.20  0.123
review-regression  0.97   1        0.8    +0.20  0.139   check-recorded 2/3
review-skipped     1      —        —      —      0.058
task-multi         0.889  1        1       0.00  0.209   route-done 1/3, reviewer-invoked 2/3
```

### task-multi: route skips review-cmd, brief runs with no review

Runs 1 and 3 (traces 2026-10-13T01-10-20-380Z): the change step hit `missing-produces`, the route
moved to review-cmd while the model was still running checks, and each `check`/`format` call counted
as a repeat of review-cmd (`execute.ts` runModel counts every EXPLICIT cause). Third one → limit →
review-cmd skipped → `brief` ran before any review entry existed → brief.mjs returned `payload: null`
silently → review-agent delivered with no brief path. Run 2 ran `review` first and passed.

Pre-existing: 2026-10-12T22-42-07 task-multi-3 shows the same sequence (review-cmd limit, brief
cause `format`). `src/harness` is unmodified. 3 of 14 recorded task-multi runs hit it.

### Fix and rerun (raw/2026-10-13-route-fix/run.log, traces 2026-10-13T01-50-17-078Z)

Changes: only `route-next` counts as an attempt at a model step; the task route's `review-cmd` model
step is gone and `brief` pins the review in code (`review.pin`); brief.mjs fails `review-missing`
instead of an empty payload; routes/review/agent.md requires `run_in_background: false`
(2 of 112 traced reviewer launches ran in the background; in task-multi-1 the headless Stop closed
the route, so SubagentStop found no route and the answer was lost).

```
task-multi ×3   score 0.944 (was 0.889)   $0.204/run (was 0.209)   13.3 turns
route-done 3/3  review-recorded 3/3  reviewer-invoked 3/3  no missing-produces limits
report-sections 2/3 (not shared)   test-added 2/3 (judge FAIL×3 on run 2)
```
