# Plugin training plan

How to tune ambicode, layer by layer. The plan starts with the layers that every skill passes through and ends with
single steps of single skills. A stage is done when its thresholds hold. Only then move to the next one.

Commands are described in the [manual in README.md](README.md#eval-commands-manual). Every diagnostic code below
(`map-missed`, `route-open`, …) is a finding of `npm run evals:report`.

## 1. Layers

From the widest to the narrowest. A change in a layer reaches every layer under it.

| # | Layer | What it is | Where | Skills | Steps / actions | Ours? |
|---|---|---|---|---|---|---|
| L0 | Claude Code and the model | agent loop, tool set, sandbox, prompt cache, compaction, model choice | — | all 6 | every model step and tool call | **no**. We pick the model and record the CC version; everything else is fixed |
| L1a | Hooks: SessionStart, UserPromptSubmit, PostCompact, SessionEnd | injected session context; UserPromptSubmit opens the route of a typed `/ambicode:<skill>`; rebind after compaction | `hooks/hooks.json`, `src/hook/` | all 6, and untyped sessions | session open; the route open of a typed `/ambicode:<skill>`; rebind after compaction (long runs: task, plan) | yes |
| L1b | Hook: Stop | the stop check: holds the session while a route step is pending | `src/hook/events/stop-check.ts` | all 6 | route close; the last model step: investigate `read`, task `write`, review `view`, plan `plan-write`, rules `apply`, init `apply` | yes |
| L1c | Hook: PostToolUse AskUserQuestion | records a human gate's answer | `src/hook/events/gate-answer.ts` | all 6 | every human gate: investigate `scope`; task `draft-ok`, `review-offer`; review `estimate`; plan `plan-accept`; rules `sources`, `rules-table`; init `init-apply` | yes |
| L1d | Hook: PostToolUse `mcp__*` | captures what a tracker tool returned | `src/hook/` | investigate, task, review, plan | `fetch`, when the ticket comes from an MCP tracker | yes |
| L1e | Hook: PreToolUse guard | git, glab, `.ambicode/task` writes, Write/Edit | `scripts/guard.mjs`, `src/hook/guard/` | task, review; read-only guard for investigate, plan | task `red`, `green`, `fix` (edits); review `fetch` (glab, git); note writes in every skill; any edit attempt in a read-only skill | yes |
| L2a | Session contract, shared operating contract | the text every session gets | `prompts/session-contract.md`, `prompts/shared-operating-contract.md` | all 6, and untyped sessions | every model step | yes |
| L2b | Reviewer role | the independent reviewer's system prompt | `prompts/reviewer-role.md` | review, task | review `review-run`; task `review-run`, `report-step` | yes |
| L3 | Harness engine | route fold, step delivery, execution, gates, status, budgets, exits, the ledger | `src/harness/` | all 6 | every step; budgets per route; `repeat`/`revise`: investigate `ground`, review `ground`, the `estimate` revise loop, task red/green | yes |
| L4a | Requirements | template, normalize, ACs | `src/modules/requirements/` | investigate, task, review, plan | `template`, `fetch`, `ground`; ACs feed investigate `read` and plan `design` | yes |
| L4b | Search: profile, map layers, locate | the project profile; `search.map(prompt)` = `[shortlist, harvest, shortlist]`; `search.map(context)` = `[grep, harvest]` | `src/modules/search/` | investigate, task, plan, init | `map(prompt)`: investigate `ground` → `scope`, `read`. `map(context)`: task `ground` → `red`; plan `ground` → `design`. Profile: init `propose`, policy globs | yes |
| L4c | Search: code index, dependents | declarations, relations, dependents, index drift (20 files) | `src/modules/search/` | task, review, init | task `ground` (`task.index`, the `callers` payload of `red`); review `estimate-step`, `review-run` (dependents in the bundle); init `propose` (index scan) | yes |
| L4d | Policy | stage packs from `policies/*.yaml`: before-work, before-checks, before-report | `src/modules/policy/`, `policies/` | investigate, task, plan; packs written by rules | before-work: investigate `read`, task `red`, plan `design`. before-checks: task `red`/`green`. before-report: task `write`, plan `plan-step` | yes |
| L4e | Checks | baseline, test selection (≤ 20 files, 120 s) | `src/modules/checks/` | task, init | task `ground` (`checks.baseline`), `red`, `green`, `fix`; init `propose` (baseline detection) | yes |
| L4f | Review | estimate, bundle, reviewer worker (sonnet, 300 s) | `src/modules/review/` | review, task | review `estimate-step`, `estimate`, `review-run`, `readback`, `view`; task `review-run`, `report-step` | yes |
| L4g | Evidence, workers | notes, navigation line, promotion; plan-check | `src/modules/evidence/`, `src/modules/workers/` | investigate, plan, task | investigate note (`read`); plan `plan-step`, `plan-check`, `promote`; task report | yes |
| L4h | Config defaults | defaults, init proposal, doctor | `src/modules/config/` | init; defaults of all 6 | init `propose`, `close`; the defaults of every module above | yes |
| L5 | Route definitions | per skill: budget (`modelSteps`, `wallMinutes`, `toolTurns`), exits, step order, `when`, `repeat`, `revisable`, gate questions and defaults | `routes/*.yaml`, `routes/gates.yaml` | one route per skill; `gates.yaml` all 6 | budget, exits, step order, `when`, gates of that route; `budget-exhausted` everywhere | yes |
| L6 | Step payloads | what a step hands the model: `payload: [envelope, acs, map, policy:…]`, map size limits (leads 1,200 B, feature 400 B) | route `payload:` + the module that renders it | investigate, task, plan, rules, review | investigate `read`; task `red`, `write`; plan `design`; rules `draft`; `fetch` (template) in investigate, task, review, plan | yes |
| L7a | Step instructions | `routes/<skill>/<step>.md`, ≤ 1,500 chars | `routes/<skill>/` | all 6 | one model step per file. Shared: `plan/fetch.md` = plan and task `fetch`; `init/apply-run.md` = init `apply`, `apply-adjusted`. Others: investigate `fetch`/`read`, review `fetch`/`readback`/`view`, task `red`/`green`/`fix`/`write`, plan `design`/`plan-write`, rules `draft`/`apply` | yes |
| L7b | Skill bodies | `skills/*/SKILL.md` | `skills/` | one skill each | from the skill open to its first step | yes |
| — | Eval side | cases, oracles, graders, the bare baseline | `evals/` | investigate, review, task, plan | what each is measured by: localize, review, task, epic cases | yes, but it is the ruler, not the plugin |

Routes and their model steps:

| Skill | Budget | Code steps | Model steps | Human gates |
|---|---|---|---|---|
| investigate | 6 steps, 12 tool turns | template, ground (normalize, ACs, `search.map(prompt)`, policy before-work) | fetch, read | scope (only if the map is empty) |
| task | 18 steps, 90 min | template, start, ground (normalize, checks baseline, `search.map(context)`, inventory, policy, index), review-run, report-step | fetch, red, green, fix, write | draft-ok, review-offer |
| review | 6 steps, 45 min | template, ground, estimate-step, review-run | fetch, readback, view | estimate |
| plan | 14 steps, 45 min | template, ground (`search.map(context)`), plan-step, plan-check, promote | fetch, design, plan-write | plan-accept |
| rules | 8 steps | discover, context, drafts-check, close | draft, apply | sources, rules-table |
| init | 2 steps | propose, close | apply, apply-adjusted | init-apply |

### Rules for every stage

- **Tools before words.** Change L3–L6 first: what the engine runs and hands over. Change L7 wording only after the
  stage's tool levers are used up.
- **Language-agnostic.** Every lever reads the measured project profile. No language, framework or ecosystem
  tables. A change counts only if it holds on BE-express, FE-angular and python (where python has data).
- **Cheapest check first.** Free offline check → `evals:walk` (1 run, about $1–2) → `evals:decide` (3 runs, about
  $13–20) → `evals:gate` against the baseline → `evals:report`.
- **No regressions upstream.** At every `decide`, re-check the thresholds of the stages already passed. A narrow
  change that breaks a wide threshold is reverted.
- **Noise.** A gain or loss counts only beyond the noise band of the run (`evals:report`; 0.099 recall on run 12).
  One run per case decides nothing.
- **Build first.** `npm run build` before any paid run; the evals run `scripts/ambicode.mjs`.

## 2. Starting point (run 12, 2026-10-06, 10 localize cases × 3, sonnet)

| Metric | Plugin | Bare |
|---|---|---|
| recall | 0.731 | 0.723 |
| precision | 0.620 | 0.562 |
| cost | 1.07× | 1.00× |
| wall time | 48.4 s | 38.8 s |
| model calls | 8.0 | — |
| first-call context | 18.6k tokens | — |
| peak context | 35k tokens | — |
| route step ready | 4.7 s after session start (map ≈ 4.3 s) | — |
| runs with `exit:done` | 26 / 30 | — |
| `map-missed` runs | 7 | — |
| `map-empty` cases | 2 | — |
| `first-call-broad` runs | 15 / 30 | — |
| offline map recall (core) | 40% (21 of 53 truth files) | — |
| offline map recall (python) | 26% (9 of 34) | — |

Task walk (fe-task-vs-5164): $0.51, 22 calls, the route stayed open at `write:delivered`, red/green repeated with
limit entries.

## 3. Stages

Order: stage 0 makes the ruler valid; stages 1–6 are global; stages 7–12 are per skill; stage 13 is wording.

### Stage 0 — Measurement is valid (eval side, no plugin change)

Nothing below means anything until this passes. The details are in
`gym/planing/new-architecture/refactoring/evals/04-cases-audit.md`.

Work:

- `evals:walk` and `evals:decide` serve `--prompt with`.
- Review cases carry `prompt.with.md`.
- Graders read the ledger instead of the `plugin-fired` / `helper-ran` checks.
- `select` ranks by discrimination: bare recall 0.3–0.8, 3–7 truth files, at least 3 threads per review version, one
  version per merge request.
- The missing `assets/`, `reviews/` and config files are restored so cases can be regenerated.
- A naked baseline exists for the current model and CC version (`evals:baseline`, 3 runs).

| Pass when | Threshold |
|---|---|
| `infra`, `untraced`, `naked-prompt`, `unrouted`, `version`, `model` findings | 0 |
| cases where both arms are saturated (≥ 0.95) or at the floor (≤ 0.2) | ≤ 1 of 10 |
| bare baseline | same model and CC version, ≥ 3 runs per case |
| noise band on recall, from the baseline | ≤ 0.10 |
| unit tests of `evals/cases/scripts` | all pass |

### Stage 1 — Session cost: hooks and session prompts (L1, L2)

Every session pays this, typed skill or not. Lever: what SessionStart and UserPromptSubmit inject, and how long the
hooks take.

Measure: `context` (first-call context minus bare), `route-slow`, wall time, cost of a run where no skill is typed.

| Pass when | Threshold | Now |
|---|---|---|
| first-call context over bare | ≤ 2,000 tokens (`extraContext`) | not separated yet; the report gives it |
| route step ready after session start | ≤ 5 s in ≥ 90% of runs (`routeReadyS`) | 4.7 s average |
| a session with no typed skill vs bare | cost ≤ 1.05×, recall within the band | not measured: add one untyped-prompt case |
| hook failures in traces | 0 | — |

### Stage 2 — Engine: delivery, closure, budgets (L3, L1 Stop)

Lever: step delivery, the Stop check, exits, budget accounting, `repeat` and `revise` handling.

Measure: `route-open`, `route-exit`, `stop-blocked`, `step-unstable`, `turns`, the route signatures in `chains.md`.

| Pass when | Threshold | Now |
|---|---|---|
| runs that end with an exit entry | ≥ 29 / 30 (97%) | 26 / 30 |
| `budget` exits on the curated set | 0 | — |
| Stop blocks that the model did not need | 0 | — |
| model calls over bare | ≤ +2 per run (`extraCalls`, gate `maxExtraTurns`) | — |
| distinct route signatures per case | 1 (`step-unstable` absent) | — |
| task walk | route closes with `exit:done`; no repeated red/green after a limit entry | open at `write:delivered` |

### Stage 3 — Search map: profile, index, locate (L4 search, L6 map payload)

The map is the main tool lever: investigate, task and plan read it. Tune offline first; it is free.

Lever: profile and index facts, map layers (`[shortlist, harvest, shortlist]` for prompts, `[grep, harvest]` for
context), dependents, leads and feature limits.

Step 3a, offline (`evals:map-recall`, `evals:shortlist-recall`, `evals:layer-audit`):

| Pass when | Threshold | Now |
|---|---|---|
| map recall, curated core | ≥ 60% | 40% |
| map recall, python | ≥ 40% | 26% |
| any project or case set that drops | none drops by more than 1 truth file | — |
| empty maps | 0 | 2 cases |
| leads size | ≤ 1,200 B; feature ≤ 400 B (unchanged) | — |
| map time | ≤ 3 s | ≈ 4.3 s |

Step 3b, paid (`evals:walk`, then `evals:decide` on localize):

| Pass when | Threshold | Now |
|---|---|---|
| `map-missed` runs | ≤ 3 / 30 | 7 / 30 |
| `first-call-broad` runs | ≤ 6 / 30 | 15 / 30 |
| `outside-map` true files read | falls vs run 12 | — |
| recall | ≥ run 12 − band | 0.731 |

### Stage 4 — Policy stages (L4 policy, `policies/*.yaml`)

Lever: which stages inject policy, and how many bytes. The packs are drafted per project by `rules`, so this stage
tunes the stage mechanics, not the pack contents.

| Pass when | Threshold |
|---|---|
| policy bytes per step | report the size per stage; no step over 1,500 B of policy |
| decide with policy stages on vs off | quality within the band; cost ≤ 1.05× of "off" |
| task: policy findings that the change fixes | reported in `task.report`; no false findings in the walk |

### Stage 5 — Checks: baseline and test selection (L4 checks)

Used by task (`checks.baseline`, red, green) and by review.

| Pass when | Threshold |
|---|---|
| baseline time | ≤ 120 s (the default timeout) on every project |
| selected test files | ≤ 20 (the default), and they include the hidden test's file in ≥ 80% of task cases |
| flaky baseline (same commit, two results) | 0 |

### Stage 6 — Independent reviewer (L4 review worker)

Shared by review and task (`review-run`). Tune it with recordings first (`evals:reviewer`), live last.

| Pass when | Threshold |
|---|---|
| complete (not partial) reviews, live tier | ≥ 90% |
| finding locations that exist in the change | 100% |
| reviewer time | ≤ 300 s (the default timeout) |
| reviewer cost | reported separately from the session cost |

### Stage 7 — investigate

Route: template → fetch → ground → scope → read. Cases: localize. The cheapest skill to run (about $0.19 a run), so
it goes first and checks stages 1–3 again on every decide.

| Pass when | Threshold | Now |
|---|---|---|
| recall gain over bare | > band (≈ +0.10) | +0.008 |
| precision | ≥ bare | 0.620 vs 0.562 |
| cost | ≤ 1.1× bare (gate) | 1.07× |
| wall time | ≤ 1.15× bare | 1.25× |
| `exit:done` | ≥ 97% | 87% |

Step levers, in order: `ground` (map variant, `revise ground --term`), `scope` (when the map is empty), the `read`
payload (envelope, ACs, map, policy), then `investigate-read.md`.

### Stage 8 — task

Route: template → fetch → start → draft-ok → ground → red → green → review-offer → review-run → fix → report-step →
write. Cases: task (1 on disk; generate 10). The hidden test of the merged fix is the oracle.

| Pass when | Threshold |
|---|---|
| hidden test green: gain over bare | ≥ 20 pp (decision 7-T) |
| cost | ≤ 1.2× bare (decision 7-T) |
| red before green in the ledger | 100% of passing runs |
| repeated red/green after a limit entry | 0 |
| route exits | ≥ 97% |
| sample | 10 cases × 3 runs |

Step levers: `ground` (inventory, index, checks baseline), `red`/`green` repeat and limits, `review-offer` default,
`fix`, then `task-*.md`.

### Stage 9 — review

Route: template → fetch → ground → estimate-step → estimate → review-run → readback → view. Cases: review versions
with at least 3 human threads.

| Pass when | Threshold |
|---|---|
| thread recall gain over bare | > band, and ≥ +0.15 |
| reported findings that point at a real location | 100% |
| session cost, reviewer excluded | ≤ 1.1× bare |
| estimate shown before the reviewer runs | 100% of runs |

Step levers: `estimate-step` (narrowing), the readback payload, then `review-readback.md`, `review-view.md`.

### Stage 10 — plan

Route: template → fetch → ground → design → plan-step → plan-write → plan-check → plan-accept → promote. Blocked until
epic data exists; the runner is `plan-run.mjs`, scored by `plan-score` and `plan-composite`.

| Pass when | Threshold |
|---|---|
| composite | a win on ≥ 2 of 3 metrics (file recall, anchor validity, AC coverage) beyond the bare spread |
| anchor validity | ≥ 95% |
| plan-check passes before plan-accept | 100% |
| budget | no `budget` exit within 14 steps |

### Stage 11 — rules

Route: discover → sources → context → draft → drafts-check → rules-table → apply → close. Deterministic setup, so
integration tests, not paid evals.

| Pass when | Threshold |
|---|---|
| drafts-check passes on the first draft | on all 3 projects |
| drafted rules that cite a source document | 100% |
| ecosystem words in the code that drafts | 0 (facts come from the profile) |
| model steps | ≤ 8 (budget) |

### Stage 12 — init

Route: propose → init-apply → apply / apply-adjusted → close.

| Pass when | Threshold |
|---|---|
| config written and `doctor` clean | on all 3 projects |
| proposed values that come from the measured profile | 100% |
| model steps | ≤ 2 (budget) |

### Stage 13 — Wording (L7)

Last, and only for a step whose tool levers are used up. One file per change; run the skill's decide.

| Pass when | Threshold |
|---|---|
| step instruction size | ≤ 1,500 chars |
| quality | gain beyond the band on that skill, nothing lost on the others |
| model calls in that step | not more than before |

## 4. One tuning loop

1. Read the latest `evals:report`. Pick the top weak finding inside the current stage.
2. Change one lever in the stage's layer.
3. Run the targeted unit tests, then the free offline check if the stage has one.
4. `npm run build`, then `evals:walk`. Stop if a stage-0 or stage-2 finding appears.
5. `evals:decide` with `--tag <kind>` for the stage's skill, then `evals:gate` and `evals:report`.
6. Keep the change if the stage threshold moved and no passed stage regressed. Otherwise revert.
7. Record the result in `outputs/<type>/<date>/iterations.md` with the stage number in the label.
