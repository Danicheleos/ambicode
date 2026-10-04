# Skill: plan (user-invoked)

## Purpose

Turn a request into a roadmap a human accepts before `task` implements it: requirements expanded
and numbered, the map confirmed, material decisions put to the human one at a time, iterations
as briefs with the test that must fail first, every AC mapped to a section or listed as not covered,
anchors verified by code, and a save that cannot claim acceptance it did not get.

## Trigger

`/ambicode:plan <request | url | key> [--requirement <url>]…` only. No LSP (D1).

## What the model loads

`SKILL.md` ≤ 2.5 KB: the judgments (material vs routine decisions; reuse over new; iterations
independently reviewable), the plan shape (headings list), the planning boundary with reasons, and
the fallback start line.

## Route `plan`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: slug (reuses an investigation's); requirements template with expansion; `note list` | step ≤ 4 KB | ⛔ `config-missing` |
| 2 | model | fetches sources (+children) | — | as investigate |
| 3 | hook/code | normalize; `acs`; `map --mode context` seeded from the note's citations and the ACs' identifiers (else `prompt` mode); `policy stage before-work` (all but code-style) | `requirement`, `map`, `policy`; ≤ 9 KB (file if larger) | — |
| 4 | worker ⏸ | proposal: `scout` builds the file/symbol/convention map in its own context | `worker` | *run* / *inline* (default inline) / *skip* |
| 5 | model | reads (batched, then spans); reuse sweep with `$A find`; forms the design and the alternatives | `tool`, `search` | `map` ≤ 2 |
| 6 | model → human ⏸ | one question per material decision, options + cost + recommendation | `gate`, `acceptance` per decision (AskUserQuestion hook) | release: *keep open — plan stays draft*; headless default: the recommendation, `default-taken` |
| 7 | model | `$A route next` → plan step: the shape, `policy stage before-report`, the AC id list, the generated navigation line | ≤ 3 KB | — |
| 8 | model | writes the plan with the **AC → section** table and briefs (*Goal, Changes path:line, Tests (fails first), Accept, Checks by key, Leaves out*) | — | — |
| 9 | code | `plan check` on the text piped in: paths exist, `:LINE` in range, quoted identifier at anchor ±3, every AC mapped or under Not covered, no new name duplicates an export | `worker {plan-checker, code part}` | ↩ bounded 2 rounds; remaining failures go into the plan's Known limitations |
| 10 | human ⏸ | acceptance: `ExitPlanMode` in plan mode, else AskUserQuestion *Accept and save* / *Revise* / *Reject* | `acceptance` | release: *Reject*; ↩ *Revise* → 5; headless default: **draft** |
| 11 | model | `$A note save --task <slug> --kind plan` (refused without acceptance → `--kind plan-draft`) | `note` | — |
| 12 | hook | Stop: checks as investigate, plus no "accepted" without an `acceptance` | — | — |

## Context budget

Start 4 + step 3 ≤ 9 + step 7 ≤ 3 + body 2.5 ≈ 18.5 KB fixed. The real-run plan session peaked at
214k because the plan was emitted twice after a guard false positive (M12, fixed) and because the
79 KB plan lived in context; the scout (step 4) and the AC list are the levers for the reading part,
and `note save` from a file (`--from <path>` 🆕, the file written once by the model into the task's
`steps/` directory, allowed by the guard for `plan-body.md` only) removes the second emission.

## Measured acceptance (33 §4)

On ≥ 3 epics × 3 runs with the real-run runner: existing-file recall ≥ full-chain's 21/30 baseline,
anchor validity 100% by `plan check`, AC coverage ≥ naked's (the naked arm had the child ACs; this
route must too), cost ≤ 1.3x naked. The loser's numbers are reported.

## What changes from v0.4.0

Expansion; AC table; `plan check`; headless draft; CLI refuses an unaccepted `plan` kind; scout
offered; no LSP; save from file.

## Open problems

- P26 `plan check`'s "quoted identifier at anchor" assumes the plan quotes an identifier per anchor;
  prose anchors ("replace lines 11–35") pass only the range check. The measured plans had 6 of 26
  anchors in that form.
- P2 (acceptance via hooks), P3 (late human answers).
