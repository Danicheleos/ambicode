# Skill: rules (user-invoked)

## Purpose

Turn written team rules into scoped YAML packs, once, with every rule quoted from its source,
nothing live before the human confirms the disposition table, and a one-command revert.

## Trigger

`/ambicode:rules [sources…]` only. Suggested by init when rule sources exist.

## What the model loads

`SKILL.md` ≤ 2.5 KB: the one judgment this skill is for (scope: which rules are global and which
belong to a path pattern), the drafting rules (one instruction per rule, quote verbatim, prefer
`observed`, drop version-bound API rules), and "run `$A route start rules`". `pack-format.md` stays
as a reference the route points at in the drafting step.

## Route `rules`

| # | Actor | Does | Payload / ledger | Gate / exit |
|---|---|---|---|---|
| 1 | code | `rules discover`: candidate files with size, heading counts; Confluence URLs in args go through the Requirements template | list ≤ 2 KB | — |
| 2 | human ⏸ | pick the sources (multi-select) | `acceptance` | release: *none — stop*; headless default: the files named in args, else stop |
| 3 | code | for URLs: Requirements steps (hash recorded); `config --json`; built-in rules for the projects (`policy --activity review`) | ≤ 4 KB, rest behind `--show` | — |
| 4 | model | drafts `.ambicode/policies/drafts/<id>.yaml`: one pack per scope, `source.quote` verbatim, `source.location`, globs derived from the real layout | Write allowed only under `drafts/` (guard) | — |
| 5 | code ↩ | `policy check --drafts`: schema, loader rules, glob match counts, quote verification, built-in near-duplicates; bounded to 3 rounds | diagnostics | after 3 rounds a failing rule is "not migrated: <reason>" |
| 6 | model | the disposition table: every source rule → pack/rule, dropped (why), or needs a decision | — | — |
| 7 | human ⏸ | *Apply all* / *Apply with changes* / *Discard drafts* | `acceptance {gate: rules-table}` | release: *Discard*; headless default: **do not apply** (drafts stay) |
| 8 | code | `rules apply`: moves drafts live, wires `policyFiles` through the YAML document API, runs one covered and one uncovered probe per pack | probe results | ⛔ `rules-apply-unconfirmed` without the acceptance entry |
| 9 | model | reports the table, probes, and `rules revert <pack-id>` | — | Stop hook: every wired pack has probe results |

## Measured acceptance

0 `pack-glob-matches-nothing` after apply; 0 near-duplicates of built-ins; 100% quotes verified;
0 packs live before step 7 (tested on the fixtures with a fake human that declines); source
heading/bullet count equals table rows (CLI count).

## What changes from v0.4.0

Drafts directory; quotes verified; confirmation before wiring (F7); CLI wires and probes; revert;
bounded loop. The model no longer edits `config.yaml`.

## Open problems

- P16 (duplicate detection threshold), from 11-policy.
