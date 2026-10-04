# Skill: rules (user-invoked)

## Purpose

Turn written team rules into scoped YAML packs, once, every rule quoted from its source, nothing
live before the human confirms the disposition table, one-command revert.

## Trigger

`/ambicode:rules [sources…]` only.

## What the model loads

`SKILL.md` ≤ 2.5 KB: the scope judgment (global vs path pattern), the drafting rules (one instruction
per rule, verbatim quote, prefer `observed`, drop version-bound API rules), the fallback start line.
`pack-format.md` stays as a reference named by the drafting step.

## Route `rules`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | code | `rules discover`; Confluence URLs → the Requirements template (capture on read) | ≤ 2 KB | — |
| 2 | human ⏸ `sources` | pick sources (multi-select) | `acceptance` | release *none — stop*; default: the files named in args, else `exit human` |
| 3 | code (gate tail) | `config --json`; built-in rules for the projects | ≤ 4 KB | — |
| 4 | model `draft` (`repeat: 3`) | drafts under `.ambicode/policies/drafts/` with `source.quote`, `source.location`, globs from the real layout; then `$A policy check --drafts` | Write allowed under `drafts/` only | — |
| 5 | code (tail of `policy check`) | schema, loader rules, glob counts, quotes, duplicates | diagnostics | `onFail: revise draft`; past `repeat` → "not migrated: <reason>" per rule, forward |
| 6 | model | the disposition table; puts the gate to the human | — | — |
| 7 | human ⏸ `rules-table` | *Apply all* / *Apply with changes* / *Discard drafts* | `acceptance {gate: rules-table}` | release *Discard*; **default: do not apply** (drafts stay) |
| 8 | model → code | *Apply* names the command: `$A rules apply`: drafts → live, `policyFiles` wired via the document API, one covered and one uncovered probe per pack | probes | ⛔ `rules-apply-unconfirmed` without an acceptance honoured per 12 §3.4 |
| 9 | model | reports table, probes, `rules revert <pack-id>` | — | Stop hook (b) |

## Ceremony

2 gates (`AskUserQuestion`) + work commands: `policy check --drafts` ×1–3, `rules apply` ×1.

## Measured acceptance

0 `pack-glob-matches-nothing` after apply; 0 near-duplicates; 100% quotes verified; 0 packs live before
step 7 (fixture with a declining fake human); source rule count equals table rows (CLI count); the
`revise draft` loop stops at 3 writes in the fixture with a permanently bad quote.

## What changes from v0.4.0

Drafts; quotes; confirmation before wiring (F7); CLI wires and probes; revert; bounded loop by
re-entry; the model no longer edits `config.yaml`.

## Open problems

- P16 duplicate threshold.
