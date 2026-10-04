# Skill: investigate (user-invoked)

## Purpose

Answer one bounded question about the code with cited evidence, editing nothing, and leave a note
the plan route reads. **The bar** (01 §1): recall within the noise band of the naked model at
≤ 1.15x cost and within the route's ceremony budget. The expected win is cost against v0.4.0 and a
cited note that feeds plan; the quality win is claimed in plan and task, not here.

The 2026-09-30 walk (M23, n = 4, a mechanics read) is the evidence for the slim shape: the slim body
ran `prepare` 4/4 vs 0/4, cut it 0/4, P 0.35 vs 0.22, R 0.31 vs 0.23, cost 1.18 vs 1.26, and took
**more** turns (20.3 vs 18.0). This route keeps the slim body and takes the turns out by moving
steps into code.

## Trigger

`/ambicode:investigate <question | url | key> [--requirement <url>]…` only. No LSP (D1).

## What the model loads

`SKILL.md` ≤ 2 KB: what an investigation is, the judgment asked (≥ 2 hypotheses; confirm or reject
each candidate; facts apart from assumptions), the read-only boundary with its reason, and the
fallback line "if no step message appeared, run `$A route start investigate "$ARGUMENTS"`".

## Route `investigate`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: slug; `when args.hasRequirement` → requirements template ("fetch, expand, then `route next`"); else → ground directly (step 3) | ≤ 4 KB | ⛔ `config-missing`; two projects → gate, release `route next --project` |
| 2 | model | `when args.hasRequirement`: fetches the issue and its children/links; captures happen in the hook | `requirement ×N` | ⛔ `requirements-server-disconnected` → ⏸ continue without (default: continue without) |
| 3 | model → code | `$A route next` → **ground** (once): `requirements normalize` from captures, `acs`, `map --mode prompt` (pass 1 + regex pass 2), `policy stage before-work`; prints the read step | `envelope`, `map`, `policy`, `step`; ≤ 8 KB (file if larger) | `map.empty` → a `human` step ⏸ "which directory or component?" (release and default: *search anyway*) |
| 4 | model | reads batched, then spans; ≥ 2 hypotheses; may `$A refs`/`find` | `search` | `map` repeat ≤ 2 |
| 5 | model → code | `$A route next` → report step: `policy stage before-report`, the shape (Confirmed facts / Assumptions / Unresolved / Recommendation / What would change this), the generated navigation line | `step`; ≤ 2 KB | — |
| 6 | model | writes the answer; `$A note save --task <slug> --kind investigation` | `note` (produces → route complete) | — |
| 7 | hook | Stop (c): the note's `path:line` citations exist | `limit` on failure, once | — |

Diagnostics (reproduce, print a value) are proposals run only through `$A check --only` after a
human *Run it* ⏸ (default: *don't run — inconclusive*).

## Ceremony budget

`route next` ×2, `note save` ×1 = **3**; +1 when step 3 goes to a file; +1 per gate asked. The budget
is computed from the route file (33 §1), not a flat +2.

## Context budget

Fixed: start ≤ 4 KB + ground ≤ 8 KB + report ≤ 2 KB + body ≤ 2 KB = **cap 16 KB**, expected 6–8 KB.
Variable: requirement text (epic 28 KB + children 16 KB in the real run; `search*` payloads reduced to
key + summary by capture), file read-back when step 3 overflows (14.5–17.6 KB, G6). Today ≈ 21–27 KB
fixed.

## Measured acceptance (33 §2)

recall(with) within the band of recall(without), 10 cases × 3 runs, Sonnet, with typed prompts;
cost ≤ 1.15x; turns ≤ budget; `map` present with pass 2 in 100% of plugin runs; 100% of cited
`path:line` exist.

## What changes from v0.4.0

No LSP, no `ToolSearch`, no shared-reference reads, no self-reported navigation line, no "stop if
LSP finds nothing". Epic expansion. Two-pass map without an index. Ground once.

## Open problems

- P25 Batched reads vs per-candidate confirmation: accepted (the Stop hook checks citations).
- P10 Index value, measured against the regex harvest.
- P37 The typed-command entry point is a probe.
