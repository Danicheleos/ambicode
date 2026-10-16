# Skill: review (user-invoked)

## Purpose

Run the pinned, checked, independently reviewed pipeline on one target and read back exactly what it
said, including what it did not cover. **The claim** (01 §1): safe publication, checked coverage,
validated findings. Measured by `complete` share ≥ 90% when no check waits, location validity 100%,
and the accepted rate per repository. The "finds more than the naked model" claim is a separate
hypothesis with its own decision point (33 §6).

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
| 2 | model | `when args.hasRequirement` (headless: only `--requirement`, D17): fetches sources (+children, field lists); `$A route next` | `requirement ×N`; `envelope {asked, missingAsked}` | **every missing-source outcome stops** (G5): `requirements-server-disconnected`, `requirements-server-ambiguous`, `requirements-not-captured-twice` (registry `policy: {review: stop}`, #65) and ⛔ `requirements-missing` when any asked source has no complete capture (two `--requirement`, one captured; a list-only `search*` hit; an unrecognised payload) — a refusal of the `ground` step, the route stays at `ground` (no `exit`, #143), each missing source named; never a quality review instead. A quality review is `/ambicode:review` typed **without** `--requirement` |
| 3 | code (tail) | `review --estimate`: files, lines, checks and decisions, waiting keys, snapshot bytes, history if any | ≤ 2 KB | ⛔ `input-too-large` / `snapshot-too-large` surface here with `--only/--exclude` suggestions |
| 4 | human ⏸ `estimate` | *run* / *narrow (--only/--exclude …)* / *skip* | `gate` | release *skip*; **default: skip**; evals pass `--answer estimate=run` at `route start` (#44) — honoured only from a **trusted** start (the prompt through the hook, or the harness channel; a model-typed start declines it, 12 §2.4, G1, P58) |
| 5 | model → code `review-run` (`repeat: 2`) | on *run* the gate names `$A review …`; dependents: `relates` (index) when present, else the name search (≤ 8) — **unchanged with `index: none`**; no language service (D8) | `search`, `review` | waiting checks → `check-only-unauthorized` per key ⏸ approve/decline (default decline); approve → `revise review-run` (`$raisedBy`), so the re-run is a route step (#77); at `repeat` the declined keys stay under Not verified |
| 6 | model | reads the four parts back as printed; the "not covered" block verbatim | — | Stop (b): the block present verbatim |
| 7 | model | findings and `--mr` → `view --review <id>` in the background; the tokened URL as a link | — | — |
| 8 | human ⏸ | selects and submits on the page | — | publication stays human-only |
| 9 | code | records offered/selected/edited/posted per finding (`metrics.jsonl`) | — | — |

## Ceremony budget

`route next` ×0–1 (after fetch, when a requirement exists), the `estimate` gate ×1: **1–2**; work
commands: `review` ×1–2. Turns reported, not gated (D10).

## Measured acceptance (33 §6)

`complete` ≥ 90% with no waiting check (live reviewer tier, ≈ $8–16, #60); location validity 100%;
accepted rate tracked. Finder decision point: live-reviewer thread recall ≤ naked at > 1.5x cost over
3 runs → the user decides whether review is described as a publication tool (01 §1 then says so).

## What changes from v0.5.0

Estimate gate with a non-acting default; index dependents when present; verbatim coverage checked;
selection metrics; user-invoked only (the trade above); no LSP, no `impact.md` LSP procedure, no
language-service dependents.

## Open problems

- P19 Replay-miss blocks measurement; the live tier is the answer.
- P29 Python dependents are names only.
- P51 Colliding names in dependents: flagged, not resolved.
