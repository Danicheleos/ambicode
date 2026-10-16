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
| 1 | hook/code | `route start`: one target from args (`--branch`, `--base`, `--mr <url>`) | start message | ⛔ `conflicting-target`, `baseline-not-applicable` |
| 2 `fetch`, `ground` | model, code | `when args.hasRequirement` (headless: only `--requirement`, D17): fetches each asked URL with the MCP tools, `route next`; `ground` builds the envelope from the captures (`asked`, `missingAsked`) | `requirement ×N`; `envelope` | every missing-source outcome stops (G5): ⛔ `requirements-missing` when any asked source has no capture — a refusal of the `ground` step, the route stays at `ground` (no `exit`, #143); `requirements-not-captured-twice` has `policy: {review: stop}` (#65). A quality review is `/ambicode:review` typed **without** `--requirement` |
| 3 `mr-template`, `mr-fetch` | code, model | `when args.hasMergeRequest`: `script(mr-diff)` names the two GitLab MCP calls; the model makes them, every page of the diff; the hook records `capture {what: mr-diff}` | `capture` | `mr-diff-missing` until a diff is captured |
| 4 `estimate-step`, `estimate` ⏸ | code, human | `review --estimate`: files, lines, checks and decisions, waiting keys, snapshot bytes, history if any; the gate: *run* / *narrow (--only/--exclude …)* / *skip* | `gate` | ⛔ `input-too-large` / `snapshot-too-large` surface here with suggestions; release *skip*; **default: skip**; evals pass `--answer estimate=run` at `route start` (#44) — honoured only from a **trusted** start (12 §2.4, G1, P58) |
| 5 `review-run`, `brief` | code | `when estimate is run`: `review.evaluate` judges the latest review (waiting checks raise `review-checks` ⏸ *with* / *without* / *no review*, default *without*; the model's `review` command writes `review{pending}`); `policy.stage(before-work)` and `script(brief)` write `brief.md` | `review`, `policy` | waiting checks never run the reviewer; at `repeat: 2` declined keys stay under Not verified |
| 6 `review-agent` | model | invokes the `ambicode:reviewer` subagent (Read/Grep/Glob) on the snapshot and `brief.md`, pastes its JSON unchanged into `review record` | `review{recorded}` | an answer that is not the findings shape is a failed review, never a clean one |
| 7 `readback` | model | `final: true`: reads the four parts back as printed; the "not covered" block verbatim in one fenced block | — | Stop (b): the block present verbatim |
| 8 `publish-list`, `publish` ⏸ | code, human | `--mr` only: the recorded findings as a numbered list (none ends the route); *all* / *none* or a number list | `gate` | **default: none**; *all* is acting |
| 9 `publish-run` | model | `when publish isnt none`: posts exactly the selected findings through the GitLab MCP server's discussion tool, one call per finding, new path and line as printed; `final: true` | — | **model-obeyed (C2, accepted 2026-10-09)**: nothing in code checks what was posted |

## Ceremony budget

`route next` ×0–1 (after fetch, when a requirement exists), the `estimate` gate ×1: **1–2**; work
commands: `review` ×1–2, `review record` ×1, the reviewer's `Agent` call ×1. Not gated (D10).

## Measured acceptance (33 §6)

`complete` ≥ 90% with no waiting check (live reviewer tier, ≈ $8–16, #60); location validity 100%;
accepted rate tracked. Finder decision point: live-reviewer thread recall ≤ naked at > 1.5x cost over
3 runs → the user decides whether review is described as a publication tool (01 §1 then says so).

## What changes from v0.5.0

Estimate gate with a non-acting default; the reviewer is a read-only subagent; verbatim coverage
checked; merge-request publication by the model after a gate (no provider, no page, no selection
metrics); user-invoked only (the trade above); no LSP, no language-service dependents.

## Open problems

- P19 Replay-miss blocks measurement; the live tier is the answer.
- P29 Dependents are what the reviewer greps for; nothing is resolved by code.
- P62 Publication correctness (right findings, right lines, nothing extra) rests on the model.

## v7 changes

Each reviewer run needs a fresh acting acceptance (`review-offer`, `estimate`, `review-again`); `review-checks` does not run the reviewer by default.
