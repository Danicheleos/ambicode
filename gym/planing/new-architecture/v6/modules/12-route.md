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
  carries the gate id **and the instance id of the print** it answers, §3.4; payload shape is probe P2) or through `route next --answer <gate>=<option>`.

## Outputs

- Step messages: one step's instruction plus the payload it needs, bounded (30 §4); printed at the
  tail of the command that completed the previous step, or returned by the AskUserQuestion hook as
  `additionalContext` (probe P48).
- Ledger: `route` (with `channel`, `trusted`), `step` (`delivered` | `completed` | `skipped`), `gate`,
  `preanswer`, `acceptance`/`declined`/`default-taken` (each with `via`; `acceptance.object` when the
  gate declares one), `revise`, `limit`, `exit`, `worker`.
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
| `repeat` | max **automatic** executions of the step within one human cycle (§4), checked when a `revise` **targets** it (G3): `ground 2`, `design 2`, `plan-write 3`, `draft 3`, `fix 2`, `review-run 2`, `check` commands 5 per phase, others 1. Steps a revise merely covers re-run without consulting their own `repeat`. A human gate answer that revises starts a new cycle and resets the counters of the steps it covers (D14) |
| `onError` | per code: `retry-with <hint>`, `ask <gateId>`, `stop:<reason>`; default `ask` once then `stop:blocked` |

A route declares `budget: {modelSteps, wallMinutes?}` (`wallMinutes` applies only in `--headless`)
and `exits: [done, blocked, human, inconclusive, superseded, budget]`. Branching is two steps with
complementary `when`s; **looping is `revise`** (§4), never a construct inside `run`.

### 2. Start

```
$A route start <skill> [--task <slug>] [--headless] [--project <id>] [--answer <gate>=<option>]… [--fresh | --adopt] [args…]
```

1. Resolve the repository and config. ⛔ `config-missing` → names `/ambicode:init`. **Exception,
   `skill: init` (G4)**: the start resolves the repository only (⛔ `not-a-repository`); a missing
   config is the normal input and an unparsable one is handed to init's own `config-unparsable`
   gate (20 step 1), never to `config-missing`. The ledger lives at `.ambicode/task/init-<date>/`
   (init's fixed slug, an exception to §2.2, #142; `TASKS_DIR` needs no config); init's route context is the repository and the
   proposal, not a live config. Every other skill fails closed on `config-missing`. Two projects and
   no `--project` or paths → raised gate `project-ambiguous` (registry; non-acting default *stop*,
   release `route next --project <id>`, #80).
2. Slug: `--task`, else the ticket key, else the kebab of the request, else `task-<hash>`.
3. Dedup and **resume** (#79): an open route for `(slug, skill)` exists —
   - from **this** session with the same `hash(args)` → re-print the current step, no new entry;
   - **ownership first, before any args comparison (H2)**: a skill whose route **owns a
     model-writable file** (today only `plan`: `steps/plan-body.md` and the `plan-draft` notes are
     per task, not per route) with a **live** route from **another** session on this slug is refused
     ⛔ `route-busy` **whatever the args**, naming the other session and route id. "Live" = an open
     route with no `exit` entry and no later `route {adopts}` from another session; age and idle
     time never end it (an interactive human may be away for an hour, 30 §8), and the absence of
     ledger progress is not proof that the owner is gone (G2, P59, #141). Nothing is adopted
     silently for `plan`; the release is one of three typed flags: **`--adopt`** (take the route
     over: append `route {skill, args, session, epoch, resumes: <routeId>, adopts: true}`; the fold
     (§4) runs over the chain, so a plan in progress continues after its `plan-draft`, D11 — this is
     the restart after a crash), **`--fresh`** (`exit {superseded}` on the other route, then a new
     route; the draft stays), or **`--task <slug>-2`** (a separate directory). After `--adopt` or
     `--fresh` the **former session has no write**: its `route next`, `note save --from
     steps/plan-body.md`, `plan check`, `note promote` and the guard's `Write(plan-body.md)` allow
     (15 §1) are refused ⛔ `route-taken-over` naming the new session — the check runs **at write
     time** on the chain's latest `route` entry, not only at start. `route status` names both
     sessions so the second person can ask the first;
   - from **another** session **with the same `hash(args)`**, skill owning no file (investigate,
     task, review, init, rules; a new `claude` session, a restart) → **adopt** it: append `route
     {skill, args, session, epoch, resumes: <routeId>}`; the fold (§4) then runs over that route's
     entries from both sessions, so the position is kept, and the start message says "resumed route
     <id> at step <x>; `route start --fresh` restarts". `--fresh` records `exit {superseded}` on the
     old route first;
   - same slug and skill, different args, this session → `exit {superseded}` on the open route, then
     a new `route`. Any other open route in this session (other slug) → `exit {superseded}` on it
     too, so one route is active per session;
   - from another session with **different** args, skill owning no file → a new `route` beside the
     open one (another session's route is never superseded from here; `route status` and `note
     list` show both, P54, #104).
4. Append `route {skill, args, mode, channel, trusted, session, epoch}`. **Mode and authority are two
   different things (G1).** `--headless` sets `mode: headless`: gates take non-acting defaults,
   `wallMinutes` applies, `--default` is accepted. Authority for an **acting** answer comes only from
   the **channel**: `trusted: true` when `channel: hook` (the `UserPromptSubmit` hook started the
   route from the user's own prompt — this is also how `claude -p` starts a route **if** the hook
   fires there (probe P37(c), unverified, #136)) or `channel: harness` (the eval harness started it
   and proves it with a per-run token in the process environment, P58). A model-run `route start`
   is `channel: cli`, `trusted: false`, **whatever flags it carries**: typing `--headless` buys the
   mode, never the authority — and the mode is visible: the `route` entry's `channel: cli, mode:
   headless` is printed in the start message, in `route status` and as the first line of the
   report's Decisions ("headless mode set by the model; N gates took their default without being
   asked"); an interactive human who sees it restarts with `/ambicode:<skill>` (#148). For each
   `--answer`: on a trusted start append **`preanswer {gate, option, via: prompt}`** (#78); on an
   untrusted start an `--answer` naming an **acting** option is recorded `declined {via: flag,
   reason: acting-needs-human}` and no preanswer is kept (R3, #102, G1); a non-acting option is
   kept as a preanswer on any channel, **recorded with the start's `trusted` flag**; when an
   untrusted preanswer's `onAnswer` revises, the `revise` is recorded `via: model` (it counts against
   the target's `repeat`, not the human's `maxRevises`, D14) and the gate is still printed to the
   human on the next cycle (#146). A preanswer is not an acceptance yet —
   the fold consults preanswers outside the evidence window and converts one into `acceptance {via:
   prompt}` at the moment its gate is reached, so a `revise` before the gate cannot swallow it and no
   `plan-accept` entry exists before the draft (33 §8). Preanswers are printed in the report under
   Decisions as "answered in the prompt (before the artifact existed)". **Consequence for the
   sandbox**: when P37(b) fails and the model types the start line, the route is `cli`/untrusted and
   acting preanswers (`estimate=run`, `review-offer=run`, `plan-accept=Accept`) are declined; those
   measurements need P37(b) or P58 to hold (33 §0.4).
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
3. Run reachable `code` steps (§8: the first not-done step and every `code` step after it up to the
   next `model`/`human` step); each writes `step {status: completed}` at its end; `onError` and
   `onFail` apply (`onFail: revise X` appends `revise` and re-folds, bounded by the target's `repeat`).
4. `human` step → §3.4. `worker` step → when a model worker ships, a declared gate on the `worker`
   step (none in v4; `plan check` is plain code, #85).
5. Print the next `model` step, or the report step (`evidence.report` skeleton + the exit rule).

This list is the one algorithm; §8 states it once for `route start`, `route next`, a command tail,
a gate answer and a resume, with what differs per entry point.

#### 3.3 Flags, one vocabulary (#44)

| Flag | Records | Meaning |
|---|---|---|
| `--answer <gate>=<option>` | at a **trusted** `route start` (`channel: hook\|harness`, §2.4): `preanswer {via: prompt}`; at an untrusted (`channel: cli`) `route start`, headless or not: acting options → `declined {acting-needs-human}` (#102, G1); on **`route next`** (always the model's own command): a **non-acting** option → `acceptance {via: flag, instance}` bound to the latest print of the gate when one exists, else `instance: null`; an **acting** option → `declined {via: flag, reason: acting-needs-human}` **on every channel and in every mode** — a flag never creates authority (C1, §3.4) | selects a non-acting option; names, but never authorizes, an acting one |
| `--default <gate>` | `default-taken {via: flag}` | takes the gate's **non-acting** default now; **accepted only in a headless route (any channel — the default is non-acting) or when `gate.asked ≥ 1`** (#97), else refused: "ask first" |
| `--revise <stepId>` | `revise {from, via: model}` | re-enter a step listed in `revisable`; counts against `repeat` |
| `--conflict "<summary>" --sources A,B` | raised gate `requirements-conflicting` | the model reports a conflict; the answer is `--answer requirements-conflicting=<source>` (one id, #94) |

#### 3.4 Gates: declared and raised, one ledger semantics (#43)

A gate is printed by the engine as a block the model must put to the human **verbatim** through
`AskUserQuestion`, with a trailing marker `[ambicode gate <id> <instance>]` in the question text, so
the `PostToolUse(AskUserQuestion)` hook can bind the answer (P2). **Every print appends `gate {gate: <id>,
class, object?, print: n}`; the entry's `id` is the ledger id, which is the instance the marker carries**
(C2, M2: `gate` = logical gate id, `id` = ledger entry id, in every persisted gate and answer record). The block names each option's consequence, including "Revise (2 left)" when `onAnswer`
revises (D14). Then:

- Answer on record (`{via: hook}` from the hook, `{via: flag}` from `--answer`, `{via: prompt}` from
  a preanswer consumed now) → continue; `onAnswer` may append `revise`.
- No answer, route `headless` → `default-taken {via: headless}` with the **non-acting** default → continue.
- No answer, interactive → re-print the gate (a new `gate` entry, a new instance). `asked` is the
  number of entries **the hook** wrote for this gate id in the window (an answer, bound or
  `unbound`), so only prints that reached a human count, never a `route next` re-print by itself
  (#54). On the third `route next` without an answer:
  `asked = 0` → `default-taken {via: never-asked}`; `asked ≥ 1` → `default-taken {via: unanswered}`.
  Both take the non-acting option; the report prints the words. A human who was present and not
  asked loses nothing: non-acting means nothing written, nothing spent.
- **Acting options** (write a file outside the ledger, run the reviewer, run a `propose` command,
  apply packs, write config, promote a draft) are honoured from two origins only: `via: hook`
  **bound to a printed instance** (below), and `via: prompt` — a preanswer that names this gate and
  this option, written at a **trusted** `route start` from the user's prompt or the harness (§2.4,
  #102, G1). **Never from `via: flag`.** `trusted` is the origin of the input record, not a licence
  to create later acting answers: a trusted `--headless` start proves where the start came from, a
  flag the model types says what the model wants, and neither proves that the user chose this
  option (C1; this supersedes the delegation reading of #132). In **every** route — trusted or not,
  headless or not — a model-typed acting flag (`route next --answer <gate>=<acting>`, `check
  --approve`, `review --approve`, #84) records `declined {via: flag, reason: acting-needs-human}`
  (not a gate answer in the fold, §4, #115) and the gate is re-printed; in headless the gate then
  takes its non-acting default and the report's Decisions says "the model asked for *run*; declined,
  no answer from the user". A user who wants an acting answer in `claude -p` gives it in the prompt
  as `--answer <gate>=<option>` (30 §6). A command that executes an answer already honoured — `note
  promote` after an *Accept*, `init --apply` with the accepted `--set` values, `check --approve`
  after an *approve* on record — asks nothing again (§8 Standalone).
- **An acting answer names its object (G2, R17).** A gate whose acting option consumes an artifact
  declares `object: <kind>{<qualifier>}` (32 §3: `plan-accept` → `note{plan-draft}`). The object is
  resolved in the **current evidence window of the step that `produces` it** (`plan-check`), not in
  the gate's own window: a `revise plan-accept` re-asks the question and leaves the unchanged
  upstream draft where it is, while a `revise design` (a new cycle) moves the producer's window too
  and the old drafts fall out of it (H3). The engine
  prints the gate with the object's identity (`plan-draft_<ts>.md`, `contentHash` first 12) and the
  hook (or the preanswer conversion) writes `acceptance {gate, instance, answer, via, object: {kind,
  id, path, contentHash}}` with the identity **of the print the marker names** — never of the latest
  print (C2). The consuming command
  (`note promote`, 13 §3) honours the acceptance only for that object: a newer draft, a changed hash,
  a later *Reject*/*Revise* on the same gate, or an object already consumed → `plan-not-accepted`
  with the reason. A gate without `object` writes no `object` field (its acting option consumes
  nothing that can change under it: run the reviewer, run a check, write the proposed config whose
  values are in `acceptance.answer`, #96).
- **Binding is by instance and fails closed (C2; closes P60).** The hook reads the marker's instance
  id and looks up the `gate` entry with that ledger id in this route chain; the answer entry carries
  `instance` and copies that entry's `object`. No marker, an instance with no entry, or an entry for
  another gate id or another chain → the hook appends `{gate, via: hook, unbound: true, reason}` (not
  a gate answer in the fold, §4), the next advance re-prints the gate with "put the marker back", and
  nothing acts. A preanswer is converted **at the print**: the engine appends the `gate` entry, then
  `acceptance {via: prompt, instance: <that entry>, object: <its object>}`. An answer to an older
  print is bound to that print and carries that print's object, so `note promote` sees
  `object-changed` when a newer draft exists (13 §3) — the swap the reviewer's witness showed
  (answer to A bound to B) cannot be written.
- A gate can be re-answered: a later **bound** `acceptance` for the same gate id supersedes an
  earlier `default-taken` (P3), and `onAnswer` applies then. "Latest answer wins" is evaluated among
  bound answers only.

#### 3.5 Gate classes

| Class | Declared where | Id | Examples |
|---|---|---|---|
| **declared** | a `human` step in the route file | the step id | `plan-accept`, `review-offer`, `estimate`, `scope`, `sources`, `rules-table`, `init-apply`, `draft-ok` |
| **raised by code** | `routes/gates.yaml` (the full list is 32 §4): `code → {question, options, default, release, onAnswer?, policy?: {<skill>: stop}}` | the error code | `requirements-server-disconnected`, `requirements-server-ambiguous`, `requirements-expansion-capped`, `requirements-conflicting`, `requirements-not-captured-twice`, `check-only-unauthorized` (per key; `onAnswer: {approve: revise $raisedBy}`), `project-ambiguous`, `config-unparsable`, `budget-exhausted`, `scope-expanding` |
| **raised by the model** | `routes/gates.yaml` class `decision:*` | `decision:<slug>`, chosen by the model | plan's material decisions (23 step 4) |

**Every** gate print — declared or raised — appends `gate {gate: <id>, class, raisedBy?, object?, print}`;
its ledger id is the instance the marker carries and the answer binds to (§3.4, C2, #145);
`$raisedBy` in an `onAnswer` names that step, so approving a waiting check re-enters the step that
ran it (#77). A model-raised decision gate is opened by the model's own `AskUserQuestion` carrying
`[ambicode gate decision:<slug>]` **without an instance** (the model printed it, not the engine); the
hook appends `gate` and the bound answer together — the one case where the hook mints the instance,
harmless because a decision gate has no `object` and no acting option; its registry entry fixes the
non-acting default (*keep open*) and the release. The registry's `policy: {<skill>: stop}` replaces
the gate's **default and release** with *stop* for that skill: the gate is still printed with its
other options (interactive), and headless or three unanswered advances take *stop*; a human may
still pick a server on `requirements-server-ambiguous` (`requirements-server-disconnected: {review:
stop}`, #65, #144). **The table test (33 §8)
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
    done := code   ? a `step {step: <this id>, actor: code, status: completed}` exists in evidence   # G6: its own completion record
                     and every (kind, qualifier) in produces exists in evidence                        # #105 (vacuous when produces is empty)
          : model  ? (produces ? every (kind, qualifier) exists in evidence
                               : a `step {step: <this id>, actor: model, status: completed}` exists in evidence)   # written by route next or a command tail for the model step at the position (§8 step 1, #135)
          : human  ? acceptance|declined|default-taken for its gate exists in evidence
                     — a `declined {reason: acting-needs-human}` or an `unbound` entry does **not** count (the gate is
                     re-printed, §3.4; the entry is the record that a model tried to act, or that a marker was lost, #115, C2)
                     (else a `preanswer` for the gate exists → convert it to acceptance {via: prompt} now)
          : worker ? a `worker` entry exists in evidence
    if not done: return step
  return complete        # no `route stop` needed on the happy path
```

`revise {from: <stepId>, via: gate|code|model, cycle}` moves the evidence window for every step from
`from` onward, so they are "not done" again; evidence before the revise stays in the ledger and in
the report (as "superseded by revise a1b2c3d4-17").

**Bounds, two kinds (D14):**

- **Automatic** revises (`via: code|model`) count against the `repeat` of the revise's **target**
  step (`from`) **within the current human cycle** (G3): the target's executions so far + 1 must be
  ≤ its `repeat`, else the revise is refused with `limit {repeat, step}` and the route continues
  forward with the step's last evidence (e.g. `plan check` failures become Known limitations after
  3 writes). The steps the revise **covers** (every step from the target onward) are simply "not
  done" again and re-run as a consequence; their own `repeat` is not consulted for this revise (so
  `plan-check`, `plan-step`, `policy check --drafts` and other default-1 code steps never block a
  legitimate re-entry of the step before them). Their `repeat` still bounds revises that **target**
  them. The build validator refuses a route whose `onFail`/`revisable` target has `repeat: 1`
  (32 §3, #140). A code revise whose **target is a `human` step** (the only case: `promote → revise
  plan-accept`) does not consult `repeat` — a gate may be re-asked whenever its object changed — and
  is bounded by §5's same-error counter (two `plan-not-accepted {object-changed}` from one command →
  `stop:blocked` offered); the hook increments `gate.asked` on the re-print as usual (#134).
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
| `repeat` per step, per human cycle (checked on the revise **target**, G3) | `ground 2`, `design 2`, `plan-write 3`, `draft 3`, `fix 2`, `review-run 2`, `check` 5 per phase, others 1 | automatic revise refused with `limit`; the route continues; report lists it under Not verified |
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

### 8. Execution contract and invariants (G1–G6, C1, C2, H2; one algorithm, stated once)

**Entry points.** `route start` (hook, harness or cli channel), `route next`, the tail of an
evidence-writing command (§3.1), a gate answer through the `AskUserQuestion` hook, and a resume
(`route start` on an open route, §2.3). All five run the same sequence:

```
1. record the input      : the command's own ledger write (check/review/note…), the gate answer
                           (acceptance|declined|default-taken, with `instance` and the instance's `object`
                           when the gate declares one, §3.4),
                           a `revise {via: model}` for --revise, `preanswer`s on a trusted start;
                           `route next` and an evidence-writing command's tail also record
                           `step {step: <position>, actor: model, status: completed, cause}` when the
                           position is a `model` step without `produces` (a model step with `produces`
                           is done by them, §3.2.2; #135)
2. fold (§4)             : position = first not-done step; windows per step; preanswer conversion at the gate
3. check prerequisites   : `needs` of the position; bounds (§4: target `repeat`, `maxRevises`, §5 counters);
                           budget; `when` of the position
4. execute               : run the position if `code`, then each following `code` step up to the next
                           model/human/worker step; a model/human/worker position runs nothing and is
                           delivered in 6; `onError`/`onFail` may append `revise` → back to 2
5. record the result     : `step {step, actor: code, status: completed, cause}` after each code step's
                           outputs are on record (outputs first, completion last — see Interruption)
6. deliver               : print the next `model` step or the gate (`step {status: delivered, channel, bytes}`),
                           or the report step, or nothing when the route is complete
```

What differs per entry point: `route start` adds steps 0 (resolve, slug, ownership then
dedup/adopt/refuse, `route` entry) and skips 1; a command tail does 1 with its own kind; the gate hook does 1 with the answer and
may deliver through `additionalContext` (P48); a **cross-session adoption** does 0 then 2–6 with
nothing to record; a same-session re-print (§2.3) and the `UserPromptSubmit` re-injection (30 §5)
do 2 and 6 only — they run no code and complete no step. **No advancing entry point runs code before
folding, and no advancing entry point folds without running the reachable code after it**; re-print
and re-injection are deliveries, not advances (G6, #135).

**Records, three kinds, never conflated (13 §1).** *Delivered* (`step {status: delivered}`): an
instruction reached the model. *Completed* (`step {status: completed}`): for a code step, it finished
and its outputs are on record; for a model step without `produces`, the model ran `route next` or a
command tail at that position (#135) — an acknowledgment that the work was done, never proof of its
quality. *Verified*: a `check`/`review`/`worker` entry whose own fields say what it found. The fold
reads completed for code steps, produces or its own completion record for model steps, bound
answers for human steps (§4). A report sentence may claim only what a record of the right kind
supports (R3).

**Standalone commands.** Every CLI command runs with or without an active route. Without one: no
fold, no delivery, the command's ledger write still happens (`note save`, `check`, `review` behave
as today). With one: the tail advances. **Consent is checked by the consuming command itself, never
by the route position**: `note promote` (13 §3), `init --apply` (20 step 4), `check --approve` and
`review --approve` (16 §2) each read the ledger for an honoured answer under §3.4 — a bound hook
answer or a consumed preanswer, never a flag (C1) — for its object when the gate declares one (`note
promote`), for the accepted `key` or `--set` values otherwise (#145) — and refuse otherwise, so
running them "by hand" cannot do more than the route would. Commands that write under a task
directory also check ownership (§2.3, H2): a session that lost its `plan` route to `--adopt` or
`--fresh` gets ⛔ `route-taken-over`.

**Interruption and recovery.** Writes are ordered so that a crash between any two leaves a state the
next entry point repairs without a second consent:

| Interrupted between | On the next entry point |
|---|---|
| a file written (`steps/<id>.md`, `requirements/<key>.json`, a note) and its ledger entry | the entry is missing → the step is not done → it re-runs; the writer overwrites the file (same stem, new timestamp for notes); the orphan is listed by `route status` |
| a code step's outputs recorded and its `step {completed}` | the step re-runs; its outputs are written again beside the first (ledger is append-only); the report uses the latest in the window |
| a command's result recorded and the next step delivered | the fold finds the position; `route next` or the `UserPromptSubmit` re-injection delivers it (30 §5); nothing re-runs |
| `note promote`'s rename and its `note {plan}` entry | `plan_<ts>.md` exists with no `note {plan}` → the next `note promote` (or the `promote` step) appends the entry for that file and consumes nothing else; a second rename never happens (13 §3) |
| a gate answered in the hook and the answer entry | the answer is lost; the gate re-prints (§3.4); the human answers again — the only case that asks twice, and it asks, never acts |

**Concurrency.** One active route per session (§2.3). Across sessions on one slug, **ownership is
checked before args**: a route owning a model-writable file (`plan`) has one live owner — a second
session is refused `route-busy` whatever its args and takes over only by typing `--adopt` (position
kept) or `--fresh` (restart), after which the former session is refused at write time
(`route-taken-over`); routes owning no file: same args → adoption, the fold is over the union;
different args → side by side (P54) (§2.3, G2, H2). `O_APPEND` keeps lines whole and ids carry the
session (13 §1); ownership of `steps/plan-body.md` comes from the chain's latest `route` entry, and
the draft chosen for promotion from `acceptance.object` bound to a printed instance — never from
append order (C2).

**Completion is not success.** A route reaches `complete` when the fold passes its last step; the
**exit** says what that is worth: `done` only when no `limit`, no `declined` check, no failed or
skipped reviewer and no `default-taken {never-asked|unanswered}` sits in the final windows;
otherwise `complete` with the report's Not verified listing each one, and the report's first line
says "complete, N items not verified". `blocked`/`inconclusive`/`budget`/`human` come from
`route stop` or the bounds (§5). The three-unanswered-advances rule (R12) stands; its consequence —
the non-acting option on record and the gate listed under Not verified — is what the report may say.

**Invariants** (each has a fixture in 33 §8):

1. No acting effect without an honoured answer for **that object** from a **trusted** origin: a hook
   answer bound to the printed instance, or a preanswer the user or the harness gave at a trusted
   start — never a flag the model typed, whatever the route's mode or channel (§3.4; G1, G2, C1, C2).
2. A step is done only by its own record: completion for code, produces or its own completion
   record for model, an answer for human (§4, G6, #135).
3. An automatic revise is bounded by its target's `repeat`; a human's by `maxRevises`; a covered
   step never blocks a legitimate re-entry (§4, G3).
4. Every route can start on the repository it was asked for: init without config, others fail
   closed on `config-missing` (§2.1, G4).
5. A skill that promises a requirement never silently continues without one it asked for (14 §3,
   25 step 2, G5).
6. Every entry point is the same six-step sequence; a crash between any two steps is repaired by
   the next entry point without asking the human to consent again (this section).
7. A model-writable file has one live owner: a second session is refused until it takes the route
   over, and the former owner is refused at write time from then on (§2.3, H2).

## Interfaces

```ts
interface Engine {
  start(input: {skill; args; task?; headless?; project?; answers?: Answer[]; fresh?: boolean; adopt?: boolean; cwd; session; channel: 'hook'|'cli'|'harness'}): Promise<StepMessage>;   // trusted = channel !== 'cli' (§2.4, G1); adopt/fresh take over an owned route (§2.3, H2)
  advance(input: {task; session; answers?: Answer[] /* {gate, option, instance?} — acting options from the model are declined (C1) */; default?; revise?; conflict?; project?; show?; cause: 'route-next'|CommandName|'gate-hook'}): Promise<StepMessage>;
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
| A gate marker edited out of the question, or its instance id names no `gate` entry of this chain | the hook cannot bind; it appends `{unbound: true, reason}` (not a gate answer); the next advance re-prints the gate with "put the marker back"; nothing acts (C2) |
| An answer arrives for an older print (print A, then print B for a new draft, then *Accept* on A's question) | bound to A's instance with A's object; `note promote` → `plan-not-accepted {object-changed}` (A ≠ the latest draft B); nothing promoted; the gate re-prints for B (C2, 13 §3) |
| The model runs `route next --answer <gate>=<acting>` in a **trusted headless** route | `declined {via: flag, reason: acting-needs-human}` all the same; the gate takes its non-acting default; the report's Decisions names the declined request (C1) |
| Ledger unreadable | ⛔ `ledger-unreadable`; release `route start --task <slug>-2` |
| `/ambicode:init` on a repository with no config | the init route starts (§2.1 exception, G4); every other skill: ⛔ `config-missing` naming init |
| A model types `route start … --headless --answer <gate>=<acting>` interactively | `channel: cli` → `trusted: false`; the mode is headless, the acting answer is `declined {acting-needs-human}`; the gate is asked when reached (G1) |
| *Accept* on draft A, then a new `plan-draft` B is saved | the acceptance carries A's hash and the latest draft is now B: `note promote` → `plan-not-accepted {reason: object-changed}` naming both hashes; **nothing** is promoted until the gate is re-printed for B and answered (13 §3 step 3, #134); A is dead as an object (G2, #133) |
| A second live `plan` route on one slug from another session, same or different args | ⛔ `route-busy`; release `--adopt` (position kept), `--fresh` (restart) or `--task <slug>-2` (§2.3, G2, H2) |
| The former `plan` session writes after `--adopt`/`--fresh` from another session | ⛔ `route-taken-over` naming the new session, from `route next`, `note save --from`, `plan check`, `note promote` and the guard's `Write(plan-body.md)` (§2.3, 15 §1, H2) |
| A crash between a step's outputs and its completion record | the step re-runs on the next entry point; outputs are appended again; no consent is asked twice (§8) |
| Compaction mid-route | `UserPromptSubmit` re-injects the current step from the fold |
| A new session on an open route | skill owning no file: adopted when `hash(args)` matches (§2.3), else a new route beside it; `plan`: `route-busy` until `--adopt` or `--fresh` (H2); `--fresh` restarts (#114) |
| Two sessions, one slug, both live | skill owning no file — same args: each `route start` adopts and the fold is over the union; different args: two routes side by side (P54); `plan`: the second is `route-busy` (H2); ids carry the session (13 §1); `O_APPEND` keeps lines whole (#114) |

## What changes from v0.4.0

`prepare-on-skill.ts` becomes `route start`; the `Skill` hook entry is removed (dead under D2); the
MCP hook captures only (14 §3). Skill bodies lose their step lists. New ledger kinds (13 §1).

## Open problems

- P1 Workflow-engine risk: measured by 33 §1–2 before anything is built on the engine; the
  decision to roll back is the user's (D10, R13).
- P2 `AskUserQuestion` hook payload (does it carry the question text with the marker and the chosen
  option?): probe before 41 step 3 — the gate binding depends on it. Fallback for **non-acting**
  options: the model types `route next --answer <gate>=<option>` after asking. **Acting options have
  no model-typed fallback** (C1): if P2 fails, acting answers exist only as preanswers in a trusted
  start, and 41 step 3 presents that to the user before anything is built on the hook (D10).
- P58 Whether the eval harness can hand a per-run token to the model's Bash children inside the
  `claude plugin eval` sandbox (environment of the scaffold script or of the sandbox process). If
  yes, the sandbox fallback start is `channel: harness` and acting preanswers are honoured there;
  if no, acting preanswers in the sandbox exist only when P37(b) holds (the hook starts the route
  from the prompt). Probe with P37 (33 §0.4). Until probed, every eval that needs an acting
  preanswer (review `estimate=run`, task `review-offer=run`) is conditional on one of the two.
- P59 `route-busy` narrows P54 for `plan`: two people planning one slug at once must use two task
  directories, and a restart after a crash types `--adopt` (one extra turn, H2). Accepted; the
  alternative (per-route `plan-body.md` and drafts) changes the one model-writable path the guard
  and the skill grant name (15 §1, #57) and is not worth it before the first measured plan. An
  abandoned plan route is taken over with `--adopt` or `--fresh`, never timed out (#141).
- P60 **closed** (C2): the answer binds to the instance id in the marker, never to the latest `gate`
  entry; an unbindable answer is `unbound` and re-asked.
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
  (`ADDITIONAL_CONTEXT_EVENTS` includes `PostToolUse`, `src/types/hook.ts:33`, so the contract
  allows it; the payload is P2). Fallback: the hook prints nothing and the gate text ends with "then
  run `$A route next`" (+1 ceremony turn per gate).
- P54 Adopting a route from another session folds over two sessions' entries: a second **live**
  session on the same slug sees the first's steps as done. Intended for a restart, surprising for
  two people; `route status` names the sessions involved. Only for skills owning no file; `plan`
  adopts by an explicit `--adopt` (H2).
- P55 `maxRevises` is a guess (3); a human who needs a fourth round restarts the route and keeps the
  draft. Measured by how often "(0 left)" is printed in real plans.
