# AMBICODE v2 architecture, version 6 (design, not code)

Date: 2026-10-04. Status: **reviewed three times (APPROVE WITH EDITS each, all applied in place; no new user decisions)** — [../review-v6.md](../review-v6.md) (#132–#148), the independent external review of v6 ([../../../plan/gpt-review-architecture-v6/README.md](../../../plan/gpt-review-architecture-v6/README.md): C1, C2, H1, H2, M1) and its second round ([../../../plan/gpt-review-architecture-v6_2/README.md](../../../plan/gpt-review-architecture-v6_2/README.md): H3, M2, M3).
Versions 1–5 are kept unchanged in [../v1/](../v1/00-README.md), [../v2/](../v2/00-README.md),
[../v3/](../v3/00-README.md), [../v4/](../v4/00-README.md), [../v5/](../v5/00-README.md). The reviews:
[../review-v1.md](../review-v1.md) (41 corrections), [../review-v2.md](../review-v2.md) (33, #42–#74),
[../review-v3.md](../review-v3.md) (26, #75–#100), [../review-v4.md](../review-v4.md) (12, #101–#112),
[../review-v5.md](../review-v5.md) (APPROVE, #113–#115 applied in place) and an **independent external
review of v5** ([../../../plan/gpt-review-architecture-v5/README.md](../../../plan/gpt-review-architecture-v5/README.md):
REWORK, G1–G6 — 2 critical, 4 high; its six rule witnesses reproduce from the v5 text). v6 applies
G1–G6 and adds the execution contract the external reviewer asked for (12 §8), nothing else. What
changed and why, item by item with the contracts touched and the scenario that verifies each, is in
[CHANGELOG.md](CHANGELOG.md), together with the post-approval edits of both v6 reviews (a flag
never creates authority, C1; gate answers bind to the printed instance, C2; one live owner per
`plan` route with `--adopt`, H2). Nothing here is built. Every number comes from a file in
`gym/planing/investigation/` or from [../measurements-2026-10-03/](../measurements-2026-10-03/README.md),
whose provenance note says which numbers were logged and which were not. Guesses say "I'd guess".

## What version 6 changed, in one paragraph

Two rules were added (01 §5, R17–R18) and one section (12 §8). **Authority is the channel, not a
flag**: a `route start` is trusted when the `UserPromptSubmit` hook (the user's own prompt, also in
`claude -p`) or the eval harness (a per-run token, probe P58) started it; a model-typed `--headless`
buys the headless mode and nothing else, and a model-typed acting flag is declined in every route —
acting answers come only from a hook answer or a preanswer the user gave at a trusted start (G1,
C1). **An acting answer names its object and the question it answers**: every gate print is a
ledger entry whose id is in the marker; the answer binds to that instance and carries that print's
draft hash; `note promote` promotes that draft and no other, once, with recovery after a crash (G2,
C2); a `plan` route has one live owner — a second session is `route-busy` whatever its args until
it types `--adopt` or `--fresh`, after which the former session is refused at write time (P59, H2). **An automatic revise is
bounded by its target's `repeat`**, not by every covered step's, so three plan writes are three
(G3). **init starts without a config** (G4). **Review stops on every missing-source outcome**,
including a partially captured set (`missingAsked`, G5). **A code step is done by its own completion
record**, not by an empty `produces` (G6). 12 §8 states the one six-step algorithm every entry
point runs, the three record kinds (delivered, completed, verified), what standalone commands may
do, how a crash between any two writes is repaired, the concurrency model, and that completion is
not success. Fourteen end-to-end scenarios (33 §8, S1–S14) carry the invariants. Decisions D1–D19 are
unchanged; nothing from the backlog moved.

## Why a new architecture

The plugin at v0.4.0 **ties the naked model** on the only valid comparison
(`archive/baseline-2026-10-02.md`): localize recall 0.720 vs 0.697 inside a 0.101 noise band, at
**1.42x cost and +4.7 turns**. On a real epic (`archive/real-run-VS-6735-2026-10-02.md`) the full
chain made the best-anchored plan but read fewer requirements than the naked model and cost 41%
more. The causes are in [01-goals-and-constraints.md](01-goals-and-constraints.md) §2. The redesign
keeps what measured well and replaces what did not.

## What version 4 changed, in one paragraph

Six more user decisions (01 §3, D14–D19): **a human's *Revise* always wins** over the automatic
`repeat` bounds (a new cycle; the human is bounded only by the gate's `maxRevises`, shown in the
gate text); `map --layers` is **not for the model**; "the user decides" stands for **every** decision
point; in headless runs a requirement exists **only** with an explicit `--requirement`; the plugin
is **language-agnostic by construction** (ecosystem adapters detected by `init`; measured on
TypeScript because the user can judge those results); and **no new baseline** — the 2026-10-02 run
is the reference, so the naked prompt never changes and only the plugin arm gets `prompt.with.md`.
The review's three must-items are closed by those rules plus route re-entry for task's fix round and
review's re-run (`revise $raisedBy`). Also: pre-answers are a `preanswer` kind consumed at the gate
(so a revision cannot swallow them); a new session **adopts** an open route instead of restarting;
the gate registry is complete and every default is non-acting; the expansion-cap gate fires before
the child reads; "ceremony turn" and "work command" are defined once and the tables use them
(plan is 3 + N ceremony + 1 work); `check --approve` obeys the acting-option rule; hook time is given
as typical and maximum with the start work named; today's ledger was counted as one kind (`note`) — corrected in v5 to two, `note` and `review` (#110).

## What version 3 changed, in one paragraph

The user decided six things (01 §3, D7–D13): investigate's bar is a tie at lower cost; **no LSP and
no language service anywhere** until the skills prove themselves without them (a backlog file holds
the items with entry conditions); code may choose search layers deterministically **if the choice is
declared in config, printed and recorded**; the point of no return is judged on cost and recall,
turns are reported, and **the rollback decision is the user's**; a plan is **saved as a draft before
anyone is asked to accept it**; `ExitPlanMode` is deferred. The review's structural findings were
closed: the fold can **go back** (`revise` entries), gates come in two classes (declared, raised)
and both are table-tested, the flag vocabulary is one, every evidence-writing command advances the
route at its tail so the ceremony count is 1–4 + gates per route, the eval harness gets per-arm
prompts, the no-URL path builds the envelope from the args, capture is said to reduce disk and not
context, the harness never rewrites source from a code step, and every measurement number says
whether it was logged.

## How to read this

Same structure as v1 and v2. Each module and skill file: **Purpose, Inputs, Outputs, Workflow,
Interfaces, Failure modes and exits, What changes from v0.4.0, Open problems**. All open problems
are collected in [40-open-problems.md](40-open-problems.md); deferred items in [50-backlog.md](50-backlog.md).

| File | What it settles |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | v5 → v6 (G1–G6, the execution contract) and the post-approval edits of review-v6 (#132–#148) and the external v6 review (C1, C2, H1, H2, M1), top; then the frozen v4 → v5 and v3 → v4 records. |
| [01-goals-and-constraints.md](01-goals-and-constraints.md) | Goal numbers (one bar per skill, decision points), measured facts with provenance, the user's decisions D1–D19, non-goals, design rules R1–R16. |
| [02-overview.md](02-overview.md) | Layers, modules, the own-harness loop, one run end to end with its ceremony count, keep/rework/drop. |
| [modules/10-search.md](modules/10-search.md) | Text, shortlist, regex pass 2 with collision counts, optional index, declared layer lists. No LSP. |
| [modules/11-policy.md](modules/11-policy.md) | Packs, staged delivery, command slots, `rules` authoring path with re-entry. |
| [modules/12-route.md](modules/12-route.md) | Routes, steps, the fold with `revise` and human cycles, resume by adoption, declared and raised gates, one flag vocabulary, ceremony defined, tail advance, limits, DSL. |
| [modules/13-evidence.md](modules/13-evidence.md) | 21 ledger kinds incl. `preanswer`, session-scoped ids, draft-first notes and `promote`, generated report sections, navigation line. |
| [modules/14-requirements.md](modules/14-requirements.md) | `hasRequirement` defined, captured payloads, envelope from captures or args, field lists, binding in the hook, AC list. |
| [modules/15-guard.md](modules/15-guard.md) | Structural command parser, decision table, Stop hook, the gate table test over both classes. |
| [modules/16-checks-review.md](modules/16-checks-review.md) | Pipeline kept; `check --only` with runner summaries, model-run `format`, task scoping, estimate, dependents without a language service. |
| [modules/17-workers.md](modules/17-workers.md) | Process runner and `plan check` (rounds by re-entry) ship; scout, collector, judge are an appendix. |
| [skills/20-init.md](skills/20-init.md) … [skills/25-review.md](skills/25-review.md) | One route per skill with honest ceremony tables, gates by class and non-acting defaults. |
| [30-harness.md](30-harness.md) | Hook matrix, session state, context budget (capture ≠ context), compaction, headless with `--answer`, week-one cases, what the harness never does. |
| [31-cli.md](31-cli.md) | CLI surface v3; which commands advance the route. |
| [32-artifacts.md](32-artifacts.md) | `.ambicode/` layout, ledger lines, the route DSL with `revise`, the gate registry, config v3, captured requirements. |
| [33-measurement.md](33-measurement.md) | §0 harness fixes and probes first, no new baseline; decision points (the user decides); the eval sequence; detectable effects; composite defined. |
| [40-open-problems.md](40-open-problems.md) | The list P1–P60 with closures (P60 closed by C2). |
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
