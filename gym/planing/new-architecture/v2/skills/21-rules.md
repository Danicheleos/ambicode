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
| 2 | human ⏸ | pick sources (multi-select) | `acceptance` | release *none — stop*; default: the files named in args, else `exit human` |
| 3 | code | `config --json`; built-in rules for the projects | ≤ 4 KB | — |
| 4 | model | drafts under `.ambicode/policies/drafts/` with `source.quote`, `source.location`, globs from the real layout | Write allowed under `drafts/` only | — |
| 5 | code ↩ | `policy check --drafts` (schema, loader rules, glob counts, quotes, duplicates), ≤ 3 rounds | diagnostics | after 3 rounds: "not migrated: <reason>" |
| 6 | model | the disposition table | — | — |
| 7 | human ⏸ | *Apply all* / *Apply with changes* / *Discard drafts* | `acceptance {gate: rules-table}` | release *Discard*; **default: do not apply** (drafts stay) |
| 8 | code | `rules apply`: drafts → live, `policyFiles` wired via the document API, one covered and one uncovered probe per pack | probes | ⛔ `rules-apply-unconfirmed` without an acceptance on record |
| 9 | model | reports table, probes, `rules revert <pack-id>` | — | Stop hook (b) |

## Measured acceptance

0 `pack-glob-matches-nothing` after apply; 0 near-duplicates; 100% quotes verified; 0 packs live before
step 7 (fixture with a declining fake human); source rule count equals table rows (CLI count).

## What changes from v0.4.0

Drafts; quotes; confirmation before wiring (F7); CLI wires and probes; revert; bounded loop; the model
no longer edits `config.yaml`.

## Open problems

- P16 duplicate threshold.
