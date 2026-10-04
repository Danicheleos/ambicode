# Skill: plan (user-invoked)

## Purpose

Turn a request into a roadmap a human accepts before `task` implements it: requirements expanded
and numbered, the map confirmed, material decisions put to the human one at a time, iterations as
briefs with the test that must fail first, every AC mapped or listed as not covered, anchors verified
by code, and a save that claims acceptance only on record. **The bar** (01 §1): the composite of
existing-file recall, anchor validity and AC coverage above the naked arm on ≥ 3 epics × 3 runs; a
tie on AC coverage is expected (the naked model expands epics on its own, M11).

## Trigger

`/ambicode:plan <request | url | key> [--requirement <url>]…` only. No LSP (D1).

## What the model loads

`SKILL.md` ≤ 2.5 KB: the judgments (material vs routine; reuse over new; independently reviewable
iterations), the plan shape, the planning boundary with reasons, the fallback start line.

## Route `plan`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: slug (reuses the investigation's); `note list`; template `when args.hasRequirement` | ≤ 4 KB | — |
| 2 | model | fetches sources (+children); captures in the hook | `requirement ×N` | as investigate |
| 3 | model → code | `$A route next` → ground once: normalize, `acs`, `map --mode context` seeded from the note's citations and the ACs' identifiers (else `prompt`), `policy stage before-work` (all but code-style) | ≤ 9 KB (file if larger) | — |
| 4 | model | reads; reuse sweep with `$A find`; design and alternatives | `search` | `map` ≤ 2 |
| 5 | model → human ⏸ | one question per material decision, options + cost + recommendation | `gate`, `acceptance {via}` per decision | release *keep open — plan stays draft*; **default: keep open** (plan becomes draft) |
| 6 | model → code | `$A route next` → plan step: shape, `policy stage before-report`, the AC id list, the navigation line | ≤ 3 KB | — |
| 7 | model | writes the plan **once** into `steps/plan-body.md` (the guard allows it): AC → section table; briefs (*Goal, Changes path:line, Tests (fails first), Accept, Checks by key, Leaves out*) | — | — |
| 8 | code | `plan check --from steps/plan-body.md` | `worker {plan-check}` | ↩ ≤ 2 rounds; remainder into Known limitations |
| 9 | human ⏸ | acceptance: `ExitPlanMode` in plan mode, else AskUserQuestion *Accept and save* / *Revise* / *Reject* | `acceptance {gate: plan-accept, via}` | release *Reject*; ↩ *Revise* → 4; **default: draft** |
| 10 | model | `$A note save --task <slug> --kind plan --from steps/plan-body.md` → refused without `acceptance {via: hook}` (or headless) → `--kind plan-draft` | `note` (produces → complete) | — |
| 11 | hook | Stop (c): the note's citations; no "accepted" without an acceptance entry | — | — |

Scout and judge workers: not in v2 (17 appendix).

## Ceremony budget

`route next` ×2, `note save` ×1, `plan check` ×1 (code, no turn) = **3** + one AskUserQuestion per
material decision + 1 acceptance; +1 per file-delivered step.

## Context budget

Fixed cap ≈ 18.5 KB (start 4 + ground 9 + plan step 3 + body 2.5). Variable: requirement text (up to
10 children), file read-back, and the plan body itself, emitted **once** (the real run emitted 78 KB
twice after the guard false positive, M12 fixed; the second emission was ~80k of the 214k peak). The
peak is measured in 33 §7, both arms.

## Measured acceptance (33 §4)

3 epics × 3 runs × 2 arms (naked / route) with the real-run runner rebuilt as one process (MCP is
lost on `--resume`); hand-labelled ACs; `plan check` as the anchor grader; cost ≈ $50–70 per decision.
Kill: the route does not beat naked on the composite.

## What changes from v0.4.0

Expansion; AC table; `plan check`; headless draft on record; CLI refuses an unaccepted `plan` kind;
plan body written once; no LSP.

## Open problems

- P26 Anchor forms: of the measured plans, the full arm had 23/26 identifier-quoting anchors correct,
  the neutral arm 14/17, the naked arm 12/12; the 6 misses were whole-file replacements or quotes of
  new code, not wrong anchors; prose-range anchors ("replace lines 11–35") get the range check only.
- P2 acceptance via hooks; P3 late answers.
