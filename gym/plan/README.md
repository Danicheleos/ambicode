# gym/plan — training-campaign plan for the ambicode plugin

Supersedes: gym/plan/README.md @ ca5d65f25e77a6307bdcd1db0fe7bfe453d58a5034d96c5e326dbddfb5a71096 (replan R-1; see the Changes section at the end)

Written 2026-09-28 against branch `tuning`, HEAD `3e5e146`, plugin 0.3.4, from the two
investigation notes under `gym/planing/investigation/` after auditing every claim in
them ([00-audit.md](00-audit.md)). Evidence rule for every file here: a factual statement
about the repository carries a `path:line`, a command with its output, or a commit hash;
anything else is labelled ASSUMPTION and listed in [00 Assumptions](00-audit.md#assumptions).
`TBD: <what is needed>` marks a detail the repository cannot supply.

## Files

| File | One line |
|---|---|
| [00-audit.md](00-audit.md) | Every claim of the investigation notes: confirmed / contradicted / unverifiable, with evidence; open questions; assumptions |
| [01-goals-and-metrics.md](01-goals-and-metrics.md) | What "trained" means; gates G1–G3, metrics T1–T4 with commands, baselines, targets, signal-vs-noise rules; work packages WP0–WP7; cost per iteration |
| [02-loop-protocol.md](02-loop-protocol.md) | One iteration step by step: entry conditions, iteration 0, brief, scope, gates, measurement order, decision table, label queue, exits |
| [03-checkpoints-and-gates.md](03-checkpoints-and-gates.md) | Checkpoints cp-0…cp-5 with thresholds; who decides with what evidence; stop-and-escalate S1–S9; push-through conditions |
| [04-orchestration.md](04-orchestration.md) | Lead, verifier, auditor, workers: may / may not; handoff format; respawn rules; verify-not-trust |
| [05-anti-hallucination.md](05-anti-hallucination.md) | Re-verification before acting; disk as the only memory; cross-checks; re-read cadence; red flags |
| [06-data-and-state.md](06-data-and-state.md) | `gym/runs/<campaign-id>/` layout; committed vs scratch; `metrics.json` schema; git conventions; volatile inputs; reconstruction from disk |
| [07-blockers.md](07-blockers.md) | Blocker types B1–B9, playbooks, retry limits, known blockers K1–K8, replan triggers |
| [08-safety-and-rollback.md](08-safety-and-rollback.md) | Emergency triggers E1–E8, shutdown steps, rollback to any tag, security constraints, post-incident audit |
| [09-replan.md](09-replan.md) | Replan triggers R1–R10, procedure, superseding without losing history, what a replan may not do |
| [10-supervisor.md](10-supervisor.md) | Unattended runs: supervisor loop, guard hook (allow/deny/kill), context budget 150k/200k, safe points and PHASE, restart/resume/halt table, verified behaviour, limits; code in `supervisor/` |
| [USER-GUIDE.md](USER-GUIDE.md) | For the owner: prerequisites, decisions, kickoff prompt, monitoring, labels, stop/resume/handover |

## Reading order for a lead starting cold

1. This file, then [USER-GUIDE.md §3](USER-GUIDE.md#3-decisions-to-make-before-starting-write-them-down-the-lead-copies-them-into-campaignmd) to learn what the owner decided (or that it is still TBD).
2. [06-data-and-state.md](06-data-and-state.md) — where things go; if `gym/runs/<campaign-id>/` exists, run §6 reconstruction now and skip to step 6.
3. [01-goals-and-metrics.md](01-goals-and-metrics.md) — the definition, metrics, signal rules, WP order.
4. [02-loop-protocol.md](02-loop-protocol.md) — iteration 0 and the loop.
5. [04-orchestration.md](04-orchestration.md), [05-anti-hallucination.md](05-anti-hallucination.md) and [10-supervisor.md §2–§3](10-supervisor.md#2-context-budget) — before spawning anyone; §3 defines when you may end your turn.
6. [03-checkpoints-and-gates.md](03-checkpoints-and-gates.md), [07-blockers.md](07-blockers.md), [08-safety-and-rollback.md](08-safety-and-rollback.md) — keep open; consult at every decision, blocker or stop.
7. [00-audit.md](00-audit.md) — when a brief cites the notes or a seam; use its rows, not the notes.
8. [09-replan.md](09-replan.md) — only when a trigger fires.

Under time pressure mid-campaign: [02 §5](02-loop-protocol.md#5-decision-table) for a
decision, [03 §3](03-checkpoints-and-gates.md#3-stop-and-escalate) for whether to stop,
[08 §2](08-safety-and-rollback.md#2-emergency-shutdown) to stop, [07 §2](07-blockers.md#2-playbooks-and-retry-limits)
for a blocker.

## Open TBDs (the repository cannot supply these)

| TBD | Where used | Who supplies |
|---|---|---|
| Budget ceiling and where usage is read | 01 §5, 08 §5, USER-GUIDE §3 | owner |
| Owner's escalation channel | 03 §3, 08 §2 | owner |
| Model for lead and helpers | 04 §0 | owner |
| Opus 5.5 pricing for real-session cost (Q8) | 00 §6 | owner |
| 3-run/arm T2 baseline | 01 §3, §6 | iteration 0 |
| FE-repo checks Q5, Q7 and labels Q3 | 00 §6, USER-GUIDE §5 | owner |

## Conventions

- Metric ids: G1–G3 gates, T1 triggers, T2 curated sweep, T3 recordings, T4 real sessions.
- Work packages WP0–WP7 in [01 §4](01-goals-and-metrics.md#4-work-packages); cycle 1 = WP0–WP4.
- Blockers B1–B10, known blockers K1–K8, stops S1–S9, emergencies E1–E8, replan triggers R1–R10, labels L-NNN, replans R-n.
- `gym/plan/` is read-only during a campaign; [09 §2](09-replan.md#2-procedure) is the only way to change it.

## Revisions

| Rev | Date | Trigger | planDigest before → after | Change |
|---|---|---|---|---|
| 0 | 2026-09-28 | initial | — → (computed by the lead at iteration 0: `sha256sum gym/plan/*.md \| sha256sum`) | — |
| 1 | 2026-09-29 | R7 (L-011, L-012, owner-directive-1) | ca5d65f2... -> (computed by the owner after apply) | T3 count withdrawn as a control, medium+ stability added; T4p proxy planned; T2 decision sweeps only at checkpoints; Sonnet 5.5 baseline cp-S0; budget $400; context 150k/200k |

## Changes

- Files table, row 10-supervisor.md: "context budget 300k/500k" -> "context budget 150k/200k". Evidence: `labels.json` owner-directive-1, 2026-09-29T09:23:24.943Z (item 3).
- Revisions table: (one row, rev 0) -> added row rev 1 (2026-09-29, trigger R7: L-011, L-012, owner-directive-1; planDigest after computed by the owner after apply). Evidence: `gym/plan/09-replan.md` §3 (README keeps the Revisions table); `gym/runs/R1/replan/R-1-2026-09-29T09-30-00Z.md`.
