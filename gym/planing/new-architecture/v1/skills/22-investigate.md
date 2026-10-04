# Skill: investigate (user-invoked)

## Purpose

Answer one bounded question about the code with cited evidence, editing nothing, and leave a note
the plan route reads. The measured target is the naked model's recall at no more than 1.15x its
cost and +2 turns (01 §1). The 2026-09-30 walk showed the slim body with a stated reason beat the
long body on every mechanic; this route is that slim body made structural.

## Trigger

`/ambicode:investigate <question | url | key> [--requirement <url>]…` only. No LSP (D1).

## What the model loads

`SKILL.md` ≤ 2 KB: what an investigation is, the judgment asked (form ≥ 2 hypotheses, confirm or
reject each candidate, separate facts from assumptions), the read-only boundary with its reason,
and the fallback line "if no step message appeared, run `$A route start investigate "$ARGUMENTS"`".
No procedure.

## Route `investigate`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: slug; if args hold a URL/key → requirements template with expansion steps; else → `map --mode prompt` from the request text | step ≤ 4 KB | ⛔ `config-missing` |
| 2 | model | (ticket case) fetches the issue and its children/links as the template says | — | ⛔ `requirements-server-disconnected` → ⏸ *continue without* |
| 3 | hook/code | MCP PostToolUse: `rawHash`; `requirements normalize`; `requirements acs`; `map --mode prompt` two passes; `policy stage before-work` | `requirement`, `map`, `policy`; step ≤ 8 KB (file if larger) | `map` with 0 candidates → the step says so and asks one scoping question ⏸ (release: *search anyway*) |
| 4 | model | reads: batched when nothing is known, spans from the map once it is; forms ≥ 2 hypotheses; checks each; may `$A refs`/`find` | `tool`, `search` | repeat limit: `map` ≤ 2 |
| 5 | model | `$A route next` → report step: `policy stage before-report`, the shape (Confirmed facts / Assumptions / Unresolved / Recommendation / What would change this), the generated navigation line | `step`; ≤ 2 KB | — |
| 6 | model | writes the answer; `$A note save --task <slug> --kind investigation` | `note` | — |
| 7 | hook | Stop: cited `path:line` exist; a note exists; `exit` or all steps done | `limit` on failure, once | — |

Diagnostics (reproduce, print a value) stay proposals: argv, reason, expected evidence; run only
through `$A check --only` after a human *Run it* ⏸ and a `run/propose` policy decision; release:
*don't run — answer as inconclusive*.

## Context budget

Route start (≤ 4 KB) + step 3 (≤ 8 KB) + step 5 (≤ 2 KB) + the skill body (≤ 2 KB) ≈ 16 KB worst
case, against today's ≈ 21–27 KB (body 6.5 + two references 10.1 + hook payload 4–10). Ceremony
turns: `route next` ×1, `note save` ×1 (today 3–6, M1).

## Measured acceptance (33 §2)

- recall(with) ≥ recall(without) − band, 26 cases × 3 runs, Sonnet; cost ≤ 1.15x; turns ≤ +2.
- `map` present in 100% of plugin runs (ledger), pass 2 ran in ≥ 80%.
- 100% of cited `path:line` exist.

## What changes from v0.4.0

No LSP, no `ToolSearch`, no `requirements-mcp.md` read, no `prepare-output.md` read, no
self-reported navigation line, no "stop if LSP finds nothing". Expansion of epics. Two-pass map.

## Open problems

- P25 "Read batched when nothing is known" conflicts with the shortlist discipline's "confirm each
  candidate": a batched `cat` of 8 files is a confirmation of all 8 at once; the ledger cannot tell
  which were read. Accepted: the Stop hook checks citations, not reading.
- P10 (index value unmeasured) applies here first.
