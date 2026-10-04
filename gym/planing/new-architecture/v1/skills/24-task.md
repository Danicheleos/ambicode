# Skill: task (user-invoked)

## Purpose

Make one bounded code change with the record to prove it: baseline taken, map confirmed, references
of changed symbols listed by an exact tool, a test that fails first, the smallest fix, format,
affected checks, an independent review, and a report whose Evidence and Not verified sections come
from the ledger. This is the one skill where LSP is used (D1), after the map exists.

## Trigger

`/ambicode:task <request | url | key | "iteration N of <slug>"> [--requirement <url>]…` only.

## What the model loads

`SKILL.md` ≤ 2.5 KB: the judgments (smallest coherent change; reuse before adding; never weaken a
test; ask when a finding expands scope), the git boundary (never stash/reset/checkout; the guard
asks on them anyway), the report's two prose parts, the fallback start line.

## Route `task`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: slug from args or the plan's directory; `note list` (accepted plan, notes.md); requirements template if a URL/key | ≤ 4 KB | plan says `draft` → ⏸ *implement anyway* / *stop*; default: stop |
| 2 | code | `checks.baseline`: HEAD, dirty files; `map --mode context` from the brief's paths/symbols (or `prompt` mode); `policy stage before-work`; `index build` (background); LSP advisory: which of `task.lspPlugins` is installed | `baseline`, `map`, `policy`; ≤ 9 KB (file if larger) | — |
| 3 | model | one line to the user: pre-existing dirty files stay out of this task's review | — | — |
| 4 | code | for each symbol the brief says changes signature: `refs --exact` (TypeScript) or `refs` (grep) → the caller inventory in the step text | `search` | — |
| 5 | model | **red**: writes the regression test; `$A check --task <slug> <key> --only <spec> --phase red` | `check {red, exit≠0}` | `propose` check → ⏸ approve/decline; no test possible → the model states the observation that would count, recorded as `limit {no-red}` |
| 6 | model | **green**: the smallest change; reads the LSP diagnostics the tool reports after each edit (if a server runs); re-maps when it touches a path outside the map (`map … <path>`); `$A check … --phase green` | `check {green, exit 0}`, `tool` | guard `askOutsideMap` (off by default) |
| 7 | code | `format --task <slug>` | `format` | `format-unconfigured` → listed under Not verified |
| 8 | model → human ⏸ | review offer with `review --estimate` text | `gate` | *run* / *skip — verification incomplete*; headless default: run |
| 9 | code | `review --task <slug> [--requirement … --evidence -]`; dependents from `relates`/`refs --exact` passed as `--context` | `review` | waiting checks → ⏸ approve/decline each (both release); re-run once with the answers |
| 10 | model | verifies each finding against the code; fixes accepted in-scope ones; `check --only` again; `review` again | `check`, `review` | review ≤ 2 per iteration (repeat limit); a finding that expands scope → ⏸ *out of scope — list under Remaining* |
| 11 | model | `$A route next` → report step: `policy stage before-report`; the generated **Evidence** and **Not verified** | ≤ 3 KB | — |
| 12 | model | writes **Done** and **Remaining**; pastes the generated sections; `note save --kind notes` only if the plan has more iterations | `note`? | — |
| 13 | hook | Stop: generated sections unchanged; "tests pass" ⇔ `check {green}`; red before green for a defect brief; every declined key under Not verified; `exit` | — | — |

## LSP in this route (D1)

- Loaded by the model only at step 6, when files are open and symbols known. The step text says:
  "If an LSP plugin is installed (`<name>` per init), diagnostics appear after each edit; fix them
  in the same step. For references use `$A refs --exact`; the LSP tool's first `findReferences` is
  partial for 5–11 s (M9)."
- Never required. No `ToolSearch select:LSP` step. Absence costs nothing and is not reported as a gap.

## Measured acceptance (33 §5)

On the new task suite (10 defect tickets with a hidden failing test): hidden test passes
(with) > (without) beyond the spread; `check {red}` then `check {green}` in 100% of with-runs; no
weakened assertion (diff check); cost ≤ 1.2x unless the pass gain pays for it.

## What changes from v0.4.0

`check --only`, `format`, baseline scoping, caller inventory by code, LSP advisory, generated report
sections, review estimate gate, repeat limits, no `prepare-output.md`/`requirements-mcp.md`.

## Open problems

- P18 Edits are unmeasured until the suite exists; every "ask" rule on edits ships off.
- P27 Red/green for non-defect briefs (a feature) is "the new test fails before the change"; some
  briefs have no failing-first test (config, docs). The route accepts `limit {no-red}` with a stated
  observation; the report shows it. Whether reviewers accept that as honest is a human judgment.
- P28 `index build` after each check: 0.15–0.5 s warm; on a 4,000-file project cold 6 s once. If the
  background build is still running when step 4 needs it, step 4 falls back to grep and says so.
