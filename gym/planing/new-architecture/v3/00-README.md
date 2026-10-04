# AMBICODE v2 architecture, version 3 (design, not code)

Date: 2026-10-04. Status: **draft, revised after the second review and six user decisions**.
Version 1 is kept unchanged in [../v1/](../v1/00-README.md), version 2 in [../v2/](../v2/00-README.md).
The reviews: [../review-v1.md](../review-v1.md) (41 corrections) and [../review-v2.md](../review-v2.md)
(33 corrections #42–#74: 8 must, 18 should, 7 could; verdict "rework, narrower than v1"). What changed
and why, item by item, is in [CHANGELOG.md](CHANGELOG.md). Nothing here is built. Every number comes
from a file in `gym/planing/investigation/` or from
[../measurements-2026-10-03/](../measurements-2026-10-03/README.md), whose provenance note says which
numbers were logged and which were not. Guesses say "I'd guess".

## Why a new architecture

The plugin at v0.4.0 **ties the naked model** on the only valid comparison
(`archive/baseline-2026-10-02.md`): localize recall 0.720 vs 0.697 inside a 0.101 noise band, at
**1.42x cost and +4.7 turns**. On a real epic (`archive/real-run-VS-6735-2026-10-02.md`) the full
chain made the best-anchored plan but read fewer requirements than the naked model and cost 41%
more. The causes are in [01-goals-and-constraints.md](01-goals-and-constraints.md) §2. The redesign
keeps what measured well and replaces what did not.

## What version 3 changed, in one paragraph

The user decided six things (01 §3, D7–D13): investigate's bar is a tie at lower cost; **no LSP and
no language service anywhere** until the skills prove themselves without them (a backlog file holds
the items with entry conditions); code may choose search layers deterministically **if the choice is
declared in config, printed and recorded**; the point of no return is judged on cost and recall,
turns are reported, and **the rollback decision is the user's**; a plan is **saved as a draft before
anyone is asked to accept it**; `ExitPlanMode` is deferred; the eval-harness fix and a second
baseline are approved as step 0. The review's structural findings are closed: the fold can now **go
back** (`revise` entries with `repeat` bounds, declared per gate answer or code failure), gates come
in two classes (declared in the route file, raised from a registry) and both are table-tested, the
flag vocabulary is one (`--answer` selects, `--default` takes the default, `route start --answer`
pre-answers for headless runs), every evidence-writing command advances the route at its tail so the
ceremony count is 1–4 per route and honestly derived, the eval harness gets per-arm prompts, the
no-URL path builds the envelope from the args, capture is said to reduce disk and not context, the
harness never rewrites source from a code step, and every measurement number says whether it was
logged.

## How to read this

Same structure as v1 and v2. Each module and skill file: **Purpose, Inputs, Outputs, Workflow,
Interfaces, Failure modes and exits, What changes from v0.4.0, Open problems**. All open problems
are collected in [40-open-problems.md](40-open-problems.md); deferred items in [50-backlog.md](50-backlog.md).

| File | What it settles |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | The six user decisions and every review-v2 correction, with what was done. |
| [01-goals-and-constraints.md](01-goals-and-constraints.md) | Goal numbers (one bar per skill, decision points), measured facts with provenance, the user's decisions D1–D13, non-goals, design rules R1–R15. |
| [02-overview.md](02-overview.md) | Layers, modules, the own-harness loop, one run end to end with its ceremony count, keep/rework/drop. |
| [modules/10-search.md](modules/10-search.md) | Text, shortlist, regex pass 2 with collision counts, optional index, declared layer lists. No LSP. |
| [modules/11-policy.md](modules/11-policy.md) | Packs, staged delivery, command slots, `rules` authoring path with re-entry. |
| [modules/12-route.md](modules/12-route.md) | Routes, steps, the fold with `revise`, declared and raised gates, one flag vocabulary, tail advance, limits, DSL. |
| [modules/13-evidence.md](modules/13-evidence.md) | 20 ledger kinds, session-scoped ids, draft-first notes and `promote`, generated report sections, navigation line. |
| [modules/14-requirements.md](modules/14-requirements.md) | `hasRequirement` defined, captured payloads, envelope from captures or args, field lists, binding in the hook, AC list. |
| [modules/15-guard.md](modules/15-guard.md) | Structural command parser, decision table, Stop hook, the gate table test over both classes. |
| [modules/16-checks-review.md](modules/16-checks-review.md) | Pipeline kept; `check --only` with runner summaries, model-run `format`, task scoping, estimate, dependents without a language service. |
| [modules/17-workers.md](modules/17-workers.md) | Process runner and `plan check` (rounds by re-entry) ship; scout, collector, judge are an appendix. |
| [skills/20-init.md](skills/20-init.md) … [skills/25-review.md](skills/25-review.md) | One route per skill with honest ceremony tables, gates by class and non-acting defaults. |
| [30-harness.md](30-harness.md) | Hook matrix, session state, context budget (capture ≠ context), compaction, headless with `--answer`, week-one cases, what the harness never does. |
| [31-cli.md](31-cli.md) | CLI surface v3; which commands advance the route. |
| [32-artifacts.md](32-artifacts.md) | `.ambicode/` layout, ledger lines, the route DSL with `revise`, the gate registry, config v3, captured requirements. |
| [33-measurement.md](33-measurement.md) | §0 harness fixes and probes first; decision points (the user decides); per-arm prompts; costs recomputed; detectable effects; composite defined. |
| [40-open-problems.md](40-open-problems.md) | The list P1–P53 with closures. |
| [41-migration.md](41-migration.md) | Order, the point of no return (user-decided), what is touched and what is kept. |
| [50-backlog.md](50-backlog.md) | LSP, language service, `ExitPlanMode`, recorder, workers, agentmap — each with its entry condition. |

## Notation

- `$A` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`.
- 🆕 new in v2 of the plugin. ♻ reworked. ✅ kept. ✂ removed.
- ⏸ a human gate, always with its release. ⛔ a hard exit, always with the way out. ⤵ a command that advances the route at its tail.
- Actors: **Model**, **CLI**, **Hook**, **Human**, **Worker**.

## What this design is not

- Not a workflow engine with hidden state: route position is a pure function of the ledger,
  including its revises.
- Not an automatic router: the user types every skill; nothing fires on its own, including the
  ticket hook when no route is active; code's only automatic choices (search layers) are declared
  in config and recorded.
- Not a code-intelligence product: one optional index adapter behind an interface, off by default;
  no LSP, no language service.
- Not self-judging: a missed bar stops and reports; the user decides.
