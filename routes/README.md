# Routes

A route is the ordered list of steps ambicode walks for one skill. Code steps run inside the CLI, model steps hand
the model a short instruction, human steps ask the user through a gate. Everything that happens is appended to the
task's ledger (`.ambicode/tasks/<task>/ledger.jsonl`), and the route's position is folded from that ledger.

This directory is developer documentation plus the route files; this README is not shipped in the plugin.

| File | What it is |
|---|---|
| `<skill>/<skill>.yaml` | One route. The folder and file name must equal its `skill`. |
| `gates.yaml` | The gate registry: gates a route can raise from code (not declared on a step). |
| `<skill>/<step>.md` | Instruction text of the route's model steps, referenced as `file:routes/<skill>/<step>.md`. A route may reference another route's text (task uses `investigate/fetch.md`). |

Routes are checked by `npm run build`, `npm run verify` and the package build. A mistake fails with
`route-invalid: <file>: <where>: <what is wrong>`.

## A route file

```yaml
skill: investigate        # required, equals the file name
version: 3                # required, always 3
needsRequest: true        # optional; see the table
steps: [ ... ]            # required, at least one
```

| Field | Values | Meaning and when to use |
|---|---|---|
| `skill` | string | The skill the route belongs to; `/ambicode:<skill>` starts it. |
| `version` | `3` | Schema version of the route language. |
| `needsRequest` | `true` | A start with no text and no `--task` continues the session's latest task of such a route, or fails `task-needed` listing recent tasks to ask about. Without it the route is named after its skill (`review`, `rules`). |

## A step

```yaml
- id: ground
  actor: code
  run: [requirements.normalize, search.map(prompt)]
  produces: [envelope, map]
  repeat: 2
```

Unknown fields are rejected. Step ids are unique inside a route.

| Field | Values | Meaning and when to use |
|---|---|---|
| `id` | string | Name used in the ledger, in `when` and revise targets. |
| `actor` | `code`, `model`, `human` | `code`: runs handlers, no model turn. `model`: the model gets instruction text and must do the work. `human`: asks the user through a gate. |
| `run` | handler call or list | **Code steps only** (required there). Handlers run in order, as `name` or `name(param, param)`. Allowed names are listed below. |
| `instruction` | inline text or `file:<path>` | **Model steps only** (required there). Put long text in `routes/<skill>/<step>.md` and reference it. The placeholders `{cli}` (command prefix) and `{task}` (task slug) are filled in. |
| `work` | inline text or `file:<path>` | **Model steps.** Delegates the step to a subagent (`ambicode:implementer`; the review step's `ambicode:reviewer`): this text, the revise args, the request under `## request` and every `payload` section are written whole to `.ambicode/tasks/<task>/steps/work-<step>.md`, and `instruction` only launches the subagent on `{work}`. While the step is open a `check` is recorded without advancing the route and prints no route text, so the model runs `route next` when the subagent returns. A step whose `produces` is still missing then reads `Not done yet`, three times at most, and is released as a gap. |
| `payload` | list of keys | **Model steps.** Outputs of earlier handlers appended to the instruction under `## <key>`. Empty outputs are left out and leave no file; the others are saved as `.ambicode/tasks/<task>/steps/<route id>-<key>.md` (`:` in a key becomes `-`). Keys below. |
| `produces` | list of `kind` or `kind{value}` | Records the step must leave in the ledger. A code step that does not write them fails with `route-produces-missing`. A model step stays open ("Not done yet") until they exist. |
| `when` | condition | Run the step only if true; otherwise it is recorded as skipped. Conditions below. |
| `gate` | gate object | **Human steps only** (required there). See Gates. |
| `onFail` | `revise <step> [--name value]` or `record` | Code step that finishes but reports a failed result. `revise`: return to that step instead of stopping; the target must be a step of this route. `record`: keep the failure on the ledger as a Not verified line and continue, with no return; use it for a check whose first result must stay visible. |
| `onError` | `stop:<exit>` | What an error in the step does. Default: show the error to the model (a second identical error adds a stop hint). `stop:` ends the route with that exit. |
| `repeat` | integer >= 1 | How many times the step may run (revises included). Default 1; there is no table by id, so every revised step states its own. On a human step it is the gate's `repeat`. |

### Handlers (`run`)

| Handler | Produces payload key | What it does |
|---|---|---|
| `requirements.normalize` | `envelope` | Builds the requirement envelope from captures (or from the request text) and records it. |
| `search.map(prompt)` | `map` | Builds the search map for the request. The parameter picks the layer set (`prompt` or `context`). `context` seeds from the task's iteration brief (a task) or the investigation (a plan); an investigation the request names by path, or the task's latest saved one, is added as an `Investigation: <path>` line. |
| `policy.stage(before-work[, <activity>])` | `policy:before-work`, or `policy:before-work:<activity>` when an activity is given | The resolved pack rules for the route's activity and the files it knows (touched files, else the map's top candidates) as `pack/rule: instruction` grouped under `Rules (team|observed|inherited):` headers under a byte cap; a second param names the activity when it differs from the route's (the task route's reviewer brief passes `review`, which also lifts the cap). The activity is part of the payload key, so the reviewer brief's rules never replace the task rules that `change` and `fix` read. |
| `policy.enabled` | `policy.enabled` | Every rule in force for the project (id and the first 80 characters), so a rules draft does not restate one word for word. |
| `context.list` | `context.list` | The files under `.ambicode/context/` (path, first H1, size) or "no context: run /ambicode:init"; the step reads the notes of the modules the change touches and of shared ones. |
| `evidence.notes.save(<kind>)`, `evidence.notes.promote` | none | Save a note / promote a plan draft. |
| `script(<name>)` | `script:<name>` | Runs `skills/<skill>/scripts/<name>.mjs`; see Scripts. |
| `review.evaluate` | `review.evaluate` | Judges the latest review: no findings proceeds; any finding goes back to `fix`, which files the ones outside the brief under Remaining. Fails the step (`onFail`) when there are findings to fix. |
| `review.publishList` | `review.publishList` | `--mr` review: the recorded findings as a numbered list; none ends the route. |
| `task.verdict` | none | Ends the route `blocked` when its last check is red, so the iteration is not done and the next start redoes it. |
| `task.start` | `brief` | The task's brief: iteration and plan path, then the plan's current iteration or the request. Exits `iterations-complete` when every iteration is done. |
| `evidence.report` | `report` | The Checks, Review and Not verified facts of the route, for its final message to copy. |
| `checks.runnable` | `checks.runnable` | Per project, the checks `check` will run: those with a command and the forms they take (all or `--file`), minus any a pack forbids; per form, `runs freely` or `needs approval` (the all form always, the `--file` form on a `propose`). |
| `checks.baseline` | `baseline` | Records HEAD and the files already changed, once per task. |
| `checks.approved` | none | Runs each check the user approved that has no check entry after the approval, so an answer given after the model moved on still gets its run. |
| `checks.format` | none | Runs the configured format check on the touched files; one that needs approval raises the check gate and the answer re-runs the step. |
| `review.estimate` | `review.estimate` | Sizes the review (files, lines, refusal) for the estimate gate, with any `--narrow` in force. |
| `review.pin` | none | Pins the change as a pending `review` entry. The review route first runs each configured check that has a file form on the changed files, as `check` entries; a check that needs approval raises the check gate and the answer revises the step. |

`produces` takes any ledger kind, with an optional qualifier: `note{investigation}`, `policy{before-work}`, `check{green}`, `review{recorded}`, `envelope`, `map`, ... The qualifier is matched against the record, not checked at load.

Evidence-writing commands write their ledger entry and then advance the route at their tail: `check`, `review` (writes `review{pending}`), `note save`, `requirements normalize`. `check` run by a delegated step's subagent records without advancing; the main model runs `route next` when the subagent returns, background or not. The `review.record` handler then reads the reviewer's `answer.json` and writes `review{recorded}`; no file records a failed review.

### Scripts (`script(<name>)`)

Every route exit (done, blocked, interrupted by a new start, stopped) removes the task's `steps/` and rewrites `.ambicode/tasks/<task>/summary.md` from the ledger (request, plan with the decisions taken, one row per iteration with its final status, saved final message, files, checks and review, then Not verified; the Stop hook saves a route's final message as a `result` note once it states every gap). Nothing in `steps/` outlives its route; `plan-body.md` is promoted to the plan note before the route exits.

A skill-local script is a plain ESM file (`skills/<skill>/scripts/<name>.mjs`, no imports from `src/`, no npm packages) run with `node`. It reads one JSON object on stdin: `{task, skill, repositoryRoot, taskDir, steps, args, params, revise, raisedBy, headless}` (`params` are the arguments after the name; `steps` is the task's steps directory). It prints one JSON object on stdout, every key optional: `payload` (text for the model, saved as `script:<name>`), `record` (fields merged into the step's completion entry), `entries` (ledger entries, each with a `kind`, appended before any `failed`), `failed: {code, message, recoverable?, revise?: {args}}`, `raise: {gate, values}`, `exit` and `exitDetail`. A non-zero exit, a timeout (60 s) or output that is not JSON fails the step with `script-failed` or `script-output-invalid`. A script never writes the ledger itself.

### Conditions (`when`)

| Condition | True when |
|---|---|
| `args.hasRequirement` | The request names a requirement (URL, `--requirement`, or a bare key with an MCP server configured). |
| `args.hasMergeRequest` | The review route was started with `--mr <url>`, or with a merge-request URL as its text. |
| `map.empty` | The search map found nothing. |
| `iteration.named` / `iteration.unnamed` | The request text names `iteration N` / does not (task route). |
| `iterations.continue` | The request names no iteration, the `start` step's iteration is below the plan's iteration count, and the route's last check exited 0. |
| `revised` | The step is entered by a revise (review findings or an approved key), not in the normal walk. |
| `gate.<id>.is(<option>)` / `gate.<id>.isnt(<option>)` | The gate's answer is that option / is any other answer, free text included. |
| `<a> or <b>` | Either condition holds. |

## Gates

A gate is a question to the user. Declare one on a `human` step, or register a reusable one in `gates.yaml`.

```yaml
gate:
  question: "Nothing matched the request. Name a file, a symbol or a word, or pause."
  options: ["pause"]
  default: "pause"
  onAnswer: { "*": "revise ground --term $answer" }
```

| Field | Values | Meaning and when to use |
|---|---|---|
| `question` | string | Shown to the user. `{name}` is filled from the values the raising code passes (registry gates); `{name|text}` prints `text` when the list is empty. |
| `options` | list, at least one | The choices. `{list…}` expands a list of values, `{key}` fills a value. Free text the user types is allowed only if `free: true` or `onAnswer` has `*`; options match case-insensitively and ignore a trailing "(Recommended)". |
| `default` | one of `options` | Taken when nobody answers (headless, timeout). Never an acting option. |
| `acting` | list of options | Options that change something that matters. They count only from the user's own answer in the dialog (bound by the hook) or a trusted `--answer` at start, never from a model-typed answer. Use for approve, accept, overwrite. |
| `onAnswer` | `{ <option or *>: "revise <step> [--name value]" }` | `revise`: send the route back to a step after that answer. `*` handles free text. `$answer` is the user's text, `$raisedBy` the step that raised the gate. |
| `free` | boolean, default false | The user's own words are an answer, recorded as typed and read by a later step. `onAnswer: { "*": … }` implies it. |
| `repeat` | integer >= 1, default 3 | One counter: how many times the user can send the route back through this gate, and how many times the gate step may run. |
| `object` | `kind` or `kind{value}` | The record the question is about; its path and hash are printed. An earlier step must `produce` it. |
| `policy` | `{ <skill>: stop }` | For that skill the gate gets a `stop` option and `stop` becomes the default. Used when one route must never continue past it (review). |

An unanswered gate has one rule: `route next` shows the same print again, as it was, and never counts toward a default. Only a headless route takes the `default` at once.

In a headless route the guard turns a permission ask into a deny; the model then finishes with a final message that says `permission-denied: <what>`.

Special answers: `stop` and `pause` end the route. The exit is `human` for the `scope` and `project-ambiguous` gates and `blocked` for every other gate. Name the option `pause` when the user can supply what is missing later in the chat; a paused route cannot be resumed, the user starts a new one, and a new start on the task ends its live route as `interrupted`.

Gates are asked with AskUserQuestion; the printed line `[ambicode gate <id> <instance>]` must stay verbatim in the question so the hook can bind the answer.

`gates.yaml` entries have the same fields, keyed by gate id. They are raised by handler code (for example requirement capture). The `decision:*` entry is the template for plan decisions.

## Adding or changing a route

1. Write or edit `routes/<skill>/<skill>.yaml`; the folder and file name equal `skill`.
2. Put model instruction text longer than a few lines in `routes/<skill>/<step>.md`.
3. Every `run` name must be a registered handler; new handlers live in `src/skills/<skill>/handlers.ts`.
4. Check the route: `npm run build` (validates every file). Add a walk test in `src/skills/<skill>/` named after the rule it covers.
5. The validator checks what would break a route at load: unique step ids, registered handlers, an instruction on every model step and a gate on every human step, `when` gate references and revise targets that exist, and a default that is an option and never acting. Whether a revised step has enough `repeat` is yours to state; a revise past it writes a `limit` entry at run time.
