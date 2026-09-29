# gym — training campaign for the ambicode plugin

`gym/planing/` holds the brief (`PLANNER-README.md`) and the two investigation notes with
their cached evidence. `gym/plan/` holds the audited plan a lead agent executes.
`gym/runs/<campaign-id>/` will hold campaign state once a campaign starts
([gym/plan/06-data-and-state.md](plan/06-data-and-state.md)).

## Files created on 2026-09-28

| File | Lines |
|---|---|
| `gym/plan/README.md` | index, reading order, TBDs, conventions, revisions |
| `gym/plan/00-audit.md` | audit of both investigation notes: 24 code rows, 25 artifact rows, 30 cycle rows; 10 open questions; 6 assumptions |
| `gym/plan/01-goals-and-metrics.md` | definition of trained, G1–G3, T1–T4, WP0–WP7, cost table |
| `gym/plan/02-loop-protocol.md` | iteration 0 and the loop, decision table, label queue |
| `gym/plan/03-checkpoints-and-gates.md` | cp-0…cp-5, deciders, S1–S9, push-through |
| `gym/plan/04-orchestration.md` | roles, handoff format, respawn |
| `gym/plan/05-anti-hallucination.md` | re-verification, cross-checks, cadence, red flags |
| `gym/plan/06-data-and-state.md` | layout, committed vs scratch, metrics schema, git, reconstruction |
| `gym/plan/07-blockers.md` | B1–B10, playbooks, K1–K8, replan triggers |
| `gym/plan/08-safety-and-rollback.md` | E1–E8, shutdown, rollback, constraints, post-incident audit |
| `gym/plan/09-replan.md` | R1–R10, procedure, history |
| `gym/plan/10-supervisor.md` | unattended runs: supervisor, guard, context budget, safe points, restart table |
| `gym/plan/supervisor/` | `supervise.mjs`, `guard.mjs`, `policy.mjs`, `defaults.json`, 96 tests (`node --test gym/plan/supervisor/test/*.test.mjs`) |
| `gym/plan/USER-GUIDE.md` | owner's setup, supervisor start, monitoring, stop/resume |

Unresolved assumptions: **6** (A1–A6 in [00 Assumptions](plan/00-audit.md#assumptions)).
Open questions: **10** (Q1–Q10 in [00 §6](plan/00-audit.md#6-open-questions)).
TBDs the repository cannot supply: **6** ([plan/README.md](plan/README.md#open-tbds-the-repository-cannot-supply-these)).

## First three actions for the lead agent

1. Read `gym/plan/README.md` in its reading order; confirm the owner's decisions from
   [USER-GUIDE §3](plan/USER-GUIDE.md#3-decisions-to-make-before-starting-write-them-down-the-lead-copies-them-into-campaignmd)
   are in hand (campaign id, budget, channel), or record each missing one as TBD in `CAMPAIGN.md`.
2. Create `gym/<campaign-id>` from `tuning`, write `CAMPAIGN.md`, and verify the archive manifest the
   owner created with `supervise.mjs archive` ([06 §5](plan/06-data-and-state.md#5-volatile-inputs-to-archive-before-iteration-1));
   keep `PHASE` current from the first step ([10 §3](plan/10-supervisor.md#3-safe-points-and-the-phase-file)).
3. Run iteration 0 ([02 §2](plan/02-loop-protocol.md#2-iteration-0-baseline)): gates, T1,
   preflight, T2 at 3 runs/arm with `--model claude-opus-5-5`, T3 from the existing recordings,
   T4 from the transcript script; commit `baseline/metrics.json`; tag `gym/<campaign-id>/it-000`;
   write `cp-0.md`.
