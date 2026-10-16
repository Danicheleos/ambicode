# plan-reuse: why validateRange is missed (2026-10-15)

21 plugin runs from 2026-10-12 onward (evals/history.jsonl, case plan-reuse). Fixture ts-app-medium.

| run dir (2026-) | r | plan-quality | reuses validateRange | refs names | read range.js / validation/* | cost |
|---|---|---|---|---|---|---|
| 10-12T22-39 | 1 | fail (other: reuse ok) | yes | none (pre-refs) | yes | 0.167 |
| 10-12T22-39 | 2 | fail | no, inline `dueDate < issuedAt` | none | no | 0.158 |
| 10-12T22-39 | 3 | fail | no, inline | outstanding | no | 0.209 |
| 10-12T22-39 | 4 | pass quality (no-edit fail) | yes | none | yes | 0.186 |
| 10-12T22-39 | 5 | fail | no, inline | none | no | 0.171 |
| 10-12T23-38 | 1 | pass | yes | none | yes | 0.151 |
| 10-12T23-38 | 2 | pass | yes | validateRange | yes | 0.174 |
| 10-12T23-38 | 3 | fail | no, inline | loop incl. validateDate | no | 0.167 |
| 10-14T00-23 | 1 | pass | yes | dueDate, outstanding, daysBetween | yes | 0.210 |
| 10-14T21-42 | 1 | fail (other: reuse ok) | yes | outstanding | yes | 0.211 |
| 10-14T21-42 | 2 | fail | no, new validateDueDate in date.js | none | no (read index.js, date.js only) | 0.172 |
| 10-14T21-42 | 3 | pass | yes | overdue | yes | 0.196 |
| 10-14T23-04 | 1 | pass | yes | daysBetween | yes | 0.233 |
| 10-14T23-04 | 2 | pass | yes | dueDate outstanding validateRange daysBetween unpaidInvoices | yes | 0.216 |
| 10-14T23-04 | 3 | fail | no, new validateNotBefore | overdue dueDate outstanding daysBetween validateDate | no (date.js+index.js) | 0.243 |
| 10-15T01-44 | 1 | pass | yes | none | yes | 0.162 |
| 10-15T01-44 | 2 | pass | yes | loop (n list not recovered) | yes (cat validation/{date,range}.js) | 0.219 |
| 10-15T01-44 | 3 | pass | yes | overdue dueDate daysBetween outstanding validateRange | yes | 0.196 |
| 10-15T06-21 | 1 | pass | yes | loop | yes (validation/{date,range}.js) | 0.204 |
| 10-15T06-21 | 2 | pass | yes | overdue dueDate outstanding | yes | 0.185 |
| 10-15T06-21 | 3 | fail | no, new validateNotBefore | overdue dueDate daysBetween outstanding validateDate | no (date.js+index.js) | 0.225 |

Missed validateRange: 7 of 21 overall; 3 of 13 since 10-14 (refs era). In all 7, range.js was never opened. In all 14 runs that reused it, range.js (or validation/{date,range}.js) was opened. Two runs (r1 10-12T22-39, r1 10-14T21-42) failed on something else with validateRange reused. Per-run names come from a regex over Bash inputs, so "loop" rows may hide names.

## Cause

The reuse sweep is keyed by name, and the needed piece ("a date must not precede another date") has no name the model knows.

- The failing runs searched only names they had already seen: `validateDate`, `daysBetween`, `outstanding`, `overdue`, `dueDate`. Result in 06-21 r3: `overdue: declarations: 0`, `dueDate: declarations: 0`, `validateDate: declarations: 1 / function src/shared/validation/date.js:6`. refs cannot answer "is there a range/compare helper".
- The map payload points elsewhere: its only candidates were `src/payments/installments.js` and its test ("contains the word dueDate"). It never mentions validateRange.
- validateRange is visible to the model only as a bare name: shared.md ("src/shared/validation/index.js - input validators - items: validateCents, validateDate, ..., validateRange, ...") and the export list in index.js, which 06-21 r3 and 23 r3 both read. No purpose is attached.
- date.js carries the nudge toward inline comparison: line 5 comment "so that days compare as strings". 06-21 r3's plan quotes it: "returns `YYYY-MM-DD` strings that compare as strings (comment at `src/shared/validation/date.js:5`). The 'not before issue date' rule is a cross-field check ... becomes one validator beside `validateDate`".
- conventions.md says "Validate input with src/shared/validation, not with new checks in a service", so the model resolves the tension by adding a validator in that folder instead of looking for one. Its purpose is explained only in range.js line 4: "Works for numbers and for YYYY-MM-DD days ... Either bound may be omitted".
- The policy already says reuse-before-reimplementing; the model never found the candidate, so the rule had nothing to bind to.

The fixture context is not stale. shared.md matches the code and lists validateRange. The scout's name-only items format is the limit. Not a sandbox artifact: the model had the file and never opened it.

## Candidate fixes

1. Reword the sweep in routes/plan/design.md (no new code). Replace its sweep bullet with one that is keyed on the kind of piece and opens the home directory first. Draft, about the same length as the current bullet (about 150 characters, fits when the Weigh bullet's clause "cost, risk, one recommendation" is shortened or "Reuse over new: a new helper beside an existing one is a defect." is merged):
   "Reuse sweep first: for each piece the change needs (a check, comparison, total, lookup), read the files of the shared module that holds that kind of helper, then `{cli} refs --declarations <name> --task {task}` for names you saw. A new helper beside an existing one is a defect."
   Expected effect: all 7 misses skipped range.js; the 14 hits opened it. This forces the open. Measure with plan-reuse x3 (guide: x5 for drift): rate of plans reusing validateRange (grep of plan-body.md) and plan-quality. Currently 3/13 miss in the refs era, so one x5 run cannot separate noise; use the count of runs that open the validation directory plus plan-body reuse. The text change must not hardcode `shared`; "the module that holds that kind of helper" is the generic form.
2. Make refs --declarations list sibling declarations (src/modules/search/refs.ts, search.ts). When a name resolves to one file, append the other files in that directory with their exported names: `also in src/shared/validation: range.js validateRange, ...`. It would have surfaced range.js in 06-21 r3 and 23 r3 (both searched validateDate). It would not help 21 r2 (no refs call), and it is new output and code. Do this only if fix 1 leaves a measured residual. Measure via the refs output in traces and the same reuse rate.
3. Scout context note: add a purpose per exported helper in module notes (e.g. "validateRange - bound a number or day"). Addresses the root nameless-helper issue, but fixtures/contexts/** is protected and needs a paid scout regeneration, and it changes the scout prompt (a plugin change). Not recommended before 1.

Ranking: 1 first (cheapest, $0 to write, direct evidence). 2 only on residual. 3 deferred.

## Not determined

- Whether fix 1's wording actually changes the model; no run was made (evals cost money).
- The exact refs names in rows marked "loop" (for-loop variable lists were only partly recovered by regex).
- Why the model chooses a new validator over the conventions note: thinking blocks are empty in the traces.
- Sample size is small: 3 of 13 misses since 10-14 gives a 95% interval of roughly 5% to 54%.
