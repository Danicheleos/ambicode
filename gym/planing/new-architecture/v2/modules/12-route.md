# Module: Route (the call-chain engine)

## Purpose

Make every fixed step happen whether or not the model remembers it (M2, M3), deliver one step's
text at a time (M1, M17), give every gate a release and a non-acting default taken only on record
(R4, R12), bound repeats, and record all of it (R3). The engine is the plugin's harness inside Claude
Code's harness.

## Inputs

- A route definition per skill, `routes/<skill>.yaml`, zod-validated at build (32 §3).
- The ledger of the task directory. No other state.
- Triggers: `UserPromptSubmit` whose text starts with `/ambicode:<skill>`; the model running
  `$A route next`; `--headless` on `route start`; gate answers through the `PostToolUse(AskUserQuestion)`
  hook (the result carries `answers: {question: choice}`, seen in a transcript, G13; hook payload shape
  is probe P2) or through `route next --answer <gate>=<option>`.

## Outputs

- Step messages: one step's instruction plus the payload it needs, bounded (30 §4).
- Ledger: `route`, `step`, `gate`, `acceptance`/`declined`/`default-taken` (each with `via`), `limit`, `exit`,
  `worker`.
- `route status`: the fold as a table.

## Workflow

### 1. Definitions

| Field | Meaning |
|---|---|
| `id` | unique in the route |
| `actor` | `code`, `model`, `worker`, `human` |
| `run` | for `code`: one or more module calls |
| `instruction` | for `model`: text ≤ 1,500 chars or `file:` |
| `payload` | module outputs to attach, each bounded by its module |
| `needs` | ledger kinds required since the route's `route` entry |
| `produces` | ledger kinds this step must leave behind; a `model` step may name them (then it is done when they exist) |
| `when` | a condition from a fixed vocabulary: `args.hasRequirement`, `!args.hasRequirement`, `map.empty`, `plan.isDraft`, `headless`, `interactive`, `index.present`; a step whose `when` is false is skipped and recorded `step {skipped}` |
| `gate` | **only on `human` steps**: `{question, options[], default, release}`; `default` must be a non-acting option and equal to or weaker than `release` |
| `repeat` | max runs in one route: map 2, review 2, check 5, others 1 |
| `onError` | per code: `retry-with <hint>`, `ask`, `stop:<reason>`; default `ask` once then `stop:blocked` |

A route declares `budget: {modelSteps, wallMinutes?}` (`wallMinutes` applies only in `--headless`) and
`exits: [done, blocked, human, inconclusive, superseded, budget]`. Branching is expressed with two
steps and complementary `when`s, never inside `run`.

### 2. Start

```
$A route start <skill> [--task <slug>] [--headless] [--project <id>] [args…]
```

1. Resolve the repository and config. ⛔ `config-missing` → names `/ambicode:init`. Two projects and
   no `--project` or paths → the start message is a gate whose release is `route next --project <id>`.
2. Slug: `--task`, else the ticket key, else the kebab of the request, else `task-<hash>`.
3. Dedup key `(slug, skill, epoch, hash(args))`: identical → re-print the current step, no new entry.
   Same slug and skill, different args, an open route → append `exit {reason: superseded}` to the open
   route, then a new `route`. Any other open route in this session (other slug) → the new start records
   `exit {superseded}` on it too, so one route is active per session.
4. Append `route {skill, args, mode: interactive|headless, session, epoch}`.
5. Run `code` steps until the first unmet `needs` or a non-`code` actor; print the first `model` step.

Entry points: the `UserPromptSubmit` hook (the only one under D2; whether it fires for a typed
command in every surface is probe W12, 33 §0) and the model itself (the skill body's fallback line).

### 3. Next

```
$A route next --task <slug> [--answer <gate>=<option>] [--default <gate>] [--conflict …] [--project <id>] [--show <payload>]
```

1. Fold (§4).
2. Previous `model` step's `produces` missing → print what is missing and the producing command; no
   advance. Second identical miss adds "or `route stop --reason blocked`". Third → advance with `limit`
   (the engine never wedges, R12).
3. Run reachable `code` steps; `onError` applies.
4. **Gate** (a `human` step):
   - An answer exists (`acceptance|declined {via: hook}` from the AskUserQuestion hook, or `--answer`
     → `{via: flag}`) → continue.
   - No answer, route `headless` → `default-taken {via: headless}` with the gate's **non-acting**
     default → continue. `--default <gate>` (route not headless) → `default-taken {via: flag}`.
   - No answer, interactive → re-print the gate (count in `gate.asked`). On the **third** unanswered
     call → `default-taken {via: unanswered}` with the non-acting option → continue. A human who was
     present and not asked loses nothing: non-acting means nothing written, nothing spent.
   - `via: flag` answers are what the model typed. Steps whose consequence is a claim (plan
     acceptance) treat `via: flag` as not accepted unless the route is headless (13 §3).
5. `worker` step: the proposal gate (17 §1); the default and release are *inline*.
6. Print the next `model` step, or the report step (`evidence.report` skeleton + the exit rule).

### 4. Position is a fold over the ledger

```
position(route, ledger, session):
  entries := entries after the last `route` of this skill whose session == session
  for step in route.steps:
    if step.when evaluates false: continue (recorded as skipped on first pass)
    done := code   ? every kind in produces exists
          : model  ? (produces ? every kind exists : a later `step` entry exists)
          : human  ? acceptance|declined|default-taken for its gate exists
          : worker ? a `worker` entry exists
    if not done: return step
  return complete        # no `route stop` needed on the happy path
```

Counters (`repeat`, same-error, identical-next, `gate.asked`) are counts over the same slice. A
second session on the same ticket gets its own slice. Delete the ledger and the route restarts.

### 5. Limits

| Limit | Default | When hit |
|---|---|---|
| `repeat` per step | map 2, review 2, check 5, others 1 | step skipped with `limit`; report lists it under Not verified |
| same error code from one command | 2 | `stop:blocked` offered with the code and its release |
| identical `route next` without progress | 3 | advance with `limit` |
| unanswered gate | 3 prints | `default-taken {via: unanswered}` (non-acting) |
| `budget.modelSteps` | investigate 6, plan 12, task 16, review 6 | a gate ⏸ "continue / stop", non-acting default *stop* → `exit budget` |
| `budget.wallMinutes` (headless only) | 45 | `exit budget` |

Removed from v1: `codeCalls` (a proxy that measured nothing) and `wallMinutes` in interactive routes
(a human who steps away must not come back to a stopped route).

### 6. Delivery channels

| Channel | Limit (M14) | Used for |
|---|---|---|
| CLI stdout | 30,000 chars; design cap 8,000 per reply | every `route next` |
| Hook `additionalContext` | ≤ 9,800 inline | `route start` from the prompt hook |
| File behind a preview | any | a step payload over the window → `steps/<id>.md`, "Read it whole, N bytes" (one extra turn, G6) |

A step message starts with the same 3 lines: route/step id; what to do now; the command that ends
the step. The most important content comes first.

### 7. Stop and abandonment

`$A route stop --task <slug> --reason blocked|human|inconclusive|budget [--detail …]` appends `exit`.
The happy path needs no stop (§4). Starting another `/ambicode:` command supersedes the open route
(§2.3). An unrelated prompt leaves the route open and harmless: the Stop hook checks report-shaped
stops only (15 §3), and the next `route next` resumes.

## Interfaces

```ts
interface Engine {
  start(input: {skill; args; task?; headless?; project?; cwd; session; channel: 'hook'|'cli'}): Promise<StepMessage>;
  next(input: {task; session; answer?; default?; conflict?; project?; show?}): Promise<StepMessage>;
  status(task, session): Promise<Position>;
  stop(task, session, reason, detail?): Promise<void>;
}
```

Modules register `run` handlers by name; the engine owns no module logic.

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| Hook did not fire | skill body fallback: run `route start` yourself |
| investigate then plan on one slug | two routes, two slices; `note list` links them |
| The model reports without `route next` | the Stop hook checks the report (if report-shaped) and blocks once with the missing steps |
| A step out of order | `needs` unmet → refused with what is missing |
| Ledger unreadable | ⛔ `ledger-unreadable`; release `route start --task <slug>-2` |
| Compaction mid-route | `UserPromptSubmit` re-injects the current step from the fold |
| Two sessions, one slug | session-filtered folds; `O_APPEND` keeps lines whole |

## What changes from v0.4.0

`prepare-on-skill.ts` becomes `route start`; the `Skill` hook entry is removed (dead under D2); the
MCP hook captures only (14 §3). Skill bodies lose their step lists. New ledger kinds (13 §1).

## Open problems

- P1 Workflow-engine risk: measured by 33 §1–2 before anything is built on the engine; the
  interactive semantics above are the answer to the review's C2–C4, and they are tested by the gate
  matrix (33 §8).
- P2 `AskUserQuestion` hook payload and `ExitPlanMode` acceptance: probes before 41 step 6.
- P3 A present human whose answer arrives after three unanswered calls gets the non-acting default;
  the report says `default-taken {via: unanswered}` and the gate can be re-answered on the next
  `route next --answer`.
- P37 (was W12) Whether `UserPromptSubmit` fires and the command expands for a typed `/ambicode:…` in
  interactive sessions and in the plugin-eval sandbox: the only entry point; probe first (33 §0).
