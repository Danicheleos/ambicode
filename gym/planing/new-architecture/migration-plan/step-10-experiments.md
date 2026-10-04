# Step 10 — Experiments behind flags; backlog items only on their entry conditions

> **Dispatcher block (fill in before hand-off; the agent stops if empty)**
> - Branch: `__________`
> - Commit policy: `__________`
> - Spend authorization: per experiment, named below — `__________`
> - Which experiment(s) this hand-off covers: `__________` (one per hand-off)

## Why this step exists

Everything here is an experiment with a flag or a backlog item with an entry condition. Nothing in
it changes a default without a measurement and a user decision (R10, D10). Design:
[../v5/41-migration.md](../v5/41-migration.md) step 10; [../v5/50-backlog.md](../v5/50-backlog.md);
[../v5/modules/16-checks-review.md](../v5/modules/16-checks-review.md) §7;
[../v5/modules/17-workers.md](../v5/modules/17-workers.md) appendix.

## Read first

1. `CLAUDE.md`.
2. `../v5/50-backlog.md` whole — the entry conditions are the gate for this step; `../v5/41-migration.md`
   step 10; `../v5/33-measurement.md` §4 (scout condition), §6 (`onInvalid` experiment);
   `../v5/modules/17-workers.md` appendix; `../v5/40-open-problems.md` P21, P22, P36.
3. The reports of steps 3, 5, 6, 7, 8 (the numbers that may meet an entry condition).

## Experiments (each behind a flag, default off; each its own hand-off)

### E1. `review.onInvalid: drop` (16 §7; 33 §6)

Entry: step 8's live tier ran. Run the same 8 × 3 with `onInvalid: drop` on; compare `complete`
share, location validity, accepted rate. Decision: presented; the default stays `void` unless the
user changes it.

### E2. Scout worker (17 appendix) — **only if** 33 §4's traces show the main session's context or
cost is the bottleneck (step 6's decision 6-P said so **and** the user asked for it)

Build: `workers/scout.yaml` (process runner, tools Read/Grep/Glob + `$A map/refs/find/relates`,
≤ 8 KB output, `maxBudgetUsd`), a declared gate on the `worker` step (*run* / *inline* (default) /
*skip*; `workers.approved: [scout]` as a preanswer for *run*; headless: inline), the proposal text
of 17 appendix. Measure as a third plan arm (+$16–23 per decision). D3: nothing spends without a
human on record.

### E3. Collector subagent — **only if** P21 is probed true (a plugin subagent inherits the session's
MCP servers) **and** 30 §3's peak measurement shows requirement text is the problem

Probe P21 first (≤ $1, needs go). Build only on a true result and a user go.

### E4. Plan-judge — **only if** a calibrated judge exists (κ ≥ 0.6 on ≥ 60 labels). Not before.

## Backlog items (50) — reopened only when the entry condition is written down with its number

| Item | Entry condition (verbatim from 50) | What this step does |
|---|---|---|
| LSP tool in `task` (passive diagnostics) | investigate passes 33 §1–2 **and** the task suite shows a gain or an inconclusive band the user accepts; then probe P36 | Nothing until both reports say so; then present the probe plan and cost to the user |
| Exact references by a language-service child | the colliding-name impact cases (33 §3) show the plugin arm losing with collision flags alone | Nothing until step 5's impact run says so; then present |
| `ExitPlanMode` as acceptance channel | a user asks for plan mode, or 33 §4's traces show `AskUserQuestion` acceptance is a bottleneck | Present |
| Recorder of model reads | a measurement needs the model's reads | Present |
| agentmap adapter | someone investigates the 65/179 gap | Nothing |
| `claude plugin list` for LSP advice | with the LSP item | Nothing |
| `PostToolUse(Edit\|Write)` reminder hook | a pack sets `remindOnEdit` | Re-register the hook entry when a shipped pack sets it; measure the per-edit cost (G18: 89–143 ms) |
| `budget.codeCalls`, interactive `wallMinutes` | none — dropped | Nothing |

"Present" means: write the entry condition's evidence (numbers, report, date), the measurement in 33
that would decide it, and the cost; the user approves the spend; only then the item returns to the
main design (a v6) and is built. An agent does not build a backlog item in this step.

## Proofs

- Every flag defaults off and has a test that the default path is byte-identical to step 8's
  behaviour.
- Every experiment's result is a report with both arms' numbers and the loser's detail (R13).

## Do not

- Do not change any default here.
- Do not build an LSP or language-service item under any name (D8) before its entry condition is
  met **and** the user approves.
- Do not build a model worker without the gate, the `workers.approved` preanswer path and a human on record (D3).

## Done when

The named experiment ran with its flag, its numbers are presented, and no default changed.
