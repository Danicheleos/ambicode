# Module: Route (the call-chain engine)

## Purpose

Make every fixed step happen whether or not the model remembers it (M2, M3), deliver one
step's text at a time (M1, M17), give every gate a release (M13), bound loops and spending,
and record all of it so the report can be checked (R3). The route engine is the plugin's
harness inside Claude Code's harness.

## Inputs

- A **route definition** per skill, `routes/<skill>.yaml`, shipped in the plugin and validated
  by a zod schema at build time ([32-artifacts.md](../32-artifacts.md) §3).
- The **ledger** of the task directory (Evidence module). The engine never keeps other state.
- The triggering event: a `UserPromptSubmit` whose text starts with `/ambicode:<skill>`, a
  `PostToolUse(Skill)` for `ambicode:<skill>` (both start the route; the second is a no-op if the
  first did), a `PostToolUse` on an MCP read tool, or the model running `$A route next`.
- Answers to gates: an `AskUserQuestion` result (recorded by a `PostToolUse` hook; the answer is in
  `answers: {question: choice}`, probed 2026-10-02), or flags `--accept/--decline <gate>` on
  `route next`.

## Outputs

- **Step messages** to the model: one step's instruction, plus the payload that step needs
  (requirements, map, policy for this stage), bounded ([30-harness.md](../30-harness.md) §4).
- **Ledger entries**: `route` (start), `step` (each delivered step), `gate` (asked), `acceptance` /
  `declined` / `default-taken` (released), `exit` (stop reason), `limit` (a counter hit).
- `route status` for humans and tests: the fold of the ledger as a table.

## Workflow

### 1. Definitions

A route is an ordered list of steps. Each step has:

| Field | Meaning |
|---|---|
| `id` | unique in the route |
| `actor` | `code` (CLI or hook runs it), `model` (the model does judgment work), `worker` (a subagent, proposed through a gate), `human` (a gate) |
| `run` | for `code`: the module call (`requirements.normalize`, `search.map`, `policy.stage`, `checks.baseline`, `review.run`, `evidence.report`) |
| `instruction` | for `model`: text ≤ 1,500 chars, or a `file:` under `routes/steps/` |
| `payload` | which module outputs to attach (`map`, `requirements`, `policy:before-work`), each bounded by the module |
| `needs` | ledger kinds that must exist since `route` start before this step runs (`requirement`, `map`, `baseline`, `check:green`) |
| `produces` | ledger kinds this step must leave behind; a `model` step usually produces nothing until the next `code` step |
| `gate` | `{question, options[], default, release}`; `release` names the option that lets the route continue without the thing (decline, skip, keep-draft) |
| `repeat` | max times this step may run in one route (default 1; `map` 2; `review` 2) |
| `onError` | per error code: `retry-with <hint>`, `ask`, `stop:<reason>` |

A route also declares `budget: {codeCalls, modelSteps, wallMinutes}` and `exits:` (the stop reasons it
accepts: `done`, `blocked`, `budget`, `human`, `inconclusive`).

### 2. Start

```
$A route start <skill> [--task <slug>] [--headless] [args…]      (hook or model)
```

1. Resolve the repository and config (existing `findSessionRepository`). ⛔ `config-missing` → the
   message names `/ambicode:init`.
2. Mint or reuse the slug (Evidence `slug`): explicit `--task`, else the ticket key in args, else the
   kebab of the request, else `task-<hash>`. A second `route start` for the same slug and skill within
   the epoch is a no-op that re-prints the current step (idempotent, because both the prompt hook and
   the Skill hook may fire).
3. Append `route {skill, args, budget, epoch}`.
4. Run `code` steps in order until the first step whose `needs` are unmet or whose actor is not
   `code`. Each run appends its evidence (the module does that, not the engine).
5. Print the first `model` step as a step message.

Why the hook starts it: M3. Why the model can also start it: hooks did not fire for a typed command
in one probe (G1), and an instruction with a stated reason held where a bare one did not (M4).

### 3. Next

```
$A route next --task <slug> [--accept <gate>|--decline <gate>] [--show <payload>]
```

1. Fold the ledger (§4) to the current position.
2. If the previous `model` step declared `produces` that are missing, print **what is missing** and
   the command that produces it; do not advance. The second identical miss adds "or `route stop
   --reason blocked`". There is no third: the third call advances with the gap recorded as `limit`,
   so the route cannot wedge the session (R4 applied to the engine itself).
3. Run every `code` step now reachable. A `code` step that fails with an `AmbicodeError` follows its
   `onError`; the default is `ask` once, then `stop:blocked`.
4. A `gate` step prints the question, options, default and release, and appends `gate`. The model
   asks the human (AskUserQuestion when available). The answer arrives through the `PostToolUse`
   hook or through `--accept/--decline` on the next call. If neither arrives on the next call, the
   engine takes the default, appends `default-taken {gate, default}` and continues. The report must
   then say so (Stop hook, [15-guard.md](15-guard.md) §3). That is the headless release (M13).
5. A `worker` step prints a proposal: what the worker would do, its tools, its measured median cost,
   and the options *run* / *do it inline* / *skip*. Only the human's or the config's pre-approval
   (`workers.approved: [scout]`) runs it (D3).
6. Print the next `model` step, or, when none remains, the **report step**: the `evidence.report`
   skeleton ([13-evidence.md](13-evidence.md) §4) plus `exit done` instructions.

### 4. Position is a fold over the ledger

```
position(route, ledger):
  entries := ledger entries after the last `route` entry for this skill
  for step in route.steps:
    done := step.actor == code  ? every kind in step.produces exists in entries
          : step.actor == model ? a `step {id: next}` entry for the step after it exists
          : step.actor == human ? an acceptance/declined/default-taken entry for its gate exists
          : step.actor == worker? a `worker {id, outcome}` entry exists
    if not done: return step
  return report
```

Counters (`repeat`, `budget`, `sameError`) are counts over the same slice. Delete the ledger and the
route starts again; copy it and the route continues elsewhere. No file holds "current step".

**Why this and not a state file**: the existing skills forbid a workflow database, for the reason
that hidden state drives the model. A fold is not hidden: `route status` prints it, the ledger is
plain JSONL, and every line was written by code the model cannot forge (the guard denies writes
under `.ambicode/task/`).

### 5. Loops and budgets

| Limit | Default | When hit |
|---|---|---|
| `repeat` per step | map 2, review 2, check 3, others 1 | the step is skipped with a `limit` entry; the message says why; the report lists it under Not verified |
| same error code from one command | 2 | `stop:blocked` offered; the message names the code and the release from `outcomes.md` |
| `budget.codeCalls` | 40 | `route next` prints "budget: N code calls; stop or continue?" as a gate with default *stop* |
| `budget.modelSteps` | route-specific (investigate 6, plan 10, task 14) | same |
| `budget.wallMinutes` | 45 | same, measured from `route` entry time |
| identical `route next` without progress | 3 | advances with a `limit` entry (§3.2) |

Model turns and dollars are invisible to the CLI; the counters above are proxies. The transcript
(`transcript_path` in the hook input) could give real counts; it is not a documented format, so a
reader of it is diagnostic only and never gates ([40-open-problems.md](../40-open-problems.md) P9).

### 6. Delivery channels

| Channel | Limit (M14) | Used for |
|---|---|---|
| CLI stdout, model ran the command | 30,000 chars shown whole; target ≤ 8,000 | every `route next` reply |
| Hook `additionalContext` | ≤ 9,800 inline | `route start` from the prompt/Skill hooks; the step after an MCP read |
| File behind a preview | any | a step payload over the window: written to `.ambicode/task/<slug>/steps/<id>.md`; the message says "Read it whole, N bytes" (one extra turn, as G6 measured) |

A step message always starts with the same 3 lines: route and step id, what the model is asked to do
now, the command that ends the step. The payload follows. The ordering rule from v0.4.0 holds: what
matters most comes first, so a cut loses the least.

### 7. Stop

```
$A route stop --task <slug> --reason done|blocked|budget|human|inconclusive [--detail …]
```

Appends `exit`. The Stop hook accepts a final report only when an `exit` exists or every step is done;
a report with no exit is blocked once with "run `route stop`" (then allowed, so the hook cannot wedge
the session either).

## Interfaces

```ts
interface Route { skill: string; steps: Step[]; budget: Budget; exits: ExitReason[] }
interface Engine {
  start(input: {skill; args; task?; cwd; channel: 'hook'|'cli'}): Promise<StepMessage>;
  next(input: {task; accept?; decline?; show?}): Promise<StepMessage>;
  status(task): Promise<Position>;
  stop(task, reason, detail?): Promise<void>;
}
type StepMessage = { header: string; body: string; bytes: number; channel: 'inline'|'file'; file?: string }
```

Modules register `run` handlers by name: `registerStep('search.map', (ctx) => …)`. The engine owns no
module logic.

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| Hook did not fire | the skill body's one fallback line: run `route start` yourself |
| Two routes active on one slug (investigate then plan) | allowed; the fold is per `route` entry; the plan route reads the investigation note by `note list` |
| The model ignores `route next` and reports | Stop hook blocks once, lists the missing steps, offers `route stop --reason inconclusive` |
| The model runs a step out of order (review before edits) | `needs` unmet → the step is refused with what is missing; no silent reorder |
| The ledger is unreadable | ⛔ `ledger-unreadable`; release: `route start --task <slug>-2` opens a fresh directory and the message says the old one is kept |
| Compaction mid-route | `UserPromptSubmit` re-injects the current step from the fold (cheap: one file read) |

## What changes from v0.4.0

- `prepare-on-skill.ts` becomes `route start`; the three entry hooks (prompt, Skill, MCP read) stay.
- Skill bodies lose their step lists. Steps live in `routes/*.yaml` and `routes/steps/*.md`.
- `prepare` stops being a model-facing command; its parts (`requirements.normalize`, `search.map`,
  `policy.stage`) are route steps and separate commands.
- New ledger kinds: `route`, `step`, `gate`, `acceptance`, `declined`, `default-taken`, `limit`, `exit`,
  `worker`.

## Open problems (collected in 40)

- P1 The engine is a workflow engine by another name. Its defence is the fold and the tested exits;
  the risk (rigid procedure displacing reasoning) is measured, not argued away: the slim-route variant
  is compared to the naked model before any step is made mandatory.
- P2 `AskUserQuestion` answers reach the ledger only through a `PostToolUse` hook; `ExitPlanMode`
  acceptance was seen once in a transcript but not probed as a hook payload.
- P3 Headless cannot be detected reliably; the design does not need to detect it (default-taken), but
  a human who *is* present and whose answer arrived late gets the default. Mitigation: the default is
  always the conservative release (draft, skip, decline), never the acting option.
- P4 Three entry hooks for one start: dedup by (slug, skill, epoch) is a rule that must be tested
  against both the probe where the Skill tool fires and the probe where it does not.
