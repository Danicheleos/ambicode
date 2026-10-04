# AMBICODE v2 architecture, version 2 (design, not code)

Date: 2026-10-03. Status: **draft, revised after review**. Version 1 is kept unchanged in
[../v1/](../v1/00-README.md); the review that produced this version is
[../review-v1.md](../review-v1.md) (41 corrections: 23 must, 13 should, 5 could). What changed and
why, correction by correction, is in [CHANGELOG.md](CHANGELOG.md). Nothing here is built. Every
number comes from a file in `gym/planing/investigation/` or from
[../measurements-2026-10-03/](../measurements-2026-10-03/README.md). Guesses say "I'd guess".

## Why a new architecture

The plugin at v0.4.0 **ties the naked model** on the only valid comparison
(`archive/baseline-2026-10-02.md`): localize recall 0.720 vs 0.697 inside a 0.101 noise band, at
**1.42x cost and +4.7 turns**. On a real epic (`archive/real-run-VS-6735-2026-10-02.md`) the full
chain made the best-anchored plan but read fewer requirements than the naked model and cost 41%
more. The causes are in [01-goals-and-constraints.md](01-goals-and-constraints.md) §2. The redesign
keeps what measured well and replaces what did not.

## What version 2 changed, in one paragraph

The route engine no longer takes a gate's default on its own: defaults need a recorded `--headless`
or an explicit `--default`, and every default is non-acting (nothing written, nothing spent). The
Stop hook checks only report-shaped stops and note files, once. A route completes when its last
step's evidence exists, with no extra command. Requirement payloads are captured by the hook and
the envelope is built by code, so there is nothing to paraphrase and no second normalizer. The
ground step (normalize, ACs, map, rules) runs once, when the model says fetching is done, not once
per ticket read. The map's second pass harvests exported identifiers by regex, so it works with no
index; the index is an optional improvement measured against that. The tool recorder, the agentmap
adapter, the wall-clock and call-count budgets, and two of three workers are gone until a
measurement asks for them. The measurement plan now starts by rewriting the eval prompts to typed
commands, because with user-only skills a plain question fires nothing, and it costs the plan and
task suites in dollars.

## How to read this

Same structure as v1. Each module and skill file: **Purpose, Inputs, Outputs, Workflow,
Interfaces, Failure modes and exits, What changes from v0.4.0, Open problems**. All open problems
are collected in [40-open-problems.md](40-open-problems.md).

| File | What it settles |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | Every review correction and what was done with it. |
| [01-goals-and-constraints.md](01-goals-and-constraints.md) | Goal numbers (one bar per skill), measured facts, the user's decisions, non-goals, design rules. |
| [02-overview.md](02-overview.md) | Layers, modules, the own-harness loop, one run end to end with its ceremony count, keep/rework/drop. |
| [modules/10-search.md](modules/10-search.md) | Text, shortlist, regex pass 2, optional index, exact references, LSP (task only). Measured. |
| [modules/11-policy.md](modules/11-policy.md) | Packs, staged delivery, command slots, `rules` authoring path. |
| [modules/12-route.md](modules/12-route.md) | Routes, steps, the fold, gates and releases (interactive and headless), limits, DSL. |
| [modules/13-evidence.md](modules/13-evidence.md) | Ledger kinds, notes, task directory, generated report sections, navigation line (CLI calls only). |
| [modules/14-requirements.md](modules/14-requirements.md) | Captured payloads, code-built envelope, one-level expansion, AC list, binding rule. |
| [modules/15-guard.md](modules/15-guard.md) | Structural command parser, decision table, Stop hook (report-shaped stops only). |
| [modules/16-checks-review.md](modules/16-checks-review.md) | Pipeline kept; `check --only` with runner summaries, `format`, task scoping, estimate. |
| [modules/17-workers.md](modules/17-workers.md) | Process runner and `plan check` ship; scout, collector, judge are an appendix. |
| [skills/20-init.md](skills/20-init.md) … [skills/25-review.md](skills/25-review.md) | One route per skill with ceremony counts, gates and non-acting defaults. |
| [30-harness.md](30-harness.md) | Hook matrix (no dead rows), session state, context budget with the variable parts, compaction, headless, week-one cases. |
| [31-cli.md](31-cli.md) | CLI surface v2. |
| [32-artifacts.md](32-artifacts.md) | `.ambicode/` layout, ledger lines, the route DSL (with `when`), config v2, captured requirements. |
| [33-measurement.md](33-measurement.md) | §0 harness fixes and probes first; per-route ceremony budgets; costs for every tier; kill criteria that can fire. |
| [40-open-problems.md](40-open-problems.md) | The list, renumbered, with the review's additions. |
| [41-migration.md](41-migration.md) | Order, the point of no return, what is touched and what is kept. |

## Notation

- `$A` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`.
- 🆕 new in v2 of the plugin. ♻ reworked. ✅ kept. ✂ removed.
- ⏸ a human gate, always with its release. ⛔ a hard exit, always with the way out.
- Actors: **Model**, **CLI**, **Hook**, **Human**, **Worker**.

## What this design is not

- Not a workflow engine with hidden state: route position is a pure function of the ledger.
- Not an automatic router: the user types every skill; nothing fires on its own, including the
  ticket hook when no route is active.
- Not a code-intelligence product: one optional index adapter behind an interface, off by default.
