# Module: Route (the call-chain engine)

## Purpose

Make every fixed step happen whether or not the model remembers it (M2, M3), deliver one step's
text at a time (M1, M17), give every gate a release and a non-acting default taken only on record
(R4, R12), let a route **go back** where its skill needs a revision (review-v2 #42), bound repeats,
and record all of it (R3). The engine is the plugin's harness inside Claude Code's harness.

## Inputs

- A route definition per skill, `routes/<skill>.yaml`, zod-validated at build (32 §3).
- The gate registry `routes/gates.yaml` for gates raised by error codes and commands (§3.5).
- The ledger of the task directory. No other state.
- Triggers: `UserPromptSubmit` whose text starts with `/ambicode:<skill>`; the model running
  `$A route next` **or any evidence-writing command** (§3.3); `--headless` and `--answer` on
  `route start`; gate answers through the `PostToolUse(AskUserQuestion)` hook (the question text
  carries the gate id; payload shape is probe P2) or through `route next --answer <gate>=<option>`.

## Outputs

- Step messages: one step's instruction plus the payload it needs, bounded (30 §4); printed at the
  tail of the command that completed the previous step, or returned by the AskUserQuestion hook as
  `additionalContext` (probe P48).
- Ledger: `route`, `step`, `gate`, `acceptance`/`declined`/`default-taken` (each with `via`),
  `revise`, `limit`, `exit`, `worker`.
- `route status`: the fold as a table, with the layers each `map` used (D9).

## Workflow

### 1. Definitions

| Field | Meaning |
|---|---|
| `id` | unique in the route |
| `actor` | `code`, `model`, `worker`, `human` |
| `run` | for `code`: one or more module calls |
| `instruction` | for `model`: text ≤ 1,500 chars or `file:` |
| `payload` | module outputs to attach, each bounded by its module |
| `needs` | ledger kinds required since the route's `route` entry (or since the last `revise` covering this step) |
| `produces` | ledger kinds this step must leave behind; a `model` step may name them (then it is done when they exist) |
| `when` | a condition from a fixed vocabulary: `args.hasRequirement`, `!args.hasRequirement`, `map.empty`, `plan.isDraft`, `headless`, `interactive`, `index.present`, `gate.<id>.answered`, `gate.<id>.is(<option>)`; a false `when` skips the step, recorded `step {skipped}` |
| `gate` | **only on `human` steps**: `{id, question, options[], default, release, onAnswer?}`; `default` must be a non-acting option; `onAnswer: {<option>: revise <stepId>}` declares re-entry |
| `onFail` | for `code`/`worker`: `revise <stepId>` when the step's result is a failure the route wants redone (e.g. bad anchors) |
| `revisable` | on the route: step ids the **model** may re-enter with `route next --revise <stepId>` (recorded `via: model`) |
| `repeat` | max executions of the step in one route (1 + revises that cover it): map 2, review 2, check 5, plan-write 3, drafts 3, others 1 |
| `onError` | per code: `retry-with <hint>`, `ask <gateId>`, `stop:<reason>`; default `ask` once then `stop:blocked` |

A route declares `budget: {modelSteps, wallMinutes?}` (`wallMinutes` applies only in `--headless`)
and `exits: [done, blocked, human, inconclusive, superseded, budget]`. Branching is two steps with
complementary `when`s; **looping is `revise`** (§4), never a construct inside `run`.

### 2. Start

```
$A route start <skill> [--task <slug>] [--headless] [--project <id>] [--answer <gate>=<option>]… [args…]
```

1. Resolve the repository and config. ⛔ `config-missing` → names `/ambicode:init`. Two projects and
   no `--project` or paths → raised gate `project-ambiguous` (registry), release `route next --project <id>`.
2. Slug: `--task`, else the ticket key, else the kebab of the request, else `task-<hash>`.
3. Dedup key `(slug, skill, epoch, hash(args))`: identical → re-print the current step, no new entry.
   Same slug and skill, different args, an open route → append `exit {reason: superseded}` to the open
   route, then a new `route`. Any other open route in this session (other slug) → `exit {superseded}`
   on it too, so one route is active per session.
4. Append `route {skill, args, mode: interactive|headless, session, epoch}`; for each `--answer`,
   append `acceptance {gate, answer, via: prompt}` (#44). These pre-answers are printed in the report
   under Decisions as "answered in the prompt".
5. Run `code` steps until the first unmet `needs` or a non-`code` actor; print the first `model` step.

Entry points: the `UserPromptSubmit` hook (the only one under D2; whether it fires for a typed
command in every surface is probe P37, 33 §0) and the model itself (the skill body's fallback line).

### 3. Advancing

#### 3.1 Who advances the route

Every **evidence-writing command** the model runs (`route next`, `check`, `format`, `review`,
`plan check`, `note save`, `requirements normalize`) ends the same way: fold, run the reachable
`code` steps, print the next `model` step or the gate. `route next` is needed only when the model's
step produced no command (after MCP reads; after reading code). This is what keeps the ceremony
count at 1–4 per route (#45; counts in each skill file).

```
$A route next --task <slug> [--answer <gate>=<option>]… [--default <gate>] [--revise <stepId>] [--conflict … --sources A,B] [--project <id>] [--show <payload>]
```

#### 3.2 Order inside one advance

1. Fold (§4).
2. Previous `model` step's `produces` missing → print what is missing and the producing command; no
   advance. Second identical miss adds "or `route stop --reason blocked`". Third → advance with `limit`
   (the engine never wedges, R12).
3. Run reachable `code` steps; `onError` and `onFail` apply (`onFail: revise X` appends `revise` and
   re-folds, bounded by `repeat`).
4. `human` step → §3.4. `worker` step → the proposal gate (17 §1); default and release *inline*.
5. Print the next `model` step, or the report step (`evidence.report` skeleton + the exit rule).

#### 3.3 Flags, one vocabulary (#44)

| Flag | Records | Meaning |
|---|---|---|
| `--answer <gate>=<option>` | `acceptance\|declined {via: flag}` (at `route start`: `via: prompt`) | selects an option, acting or not |
| `--default <gate>` | `default-taken {via: flag}` | takes the gate's **non-acting** default now |
| `--revise <stepId>` | `revise {from, via: model}` | re-enter a step listed in `revisable` |
| `--conflict "<summary>" --sources A,B` | raised gate `requirements-conflicting` | the model reports a conflict; the answer is `--answer conflict=<source>` (#69) |

#### 3.4 Gates: declared and raised, one ledger semantics (#43)

A gate is printed by the engine as a block the model must put to the human **verbatim** through
`AskUserQuestion`, with a trailing marker `[ambicode gate <id>]` in the question text, so the
`PostToolUse(AskUserQuestion)` hook can bind the answer (P2). Then:

- Answer on record (`{via: hook}` from the hook, `{via: flag}` from `--answer`, `{via: prompt}` from
  `route start --answer`) → continue; `onAnswer` may append `revise`.
- No answer, route `headless` → `default-taken {via: headless}` with the **non-acting** default → continue.
- No answer, interactive → re-print the gate. `gate.asked` is incremented **by the hook** when the
  marker is seen, not by `route next` (#54). On the third `route next` without an answer:
  `asked = 0` → `default-taken {via: never-asked}`; `asked ≥ 1` → `default-taken {via: unanswered}`.
  Both take the non-acting option; the report prints the words. A human who was present and not
  asked loses nothing: non-acting means nothing written, nothing spent.
- **Acting options** (write a file outside the ledger, run the reviewer, apply packs, write config)
  are honoured from `via: hook`, from `via: prompt`, and from `via: flag` **only in a headless route**
  (#55). Interactively, a model-typed `--answer review-offer=run` records `declined {via: flag,
  reason: acting-needs-human}` and re-prints the gate.
- A gate can be re-answered: a later `acceptance` for the same gate id supersedes an earlier
  `default-taken` (P3), and `onAnswer` applies then.

#### 3.5 Gate classes

| Class | Declared where | Id | Examples |
|---|---|---|---|
| **declared** | a `human` step in the route file | the step id | `plan-accept`, `review-offer`, `estimate`, `scope`, `sources`, `rules-table`, `init-apply` |
| **raised by code** | `routes/gates.yaml`: `code → {question, options, default, release, policy?: {<skill>: stop}}` | the error code | `requirements-server-disconnected`, `requirements-expansion-capped`, `requirements-conflicting`, `check-only-unauthorized` (per waiting key), `project-ambiguous`, `config-unparsable`, `budget-exhausted`, `scope-expanding` |
| **raised by the model** | `routes/gates.yaml` class `decision:*` | `decision:<slug>`, chosen by the model | plan's material decisions (23 step 5) |

Raised gates are appended as `gate {id, class, raisedBy}` when printed. A model-raised decision gate
is opened by the model's own `AskUserQuestion` carrying `[ambicode gate decision:<slug>]`; the hook
appends `gate` and the answer together; its registry entry fixes the non-acting default (*keep
open*) and the release (*keep open — the plan stays a draft*). The registry's `policy` lets one
skill override a raised gate's behaviour (`requirements-server-disconnected: {review: stop}`, #65).
**The table test (33 §8) iterates both the route files and the registry**; a gate with no
`release` or an acting `default` fails the build.

### 4. Position is a fold over the ledger, with re-entry (#42)

```
position(route, ledger, session):
  entries := entries after the last `route` of this skill whose session == session
  for step in route.steps (in order):
    if step.when evaluates false: continue (recorded as skipped on first pass)
    since := index of the last `revise` entry whose `from` step index <= this step's index, else 0
    evidence := entries[since:]
    done := code   ? every kind in produces exists in evidence
          : model  ? (produces ? every kind exists in evidence : a later `step` entry exists in evidence)
          : human  ? acceptance|declined|default-taken for its gate exists in evidence
          : worker ? a `worker` entry exists in evidence
    if not done: return step
  return complete        # no `route stop` needed on the happy path
```

`revise {from: <stepId>, via: gate|code|model, reason}` moves the evidence window for every step
from `from` onward, so they are "not done" again; evidence before the revise stays in the ledger
and in the report (as "superseded by revise L17"). `repeat` bounds executions: a revise that would
exceed a covered step's `repeat` is refused with `limit {repeat, step}` and the route continues
forward with the step's last evidence.

Examples: plan's `plan-accept` gate `onAnswer: {Revise: revise design}` re-opens design → write →
check → accept (23); `plan check` with bad anchors `onFail: revise plan-write` (≤ 3 writes); rules'
`policy check --drafts` `onFail: revise draft` (≤ 3); investigate's `scope` gate `onAnswer: {<free
text>: revise ground}` with the answer passed as `--term`; task's post-review fix is a route step
(`fix`) followed by `recheck` with `repeat: 2`, not a re-run outside the route.

Counters (`repeat`, same-error, identical-next, `gate.asked`) are counts over the same slice. A
second session on the same ticket gets its own slice. Delete the ledger and the route restarts.

### 5. Limits

| Limit | Default | When hit |
|---|---|---|
| `repeat` per step | map 2, review 2, check 5, plan-write 3, drafts 3, others 1 | revise refused with `limit`; the route continues; report lists it under Not verified |
| same error code from one command | 2 | `stop:blocked` offered with the code and its release |
| identical `route next` without progress | 3 | advance with `limit` |
| unanswered gate | 3 prints | `default-taken {via: never-asked\|unanswered}` (non-acting) |
| `budget.modelSteps` | investigate 6, plan 14, task 18, review 6 | raised gate `budget-exhausted` "continue / stop", non-acting default *stop* → `exit budget` |
| `budget.wallMinutes` (headless only) | 45 | `exit budget` |

### 6. Delivery channels

| Channel | Limit (M14) | Used for |
|---|---|---|
| CLI stdout | 30,000 chars; design cap 8,000 per reply | the tail of every evidence-writing command |
| Hook `additionalContext` | ≤ 9,800 inline | `route start` from the prompt hook; the step after a gate answer (`PostToolUse(AskUserQuestion)`, P48) |
| File behind a preview | any | a step payload over the window → `steps/<id>.md`, "Read it whole, N bytes" (one extra turn, G6) |

A step message starts with the same 3 lines: route/step id; what to do now; the command that ends
the step. The most important content comes first.

### 7. Stop and abandonment

`$A route stop --task <slug> --reason blocked|human|inconclusive|budget [--detail …]` appends `exit`.
The happy path needs no stop (§4). Starting another `/ambicode:` command supersedes the open route
(§2.3). An unrelated prompt leaves the route open and harmless: the Stop hook checks report-shaped
stops only (15 §3), and the next evidence-writing command resumes.

## Interfaces

```ts
interface Engine {
  start(input: {skill; args; task?; headless?; project?; answers?: Answer[]; cwd; session; channel: 'hook'|'cli'}): Promise<StepMessage>;
  advance(input: {task; session; answers?; default?; revise?; conflict?; project?; show?; cause: 'route-next'|CommandName|'gate-hook'}): Promise<StepMessage>;
  status(task, session): Promise<Position>;
  stop(task, session, reason, detail?): Promise<void>;
}
```

Modules register `run` handlers by name; the engine owns no module logic. Every evidence-writing
command calls `advance({cause: <its name>})` after its own ledger write.

## Failure modes and exits

| Situation | Behaviour |
|---|---|
| Hook did not fire | skill body fallback: run `route start` yourself |
| investigate then plan on one slug | two routes, two slices; `note list` links them |
| The model reports without a command | the Stop hook checks the report (if report-shaped) and blocks once with the missing steps |
| A step out of order | `needs` unmet → refused with what is missing |
| A revise past `repeat` | refused with `limit`; forward with the last evidence |
| A gate marker edited out of the question | the hook cannot bind; the answer is not recorded; `route next` re-prints the gate with "put the marker back" (counts as not asked) |
| Ledger unreadable | ⛔ `ledger-unreadable`; release `route start --task <slug>-2` |
| Compaction mid-route | `UserPromptSubmit` re-injects the current step from the fold |
| Two sessions, one slug | session-filtered folds; ids carry the session (13 §1); `O_APPEND` keeps lines whole |

## What changes from v0.4.0

`prepare-on-skill.ts` becomes `route start`; the `Skill` hook entry is removed (dead under D2); the
MCP hook captures only (14 §3). Skill bodies lose their step lists. New ledger kinds (13 §1).

## Open problems

- P1 Workflow-engine risk: measured by 33 §1–2 before anything is built on the engine; the
  decision to roll back is the user's (D10, R13).
- P2 `AskUserQuestion` hook payload (does it carry the question text and the chosen option?):
  probe before 41 step 3 — the gate binding depends on it. Fallback: the model types
  `route next --answer <gate>=<option>` after asking (acting options then need headless or a
  human-visible confirmation in the next gate print).
- P3 A late answer supersedes a `default-taken`; `onAnswer` applies then.
- P37 Whether `UserPromptSubmit` fires and the command expands for a typed `/ambicode:…` in
  interactive sessions and in the plugin-eval sandbox: the only entry point; probe first (33 §0).
- P45 `revise` + `repeat` interplay: a revise covering several steps counts against each; a route
  author can write a loop that never converges within `repeat` and ships a plan with Known
  limitations instead. Accepted; the fixtures in 33 §8 drive every declared revise.
- P46 Model-raised decision gates: the model chooses the slug and the options; only the default
  (*keep open*) and the release are fixed by the registry. A model could ask nothing material and
  still produce a plan; the composite (33 §4) is the measure, not the gate count.
- P48 Whether `PostToolUse(AskUserQuestion)` may return `additionalContext` with the next step
  (`ADDITIONAL_CONTEXT_EVENTS` includes `PostToolUse`, `src/contracts/hook.ts:33`, so the contract
  allows it; the payload is P2). Fallback: the hook prints nothing and the gate text ends with "then
  run `$A route next`" (+1 ceremony turn per gate).
