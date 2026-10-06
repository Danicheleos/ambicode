# Step 06 amendment — review round 1 (2026-10-06)

The user approved the round-1 fixes of the step-06 review
(`plan/migration-v6-reports/step-06/review.md`), and with them the recommended answers to
P1–P4. The rules below replace the parts of `step-06-plan.md` they name; everything else there
still applies. Review P-numbers are prefixed "review" to keep them apart from platform P2.

## Review P1 — 0-S is not pending (rejected finding)

- Step 03's change 5.1 replaced the 0-S session transport: a CLI call binds by `--task` through
  `taskSessionSource` to the owner of the task's one live route. That binding is untrusted and never
  counts as consent.
- D15's "with 0-S pending … refuse `session-unbound`" and the Hand-off line on injected sessions read
  as: tests may inject sessions; the CLI binds through the owning route. No extra CLI-process walk is
  owed. The report lists 0-S as superseded by 5.1.

## Review P2 — the fetch step receives the template

- The Contract YAML's `fetch` step gains `payload: [template]` after its `instruction` line. The 06-R1
  byte-for-byte assertion now pins the amended file.
- `plan-fetch.md` no longer tells the model to read `steps/payload-*-template.txt`; it requests the
  fields each call lists in the delivered `## template` section.

## Review P3 — 06-C4 skips path spans

- 06-C4 addition: a backtick span that contains `/`, `\` or `:<digit>` yields no identifier. A plan
  that quotes its anchor as `` `src/orders/stock.ts:1` `` is not checked for `orders`.
- 06-C7 uses the same word rule, so the same spans give no duplicate candidates.

## Review P4 — worker artifact paths are repo-relative

- The Contract's `worker.artifact` and `PlanCheckResult.artifact` are
  `.ambicode/task/<t>/workers/<id>-<ts>.json`, relative to the repository root, not
  `workers/<id>-<ts>.json`. Route status resolves artifact names against the root.

## B4 — duplicates outside the bound project

- `find` uses the project from the route args, else the latest bound `project-ambiguous` answer in the
  chain (not `stop`). When no project can be chosen, the duplicate check is skipped and the result
  carries an optional `duplicatesSkipped: "<code>: <message>"`; `plan check` prints "New names were not
  looked up: …". Skipping never fails the check.

## B5 — list sizes give way to the byte caps

- 06-P7 "first 50 each" replaced: the re-printed `plan-write` lists fill an inline budget of 1,400
  bytes, then end with `… N more in <artifact>`. The 06-H1 cap of 3,072 bytes holds.
- 06-P8/06-H1: `plan check --json` drops entries from the longest of `anchors.bad`, `acs.unmapped`
  and `duplicates` until the output fits 8,000 characters, and then sets `listsCut: true`. Totals are
  unchanged.
- 06-C5/06-C6/06-C7: the artifact still keeps the first 50 of each list.
