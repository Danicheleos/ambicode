# Drift: three cases, causes per metric, core-layer plan

Date: 2026-10-09. Status: **plan approved by the user; no plugin code changed yet.**

## Purpose

Repetitions of one skill run on identical input must not drift. The audit in
[eval-replay/evals/analysis/drift-2026-10-09/report.md](../../../eval-replay/evals/analysis/drift-2026-10-09/report.md)
shows the engine serves byte-identical inputs per case (prompt, contract, step and map: one hash
each) while the repetitions diverge from the first tool call. The fix lives below the skills layer:
`read` command, map payload, guard, hooks, Stop check. Score gains are out of scope; scores must not
fall under the bare reference; every new limit is soft (recorded, never stopping the route).

## Target

Absolute, per case over N repetitions (the user kept the target absolute, 2026-10-09):

- quality: recall and F1 within 10% of the case's best repetition; recall ≥ bare point estimate,
  precision ≥ bare − band (`evals/TRAINING-PLAN.md` floor rule);
- resources: tool calls, model requests, served bytes, agent cost within 10% of the case's
  cheapest repetition; agent cost ≤ 1.1× bare is reported as the stage-2 debt row, not gated here;
- mechanics: `read` receipts in every repetition, zero zsh glob failures, zero operand retries.

The existing gate (`ACCEPTANCE.drift` in `evals/scripts/src/validation/eval-gate.mjs`: recall and
F1 ≥ 0.9× best, cost ≤ 1.25× cheapest, ≥ 80% of cases) and `case floors` are reported alongside.

## Files

| File | Content |
|---|---|
| [01-cases.md](01-cases.md) | The three cases, bare reference, plugin history per build, per-repetition tool timelines, run commands, pass definition |
| [02-causes.md](02-causes.md) | Per-metric drift mechanisms with counts and attempt ids, the free choices the model makes today, what is not controllable, the seams in `src/` |
| [03-plan.md](03-plan.md) | Steps D0–D7: layer, files, tests, offline check, expected effect, paid check, execution rules |

## Status

| Step | State |
|---|---|
| D0 ruler for drift runs | done 2026-10-09 (`evals:bench -- drift`; reproduces 15_1241/16_1304 numbers) |
| D1 operands and root | done 2026-10-09 (`:a:b`/`:a,b` spans, prefix strip, `--task` for read/map/refs/find/relates) |
| D2 zsh glob rewrite | done 2026-10-09 (guard quotes unquoted `--include/--exclude` globs; bundle 72,569 B, cap raised 71,680 → 73,081) |
| D3 ready `read` line in the map payload | done 2026-10-09 (lead spans 15–60 lines, `read:` line, operands ≤ 400 B excl. prefix, recorded in `map.delivered.operands`) |
| D4 deterministic `read` bytes | done 2026-10-09 (outline > 500 lines or when a batch overflows, span dedupe, `servedTotal`, soft `limit{read-bytes}` at 60,000 B) |
| D5 reading through `read` (hard in headless, ask interactive) | done 2026-10-09 (guard on Read/cat/sed -n/head/tail at an `answer: note` step; PostToolUse `tool` record; bundle 75,921 B, cap 76,433) |
| D6 answer shape at Stop (offline replay first) | done 2026-10-09: replay dropped R3 (24/24 fires, 3 truth in 130); R1 (listed, never read; absent path = creation) + R2 (hedged line) wired into the Stop check, block once |
| D7 paid checks 3 × 5 | not started; D1–D6 uncommitted, `npm run verify` green except the 4 known codeindex tests |

## Related

- Earlier drift work: [eval-replay/evals/plans/drift-plan-2026-10-09.md](../../../eval-replay/evals/plans/drift-plan-2026-10-09.md) (Phase A ruler done; B1/B2 answer receipt dropped), [ROADMAP](../../../eval-replay/evals/ROADMAP.md) (stage 3a paused on drift).
- Architecture: [v7/00-README.md](../new-architecture/v7/00-README.md), [12-route](../new-architecture/v7/modules/12-route.md), [15-guard](../new-architecture/v7/modules/15-guard.md), [30-harness](../new-architecture/v7/30-harness.md).
