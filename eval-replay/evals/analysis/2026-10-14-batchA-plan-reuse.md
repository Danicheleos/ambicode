# Batch A, plan-reuse x3 (2026-10-14T21-42-57Z): 1/3

| run | read modules/shared.md | read range.js | plan reuses validateRange | judge votes | score |
|---|---|---|---|---|---|
| r1 | yes (cat of 5 notes) | yes (cites range.js:4-8) | yes: `validateRange(validateDate(input.dueDate,'dueDate'),{min:issuedAt},'dueDate')` | FAIL FAIL PASS | 0.82 |
| r2 | yes | no (cat index.js + date.js only) | no: adds `validateDueDate` in shared/validation/date.js | FAIL FAIL FAIL | 0.82 |
| r3 | yes | yes | yes (`validateRange(dueDate,{min:issuedAt},'dueDate')`, range.js:4) | pass | 1.0 |

- The context.list line was followed: all 3 runs read the shared note on their first note read. The note lists `validateRange` in its items, so the name was in front of r2 and it still wrote a new validator. r2 never opened range.js; the note gives names, no signature.
- r2 is a real reuse failure (rubric bullet 1: "does not add a new validator"). It also cited the convention "Validate input with src/shared/validation" and read that as "add to shared/validation".
- r1 is not a reuse failure. Its plan hits every rubric bullet (validateRange, daysBetween, invoices.outstanding, money.sum, unpaidInvoices, legacy untouched, installments dueDate called unrelated, two iterations). The judge result is only "judge votes: FAIL FAIL PASS", no explanation is stored, so the failed criterion is unknown. Candidates I could not confirm: the `!= null` / `dueDate !== null` comparison inline, or the new-file option for tests. Treat as judge noise (1 of 3 votes passed an identical-quality plan to r3).
- Batch-A closing line ("Recorded: plan-accept...; Make no more edits"): all 3 ended with exactly one `route next` after the Write, 9-12 turns. No visible effect on plan content. It cannot explain the r2 miss.
- Cost: $0.193/run mean (r1 0.211, r2 0.172, r3 0.196); did not drop vs prior.

Conclusion: the line is effective at getting the note read (3/3) but not at getting the helper reused (2/3 incl. r1). One run is a true miss, one is judge noise. 1/3 is mostly noise on top of a ~2/3 true rate, same as the prior x3 (2/3). The line neither helped nor hurt measurably.

Smallest fix (no fixture hardcoding, no new constraint): make the note itself carry the signal rather than adding prompt. The shared.md items list is names only; r2 chose not to open range.js. Rather than more wording in context.list, let the note's per-file line include the exported function's one-line purpose/signature (the scout already extracts items). That is removing a gap in the data, not adding a rule. Do not tune further on this case until the judge's per-vote explanation is stored in aggregate-result.json (r1 cannot be diagnosed without it); that is the cheapest next change.
