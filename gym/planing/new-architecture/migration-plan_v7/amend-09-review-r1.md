# Step 09 amendment — review round 1 (2026-10-06)

The user decided S1 and P1–P6 of the step-09 review
(`plan/migration-v6-reports/step-09/review.md`). The rules below replace the parts of
`step-09-init-rules.md` they name; everything else there still applies.

## S1/P1 — engine and Stop-hook edits are in scope

- Files gains two rows:

  | File | Change | Budget | What |
  |---|---|---|---|
  | `src/route/engine.ts` | change | ±15 | `finish()` closes a route whose last step is a code step with that step's saved payload (`init.close`, `rules.close`; 09-R1, D4); a model step re-entered through `revise` gets the revise args as `## <key>` sections, as code steps already do (D9) |
  | `src/hook/events/stop-check.ts` | change | +30 | 09-D5: when the answer quotes the doctor table's header, the table must match `steps/doctor.md` cell for cell (padding, pipes, separator rows and code fences ignored) |

- 09-D5's "step 03's generated-section mechanism" is replaced by this Stop-hook check.
- The rules route's `steps/rules-apply.md` read-back is not compared by the Stop hook. It stays a
  follow-up (review N7).

## P2 — the `sources` gate keeps fixed options

- 09-T1 `sources` replaced: options *use these sources* / *none — stop*; default and release
  *none — stop*; a free-text answer re-enters `discover --source <answer>`. Discovered sources are
  listed in the print, not as options.
- A headless run that names source files in args stops at `sources` (default *none — stop*). This is
  accepted; no dynamic options and no args-derived default.

## P3 — revert refuses a shared policy file

- 09-T6 addition: if another project's `policyFiles` also lists the pack's file, `rules revert` fails
  with `bad-argument` naming those projects. Nothing is unwired or moved.

## P4 — Adjust tokens are quote-aware

- 09-G2 "parsed with `parseSet` per whitespace-separated token" replaced: the free text is split on
  whitespace outside `[…]` and outside double-quoted strings (backslash escapes honoured); each token
  goes to `parseSet`. `projects.app.commands.unit=["pytest", "-k", "foo or bar"]` is one token.

## P5 — an approved backup survives Cancel

- 09-R4 "no backup" replaced: when the human approved the backup of an unparsable config (09-P6, D18)
  and then cancels or defaults at `init-apply`, the `.bak-` file stays. `init.close` names it and says
  that `.ambicode/config.yaml` is unchanged. Without that approval, Cancel still leaves no backup.

## P6 — only `init --apply` starts the index build

- 09-D3 replaced: `runDoctor` starts step 05's `startIndexBuild` only inside `init --apply`.
  Standalone `doctor` reads the index state through the index adapter's `status` and puts it in
  `index`; it writes nothing (09-D5 unchanged).
