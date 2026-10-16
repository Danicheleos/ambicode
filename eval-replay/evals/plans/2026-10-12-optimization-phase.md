# Optimization phase: beat bare on quality, cost and speed (2026-10-12)

## Goal

On every case, ×5, the plugin arm must match or beat bare on all three of:
- **quality:** the outcome over the shared graders;
- **cost:** `costUsd`, counting the judge and any subagents;
- **speed:** `seconds`.

These are the definitions `track.mjs` already uses. No metric gets a relative band ([[drift-target-absolute]]).

## Where we stand (latest history.jsonl row per case, ×5, Sonnet 5.5 low)

```
case                 plugin score  bare score  plugin $/run  bare $/run  plugin s  bare s  plugin ctx  bare ctx
investigate-files    1             1           0.071         0.054       19        14      20.3k       17.2k
investigate-how      1             1           0.074         0.053       19        12      20.7k       17.2k
investigate-nomatch  1             1           0.051         0.054       12        12      18.0k       17.4k
plan-accept          0.891         0.6         0.127         0.066       39        23      26.3k       17.5k
review-clean         1             0.7         0.116         0.045       41        14      23.6k       16.9k
review-defect        0.873         0.8         0.110         0.046       35        16      23.4k       16.9k
review-regression    1             0.8         0.158         0.045       52        17      27.8k       16.9k
task-fix             1             0.667       0.168         0.045       48        16      30.5k       16.5k
```

- **Quality:** the plugin wins on plan, review and task, and ties investigate at 1/1.
- **Cost and speed:** the plugin loses everywhere except investigate-nomatch. It costs 1.3–3.7× as much as bare and takes 1.6–3× as long.
- **The cases are too small to reward the plugin.**
  - Every fixture has at most 15 files and about 35 lines of code.
  - Bare answers in 2–3 calls, so the plugin's fixed overhead can't pay for itself. That overhead is the SKILL.md (0.9–2.5 KB), the contract (952 B), step headers and `route next` round-trips.
  - Bare has nothing to get lost in.
- **Eval runs have no context.** The step payload says "no context: run /ambicode:init" in 74 traces. Context-mode maps are 156 B, which is almost empty.
- **The "15 rules in investigate" problem is already gone.** Commit `58ab4d2` removed the before-work stage from investigate, and investigate now gets 0 rules. The cost has moved:
  - plan/design and task/change each carry all 16 `common-quality` rules, 4,038 B. That is about 70% of each step's payload and 58 B under the 4,096 cap.
  - `appliesTo` globs are never applied in routes, because `src/skills/common.ts:135` passes `paths: []`.

The phases depend on each other, so they run in order. Each one ends at a gate, reports, and waits for approval ([[ask-before-reviewers-and-edits]]). Implementation runs in sonnet/medium subagents ([[implementation-subagents-sonnet-medium]]).

---

## Phase 0. Cost and time accounting ($0)

Before cutting anything, find out where the plugin's extra tokens and seconds go.

- Add `evals/scripts/breakdown.mjs`, or extend `context.mjs`. Per trace, it reports:
  - calls and tool calls per route step, using the ledger `delivered` entries as boundaries;
  - the bytes of every injected block (SKILL.md, contract, each step message, Stop-hook reasons);
  - `route next` round-trips;
  - subagent calls and their cost.
- Confirm that the harness `costUsd` includes subagent cost. Phases 3 and 4 depend on it. If it doesn't, add subagent usage to the cost in `track.mjs`, so delegating can't make the plugin look cheaper than it is.
- Run it over the r8, r6 and earlier plugin traces. The result is a table per case: fixed overhead, per-step bytes, calls per step, and the extra calls over bare.

**Gate:** the table, and the three biggest contributors to the plugin's extra cost.

## Phase 1. Cases that bare fails

Today's tie on investigate, and the cheap bare runs everywhere, both come from the toy fixtures. Make the cases harder by making the fixture realistic, not by adding grader traps.

1. **A new fixture**, `ts-app-medium`, in `fixtures/definitions.mjs`:
   - **Size:** about 80–150 files and 3–4k lines of code.
   - **Features:** several of them, such as invoices, customers, payments and notifications, with routes, services, models and repositories.
   - **Shared code:** a `shared/` layer of helpers and validators that a change should reuse.
   - **Decoys:**
     - names that look alike (`total` in three modules);
     - a legacy copy of the service;
     - a feature flag;
     - an event bus that hides one call edge.
   - **Conventions:** project conventions in CONTRIBUTING plus a lint rule.
   - **Tests:** jest tests with a shared test-data factory.
   - Built as replayable git steps, so a `task` or `review` case can sit on a realistic diff.
   - **Language:** stays TypeScript, as the bench only ([[tuning-language-agnostic]]).
     - A second, smaller Python twin can follow later, to check that the tuning hasn't overfit to TypeScript.
2. **New cases**, plus a version bump wherever an existing case moves onto the new fixture:
   - **investigate-trace:** a flow that crosses the event bus. Grade recall and precision of `## Files`, and the correctness of the call chain.
   - **plan-reuse:** a feature where the right plan reuses an existing validator or service. Grade by an LLM, "reuses X rather than reimplementing".
   - **task-multi:** a bug whose fix spans a service and a repository, and must use the project's error type and the test factory. Grade the shared graders and fix-correct, plus a convention grader.
   - **review-subtle:** the defect lies in a caller of the changed function, not in the diff, plus a convention violation. Grade finding-correct and no-false-defect.
3. **Bare goes first.** Bare is the cheap arm, at about $0.05–0.10 per run on this fixture (my guess).
   - Run bare ×5 on each new case.
   - The goal for a new case: bare's score ≤ 0.7, or bare's cost and time at least double what it is on today's cases. Bare should have to search.
   - If bare still scores 1, make the case harder before running the plugin.
4. Run the plugin ×5 on the same cases to set the starting point.
5. Keep the old cases as a regression floor. The new cases measure the win.

**Gate:** a bare-versus-plugin table for the new cases. Expected spend is about $5–8 (unverified).

## Phase 2. Context diet ($0, then a paid check)

Deliver less and keep quality.

1. **Policy rules by activity and relevance.** Change `policy.stage`; don't add a parallel path ([[change-before-add]]).
   - **Activity per rule.**
     - Add an `activities` field on each rule, falling back to the pack's.
     - Then plan/design gets only the architecture rules: need, fix-the-cause, cohesion, reuse, complexity, ownership, data-boundary.
     - task/change gets the code and test rules.
     - Rules that the reviewer subagent already enforces at review time can leave the change payload.
   - **Apply `appliesTo`.** Pass the paths from the map or brief instead of `[]` at `src/skills/common.ts:135`. Then a Python pack never reaches a TypeScript change.
   - Target: about 1.5 KB or less of rules per step, down from 4,038 B. The stage tests in `src/modules/policy/stage.test.ts` get assertions per activity.
2. **Fixed overhead.**
   - Cut the SKILL.md bodies the route makes redundant. Plan is 2,408 B and task is 2,470 B.
   - Merge `route next` round-trips that phase 0 shows to be pure handshakes.
   - Delete the dead files: `prompts/shared-operating-contract.md`, whose reader has no callers, and `prompts/reviewer-role.md`, which is unused.
3. **Paid check:** the plugin ×5 on all cases, old and new. Success means:
   - no score drops;
   - contextPeak and cost drop on plan and task.

**Gate:** the before and after table. Expected spend is about $6 (unverified).

## Phase 3. Knowledge subagent (`ambicode:navigator`)

The main model should get a compact, cited brief instead of exploring the repository itself. The navigator also keeps `.ambicode/context` current.

1. **Prerequisite: eval cases get context.**
   - Run the scout once per fixture, and review its output.
   - Commit the result as a fixture step, behind a `--context` flag in materialize, so every plugin case starts initialised the way a real user would be.
   - Bare doesn't get this context. That is fair, because creating it is the plugin's job. It is a one-off init cost, and gets reported separately.
2. **The agent, `agents/navigator.md`:** Sonnet, effort low, tools Read, Grep, Glob and `Bash(node *ambicode.mjs* context*)`.
   - **Input:** the question or iteration brief, the `map`, and the `context.list`.
   - **Output:** a fenced block with a fixed shape and a cap of about 2 KB:
     - files to read, with `path:N-M` ranges and why;
     - feature boundaries;
     - related dependencies;
     - existing models, services and helpers to reuse;
     - open questions.
   - It updates the context through `context write`. The guard already forces this route.
3. **Wiring.** Copy the reviewer pattern from `routes/review/agent.md` and `src/cli/commands/review/record.ts`:
   - a model step tells the main model to launch the agent;
   - `ambicode.mjs navigate record` validates the block (anchors exist, the size cap holds) and appends it to the ledger;
   - the next step's payload carries the brief in place of `map` and `context.list`.

   It goes in investigate (before read), plan (before design) and task (before change). It is skipped when the map is small, below a threshold that phase 0 sets: on toy repositories the subagent costs more than it saves.
4. **Measure** on the new cases, ×5:
   - main contextPeak;
   - total cost, including the navigator;
   - seconds;
   - score.

   Do the same with the navigator turned off. Report both: the navigator stays only if it wins.
5. **Context improvement check:** a second run on the same fixture, using the updated context, should take fewer navigator calls.

**Gate:** the comparison table, with the rejected arm's numbers shown.

## Phase 4. Implementation subagents (task route)

- **The agent:** `agents/implementer.md`, Sonnet, effort low or medium, decided by measurement.
- **Its input:** the iteration brief, the navigator brief, and the before-work rules for code. The rules travel only to the implementer, not to the main session.
- **What it does:** edits, runs the iteration's checks, and returns a fixed report: changed files, checks run with their results, and gaps.
  - `implement record` validates the report against the ledger and the checks before the route continues.
- **The main session keeps:** the gates, the reviewer launch, fix routing and the final report.
- **Multiple iterations:** a plan with several iterations gets one implementer per iteration, in sequence. Each gets a clean context.
- **Comparison:** run task-fix, task-multi and plan→task chains ×5 with inline change against delegated change. The comparison covers score, total cost, seconds and main contextPeak.

**Gate:** the table. Delegation stays only where it wins.

---

## Rules for the whole phase

- **Plugin, not evals.** Fix eval failures by tuning the plugin. Never edit an existing case to make the plugin pass. New cases are the exception, because building them is phase 1's job.
- **Language.** Tuning stays language-agnostic. Fixtures are only the bench.
- **Tests.** Targeted tests while working, and `npm run verify` at hand-off. Rebuild before every paid run.
- **Paid runs.** Only when the user approves each one. Raw data goes in `raw/`, and the write-up goes in `analysis/`.
- **Commits.** No commits unless the user asks.

## Decisions (user, 2026-10-12)

1. **Fixture:** TypeScript, about 100 files. A Python twin follows after phase 3.
2. **Bare and context** (the user left this to me): bare gets nothing outside the repository. The fixture's conventions live in a `CONTRIBUTING.md` that both arms can read. The plugin's `.ambicode/context` is what the scout derives from that repository.
3. **Old toy cases:** the aim is still to beat bare on cost and speed, and equal counts as a win. They stay a hard floor on quality.
