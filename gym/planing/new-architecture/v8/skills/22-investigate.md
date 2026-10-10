# Skill: investigate (user-invoked)

## Purpose

Answer one bounded question about the code with cited evidence, editing nothing, and leave a note
the plan route reads. **The bar** (01 §1, confirmed by the user, D7): recall within the noise band
of the naked model at ≤ 1.15x cost; turns reported against the ceremony budget. The expected win is
cost against v0.5.0 and a cited note that feeds plan; the quality win is claimed in plan and task,
not here. Because every module is behind an interface, investigate can later be tuned on its own
(layers, pass count, step text) without touching the other skills.

The 2026-09-30 walk (M23, n = 4, a mechanics read) is the evidence for the slim shape: the slim body
ran `prepare` 4/4 vs 0/4, cut it 0/4, P 0.35 vs 0.22, R 0.31 vs 0.23, cost 1.18 vs 1.26, and took
**more** turns (20.3 vs 18.0). This route keeps the slim body and takes the turns out by moving
steps into code.

## Trigger

`/ambicode:investigate <question | url | key> [--requirement <url>]…` only. No LSP, no language
service (D8).

## What the model loads

`SKILL.md` ≤ 2 KB: what an investigation is, the judgment asked (≥ 2 hypotheses; confirm or reject
each candidate; facts apart from assumptions), the read-only boundary with its reason, and the
fallback line "if no step message appeared, run `$A route start investigate "$ARGUMENTS"`".

## Route `investigate`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: slug; `when args.hasRequirement` (14: URL, `--requirement`, or a bare key with a bound server; **headless: only `--requirement`**, D17) → requirements template ("fetch with the field lists; if the JQL has > 10 hits stop and `route next`; else read the children, then `route next`"); else → ground directly (step 3) | ≤ 4 KB | ⛔ `config-missing`; two projects → raised gate `project-ambiguous` (default *stop*), release `route next --project` |
| 2 | model | `when args.hasRequirement`: fetches the issue and its children/links; captures happen in the hook | `requirement ×N` | `requirements-server-disconnected` → raised gate ⏸ continue without (default: continue with an args envelope); > 10 children → `requirements-expansion-capped` before the child reads (+1 `route next`, #81) |
| 3 | model → code `ground` (`repeat: 2`) | `$A route next` → **ground** (once): `requirements normalize` (captures or args), `acs`, `map --mode prompt` with the configured layers, `policy stage before-work`; prints the read step | `envelope`, `map`, `policy`, `step`; ≤ 8 KB (file if larger) | — |
| 3a | human ⏸ `scope` | `when map.empty`: "which directory or component?" | `acceptance` | release and default: *search anyway*; `onAnswer: {"*": revise ground --term $answer}` (#66, #86) |
| 4 | model `read` | reads batched, then spans; ≥ 2 hypotheses; may `$A refs`/`find`; a `collides` name → verify imports | `search` | `ground` repeat 2 (12 §5) |
| 5 | model → code | `$A route next` → report step: `policy stage before-report`, the shape (Confirmed facts / Assumptions / Unresolved / Recommendation / What would change this), the generated navigation line | `step`; ≤ 2 KB | — |
| 6 | model | writes the answer; `$A note save --task <slug> --kind investigation` | `note` (produces → route complete) | — |
| 7 | hook | Stop (c): the note's `path:line` citations exist | `limit` on failure, once | — |

Diagnostics (reproduce, print a value) are proposals run only through `$A check --only` after the
raised gate `check-only-unauthorized` ⏸ *Run it* (default: *don't run — inconclusive*).

## Ceremony budget (12 §3.1 rule: a code step after a model step costs one command)

| Path | `route next` | `note save` | gates | **ceremony** | work commands |
|---|---|---|---|---|---|
| no requirement (sandbox) | 1 (after reading → report step) | 1 | 0 | **2** | 0 |
| with requirement | 2 (after fetch; after reading) | 1 | 0 | **3** | 0 |
| + > 10 children (expansion gate) | +1 (the early stop) | | +1 | +2 | |
| + `scope` gate | +0 (the hook tail re-runs ground, P48) | | +1 | +1 | |
| + a diagnostic under `propose` | | | +1 (`check-only-unauthorized`) | +1 | `check --only` ×1 |

+1 when step 3 goes to a file. Ceremony and work are defined in 12 §3.1. Turns are **reported**,
not gated (D10).

## Context budget

Fixed: start ≤ 4 KB + ground ≤ 8 KB + report ≤ 2 KB + body ≤ 2 KB = **cap 16 KB**, expected 6–8 KB.
Variable: requirement text (epic 28 KB + children 16 KB in the real run; the JQL field list is the
only lever for `search*` payloads, 14 §2), file read-back when step 3 overflows (14.5–17.6 KB, G6).
Today ≈ 21–27 KB fixed. Peak measured in 33 §7.

## Measured acceptance (33 §2)

recall(with) within the band of recall(without): `evals:decide` (26 cases × 3 runs, plugin arm with
`prompt.with.md`) gated against the **cached 2026-10-02 baseline**, whose naked arm is the reference
because the naked `prompt.md` does not change (D19, #87); cost ≤ 1.15x; turns reported against 2–3;
`map` present with pass 2 in 100% of plugin runs; 100% of cited `path:line` exist. The decision to
proceed or roll back is the user's (D10).

## What changes from v0.5.0

No LSP, no `ToolSearch`, no shared-reference reads, no self-reported navigation line, no "stop if
LSP finds nothing". Epic expansion with field lists. Two-pass map without an index, layers explicit.
Ground once. Args envelope when nothing is fetched.

## Open problems

- P25 Batched reads vs per-candidate confirmation: accepted (the Stop hook checks citations).
- P10 Index value, measured against the regex harvest.
- P37 The typed-command entry point is a probe.
- P51 Colliding names without an exact tool.

## v7 changes

Investigate has no report step: the route ends at `read` with `answer: note`, and `engine.stopHook` saves the final message as the investigation note and advances the route. A dismissed gate question exits `human` with reason `dismissed`. The `scope` question explains how to come back with more context (re-type the skill).
