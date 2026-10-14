# plan-reuse: why the plugin plan finds validateRange or misses it (2026-10-14)

Read-only analysis. Sources: `evals/cases/results/traces/{plugin,bare}/*/plan-reuse-*.jsonl`, `aggregate-result.json` per batch, `evals/history.jsonl`, the step payload files in `plan-reuse-<n>.ambicode/`, `src/modules/search/map.ts`, `src/skills/common.ts`, `routes/plan/*`. Numbers come from a script over the traces (tool_use inputs, tool_result text, `Write` of plan-body.md). "Saw range" = a tool result of that run contained the body of `validateRange` (range.js). "plan VR" = mentions of `validateRange` in the plan body the model wrote.

## 1. Runs

Route code states differ by batch, so only rows marked CURRENT use the design that ships now (map via `search.map(context)` = layers grep, harvest; no navigator; `context.list` ending "Read only the one file you need."). Batches 10-13 11:39 to 10-14 00:11 ran the navigator or the shortlist map (rolled back at 8498e0c).

| batch | design | n | passed | saw range | plan VR>0 | calls (mean) | $ (mean) |
|---|---|---|---|---|---|---|---|
| 10-12 22:39 (case v1 grader) | pre-ground-step | 5 | 0/5 | 2/5 | 2/5 | 7.4 | 0.178 |
| 10-12 23:38 (v2) CURRENT | context notes + refs | 3 | 2/3 | 2/3 | 2/3 | 6.7 | 0.164 |
| 10-14 00:23 (v2) CURRENT | same | 1 | 1/1 | 1/1 | 1/1 | 10 | 0.210 |
| 10-13 11:39 | navigator | 3 | 1/3 | 2/3 | 2/3 | 15 | 0.276 |
| 10-13 12:27, 12:34, 15:57, 16:30 | shortlist map + navigator brief | 12 | 0/12 | 0/12 | 1/12 | 6 to 22 | 0.16 to 0.23 |
| 10-13 18:09, 10-14 00:11 | navigator x2 + record | 4 | 0/4 | 2/4 | 0/4 | 27 | 0.36 |
| bare 10-12 22:25 (v1) | no plugin | 5 | plan-quality 2/5 | 3/5 | n/a (plan in final message) | 3.2 | 0.108 |
| bare 10-12 23:32 (v2) | no plugin | 3 | plan-quality 0/3 | 2/3 | n/a | 4 | 0.120 |
| bare 10-14 00:14 (v2) | no plugin | 1 | not in history.jsonl | 1/1 | n/a | 4 | 0.113 |

Current-design runs, one line each (all four share the same map and context.list payload):

| run | passed | read shared note / validation dir | planned validateRange | calls | $ |
|---|---|---|---|---|---|
| 23:38 n1 | yes | `cat src/shared/validation/index.js range.js` | 3 | 6 | 0.147 |
| 23:38 n2 | yes | `cat .ambicode/context/modules/{...shared}.md`, `validation/{index,date,range}.js` | 1 | 7 | 0.170 |
| 23:38 n3 | no | notes of invoices and reports only; never shared note, never src/shared/validation | 0 | 7 | 0.165 |
| 00:23 n1 | yes | `cat modules/invoices.md reports.md shared.md conventions.md`, then `range.js` | 3 | 10 | 0.210 |

The 10-12 22:39 batch fails on the v1 grader (all 5 fail, 2 of them mention validateRange), so it says little about reuse. Bare read `range.js` in 6 of 9 runs (it `cat`s whole directories after `git ls-files`) yet scored 2/5 and 0/3 on plan-quality; why bare fails when it saw the helper was not investigated.

Judge noise: even the 00:23 pass had votes FAIL PASS PASS (`aggregate-result.json`).

## 2. Why pass versus fail

Where it separates: in the current design, a run passed only when it saw `range.js` or the shared note (3/3), and failed when it did not (0/1). Sample is 4 runs; treat as direction, not rate.

The map does not carry it. `search.map(context)` for this request returns one pair of files, and both are the decoy. Identical payload in the failing 23:38 n3 and the passing 00:23 n1:
```
"candidates":[["src/payments/installments.js",2,["contains the word \"dueDate\""],["1-27"]],["tests/payments/installments.test.js",2,...
```
Cause in `map.ts`: the context-mode layers `grep, harvest` search only identifier-shaped terms (`dueDate`); the nouns ("date", "invoice", "report") are never searched in this mode. The request never names the validator, so no term can reach src/shared.

Reproduced at $0 in a materialized fixture (`scratchpad/cases/plan-reuse`, `ambicode map --mode prompt`, the older shortlist layers): with the nouns as terms the top rows are `src/legacy/invoice-total.js` and `tests/legacy/invoice-total.test.js` (score 19, the frozen copy the grader forbids), then `src/shared/validation/date.js` at 11. `range.js` is not reached (it only appears when "validation" is a term). That matches the history: 12 shortlist-map runs saw date.js in the map and 0/12 read range.js. A better map rank cannot fix this case: the match "before its issue date" to `validateRange` is semantic.

What the model has instead is `context.list`: 11 lines, titles only (`modules/shared.md  shared module  ~272 tokens`), plus "Read only the one file you need." The shared note is the one place that names `validateRange` ("src/shared/validation/index.js - input validators - items: ... validateRange ..."). Passing runs got there by `ls`/`cat` of the validation directory or by `cat modules/*`; the failing run took the line literally and read the two notes whose titles match the request nouns. `refs --declarations <name>` needs a name (design.md says so); the failing 23:38 n3 ran it for `createInvoice validateDate outstanding unpaidInvoices groupBy`, all names it already had.

Design wording: `routes/plan/design.md` says "look for an existing one with `refs --declarations <name>`". Same limit. The `policy:before-work` payload carries `common-design/reuse-before-reimplementing` ("look for an existing one") with no directions to where.

Ranking of causes: (1) context.list line "Read only the one file you need." (it opposes reading shared); (2) design.md reuse sweep names only `refs`; (3) the map, which cannot help here and cannot be made to by ranking.

## 3. Fixes, generic

(a) context.list wording (`src/skills/common.ts:110`, the one line). Replace with something like: "Read the notes of every module the change touches and of any shared or common module; open only the files you need." Cost: shared + invoices + reports is about 650 tokens, against 1,952 for all notes; the 00:23 pass read four notes in one `cat`. Risk: the old line exists to stop reading everything; the new line still bounds it. This is not a scope fence: it widens reading, it does not skip search. Expected effect: shared note read in about every run (now 3/4 current-design runs saw range; the miss was this line's failure mode). Language-agnostic, no fixture names.

(b) design.md sweep line. Add "list the shared or common module and read its note: `refs` only confirms a name you already know". Overlaps (a); worth it only if (a) alone leaves misses. Two places saying the same thing is a drift risk.

(c) Code. Ranking shared modules in the map: the map hit only the decoy, nouns are not searched in context mode, and the shortlist alternative ranked the legacy copy first. Not viable for this case. Highlighting notes whose Key files the map hit: the map hit payments/installments.js, so it would highlight the payments note and steer away from shared. Rejected on this case with evidence. A variant that could work: add each note's Purpose line to the listing (`modules/shared.md  shared module  Cross-feature helpers: money, validation, errors, ...`). It gives the model a reason to open shared, costs about 12 short lines. It is code in `renderListing`; do it only if (a) fails.

## Recommendation

Do (a), edit the existing line in `src/skills/common.ts:110`. One sentence, no new code path, no new option.

$0 check before any paid run: rebuild, run `scratchpad/firststep.sh plan-reuse`, and diff `step-plan-reuse.txt`: the `## context.list` tail must read the new line and nothing else must change (map, policy, design text byte-identical). Add the line to the existing context.list test if one asserts the old text. That proves the payload, not behaviour. The behaviour proof is paid: plan-reuse x3 (per the paid-run tiers), pass condition "range.js or modules/shared.md appears in a tool result in 3/3 and plan-quality passes in at least 2/3". Compare with the 4 current runs (3/4). Also run plan-accept x3 in the same batch to see the wider reads do not push it past its cost or break its graders. Ask before spending.

Not done: no paid run, no edits outside this file, no check of the 10-14 14:53 plan-accept batch (it does not contain plan-reuse).
