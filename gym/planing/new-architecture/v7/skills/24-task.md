# Skill: task (user-invoked)

## Purpose

Make one bounded code change with the record to prove it: baseline, confirmed map, callers of
changed symbols from the name search (with collisions flagged), a test that fails first (and ran),
the smallest fix, format, affected checks, an independent review offered, and a report whose
Evidence and Not verified come from the ledger. **The bar** (01 §1): pass(with) > pass(without) on
the hidden-test suite at ≤ 1.2x cost, with the suite's detectable effect stated (33 §5, #61).

## Trigger

`/ambicode:task <request | url | key | "iteration N of <slug>"> [--requirement <url>]… [--plan <file>] [--from-draft]` only.

## What the model loads

`SKILL.md` ≤ 2.5 KB: the judgments (smallest coherent change; reuse before adding; never weaken a
test; ask when a finding expands scope), the git boundary with its reason, the two prose report
parts, the fallback start line.

## Route `task`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: slug from args or the plan's directory; `note list` → the latest `plan` (or `--plan <file>`); `notes.md` iteration header; template `when args.hasRequirement` (headless: only `--requirement`, D17) | ≤ 4 KB | `plan.isDraft` and no `--from-draft` → declared gate `draft-ok` ⏸ *implement anyway (recorded)* / *stop*; **default: stop** |
| 2 | code (start tail) | `checks.baseline`; `map --mode context` from the brief's paths/symbols (layers from config); caller inventory: `refs` (grep -w) for every symbol the brief re-signs, collisions flagged from the harvest; `policy stage before-work`; detached `index build` | `baseline`, `map`, `search`, `policy`; ≤ 9 KB (file if larger) | — |
| 3 | model `red` | one line that pre-existing dirty files stay out of this task's review; the regression test; `$A check --task <slug> <key> --only <spec> --phase red` | `check {red, summary.failed ≥ 1}` | `propose` → raised gate `check-only-unauthorized` ⏸ approve/decline (default decline); no test possible → `limit {no-red}` with the stated observation |
| 4 | model `green` | **green**: the smallest change; a `collides` caller → verify its import before editing; `$A check … --phase green`; then `$A format --task <slug>` (model-run, #48) | `check {green, exit 0, summary.ran ≥ 1}`, `format` | `format-unconfigured` → Not verified |
| 5 | human ⏸ `review-offer` (tail of `format`) | the `--estimate` text; *run* / *skip — verification incomplete* | `gate`, answer | **default: skip**; evals pass `--answer review-offer=run` at `route start` (#44) — honoured only from a **trusted** start (hook or harness channel; a model-typed `--headless` start declines it, 12 §2.4, G1, P58) |
| 6 | model → code `review-run` (`repeat: 2`) | on *run* the gate text names `$A review --task <slug> [--requirement …]`; dependents from `relates` (index) or the name search as `--context`. The command's tail **evaluates**: in-scope findings and `fix` under its `repeat` → `revise fix` (this is also how `fix` is entered the first time, since its kinds already exist in its window; the first entry counts as `fix`'s first execution, the second `revise fix` as its second; the third is refused with `limit`, #103); waiting keys → raised gate per key; else → report step | `review`, `revise?` | waiting checks → `check-only-unauthorized` per key ⏸ approve/decline (default decline); approve → `revise review-run` (`$raisedBy`, #77) |
| 7 | model `fix` (`repeat: 2`) | verifies findings; fixes accepted in-scope ones; `$A check … --phase green` again; then `$A review --task` again (→ step 6's tail evaluates once more) | `check{green}`, `review` (#105) | `fix` at its `repeat` → remaining findings go to **Remaining**, forward to the report; check ≤ 5 per phase; a scope-expanding finding → raised gate `scope-expanding` ⏸ *out of scope* (default: out of scope) |
| 8 | code (tail of the last `review` or `check`) | report step: `before-report`, generated Evidence / Not verified | ≤ 3 KB | — |
| 9 | model | **Done** and **Remaining**; pastes the generated sections; `note save --kind notes --iteration N` when the plan has more iterations | `note`? | the report is the route's artifact (Stop (b)) |
| 10 | hook | Stop (b): sections unchanged; "tests pass" ⇔ `check {green, ran ≥ 1}`; red before green for a defect brief; declined keys under Not verified | — | — |

## No LSP in this route (D8)

The v2 passive-diagnostics use is in the backlog with its probe. References come from `refs`
(grep -w) with collision flags; the step text tells the model to verify a colliding caller's import
before editing it (P51).

## Ceremony budget

| Path | `route next` | gates | `note save` | **ceremony** | work commands |
|---|---|---|---|---|---|
| review skipped | 0 (every step ends in a command whose tail advances) | 1 (`review-offer`) | 0–1 | **1–2** | `check` ×2, `format` ×1 |
| + red check under `propose` | 0 | +1 (`check-only-unauthorized`) | | +1 | |
| review run, no findings | 0 | 1 | 0–1 | **1–2** | + `review` ×1 |
| review run, one fix round | 0 | 1 (+1 per waiting key, + scope gate) | 0–1 | **1–3** | + `check` ×1, `review` ×1 |
| review run, two fix rounds (`fix` at `repeat`: entered once, revised once) | 0 | as above | 0–1 | **1–3** | + `check` ×2, `review` ×2 |

Ceremony and work per 12 §3.1 (#82). If P48 fails, +1 `route next` after each gate. v2 claimed 5–8
by counting work commands as ceremony; the v2 engine would in fact have needed 10–12 (#45). Turns
reported, not gated (D10).

## Measured acceptance (33 §5)

Hidden test passes (with) vs (without), with the minimum detectable effect for 10 cases × 3 runs
stated (≈ 20 pp); `check {red}` then `check {green}` with summaries in 100% of with-runs; no weakened
assertion; cost ≤ 1.2x. No third arm (nothing to isolate without LSP). The user decides (D10).

## What changes from v0.4.0

`check --only` with summaries, model-run `format`, baseline scoping, caller inventory by code with
collision flags, generated report sections, estimate gate (default skip), re-entry for the fix
round, `--plan`, `--from-draft`, iteration header. No LSP.

## Open problems

- P18 Edits unmeasured until the suite; edit-time asks ship off.
- P27 Briefs with no failing-first test: `limit {no-red}` with a stated observation.
- P28 Background index not ready → grep fallback, stated.
- P49 Detectable effect of the suite.
- P51 Colliding callers without an exact tool.

## v7 changes

Code steps after a model step run in the same `route next` (`chain: next`, `final: true` on the last step); no-red ends with `limit{no-red}` + `exit{human}`. `fix.when: revised`; after a fix round the route raises `review-again` (16 v7 changes). `before-checks` is delivered at `green`.
