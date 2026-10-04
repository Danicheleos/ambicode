# Step 7 — Task route: `check --only` with summaries, model-run `format`, baseline scoping, caller inventory, `review-run` → `fix` re-entry, Stop hook rules, the task suite

> **Dispatcher block (fill in before hand-off; the agent stops if empty)**
> - Branch: `__________`
> - Commit policy: `__________`
> - Spend authorization: probe P17 (≤ $0.50): `__________`; task suite walk (1 case × 1 run × 2 arms, ≈ $2–3): `__________`; task suite decision run 10 × 3 × 2 (≈ $30–90): `__________`
> - Step 6 report attached: `yes`

## Why this step exists

Task is the skill with no measurement at all (01 §1: "no suite; 1 Edit/Write in 7,709 tool calls").
v5 gives it the record to prove a change: a test that fails first and ran, the smallest fix,
format, affected checks, an independent review offered, and a report whose Evidence comes from the
ledger. The suite is the largest single effort in the plan (41: 2–3 weeks on its own). Design:
[../v5/skills/24-task.md](../v5/skills/24-task.md), [../v5/modules/16-checks-review.md](../v5/modules/16-checks-review.md)
§2–§4, [../v5/modules/15-guard.md](../v5/modules/15-guard.md) §3, [../v5/33-measurement.md](../v5/33-measurement.md)
§5, §8; [../v5/41-migration.md](../v5/41-migration.md) step 7.

## Read first

1. `CLAUDE.md`.
2. `../v5/skills/24-task.md` whole (the route table is the specification; the ceremony table is a
   test); `../v5/modules/16-checks-review.md` §2 (`check --only`, summary rules, `--approve` rule), §3
   (`format` model-run), §4 (task-scoped review); `../v5/modules/12-route.md` §3.4 (acting flags),
   §3.5 (`$raisedBy`), §4 (the `fix` entry rule, #103/#105); `../v5/modules/15-guard.md` §3 (Stop
   checks for task: "tests pass" ⇔ `check {green, ran ≥ 1}`, red before green); `../v5/32-artifacts.md`
   §4 (`check-only-unauthorized`, `scope-expanding`); `../v5/33-measurement.md` §5 (suite
   construction, graders, detectable effect), §8 (`fix` re-entry fixtures); `../v5/30-harness.md` §3
   (task budget), §6 (headless `--answer review-offer=run`), §9 (`format` is model-run);
   `../v5/01-goals-and-constraints.md` §1 (task bar: ≥ 20 pp at ≤ 1.2x), M7, M12, D3, D8, D10, R3;
   `../v5/40-open-problems.md` P17, P18, P27, P28, P41, P49, P51.
3. Code: `src/checks/run.ts` (`runChecks`, `RunChecksOptions.approvals/declines`), `select.ts`,
   `authorize.ts` (`authorizeCommand`, `checkApprovalKey`), `adapters.ts` (one adapter per runner;
   the summary parser goes here), `src/review/bundle.ts` (`assembleBundle`: `--task` scoping seam),
   `src/git/diff.ts`, `src/checks/workspace-diff.ts`, `src/hook/stop-check.ts` (step 3),
   `skills/task/SKILL.md` (10.6 KB → ≤ 2.5 KB), `fixtures/definitions.mjs` (`ts-off-by-one`,
   `py-none-guard`, `ts-source-regression`: defect fixtures for the red/green walk).
4. `docs/compatibility.md:383-387` (the `Stop` schema probe on 2.1.278) for P17.

## Deliverables

### 1. Probe P17 (≤ $0.50, needs go) — `Stop` output fields

Throwaway plugin whose `Stop` hook returns `{"decision":"block","reason":"PROBE-P17 list","hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"PROBE-P17 ctx"}}`;
one `claude -p`; record which fields reached the model (reason, additionalContext, neither) and
whether the schema rejected anything. Step 3 writes the list to both the reason and `stop-check.md`;
after this probe keep only what works and leave the file fallback (15 §3, P17).

### 2. `check --only` with a runner summary (16 §2) ⤵

`$A check --task <slug> <projectId>/<checkId> --only <file>… --phase red|green [--approve <key>] [--decline <key>]`:
reuses `runChecks` with a **forced selection** (no new runner), authorized through
`authorizeCommand` under the check's key (`propose` → raised gate `check-only-unauthorized` with
`onAnswer: {approve: revise $raisedBy}`; `forbid` refuses). Adapter summary parsing per runner
(jest/vitest/pytest/playwright → `{ran, failed}`; eslint/ruff/generic → `null`), with fixtures per
runner's real output format (collect the strings from the runners' own test suites or docs, not
from NDA repos). Ledger `check {key, argv, only, exit, phase, summary, ms, mutations}`. Rules the
route applies: **red** needs `summary.failed ≥ 1`; **green** needs `exit 0` and `summary.ran ≥ 1`;
unparseable → `limit {red-unproven|green-unproven}` visible under Not verified (P41). `--approve`
honoured only per 12 §3.4 (an `acceptance {gate: check-only-unauthorized, key}` on record, or
headless); interactively a model-typed `--approve` records `declined {acting-needs-human}` and the
gate re-prints (#84). Tail-advance.

### 3. `format` — model-run (16 §3) ⤵

`$A format --task <slug> [paths…]`: the project's `format` command (config slot `commands.format`,
null until `init` fills it in step 9; `format-unconfigured` → "not formatted" under Not verified) on
the files changed since the baseline; same authorization seam; formatted files reported as such,
not as `mutations`. Ledger `format {key, files, exit, via: 'model'}`. The engine never runs it (30 §9).

### 4. Baseline scoping and caller inventory (24 step 2; 16 §4)

- `checks.baseline` at the start tail: `baseline {head, dirty[]}`; `review --task <slug>` excludes
  dirty files the task did not touch and lists them under "not covered: pre-existing changes"
  (`assembleBundle` seam; without `--task` behaviour unchanged).
- Caller inventory: `refs` (step 3/5) for every symbol the brief re-signs, collisions flagged from
  the harvest; the step text says "a `collides` caller → verify its import before editing" (P51).
  Detached `index build` when an adapter is set (step 5).

### 5. `routes/task.yaml` and step texts (24 table)

Steps: `start` (code; slug from args or the plan's directory; `note list` → latest `plan` or
`--plan <file>`; `plan.isDraft && !--from-draft` → declared gate `draft-ok` ⏸ *implement anyway
(recorded)* / *stop*, default **stop**), `ground` (code: baseline, map context, caller inventory,
policy before-work, detached index build; ≤ 9 KB), `red` (model; `produces: [check{red}]`; `limit
{no-red}` with the stated observation when no test is possible, P27), `green` (model; `produces:
[check{green}, format]`), `review-offer` (human; tail of `format`; `--estimate` text; *run* / *skip —
verification incomplete*; default **skip**), `review-run` (code, `repeat: 2`; on *run* the gate text
names `$A review --task <slug>`; the command's tail evaluates: in-scope findings and `fix` under
`repeat` → `revise fix` — **this is how `fix` is entered the first time** (#103); waiting keys → gate
per key; else report step), `fix` (model, `repeat: 2`; `produces: [check{green}, review]`), `report-step`
(code; before-report; generated Evidence / Not verified), `write` (model: Done and Remaining; `note
save --kind notes --iteration N` when the plan has more iterations). `scope-expanding` raised gate
⏸ *out of scope* (default) / *include*. `budget.modelSteps: 18`. Step texts ≤ 1,500 chars; the green
step ends with "then `$A format --task <slug>`".

### 6. Stop hook rules for task (15 §3)

Report-shaped stop (b): generated sections unchanged (hash comment / normalized diff); "tests pass"
⇔ a `check {green, summary.ran ≥ 1}`; red before green for a defect brief (the brief says "defect"
or the ticket type does); declined keys appear under Not verified. Fixtures in the Stop test.

### 7. Skill body (24 "What the model loads")

`skills/task/SKILL.md` ≤ **2.5 KB**: the judgments (smallest coherent change; reuse before adding;
never weaken a test; ask when a finding expands scope), the git boundary with its reason, the two
prose report parts, the fallback start line. `disable-model-invocation: true`. `allowed-tools`
unchanged (`Edit(**)`, `Write(**)`, scoped Bash). No LSP, no `prepare`.

### 8. Fixtures (33 §8) and ceremony test

`fix` re-entry from `review-run` (twice, third refused with `limit`), `review-run` re-entry from an
approved waiting key (`$raisedBy`), `--approve` typed interactively → `declined` + re-print,
`review-offer` default skip in headless and `--answer review-offer=run` as a preanswer, `draft-ok`
default stop, `scope-expanding` default out of scope, `limit {no-red}`. Ceremony per 24's table
(review skipped: 1–2; one fix round: 1–3) reproduced by the synthetic walk.

### 9. The task suite `evals/evals-task` (33 §5; needs go to run)

Construction (free): 10 defect tickets from the benchmark set, each with a base-commit scaffold
(shared with step 5's builder), dependencies installed (G22), the merged fix's test identified by
name and **withheld** as the hidden test, the project's runner proven to start in the sandbox (one
walk first). Graders (code): hidden test passes; ledger has `check {red, failed ≥ 1}` before `check
{green, ran ≥ 1}`; no assertion weakened (diff of test files against the merged version); cost and
turns. Arms: naked / route; **no third arm** (D8). Plugin-arm prompt types `/ambicode:task --headless
--answer review-offer=run …` per step 0's mechanism. State the detectable effect in the suite's
README: ≈ 20 pp at 10 × 3 (33 §5). **Decision 7-T**: gain ≥ 20 pp → stands; inside ±20 pp →
inconclusive, presented with the cost of 30 cases (≈ $90–270, detectable ≈ 12 pp) so the user
chooses between enlarging and cutting task to baseline + guard + review offer; loss beyond 20 pp →
cut proposed. The agent presents; the user decides.

## Proofs

- `npm run verify` green; tests for every deliverable; the gates table test covers task's gates.
- Integration on `ts-off-by-one` (materialized): `route start task "<synthetic defect text>"` →
  ground (baseline, map, inventory) → red step; `check … --only <spec> --phase red` on a failing spec
  written by test code → `check {red, failed ≥ 1}`; green after the fix → `check {green}`; `format`
  with a null slot → `format-unconfigured`; `review-offer` printed; synthetic *skip* → report step
  with Evidence/Not verified generated; the Stop fixture blocks a "tests pass" claim when the green
  check is missing. Show the ledger.
- Timing: warm `index build` after `check` does not block the tail (measure with the fake adapter).

## Do not

- Do not run checks or `format` from a hook or a code step; the model runs them (R1 is about fixed
  steps, 30 §9 about writes).
- Do not honour `--approve` interactively; do not run the reviewer on a skipped offer.
- Do not build edit-time asks (`guard.askOutsideMap` stays off, P18) or the LSP diagnostics item (D8).
- Do not weaken a test or raise a check limit to make a fixture green.
- Do not build the suite's cases from anything but the base-commit scaffold; do not commit case
  content.

## Done when

Deliverables 1–8 are built and tested; the integration ledger is shown; the suite's 10 cases exist
locally with their README stating the detectable effect; the walk and decision run have run (or are
"awaiting go") and decision 7-T is presented as 33 §5 says.
