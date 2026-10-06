# Step 08 amendment — implementation questions and review round 1 (2026-10-06)

The user decided the open questions raised while implementing step 08 and P1–P4 and S1 of the
step-08 review (`plan/migration-v6-reports/step-08/review.md`). The rules below replace the parts of
`step-08-review.md` they name; everything else there still applies.

## Review limits — null means no limit

- `review.maxFindings`, `maxChangedFiles`, `maxChangedLines` and `maxContextBytes` default to `null`,
  meaning no limit; `init` writes `null`, `config` prints `no limit`. A repo config may still set numbers.
- With no finding limit the reviewer prompt omits "at most N"; with no context limit the
  sibling-context budget is 512 KiB. The per-file snapshot ceiling is unchanged.
- Byte identity is waived for these lines only: `src/snapshot/limits.ts` (null guards),
  `src/review/prompt.ts` (the findings line) and `src/review/report.ts` (`limit none`, P4).
- Review results from this step on are not comparable with earlier ones on finding count or precision.

## Requirement evidence on routes (implementation PLAN-2)

- On any route (review and task), a `review --task` that names no `--evidence` and no `--requirement`
  reviews against the chain's latest requirement envelope when it was built from captures. The
  envelope is passed in process, not as an `--evidence` file.
- The declared requirements are the asked captures, by URL or by issue key when the capture has no
  URL; the http(s) URL check applies only to `--requirement`.

## Waiting checks — one explicit question (replaces 08-W1 … 08-W3)

- Gate `review-checks` (registry): "Checks waiting: {key}. The reviewer has not run yet. Run the review
  with them, without them, or no review?"; options *with* / *without* / *no review*; default and
  release *without*; acting `[with]`; *with* and *without* revise `$raisedBy` once.
- *with* approves every listed key; *without* reviews with them under Not verified; *no review* runs
  no reviewer and goes to readback. Headless takes *without*. A re-run that still waits asks again.
- `review-run` has no `repeat`; there are no automatic re-runs.
- 08-W4: a typed `--approve` after the headless default is recorded `declined {via: flag,
  acting-needs-human}` (`src/checks/check-command.ts`).

## P1 — a typed `--approve` outside a route approves nothing

- Standalone `review --approve <key>` (no route, with or without `--task`) leaves the check waiting
  and adds an omission pointing to `route start review`. The waiting-check omission no longer
  suggests `--approve`, and the report lists a waiting key without `--approve` (byte identity of
  `src/review/report.ts` is waived for that line too). `--decline` still works standalone.
- `bundle --approve <key>` approves nothing either (review round 2, N9): the check stays waiting and an
  omission points to `route start review`.

## P2 — `--estimate` accepts `--approve`, `--decline` and `--evidence`

- The Contract's `bad-argument` (field `--estimate`) for these flags is replaced: they are accepted;
  nothing executes during an estimate.

## P3 — the `onNeedCommand` engine seam

- Non-goal "the only engine change is the `target` start arg" gains: the `onNeedCommand` seam
  (`gates.ts` plus about 5 lines in `engine.ts`), which 08-R5 needs to deliver the review command
  with the route's target and narrowing.

## S1 — gate prints name the raising step

- Waived: gate prints show "goes back to <step>" instead of the literal `$raisedBy`
  (`src/route/gates.ts`, `gatePrintText`); this also changes step 07's printed text.

## Also decided

- 08-I1 `rules discover --project <id>` is built here (user's instruction): it lists rule-source candidates
  under that project's root only (repo-relative paths); an unknown project is `bad-argument` (`--project`).
  The audit has no gap left.
- Review N1: the leak test in `evals-bench.test.mjs` also reads ticket ids from the
  `projects/<side>/cases/*/truth.json` layout of the ignored benchmarks folder.
- Review N8: the declaration census keeps running with `index: none` (08-D3 needs it there).
- Review N11: `validate-plan.mjs` no longer fails on links to removed history (`migration-plan_v6/`,
  `measurements-2026-10-03/`, `review-migration-plan-v6.md`); it lists them as `unresolved_history_link`.
  Links inside `migration-plan_v7/` and `v6/` must still resolve.
