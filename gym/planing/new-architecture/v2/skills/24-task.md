# Skill: task (user-invoked)

## Purpose

Make one bounded code change with the record to prove it: baseline, confirmed map, callers of
changed symbols from an exact tool, a test that fails first (and ran), the smallest fix, format,
affected checks, an independent review offered, and a report whose Evidence and Not verified come
from the ledger. **The bar** (01 §1): pass(with) > pass(without) beyond the spread on the hidden-test
suite at ≤ 1.2x cost.

## Trigger

`/ambicode:task <request | url | key | "iteration N of <slug>"> [--requirement <url>]… [--plan <file>] [--from-draft]` only.

## What the model loads

`SKILL.md` ≤ 2.5 KB: the judgments (smallest coherent change; reuse before adding; never weaken a
test; ask when a finding expands scope), the git boundary with its reason, the two prose report
parts, the fallback start line.

## Route `task`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: slug from args or the plan's directory; `note list` → the latest `plan` (or `--plan <file>`); `notes.md` iteration header; template `when args.hasRequirement` | ≤ 4 KB | `plan.isDraft` and no `--from-draft` → ⏸ *implement anyway (recorded)* / *stop*; **default: stop** |
| 2 | code | `checks.baseline`; `map --mode context` from the brief's paths/symbols; `policy stage before-work`; detached `index build`; LSP advisory line (which of `task.lspPlugins` is installed, if known) | `baseline`, `map`, `policy`; ≤ 9 KB (file if larger) | — |
| 3 | model | one line: pre-existing dirty files stay out of this task's review | — | — |
| 4 | code | `refs --exact <every symbol the brief re-signs>` in one call (TypeScript) or `refs` (grep): the caller inventory in the step text | `search` | `exact-unavailable` → grep, stated |
| 5 | model | **red**: the regression test; `$A check --task <slug> <key> --only <spec> --phase red` | `check {red, summary.failed ≥ 1}` | `propose` → ⏸ approve/decline (default decline); no test possible → `limit {no-red}` with the stated observation |
| 6 | model | **green**: the smallest change; diagnostics pushed by the LSP plugin, if any, fixed in the same step; re-map on a path outside the map; `$A check … --phase green` | `check {green, exit 0, summary.ran ≥ 1}` | `guard.askOutsideMap` off |
| 7 | code | `format --task <slug>` | `format` | `format-unconfigured` → Not verified |
| 8 | human ⏸ | review offer with the `--estimate` text | `gate` | *run* / *skip — verification incomplete*; **default: skip** (evals pass `--default review-offer=run`) |
| 9 | code | `review --task <slug> [--requirement …]`; dependents from the index or the name search as `--context` | `review` | waiting checks → ⏸ approve/decline each (default decline); one re-run with the answers |
| 10 | model | verifies findings; fixes accepted in-scope ones; `check --only` again; `review` again | `check`, `review` | review ≤ 2; check ≤ 5; scope-expanding finding → ⏸ *out of scope* (default: out of scope) |
| 11 | model → code | `$A route next` → report step: `before-report`, generated Evidence / Not verified | ≤ 3 KB | — |
| 12 | model | **Done** and **Remaining**; pastes the generated sections; `note save --kind notes --iteration N` when the plan has more iterations | `note`? | the report is the route's artifact (Stop (b)) |
| 13 | hook | Stop (b): sections unchanged; "tests pass" ⇔ `check {green, ran ≥ 1}`; red before green for a defect brief; declined keys under Not verified | — | — |

## LSP in this route (D1)

**Passive only.** If an LSP plugin is installed, Claude Code may push diagnostics after an edit; the
step text says to fix them in the same step. No `ToolSearch select:LSP`, no active LSP calls:
references come from `refs --exact` (one process, complete answer, 0.7–2.4 s) instead of the LSP
tool's partial first answers (M9). Whether diagnostics are pushed after `Edit` at all is a probe
(33 §0); absence costs nothing and is not a gap.

## Ceremony budget

`check` ×2 (red, green), `format` (code), `route next` ×1, possibly `note save` ×1, plus `review` ×1–2
and its approvals: **5–8**, computed from the route file.

## Measured acceptance (33 §5)

Hidden test passes (with) > (without) beyond the spread; `check {red}` then `check {green}` with
summaries in 100% of with-runs; no weakened assertion; cost ≤ 1.2x unless the pass gain pays. A third
arm (route, no LSP plugin) once, to isolate LSP.

## What changes from v0.4.0

`check --only` with summaries, `format`, baseline scoping, caller inventory by code, passive LSP,
generated report sections, estimate gate (default skip), repeat limits, `--plan`, `--from-draft`,
iteration header.

## Open problems

- P18 Edits unmeasured until the suite; edit-time asks ship off.
- P27 Briefs with no failing-first test: `limit {no-red}` with a stated observation.
- P28 Background index not ready → grep fallback, stated.
- P36 Diagnostics push: probe.
