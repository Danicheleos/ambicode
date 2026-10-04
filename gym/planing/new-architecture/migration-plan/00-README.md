# Migration plan v0.4.0 → v5 architecture: hand-off for implementing agents

This directory turns [../v5/41-migration.md](../v5/41-migration.md) into eleven self-contained work
orders (`step-00` … `step-10`). Each one is written to be handed to an agent that has **not** read
this conversation. It says what to read, what to build, how to prove it, what not to do, and when
to stop and ask. The design under [../v5/](../v5/00-README.md) is the specification; a step file
never restates it in full, it points at the exact sections and adds the operational detail the
design leaves to the implementer. **When a step file and the design disagree, the design wins and
the disagreement is reported** (see "Escalation").

Status of the design: v5, approved 2026-10-04 by the fifth gated review
([../review-v5.md](../review-v5.md): 0 critical, 0 high, 3 medium applied in place). Nothing is built.

## How to dispatch a step

1. Give the agent: this file, the step file, and read access to the repository. Nothing else is
   needed; every step file lists what to read.
2. Fill in the **dispatcher block** at the top of the step file before handing it over (branch,
   commit policy, spend authorization). An agent that finds the block empty stops and asks.
3. The agent works in the order the step file gives, runs the proofs it names, and ends with the
   **report** in the format below. The report is the deliverable; the code is its evidence.
4. Steps are dispatched in the order of the dependency graph. Two steps may run in parallel only
   where the graph shows no edge between them **and** the dispatcher gives them separate branches.

## Common rules (every step, no exceptions)

1. **`CLAUDE.md` at the repository root applies in full.** The rules that do the most work here:
   measure before claiming; reproduce before fixing; report faithfully against yourself; typecheck
   after every structural edit; run the full suite before saying done; new behaviour ships with
   its test in the same change; add assertions, never weaken them; do not raise a limit to pass.
2. **The design is normative.** Read the sections the step names before writing code. Do not
   "improve" the design while implementing. If the design is wrong, impossible, or silent on a
   point that forces a choice with user-visible consequences, write it down under **Deviations**
   in the report with the evidence, implement the closest faithful reading, and flag it. Do not
   silently pick a different mechanism.
3. **User decisions D1–D19** ([../v5/01-goals-and-constraints.md](../v5/01-goals-and-constraints.md) §3)
   are not negotiable by an agent. The ones that bite during implementation: D2 (the user launches
   every skill; no model-driven selection), D8 (no LSP and no language service anywhere; nothing
   from [../v5/50-backlog.md](../v5/50-backlog.md) gets built), D9 (search layers declared in config,
   printed, recorded), D10/D16 (decision points present numbers; the user decides; no script rolls
   anything back), D11 (plan saved as a draft before anyone is asked), D15 (`map --layers` is not for
   the model), D17 (headless `hasRequirement` only via `--requirement`; benchmark configs untouched),
   D18/R16 (no route, module or step text names a language; ecosystem facts live in adapters),
   D19 (no new baseline run; the naked `prompt.md` never changes).
4. **Design rules R1–R16** (same file, §5) are enforced by tests the steps name. R3 (evidence from
   the record), R4 (every gate has a release and a non-acting default), R12 (the engine never wedges
   and never acts on silence) and R14 (every automatic choice is declared, printed, recorded) are the
   ones most easily broken by a shortcut.
5. **No money is spent without the dispatcher block saying so.** "Spend" means any model call:
   `claude -p`, `claude plugin eval`, a probe, a reviewer run. Unit tests, `npm run verify`,
   `git`, `node` scripts and reading are free. A step that reaches a spend item without
   authorization stops there, finishes everything else, and reports the item as "not run, awaiting go".
6. **NDA data.** `benchmarks/` and everything under `evals/evals-core/` except its `README.md` are
   under NDA and gitignored. Never copy ticket text, file lists, ground truth, prompts or case names
   into a committed file, a test, a comment, a report or a chat message. Tests use synthetic data.
   `evals-bench.test.mjs` fails if a tracked file names a ticket identifier; keep it passing.
7. **Nothing from the backlog.** [../v5/50-backlog.md](../v5/50-backlog.md) lists what is deferred
   and the condition that reopens each item. No step opens one.
8. **Layout is fixed** (below). Do not create parallel modules or directories; extend the seam that
   exists (CLAUDE.md "Making changes").
9. **Versioned design, frozen.** Do not edit anything under `../v1/` … `../v5/` or the reviews. A
   needed design change is reported, not applied; the user decides whether a v6 is opened.
10. **Reports are honest.** A skipped proof is "skipped", a failing test is shown with its output,
    a guess says "I'd guess". An agent never reports a step as done that it did not do.

## Code layout for the new modules (fixed)

Existing directories keep their roles; new code goes where the module already lives.

| Design module | Code home | New files expected |
|---|---|---|
| Route (12) | `src/route/` (new) | `engine.ts`, `fold.ts`, `routes.ts` (zod schema + loader), `gates.ts` (registry), `flags.ts`; `routes/<skill>.yaml`, `routes/gates.yaml`, `routes/steps/*.md` at the plugin root (32 §1) |
| Evidence (13) | `src/task/` (exists: `ledger.ts`, `slug.ts`) | `kinds.ts`, `notes.ts`, `report.ts`, `navigation-line.ts`, `task-dir.ts` |
| Search (10) | `src/code-intelligence/` (exists) + `src/git/git.ts` | `map.ts`, `harvest.ts`, `refs.ts`, `index/adapter.ts`, `index/none.ts`, `index/codeindex.ts`; `grepWords` beside `grepFiles` in `git.ts` |
| Requirements (14) | `src/requirements/` (exists) | `has-requirement.ts`, `template.ts`, `capture.ts`, `envelope.ts`, `acs.ts` |
| Policy (11) | `src/policy/` (exists) | `stage.ts`, `rules.ts` (discover/apply/revert), `quotes.ts`, `duplicates.ts` |
| Guard (15) | `src/hook/` (exists) | `command-parser.ts`, `stop-check.ts`; changes in `guard-core.ts`, `run-hook.ts` |
| Checks + Reviewer (16) | `src/checks/`, `src/review/`, `src/page/` (exist) | additions only, named in the step |
| Workers (17) | `src/workers/` (new) | `process-runner.ts` (generalized from `src/review/claude-reviewer.ts`), `plan-check.ts` |
| CLI | `src/cli/commands/` (exists), `src/cli/main.ts` `SPECS` | one file per new command; `USAGE` updated |
| Hooks | `hooks/hooks.json`, `scripts/guard.mjs` (built from `src/hook/guard.ts`) | matrix per 30 §1 |
| Skills | `skills/<skill>/SKILL.md` | bodies shrink per 22–25 |
| Evals | `evals/scripts/src/` | harness changes per 33 §0 |

Conventions that already exist and must be kept: errors are `AmbicodeError{code}` with the release
in the message (`src/util/errors.ts`); every command has `--json`; option specs are `OptionSpec`
objects parsed by `src/cli/args.ts`; `Runtime` from `src/composition/root.ts` is the only place
that touches `fs`, `process`, `Date` and `crypto`; tests are `node:test` files beside the code
(`*.test.ts`) and run through `npm run test:unit`; fixtures are defined in `fixtures/definitions.mjs`
and materialized with `node fixtures/materialize.mjs <name> <dir>`.

## Order and dependencies

```
step-00 harness ──► step-01 guard ──► step-02 evidence ──► step-03 route engine + investigate ──► DECISION A (point of no return)
                                                                     │
                                            ┌────────────────────────┼─────────────────────────┐
                                            ▼                        ▼                         ▼
                                     step-04 requirements      step-05 search             step-09 init + rules
                                            │                        │
                                            └──────────┬─────────────┘
                                                       ▼
                                                step-06 plan ──► step-07 task ──► step-08 review ──► step-10 experiments
```

- Steps 0–3 are sequential and produce the numbers the user decides on (41: "2–3 weeks").
- After step 3's decision point, steps 4, 5 and 9 are independent of each other.
- Step 6 needs 4 and 5; step 7 needs 6; step 8 needs 7 (it reuses `review-run` re-entry and the
  estimate seam); step 10 is last and only on its entry conditions.
- Probes gate steps (33 §0.4): P37 and P47 before step 1 (run in step 0); P2/P48 before step 3;
  P17 before step 7; P21 never (appendix workers are not built).

## Decision points (the user decides, D10/D16)

Every step file names its decision points. An agent that reaches one **stops that line of work**,
finishes everything that does not depend on it, and puts the decision in its report with: the
numbers on both sides, the loser's detail, the options with their cost, and the agent's
recommendation in one sentence. The agent does not pick. The known ones:

| Id | Where | What is decided |
|---|---|---|
| **0-V** | step 0 | **Claude Code version gate — decided (a) on 2026-10-04.** `withBaseline` (`evals/scripts/src/evals-bench.mjs:669`) refuses a baseline whose `claudeVersion` differs from the run's. The cached baseline ran on **2.1.287**; the machine has **2.1.288** today. Under D19 no new baseline runs. The user chose option (a): an explicit `--accept-baseline-version <ver>` flag that prints the mismatch as a GAP and records it in the result (step 0 §1). Not open for the agent. |
| 0-R | step 0 | How the live reviewer tier gets a signed-in reviewer (step 0 §7). |
| 0-P | step 0 | P37 fails in the sandbox → the sandbox arm starts the route from the skill body's fallback line, stated in every result. |
| A | after step 3 | **Point of no return**: `evals:decide` plugin arm vs the cached baseline: cost ≤ 1.15x and recall within the band (33 §1–2). Fails → the user decides whether the engine proceeds, is cut down, or is abandoned (then steps 4–8 ship on v0.4.0's hooks). |
| 5-I | step 5 | codeindex gains < 0.05 recall@15 over the regex harvest → stays `none`. |
| 6-P | step 6 | plan composite not a win → presented; scout appendix only if traces point at context/cost. |
| 7-T | step 7 | task suite inconclusive at 10 × 3 → enlarge (≈ $90–270) or cut task to baseline + guard + review offer. |
| 8-F | step 8 | finder claim not supported → the user decides how review is described. |

## Escalation (when to stop and ask)

Stop and ask only when different answers lead to materially different work (CLAUDE.md "Scope").
Ask in the report, not mid-task, unless proceeding under any assumption would make the work useless.
Format of a question: *context in two sentences → the options with cost → recommendation*. Routine
judgment calls (naming, file split, test data) are the agent's.

## Report template (end of every step)

```
# step-NN report — <date>

Result: done | done with deviations | blocked on <id> | partial (<what is missing>)

Verified: `npm run verify` <green|red + output>; new tests: <count>, <files>; probes: <id: result | not run, awaiting go>
Measured: <numbers the step was asked to produce, in a code block, with the command that produced them>
Deviations from the design: <none | list with v5 section, what differs, why, evidence>
Decision points reached: <none | id: numbers both sides, options with cost, recommendation>
Not done, and why: <list>
Spend: $<amount> on <what>, authorized by <dispatcher block line>
Files touched: <list>
Next: <the step that can now be dispatched, and what it needs from this one>
```

## Glossary

- **`$A`** — `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs"`, the built CLI. Measure against the
  build (`scripts/ambicode.mjs`), not `src/` (CLAUDE.md "In this repository").
- **Route / step / gate / fold** — 12 §1–§4. A route is `routes/<skill>.yaml`; the position is a
  fold over the ledger; a gate is a `human` step or a registry entry raised by an error code.
- **Evidence-writing command** — a CLI command that appends to the ledger and advances the route at
  its tail (12 §3.1 list; 31 marks them ⤵).
- **Ceremony turn** vs **work command** — 12 §3.1. Budgets per skill in 22–25.
- **Preanswer / acceptance / declined / default-taken** — 13 §1; semantics 12 §3.4.
- **Human cycle** — a gate-driven `revise` (D14) that resets `repeat` counters; bounded by `maxRevises`.
- **Naked arm / plugin arm** — `claude plugin eval` without / with the plugin; the naked arm is
  the cached 2026-10-02 baseline (D19).
- **Decision point** — a measured criterion that, when it fails, presents numbers and stops (R13).
