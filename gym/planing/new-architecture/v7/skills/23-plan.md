# Skill: plan (user-invoked)

> **v7 note.** B8: the plan map is seeded with the paths and symbols cited in the investigate note or brief and the acceptance-criteria identifiers; terms rank from the brief or plan iteration text, and the map entry records tuning, profile and decisions (see 10-search v7 changes).

## Purpose

Turn a request into a roadmap a human accepts before `task` implements it: requirements expanded
and numbered, the map confirmed, material decisions put to the human one at a time, iterations as
briefs with the test that must fail first, every AC mapped or listed as not covered, anchors verified
by code, **a draft saved before anyone is asked anything** (D11), and a promotion to `plan` only on
record. **The bar** (01 §1): the composite of existing-file recall, anchor validity and AC coverage
above the naked arm on ≥ 3 epics × 3 runs, composite defined in 33 §4 (#62); a tie on AC coverage
is expected (the naked model expands epics on its own, M11).

## Trigger

`/ambicode:plan <request | url | key> [--requirement <url>]…` only. No LSP, no language service (D8).

## What the model loads

`SKILL.md` ≤ 2.5 KB: the judgments (material vs routine; reuse over new; independently reviewable
iterations), the plan shape, the planning boundary with reasons, the fallback start line.
`allowed-tools` **gains** `Write(.ambicode/task/*/steps/plan-body.md)` (today: `Read, Grep, Glob,
Bash(node *ambicode.mjs*)`, `skills/plan/SKILL.md:5`; #57); the guard row (15 §1) stays the real boundary.

## Route `plan`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | hook/code | `route start`: slug (reuses the investigation's); `note list`; template `when args.hasRequirement` | ≤ 4 KB | ⛔ `route-busy` when another session has a live plan route on this slug, **whatever the args** (12 §2.3, G2, H2); release `--adopt` (continue from the fold — the restart after a crash), `--fresh` (restart) or `--task <slug>-2`; the former session is then refused `route-taken-over` on every write |
| 2 | model | fetches sources (+children, field lists); captures in the hook | `requirement ×N` | as investigate |
| 3 | model → code `ground` | `$A route next` → ground once: normalize (captures or args), `acs`, `map --mode context` seeded from the note's citations and the ACs' identifiers (else `prompt`), `policy stage before-work` (all but code-style) | ≤ 9 KB (file if larger) | — |
| 4 | model `design` | reads; reuse sweep with `$A find`; design and alternatives; for each material decision an `AskUserQuestion` carrying `[ambicode gate decision:<slug>]` (12 §3.5) | `search`; `gate {class: decision}` + `acceptance {via: hook}` per decision | registry: release *keep open — the plan stays a draft*; **default: keep open** |
| 5 | model → code | `$A route next` → plan step: shape, `policy stage before-report`, the AC id list, the navigation line | ≤ 3 KB | — |
| 6 | model `plan-write` (`repeat: 3`) | writes the plan **once** into `steps/plan-body.md`: AC → section table; briefs (*Goal, Changes path:line, Tests (fails first), Accept, Checks by key, Leaves out*); then `$A plan check --from steps/plan-body.md` | — | — |
| 7 | code (tail of `plan check`, a work command) | **`note save --kind plan-draft --from steps/plan-body.md` first** (the draft exists from here on, D11); then anchors, ACs, duplicates — plain code, no proposal gate (#85) | `note {plan-draft}`, `worker {plan-check}` | `onFail: revise plan-write` with the bad list (≤ 2 automatic revisions per human cycle = 3 writes and 3 checks; the bound is `plan-write`'s `repeat`, this step's own default 1 does not block the re-entry, 12 §4, G3); then the remainder goes into Known limitations and the route moves on |
| 8 | human ⏸ `plan-accept` (`maxRevises: 3`, `object: note{plan-draft}`) | `AskUserQuestion` *Accept* / *Revise (N left)* / *Reject*; the question names the draft it is about (`plan-draft_<ts>.md`, hash first 12; 12 §3.4, G2) and ends with `[ambicode gate plan-accept <instance>]`, the id of this print's `gate` entry (C2) (the `ExitPlanMode` path is in the backlog, D12) | `gate {gate: plan-accept, print, object}` per print (its `id` is the instance, M2); `acceptance {gate: plan-accept, instance, via, object: {kind: note, value: plan-draft, id, path, contentHash}}` copied from that instance (#145, C2) | release *Reject* (draft stays); `onAnswer: {Revise: revise design}` — a **human cycle**: `design`/`plan-write` counters reset, so a Revise after two failed checks still re-opens design (D14, #75); **default: keep the draft** |
| 9 | code (gate tail, P48) | on *Accept*: `note promote` → `plan_<ts>.md` **for the accepted draft only** (13 §3 predicate: same hash, latest answer Accept, not yet promoted) | `note {plan, promotedFrom}` (produces → complete) | `plan-not-accepted {reason}` when the acceptance is not honoured per 12 §3.4 or names another draft (G2); `onFail: revise plan-accept` re-prints the gate for the new draft (32 §3, 12 §4, #134) |
| 10 | hook | Stop (c): the latest note's citations; no "accepted" without an acceptance entry | — | — |

Scout and judge workers: not in v4 (17 appendix).

## Ceremony budget

| Path | `route next` | gates | **ceremony** | work (`plan check`) |
|---|---|---|---|---|
| straight through, N decisions | 2 | N + 1 (accept) | **3 + N** | 1 |
| one automatic `plan check` revision | 2 | N + 1 | 3 + N | 2 |
| *Revise* once (human cycle) | +1 (after re-design) | +1 | +2 | +1 |

`plan check` is a work command, not ceremony (12 §3.1, #82). +1 per file-delivered step. If P48
fails (the gate hook cannot print the next step), +1 `route next` after each gate. Turns reported,
not gated (D10).

## Context budget

Fixed cap ≈ 18.5 KB (start 4 + ground 9 + plan step 3 + body 2.5). Variable: requirement text (up to
10 children; field lists), file read-back, and the plan body itself, emitted **once** (the real run
emitted 78 KB twice after the guard false positive, M12 fixed; the second emission was ~80k of the
214k peak). The peak is measured in 33 §7, both arms.

## Measured acceptance (33 §4)

3 epics × 3 runs × 2 arms (naked / route) with the real-run runner rebuilt as one process (MCP is
lost on `--resume`); hand-labelled ACs; `plan check` as the anchor grader; ≈ $32–45 per decision
(#59). The composite: win beyond the naked arm's run-to-run spread on ≥ 2 of 3 metrics with no loss
beyond the spread on the third (33 §4). The result is presented; the user decides (D10).

## What changes from v0.4.0

Expansion; AC table; `plan check` with re-entry; **draft saved before the gate**; promotion instead
of a `plan` save; decision gates bound by id; plan body written once; `Write` grant for the one file;
no LSP.

## Open problems

- P26 Anchor forms: of the measured plans, the full arm had 23/26 identifier-quoting anchors correct,
  the neutral arm 14/17, the naked arm 12/12; the 6 misses were whole-file replacements or quotes of
  new code, not wrong anchors; prose-range anchors ("replace lines 11–35") get the range check only.
- P2 the AskUserQuestion hook payload (binding by marker); P3 late answers; P46 model-raised decisions.
- P55 `maxRevises: 3` is a guess; a fourth round means `route start --fresh` with the draft kept.
- A `route start --answer plan-accept=Accept` from a **trusted** start (hook or harness, 12 §2.4,
  G1) is a `preanswer` consumed at the gate and bound to the draft present then (G2): it survives
  `plan check` revisions and accepts an artifact nobody has seen — the report says so (P42). From
  `channel: cli` it is `declined` (#138).
