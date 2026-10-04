# Module: Route (the call-chain engine)

## Purpose

Make every fixed step happen whether or not the model remembers it (M2, M3), deliver one step's
text at a time (M1, M17), give every gate a release and a non-acting default taken only on record
(R4, R12), let a route **go back** where its skill needs a revision — and let a **human** ask for
another round regardless of the automatic bounds (D14) — bound the automatic repeats, and record all
of it (R3). The engine is the plugin's harness inside Claude Code's harness. It knows nothing about
languages or ecosystems (R16).

## Inputs

- A route definition per skill, `routes/<skill>.yaml`, zod-validated at build (32 §3).
- The gate registry `routes/gates.yaml` for gates raised by error codes and commands (§3.5).
- The ledger of the task directory. No other state.
- Triggers: `UserPromptSubmit` whose text starts with `/ambicode:<skill>`; the model running
  `$A route next` **or any evidence-writing command** (§3.1); `--headless` and `--answer` on
  `route start`; gate answers through the `PostToolUse(AskUserQuestion)` hook (the question text
  carries the gate id; payload shape is probe P2) or through `route next --answer <gate>=<option>`.

## Outputs

- Step messages: one step's instruction plus the payload it needs, bounded (30 §4); printed at the
  tail of the command that completed the previous step, or returned by the AskUserQuestion hook as
  `additionalContext` (probe P48).
- Ledger: `route`, `step`, `gate`, `preanswer`, `acceptance`/`declined`/`default-taken` (each with
  `via`), `revise`, `limit`, `exit`, `worker`.
- `route status`: the fold as a table, with revises, remaining repeats, and the layers each `map` used (D9).

## Workflow

### 1. Definitions

| Field | Meaning |
|---|---|
| `id` | unique in the route |
| `actor` | `code`, `model`, `worker`, `human` |
| `run` | for `code`: one or more module calls |
| `instruction` | for `model`: text ≤ 1,500 chars or `file:` |
| `payload` | module outputs to attach, each bounded by its module |
| `needs` | ledger kinds required in the step's current evidence window (§4) |
| `produces` | ledger kinds this step must leave behind, each optionally qualified by one field value — `note{plan}`, `note{plan-draft}`, `policy{before-report}`, `check{green}` — and matched with the qualifier by the fold (#105); a `model` step may name them (then it is done when they exist) |
| `when` | a condition from a fixed vocabulary: `args.hasRequirement`, `!args.hasRequirement`, `map.empty`, `plan.isDraft`, `headless`, `interactive`, `index.present`, `gate.<id>.answered`, `gate.<id>.is(<option>)` — gate predicates read **the latest answer in the step's current evidence window** (#98); a false `when` skips the step, recorded `step {skipped}` |
| `gate` | **only on `human` steps**: `{id, question, options[], default, release, onAnswer?, maxRevises?}`; `default` must be a non-acting option; `onAnswer: {<option> \| "*": revise <stepId> [args with $answer]}` declares re-entry (`"*"` matches free text, `$answer` substitutes it, #86); `maxRevises` (default 3) bounds how many times **this gate's** answers may revise |
| `onFail` | for `code`/`worker`: `revise <stepId>` when the step's result is a failure the route wants redone (bad anchors, in-scope findings) |
| `revisable` | on the route: step ids the **model** may re-enter with `route next --revise <stepId>` (recorded `via: model`) |
| `repeat` | max **automatic** executions of the step within one human cycle (§4): `ground 2`, `design 2`, `plan-write 3`, `draft 3`, `fix 2`, `review-run 2`, `check` commands 5 per phase, others 1. A human gate answer that revises starts a new cycle and resets the counters of the steps it covers (D14) |
| `onError` | per code: `retry-with <hint>`, `ask <gateId>`, `stop:<reason>`; default `ask` once then `stop:blocked` |

A route declares `budget: {modelSteps, wallMinutes?}` (`wallMinutes` applies only in `--headless`)
and `exits: [done, blocked, human, inconclusive, superseded, budget]`. Branching is two steps with
complementary `when`s; **looping is `revise`** (§4), never a construct inside `run`.

### 2. Start

```
$A route start <skill> [--task <slug>] [--headless] [--project <id>] [--answer <gate>=<option>]… [args…]
```

1. Resolve the repository and config. ⛔ `config-missing` → names `/ambicode:init`. Two projects and
   no `--project` or paths → raised gate `project-ambiguous` (registry; non-acting default *stop*,
   release `route next --project <id>`, #80).
2. Slug: `--task`, else the ticket key, else the kebab of the request, else `task-<hash>`.
3. Dedup and **resume** (#79): an open route for `(slug, skill)` exists —
   - from **this** session with the same `hash(args)` → re-print the current step, no new entry;
   - from **another** session **with the same `hash(args)`** (a new `claude` session, a restart) →
     **adopt** it: append `route
     {skill, args, session, epoch, resumes: <routeId>}`; the fold (§4) then runs over that route's
     entries from both sessions, so the position is kept (a plan in progress continues after its
     `plan-draft`, D11), and the start message says "resumed route <id> at step <x>; `route start
     --fresh` restarts". `--fresh` records `exit {superseded}` on the old route first;
   - same slug and skill, different args, this session → `exit {superseded}` on the open route, then
     a new `route`. Any other open route in this session (other slug) → `exit {superseded}` on it
     too, so one route is active per session;
   - from another session with **different** args → a new `route` beside the open one (another
     session's route is never superseded from here; `route status` and `note list` show both, P54,
     #104).
4. Append `route {…}`; for each `--answer`, append **`preanswer {gate, option, via: prompt}`** (#78)
   — **only when `channel: hook` (the text is the user's own prompt) or `--headless`**; from
   `channel: cli` in an interactive route a `--answer` naming an **acting** option is recorded
   `declined {via: flag, reason: acting-needs-human}` and no preanswer is kept (R3, #102); a
   non-acting option is kept. A preanswer is not an acceptance yet — the fold consults preanswers outside the evidence window and converts one
   into `acceptance {via: prompt}` at the moment its gate is reached, so a `revise` before the gate
   cannot swallow it and no `plan-accept` entry exists before the draft (33 §8). Preanswers are
   printed in the report under Decisions as "answered in the prompt (before the artifact existed)".
5. Run `code` steps until the first unmet `needs` or a non-`code` actor; print the first `model` step.
   This work runs **synchronously inside the `UserPromptSubmit` hook** when the hook starts the route;
   in the no-requirement path it includes `ground` (shortlist ×2 at 0.3–1 s each, harvest, policy):
   I'd guess 1–3 s on the user's prompt, measured in 33 §7 (#88).

Entry points: the `UserPromptSubmit` hook (the only one under D2; whether it fires for a typed
command in every surface is probe P37, 33 §0) and the model itself (the skill body's fallback line).

### 3. Advancing

#### 3.1 Who advances the route, and what a ceremony turn is (#82, #95)

Every **evidence-writing command** the model runs ends the same way: fold, run the reachable `code`
steps, print the next `model` step or the gate. The list, mirrored by 31's ⤵ marks: `route next`,
`requirements normalize`, `check`, `format`, `review`, `plan check`, `policy check --drafts`,
`rules apply`, `init --apply`, `note save`, `note promote`. `route next` is needed only when the
model's step produced no command (after MCP reads; after reading code).

**Ceremony turn** (the count the skill files budget): a model tool call whose only purpose is the
route — `route next`, `note save`, `note promote`, and an `AskUserQuestion` for a gate.
**Work command**: a call a naked model would also make in some form — `check`, `format`, `review`,
`plan check`, `policy check`, `rules apply`, `init --apply`. Both are counted in every skill file;
only ceremony is called "ceremony".

```
$A route next --task <slug> [--answer <gate>=<option>]… [--default <gate>] [--revise <stepId>] [--conflict "<summary>" --sources A,B] [--project <id>] [--show <payload>]
```

#### 3.2 Order inside one advance

1. Fold (§4).
2. Previous `model` step's `produces` missing → print what is missing and the producing command; no
   advance. Second identical miss adds "or `route stop --reason blocked`". Third → advance with `limit`
   (the engine never wedges, R12).
3. Run reachable `code` steps; `onError` and `onFail` apply (`onFail: revise X` appends `revise` and
   re-folds, bounded by `repeat`).
4. `human` step → §3.4. `worker` step → when a model worker ships, a declared gate on the `worker`
   step (none in v4; `plan check` is plain code, #85).
5. Print the next `model` step, or the report step (`evidence.report` skeleton + the exit rule).

#### 3.3 Flags, one vocabulary (#44)

| Flag | Records | Meaning |
|---|---|---|
| `--answer <gate>=<option>` | `acceptance\|declined {via: flag}`; at `route start` from the hook or headless: `preanswer {via: prompt}`; at a model-run interactive `route start`: acting options → `declined {acting-needs-human}` (#102) | selects an option, acting or not |
| `--default <gate>` | `default-taken {via: flag}` | takes the gate's **non-acting** default now; **accepted only in a headless route or when `gate.asked ≥ 1`** (#97), else refused: "ask first" |
| `--revise <stepId>` | `revise {from, via: model}` | re-enter a step listed in `revisable`; counts against `repeat` |
| `--conflict "<summary>" --sources A,B` | raised gate `requirements-conflicting` | the model reports a conflict; the answer is `--answer requirements-conflicting=<source>` (one id, #94) |

#### 3.4 Gates: declared and raised, one ledger semantics (#43)

A gate is printed by the engine as a block the model must put to the human **verbatim** through
`AskUserQuestion`, with a trailing marker `[ambicode gate <id>]` in the question text, so the
`PostToolUse(AskUserQuestion)` hook can bind the answer (P2). The block names each option's
consequence, including "Revise (2 left)" when `onAnswer` revises (D14). Then:

- Answer on record (`{via: hook}` from the hook, `{via: flag}` from `--answer`, `{via: prompt}` from
  a preanswer consumed now) → continue; `onAnswer` may append `revise`.
- No answer, route `headless` → `default-taken {via: headless}` with the **non-acting** default → continue.
- No answer, interactive → re-print the gate. `gate.asked` is incremented **by the hook** when the
  marker is seen, not by `route next` (#54). On the third `route next` without an answer:
  `asked = 0` → `default-taken {via: never-asked}`; `asked ≥ 1` → `default-taken {via: unanswered}`.
  Both take the non-acting option; the report prints the words. A human who was present and not
  asked loses nothing: non-acting means nothing written, nothing spent.
- **Acting options** (write a file outside the ledger, run the reviewer, run a `propose` command,
  apply packs, write config) are honoured from `via: hook`, from `via: prompt` (a preanswer exists only from a hook-channel
  or headless `route start`, §2.4, #102), and from `via: flag` **only in a headless route** (#55). This covers `check --approve` and `review --approve` too
  (#84): interactively, a model-typed acting flag records `declined {via: flag, reason:
  acting-needs-human}` and re-prints the gate (that `declined` is not a gate answer in the fold, §4, #115).
- A gate can be re-answered: a later `acceptance` for the same gate id supersedes an earlier
  `default-taken` (P3), and `onAnswer` applies then.

#### 3.5 Gate classes

| Class | Declared where | Id | Examples |
|---|---|---|---|
| **declared** | a `human` step in the route file | the step id | `plan-accept`, `review-offer`, `estimate`, `scope`, `sources`, `rules-table`, `init-apply`, `draft-ok` |
| **raised by code** | `routes/gates.yaml` (the full list is 32 §4): `code → {question, options, default, release, onAnswer?, policy?: {<skill>: stop}}` | the error code | `requirements-server-disconnected`, `requirements-server-ambiguous`, `requirements-expansion-capped`, `requirements-conflicting`, `requirements-not-captured-twice`, `check-only-unauthorized` (per key; `onAnswer: {approve: revise $raisedBy}`), `project-ambiguous`, `config-unparsable`, `budget-exhausted`, `scope-expanding` |
| **raised by the model** | `routes/gates.yaml` class `decision:*` | `decision:<slug>`, chosen by the model | plan's material decisions (23 step 4) |

Raised gates are appended as `gate {id, class, raisedBy: <stepId>}` when printed; `$raisedBy` in an
`onAnswer` names that step, so approving a waiting check re-enters the step that ran it (#77). A
model-raised decision gate is opened by the model's own `AskUserQuestion` carrying `[ambicode gate
decision:<slug>]`; the hook appends `gate` and the answer together; its registry entry fixes the
non-acting default (*keep open*) and the release. The registry's `policy` lets one skill override
a raised gate (`requirements-server-disconnected: {review: stop}`, #65). **The table test (33 §8)
iterates the route files and every registry entry**; a gate with no `release`, or whose `default`
is an acting option or missing, fails the build (#80).

### 4. Position is a fold over the ledger, with re-entry and human cycles (#42, #75)

```
position(route, ledger, session):
  routeEntry := the last `route` of this skill for this session; if it has `resumes`, the chain of routes it resumes
  entries    := entries of those routes (any session), in order
  for step in route.steps (in order):
    if step.when evaluates false (over the step's window, below): continue (recorded as skipped once)
    since    := index of the last `revise` whose `from` step index <= this step's index, else 0
    evidence := entries[since:]                          # the step's current evidence window
    done := code   ? every (kind, qualifier) in produces exists in evidence        # #105
          : model  ? (produces ? every (kind, qualifier) exists in evidence : a later `step` entry exists in evidence)
          : human  ? acceptance|declined|default-taken for its gate exists in evidence
                     — a `declined {reason: acting-needs-human}` does **not** count (the gate is re-printed, §3.4;
                     the entry is the record that a model tried to act, #115)
                     (else a `preanswer` for the gate exists → convert it to acceptance {via: prompt} now)
          : worker ? a `worker` entry exists in evidence
    if not done: return step
  return complete        # no `route stop` needed on the happy path
```

`revise {from: <stepId>, via: gate|code|model, cycle}` moves the evidence window for every step from
`from` onward, so they are "not done" again; evidence before the revise stays in the ledger and in
the report (as "superseded by revise a1b2c3d4-17").

**Bounds, two kinds (D14):**

- **Automatic** revises (`via: code|model`) count against `repeat` of each covered step **within the
  current human cycle**. A code/model revise that would exceed a covered step's `repeat` is refused
  with `limit {repeat, step}`; the route continues forward with the step's last evidence (e.g. `plan
  check` failures become Known limitations after 3 writes).
- **Human** revises (`via: gate`, from `onAnswer`) start a **new cycle**: the `repeat` counters of
  every covered step reset; they are bounded only by the gate's `maxRevises` (default 3). When it is
  exhausted the gate still prints *Revise* but the option is marked "(0 left — restart the route to
  continue)" and choosing it records `declined {reason: max-revises}`; the non-acting default stands.
  A human is never refused by an automatic bound, and a model's `--revise` cannot consume a human's
  allowance.

Examples: plan's `plan-accept` `onAnswer: {Revise: revise design}` re-opens design → plan step →
write → check → accept, with fresh `repeat` for `plan-write` (23); `plan check` with bad anchors
`onFail: revise plan-write` (≤ 3 writes per cycle); rules' `policy check --drafts` `onFail: revise
draft` (≤ 3); investigate's `scope` gate `onAnswer: {"*": revise ground --term $answer}`; task's
`review-run` code evaluation `onFail: revise fix` when in-scope findings remain (`fix` repeat 2);
`check-only-unauthorized` approve → `revise $raisedBy` (the step whose command waited).

Counters (`repeat` per cycle, same-error, identical-next, `gate.asked`, `maxRevises`) are counts over
the route's entries. Delete the ledger and the route restarts.

### 5. Limits

| Limit | Default | When hit |
|---|---|---|
| `repeat` per step, per human cycle | `ground 2`, `design 2`, `plan-write 3`, `draft 3`, `fix 2`, `review-run 2`, `check` 5 per phase, others 1 | automatic revise refused with `limit`; the route continues; report lists it under Not verified |
| `maxRevises` per gate | 3 | *Revise* shown as "(0 left)"; choosing it is `declined {max-revises}` |
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
  start(input: {skill; args; task?; headless?; project?; answers?: Answer[]; fresh?: boolean; cwd; session; channel: 'hook'|'cli'}): Promise<StepMessage>;
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
| investigate then plan on one slug | two routes, two chains; `note list` links them |
| The model reports without a command | the Stop hook checks the report (if report-shaped) and blocks once with the missing steps |
| A step out of order | `needs` unmet → refused with what is missing |
| An automatic revise past `repeat` | refused with `limit`; forward with the last evidence |
| A human *Revise* past `maxRevises` | `declined {max-revises}`; the gate text said "(0 left)"; `route start --fresh` restarts |
| A gate marker edited out of the question | the hook cannot bind; the answer is not recorded; the next advance re-prints the gate with "put the marker back" (counts as not asked) |
| Ledger unreadable | ⛔ `ledger-unreadable`; release `route start --task <slug>-2` |
| Compaction mid-route | `UserPromptSubmit` re-injects the current step from the fold |
| A new session on an open route | adopted when `hash(args)` matches (§2.3), else a new route beside it; `--fresh` to restart (#114) |
| Two sessions, one slug, both live | same args: each `route start` adopts and the fold is over the union; different args: two routes side by side (P54); ids carry the session (13 §1); `O_APPEND` keeps lines whole (#114) |

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
- P45 `revise` + `repeat` interplay within a cycle: a route author can write an automatic loop that
  never converges within `repeat` and ships Known limitations instead. Accepted; the fixtures in
  33 §8 drive every declared revise, and the human cycle (D14) is the way out.
- P46 Model-raised decision gates: the model chooses the slug and the options; only the default
  (*keep open*) and the release are fixed by the registry. A model could ask nothing material and
  still produce a plan; the composite (33 §4) is the measure, not the gate count.
- P48 Whether `PostToolUse(AskUserQuestion)` may return `additionalContext` with the next step
  (`ADDITIONAL_CONTEXT_EVENTS` includes `PostToolUse`, `src/contracts/hook.ts:33`, so the contract
  allows it; the payload is P2). Fallback: the hook prints nothing and the gate text ends with "then
  run `$A route next`" (+1 ceremony turn per gate).
- P54 Adopting a route from another session folds over two sessions' entries: a second **live**
  session on the same slug sees the first's steps as done. Intended for a restart, surprising for
  two people; `route status` names the sessions involved.
- P55 `maxRevises` is a guess (3); a human who needs a fourth round restarts the route and keeps the
  draft. Measured by how often "(0 left)" is printed in real plans.
