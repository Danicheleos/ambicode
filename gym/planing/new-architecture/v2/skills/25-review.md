# Skill: review (user-invoked)

## Purpose

Run the pinned, checked, independently reviewed pipeline on one target and read back exactly what it
said, including what it did not cover. **The claim** (01 §1): safe publication, checked coverage,
validated findings. Measured by `complete` share ≥ 90% when no check waits, location validity 100%,
and the accepted rate per repository. The "finds more than the naked model" claim is a separate
hypothesis with its own kill (33 §6).

## Trigger

`/ambicode:review [--branch [--base <ref>] | --mr <url>] [--requirement <url>]…` only.

**The D2 trade, stated:** a natural-language "review my change" now goes to Claude Code's built-in
`code-review` skill (seen in trace `e-ExZhbm`), not to AMBICODE. AMBICODE's review runs only when
typed. The user chose this; the consequence is that the pipeline's safety properties apply only to
typed invocations.

## What the model loads

`SKILL.md` ≤ 2 KB: what the pipeline is, the four reporting rules with reasons (empty ≠ clean; failed
reviewer ≠ clean; skipped check ≠ pass; one bad location voids), the fallback start line.
`merge-request.md` and `outcomes.md` are named by the step text when needed.

## Route `review`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: one target from args; template `when args.hasRequirement` | ≤ 3 KB | ⛔ `conflicting-target`, `baseline-not-applicable` |
| 2 | model | fetches sources (+children); `$A route next` | `requirement ×N` | ⛔ retrieval failure stops the review (never a quality review instead) |
| 3 | code | `review --estimate`: files, lines, checks and decisions, waiting keys, snapshot bytes, history if any | ≤ 2 KB | ⛔ `input-too-large` / `snapshot-too-large` surface here with `--only/--exclude` suggestions |
| 4 | human ⏸ | *run* / *narrow (--only/--exclude …)* / *skip* | `gate` | release *skip*; **default: skip** (evals pass `--default estimate=run`) |
| 5 | code | dependents: index (`relates`, `refs --exact`) when present, else the name search (≤ 8) — **unchanged with `index: none`** | `search` | — |
| 6 | code | `review …` | `review` | waiting checks → ⏸ approve/decline each (default decline); one re-run |
| 7 | model | reads the four parts back as printed; the "not covered" block verbatim | — | Stop (b): the block present verbatim |
| 8 | model | findings and `--mr` → `view --review <id>` in the background; the tokened URL as a link | — | — |
| 9 | human ⏸ | selects and submits on the page | — | publication stays human-only |
| 10 | code | records offered/selected/edited/posted per finding (`metrics.jsonl`) | — | — |

## Ceremony budget

`route next` ×1 (after fetch, when a requirement exists), the estimate gate ×1, `review` ×1–2: **2–4**.

## Measured acceptance (33 §6)

`complete` ≥ 90% with no waiting check (after the replay fix or on a live tier); location validity
100%; accepted rate tracked. Finder kill: live-reviewer thread recall ≤ naked at > 1.5x cost over 3
runs → review is a publication tool, and 01 §1 says so.

## What changes from v0.4.0

Estimate gate with a non-acting default; index dependents when present; verbatim coverage checked;
selection metrics; user-invoked only (the trade above); no LSP, no `impact.md` LSP procedure.

## Open problems

- P19 Replay-miss blocks measurement.
- P29 Python dependents are names only.
- P30 Review dependents are unchanged in the default configuration; the index path is measured in
  33 §6 with planted caller breaks.
