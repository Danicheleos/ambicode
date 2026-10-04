# AMBICODE v2 architecture, version 1 (design, not code)

Date: 2026-10-03. Status: **draft for review**. Nothing here is built. Every number quoted
comes from a file in `gym/planing/investigation/` or from a measurement made while writing
this (named where used). Where a claim is a guess it says "I'd guess".

## Why a new architecture

The plugin at v0.4.0 **ties the naked model** on the only comparison that is valid
(`archive/baseline-2026-10-02.md`): localize recall 0.720 vs 0.697 inside a 0.101 noise
band, at **1.42x cost and +4.7 turns**. On a real epic (`archive/real-run-VS-6735-2026-10-02.md`)
the full chain made the best-anchored plan but read fewer requirements than the naked
model and cost 41% more. The causes are known and listed in
[01-goals-and-constraints.md](01-goals-and-constraints.md) §2. The redesign keeps the parts
that measured well and replaces the parts that did not.

## How to read this

Read in order. Each module and skill file has the same sections: **Purpose, Inputs,
Outputs, Workflow, Interfaces, Failure modes and exits, What changes from v0.4.0, Open
problems**. The open problems of every file are collected in
[40-open-problems.md](40-open-problems.md) so a reviewer can attack them in one place.

| File | What it settles |
|---|---|
| [01-goals-and-constraints.md](01-goals-and-constraints.md) | What is optimized, the measured facts the design rests on, the user's decisions, non-goals. |
| [02-overview.md](02-overview.md) | The layers, the modules, the "own harness" idea, the keep/rework/drop verdict on v0.4.0. |
| [modules/10-search.md](modules/10-search.md) | How the plugin finds code: text, term shortlist, symbol index (off-the-shelf), history, LSP (task only). Measured candidates. |
| [modules/11-policy.md](modules/11-policy.md) | Rules and policies: packs, resolution, staged delivery, command decisions. |
| [modules/12-route.md](modules/12-route.md) | The call-chain engine: routes, steps, gates, releases, loop limits, headless mode. |
| [modules/13-evidence.md](modules/13-evidence.md) | Ledger, notes, task directory, record-derived evidence, report skeleton. |
| [modules/14-requirements.md](modules/14-requirements.md) | Ticket intake: envelope v2, epic expansion, raw hashes, acceptance-criteria list. |
| [modules/15-guard.md](modules/15-guard.md) | Enforcement: PreToolUse guard, Stop hook, every gate's release. |
| [modules/16-checks-review.md](modules/16-checks-review.md) | Checks runner and isolated reviewer (kept), `check --only`, `format`, task-scoped review, estimate. |
| [modules/17-workers.md](modules/17-workers.md) | Subagents and helper skills: scout, collector, plan checker. User-approved only. |
| [skills/20-init.md](skills/20-init.md) … [skills/25-review.md](skills/25-review.md) | One file per user-invoked skill: route table, what it loads, acceptance, open problems. |
| [30-harness.md](30-harness.md) | The plugin's own harness on top of Claude Code: hook matrix, session state, context budget, compaction, headless. |
| [31-cli.md](31-cli.md) | The CLI surface v2 and which module owns each command. |
| [32-artifacts.md](32-artifacts.md) | On-disk formats: `.ambicode/` layout, ledger kinds, route definitions, config deltas. |
| [33-measurement.md](33-measurement.md) | What proves each module, kill criteria, eval tiers, the task suite. |
| [40-open-problems.md](40-open-problems.md) | Every conflict, bottleneck and unknown, in one list. |
| [41-migration.md](41-migration.md) | From v0.4.0 to v2: order of work, what is deleted, what is kept byte-for-byte. |

## Notation

- `$A` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`.
- 🆕 does not exist in v0.4.0. ♻ exists and is reworked. ✅ exists and is kept as is. ✂ removed.
- ⏸ a human gate, always written with its release. ⛔ a hard exit, always written with the way out.
- Actors: **Model** (the session's model), **CLI** (`$A`), **Hook** (Claude Code runs `$A hook` or `guard.mjs`),
  **Human**, **Worker** (a subagent or `claude -p` subprocess the plugin starts).
- "Measured" means a number from a named file. "Probed" means a one-off check of a platform fact.

## What this design is not

- Not a workflow engine with hidden state. Route position is a pure function of the append-only
  ledger (see [modules/12-route.md](modules/12-route.md) §4). Delete the ledger and the route restarts.
- Not an automatic router. The user invokes every skill. No skill is model-invocable
  ([01-goals-and-constraints.md](01-goals-and-constraints.md) §3).
- Not a code-intelligence product. The symbol index is an off-the-shelf tool behind one
  interface, chosen by measurement, replaceable, and optional until an eval shows it pays.
