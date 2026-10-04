# Step 6 — Plan route: draft first, `plan check` with re-entry, promotion, decision gates, the plan eval

> **Dispatcher block (fill in before hand-off; the agent stops if empty)**
> - Branch: `__________`
> - Commit policy: `__________`
> - Spend authorization: plan eval 3 epics × 3 runs × 2 arms (≈ $32–45): `__________`; a walk-sized dry run first (1 epic × 1 run × 2 arms, ≈ $4–5): `__________`
> - Steps 4 and 5 reports attached: `yes` (both are prerequisites)

## Why this step exists

The plan skill's measured defects: the plan gate had no headless release and a 95 KB plan was left
unsaved (M13, real-run B4); the plan body was emitted twice at 78 KB (M20); anchors were not checked
by code. v5: a draft is saved **before** anyone is asked (D11), `plan check` verifies anchors and AC
coverage by code with bounded re-entry (R15), a human *Revise* always gets another round (D14), and
promotion happens only on record (R3, R4). Design: [../v5/skills/23-plan.md](../v5/skills/23-plan.md),
[../v5/modules/17-workers.md](../v5/modules/17-workers.md) §1–§2, [../v5/32-artifacts.md](../v5/32-artifacts.md) §3
(the plan route file, verbatim), [../v5/33-measurement.md](../v5/33-measurement.md) §4, §8;
[../v5/41-migration.md](../v5/41-migration.md) step 6.

## Read first

1. `CLAUDE.md`.
2. `../v5/skills/23-plan.md` whole; `../v5/32-artifacts.md` §3 (copy the route YAML as written; the
   comments are part of the specification), §4 (`decision:*`); `../v5/modules/12-route.md` §1
   (`maxRevises`, `onAnswer`), §3.4–§3.5 (model-raised decision gates), §4 (human cycles, D14);
   `../v5/modules/13-evidence.md` §3 (notes; `note promote` from step 2); `../v5/modules/17-workers.md`
   §1–§2 (process runner; `plan check` as a plain code step, #85); `../v5/modules/15-guard.md` §1
   (plan-body allow row from step 1); `../v5/33-measurement.md` §4 (composite defined **before** the
   first run, #62), §8 (plan fixtures); `../v5/30-harness.md` §3 (plan context budget), §8 (Revise
   rows); `../v5/01-goals-and-constraints.md` §1 (the plan bar), M13, M19, M20, D11, D12, D14, R15;
   `../v5/40-open-problems.md` P23, P26, P42, P45, P46, P50, P55.
3. Code: `src/route/*` (step 3), `src/task/notes.ts` (`promote`, step 2), `src/review/claude-reviewer.ts`
   (the runner you generalize: env allowlist, `--tools`, `--json-schema`, output cap), `skills/plan/SKILL.md`
   (9.9 KB today; shrinks to ≤ 2.5 KB), `src/util/skill-content.test.ts` (plan assertions at `:194-230`).
4. `gym/planing/investigation/archive/real-run-VS-6735-2026-10-02.md` §5 and session B (plan
   anchors, the 214k peak, the double emission); `gym/planing/investigation/archive/real-run-VS-6735/`
   (the real-run runner and the `score2.mjs` / `anchors2.js` scorers 33 §4 names — locate them and
   cite their paths in the report).

## Deliverables

### 1. `src/workers/process-runner.ts` (17 §1)

Generalize `ClaudeReviewer`'s invocation into one runner: allowlisted env (`reviewerEnvironment()`
becomes the default policy), cwd, `--tools`, `--json-schema`, output cap, failure reasons,
`maxBudgetUsd`, `maxTurns`. `ClaudeReviewer` uses it with no behaviour change (its tests stay
green unchanged — that is the proof). A **model-free** worker runs in-process. No model worker ships
(17 appendix; the `worker` step kind and its gate are schema-only).

### 2. `plan check` (17 §2) as `src/workers/plan-check.ts` and `$A plan check --task <slug> [--from steps/plan-body.md | stdin]` ⤵

Code only. Checks: every cited path exists; every `:LINE` ≤ file length; every quoted identifier
occurs within ±3 lines of its anchor (port `anchors2.js`'s rule; prose range anchors get the range
check only, P26); every `AC-*` id from `requirements acs` is mapped in the plan's AC → section table
or listed under "Not covered"; no new exported name duplicates an existing one (`find`). Output
`{anchors: {checked, bad[]}, acs: {mapped, unmapped[]}, duplicates[]}`; > 50 bad anchors → the first
50 and the count. **Its tail**: first `note save --kind plan-draft --from steps/plan-body.md` (the
draft exists from here, D11), then `worker {plan-check}`, then advance: on `bad.length > 0 ||
unmapped.length > 0` → `onFail: revise plan-write` with the bad list in the re-printed write step;
past `plan-write`'s `repeat: 3` → the remainder goes to "Known limitations" and the route moves to
`plan-accept`. Artifact `workers/plan-check-<ts>.json` ≤ 64 KB.

### 3. `routes/plan.yaml` and `routes/steps/plan-*.md` (32 §3, 23)

The YAML **verbatim from 32 §3**, including `produces: [policy{before-report}]`, `[note{plan-draft},
worker]`, `[note{plan}]`, `repeat`s, `maxRevises: 3`, `onAnswer: {Revise: revise design}`,
`default: Reject`, `when: gate.plan-accept.is(Accept)`. Step texts: `plan-fetch` (field lists, then
`route next`), `plan-design` (reuse sweep with `$A find`; design and alternatives; for each
**material** decision one `AskUserQuestion` carrying `[ambicode gate decision:<slug>]`; the judgment
"material vs routine" in one sentence), `plan-write` (write `steps/plan-body.md` **once** with the
shape: AC → section table; per-iteration briefs *Goal, Changes path:line, Tests (fails first),
Accept, Checks by key, Leaves out*; then `$A plan check --from steps/plan-body.md`). Each ≤ 1,500 chars.

### 4. Gate behaviour (23 steps 4, 8, 9)

- Decision gates: the model's own `AskUserQuestion` with the marker; the hook appends `gate {class:
  decision}` + `acceptance {via: hook}`; registry default *keep open* (the plan stays a draft).
- `plan-accept`: *Accept* / *Revise (N left)* / *Reject*; **default: keep the draft** (non-acting);
  `Revise` → `revise design` as a **human cycle** (design/plan-write counters reset; D14); fourth
  Revise → "(0 left)" and `declined {max-revises}` (P55); *Accept* → the gate tail runs `promote`
  (`note promote`, step 2's predicate) → `note {plan, promotedFrom}` → route complete.
  `plan-not-accepted` when the acceptance is not honoured per 12 §3.4.
- Headless: `route start plan … --headless --answer plan-accept=Accept` is a `preanswer` consumed at
  the gate; the report says "answered in the prompt (before the artifact existed)" (P42).
- `ExitPlanMode` is **not** a channel (D12; backlog).

### 5. Skill body and grants (23 "What the model loads")

`skills/plan/SKILL.md` ≤ **2.5 KB**: the judgments (material vs routine; reuse over new;
independently reviewable iterations), the plan shape, the planning boundary with reasons, the
fallback start line. `disable-model-invocation: true`. `allowed-tools` **gains**
`Write(.ambicode/task/*/steps/plan-body.md)` (#57) — the guard's plan-body row (step 1) is the real
boundary. Remove `note save --kind plan` from `note.ts` now (step 2 kept it deprecated) and update
the guard's deny message and tests. `skill-content.test.ts` assertions about the old plan body are
rewritten for the new shape (the "never call a plan accepted merely because it was generated" idea
survives as a one-line boundary statement).

### 6. Fixtures (33 §8, plan rows) in the gates table test

- Two `plan check` failures then a human *Revise* re-opens `design` with fresh counters (#75, D14).
- A model `--revise design` does not consume the human's allowance.
- `plan-draft` exists before any `plan-accept` **acceptance** entry (D11; a `preanswer` is not one).
- *Accept* with `note{plan-draft}` already in the window still runs `promote` (#105).
- The headless chain: `--answer plan-accept=Accept` survives a `revise plan-write` and promotes at the gate (#78).
- Byte ceilings: body ≤ 2.5 KB; start ≤ 4 KB; ground ≤ 9 KB (file if larger); plan step ≤ 3 KB.

### 7. The plan eval (33 §4; needs go)

1. **Define the composite before the first run** (#62, P50): write
   `evals/scripts/src/plan-composite.mjs` with the rule verbatim from 33 §4 (per metric, noise = the
   naked arm's run-to-run spread, max − min over its 3 runs per epic, averaged; the route wins when
   above naked by more than the noise on ≥ 2 of 3 metrics and not below by more than the noise on
   the third; a tie on AC coverage counts as "not below"). Unit-test it on synthetic numbers. Commit
   it **before** any run.
2. Hand-label the ACs of the three epics (33 §4, P23): the labels live beside the benchmark data
   (NDA, gitignored); the report gives counts only.
3. Rebuild the real-run runner **as one process** (MCP servers are dropped on `--resume`, 33 §4);
   it lives under `evals/scripts/src/` and reads the epics from the NDA location by configuration,
   never by a committed list.
4. Scorers: file recall (`score2.mjs` port), anchor validity through `plan check`, AC coverage
   against the labels. Report cost, turns, peak context, revises per run (P32: peak context from the
   trace).
5. Dry run first (1 epic × 1 run × 2 arms) if authorized; then 3 × 3 × 2.
6. **Decision 6-P**: win → report; not a win → present per-metric means and spreads for both arms
   (P50 asks for the spreads with every result), and propose the scout appendix (17; +$16–23) **only
   if** the traces show the main session's context or cost is the bottleneck. The user decides.

## Proofs

- `npm run verify` green; the table test covers every plan gate and fixture above; `ClaudeReviewer`
  tests unchanged and green through the shared runner.
- Integration on a materialized fixture (`ts-feature-boundary` with a synthetic request): `route
  start plan "<text>"` → ground → design step; a decision gate answered through a synthetic hook
  payload; `route next` → plan step; a plan body written by test code; `plan check` with one bad anchor
  → write step re-printed with the bad list; a corrected body → `plan check` passes → draft saved →
  `plan-accept` printed with "(3 left)"; synthetic *Accept* via hook → `plan_<ts>.md` exists, ledger
  shows `note {plan, promotedFrom}`. Show the ledger.
- Ceremony count of 23's table reproduced by the synthetic walk test (3 + N for N decisions, +1
  work command).

## Do not

- Do not build scout, collector or plan-judge workers (17 appendix; backlog) or any `worker` gate.
- Do not accept a plan on anything but an honoured `acceptance` (hook, prompt, or flag in headless).
- Do not let the engine write `steps/plan-body.md` or any source file; the model writes the one
  file through the grant.
- Do not run the plan eval before `plan-composite.mjs` is committed with its test.
- Do not commit epic ids, AC texts or labels.
- Do not reopen `ExitPlanMode` (D12).

## Done when

Deliverables 1–6 are built and tested, the integration ledger is shown, the composite script is
committed, and the plan eval has run (or is "awaiting go") with decision 6-P presented as 33 §4 says.
