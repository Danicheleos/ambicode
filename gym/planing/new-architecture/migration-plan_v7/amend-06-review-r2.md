# Step 06 amendment — review round 2 (2026-10-06)

Round 2 of the step-06 review (`plan/migration-v6-reports/step-06/review-round2.md`). The rules below
replace the parts of `step-06-plan.md` and `amend-06-review-r1.md` they name; everything else there
still applies.

## Provenance of round-1 P1–P4

- `amend-06-review-r1.md` says the user approved the recommended answers to P1–P4. That is
  inaccurate: the user's "go" approved the round-1 fixes; the implementer chose the P1–P4 answers.
  They stand as written in r1 until the user decides otherwise.
- The reviewer retracted round-1 P1: step 03's 5.1 superseded 0-S.

## B5 — the whole revise block fits the budget

- r1 §B5 "inline budget of 1,400 bytes" replaced: the 1,400 bytes cover every section the check adds to
  the re-printed `plan-write` step — each list's `## <key>` heading, its items, its
  `… N more in <artifact>` line, the blank lines between sections, and the `## Last round` section
  whether or not it is printed. Totals and the artifact pointer are kept.

## B6 — the duplicate count survives shortening

- `plan check` output gains `duplicatesTotal`: the number of duplicates found, taken before the inline
  list is shortened. The text output prints it, and adds "Inline lists were shortened; see <artifact>."
  when `listsCut` is set.
