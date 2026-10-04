# Skill: review (user-invoked)

## Purpose

Run the pinned, checked, independently reviewed pipeline on one target and read back exactly what
it said, including what it did not cover. The pipeline is kept (M18). The route adds an estimate
before spending, dependents from the index instead of LSP (D1), a verbatim coverage block checked by
the Stop hook, and the recorded selection on the publication page.

## Trigger

`/ambicode:review [--branch [--base <ref>] | --mr <url>] [--requirement <url>]…` only. The built-in
`code-review` skill no longer competes: this skill is not model-invocable, so it runs only when typed.

## What the model loads

`SKILL.md` ≤ 2 KB: what the pipeline is, the four reporting rules with their reasons (empty ≠ clean;
failed reviewer ≠ clean; skipped check ≠ pass; one bad location voids the result), the fallback
start line. `merge-request.md` and `outcomes.md` stay as references the step text points at when
needed (an `--mr` target; an error code).

## Route `review`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: target from args (exactly one); requirements template if a URL/key | ≤ 3 KB | ⛔ `conflicting-target`, `baseline-not-applicable`: the message names the flag |
| 2 | model | fetches sources (+children) if any | — | ⛔ retrieval failure stops the review (unchanged: never a quality review instead) |
| 3 | code | `review --estimate`: files, lines, checks and decisions, keys that will wait, snapshot bytes, median cost/duration | ≤ 2 KB | ⛔ `input-too-large` / `snapshot-too-large` surface here with `--only/--exclude` suggestions listing the largest paths |
| 4 | human ⏸ | *run* / *narrow (--only/--exclude …)* / *skip* | `gate` | release: skip; headless default: run |
| 5 | code | dependents: `relates` for changed files + `refs --exact` for removed/re-signed exports (index present), else the name search; passed as `--context` (local targets only) | `search` | — |
| 6 | code | `review …` | `review` | waiting checks → ⏸ approve/decline each; one re-run carries all answers; both answers release |
| 7 | model | reads the four parts back **as printed**; the "not covered" block verbatim | — | Stop hook: the block is present verbatim |
| 8 | model | findings exist and target is an MR → starts `view --review <id>` in the background and gives the tokened URL as a link | — | — |
| 9 | human ⏸ | selects and submits on the page | — | publication stays human-only |
| 10 | code | records offered/selected/edited/posted per finding into `result.json` and `.ambicode/metrics.jsonl` (D4, the production precision signal) | `metrics` | — |

## Measured acceptance (33 §6)

- `complete` on ≥ 90% of runs with no waiting check (needs the replay fix, P19, or a live tier).
- Thread recall ≥ the naked arm on the curated review cases.
- Accepted rate (selected ÷ offered) tracked per repository; a reference, not a target.

## What changes from v0.4.0

Estimate gate; index dependents, no LSP, no `impact.md` LSP procedure; verbatim coverage checked;
selection metrics; user-invoked only.

## Open problems

- P19 Review cannot be measured until the replay reviewer is re-keyed or a live tier is paid for.
- P29 Without LSP, dependents for a Python project come from the name search or tree-sitter names
  only (P13).
