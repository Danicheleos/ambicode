# Routes

A route is the ordered list of steps ambicode walks for one skill. Code steps run inside the CLI, model steps hand
the model a short instruction, human steps ask the user through a gate. Everything that happens is appended to the
task's ledger (`.ambicode/task/<task>/ledger.jsonl`), and the route's position is folded from that ledger.

This directory is developer documentation plus the route files; this README is not shipped in the plugin.

| File | What it is |
|---|---|
| `<skill>/<skill>.yaml` | One route. The folder and file name must equal its `skill`. |
| `gates.yaml` | The gate registry: gates a route can raise from code (not declared on a step). |
| `<skill>/<step>.md` | Instruction text of the route's model steps, referenced as `file:routes/<skill>/<step>.md`. A route may reference another route's text (task uses `plan/fetch.md`). |

Routes are checked by `npm run build`, `npm run verify` and the package build. A mistake fails with
`route-invalid: <file>: <where>: <what is wrong>`.

## A route file

```yaml
skill: investigate        # required, equals the file name
version: 3                # required, always 3
revisable: [ground]       # optional, default []
steps: [ ... ]            # required, at least one
```

| Field | Values | Meaning and when to use |
|---|---|---|
| `skill` | string | The skill the route belongs to; `/ambicode:<skill>` starts it. |
| `version` | `3` | Schema version of the route language. |
| `revisable` | list of step ids | Steps the model may ask to run again with `route next --revise <step>`. A step that is revised runs more than once, so give it a `repeat` of at least 2. Use it for a step whose result may need redoing with new input. |

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
| `id` | string | Name used in the ledger, in `when`, `revisable` and revise targets. |
| `actor` | `code`, `model`, `human` | `code`: runs handlers, no model turn. `model`: the model gets instruction text and must do the work. `human`: asks the user through a gate. |
| `run` | handler call or list | **Code steps only** (required there). Handlers run in order, as `name` or `name(param, param)`. Allowed names are listed below. |
| `instruction` | inline text or `file:<path>` | **Model steps only** (required there). Put long text in `routes/<skill>/<step>.md` and reference it. The placeholders `{cli}` (command prefix) and `{task}` (task slug) are filled in. |
| `payload` | list of keys | **Model steps.** Outputs of earlier handlers appended to the instruction under `## <key>`. Empty outputs are left out. Keys below. |
| `produces` | list of `kind` or `kind{value}` | Records the step must leave in the ledger. A code step that does not write them fails with `route-produces-missing`. A model step stays open ("Not done yet") until they exist. |
| `when` | condition | Run the step only if true; otherwise it is recorded as skipped. Conditions below. |
| `gate` | gate object | **Human steps only** (required there). See Gates. |
| `onFail` | `revise <step> [--name value]` | Code step that finishes but reports a failed result: return to that step instead of stopping. The target must be a step of this route. |
| `onError` | `stop:<exit>` | What an error in the step does. Default: show the error to the model (a second identical error adds a stop hint). `stop:` ends the route with that exit. |
| `repeat` | integer >= 1 | How many times the step may run (revises included). Default 1; there is no table by id, so every revised step states its own. On a human step it is the gate's `repeat`. |

### Handlers (`run`)

| Handler | Produces payload key | What it does |
|---|---|---|
| `requirements.normalize` | `envelope` | Builds the requirement envelope from captures (or from the request text) and records it. |
| `search.map(prompt)` | `map` | Builds the search map for the request. The parameter picks the layer set (`prompt` or `context`). |
| `policy.stage(<stage>)` | `policy:<stage>` | Rules for the stage: `before-work`, `before-checks`, `before-report`. |
| `evidence.navigationLine` | `navigation` | The line saying which navigation calls were recorded. |
| `evidence.notes.save(<kind>)`, `evidence.notes.promote` | none | Save a note / promote a plan draft. |
| `script(<name>)` | `script:<name>` | Runs `skills/<skill>/scripts/<name>.mjs`; see Scripts. |
| `review.evaluate` | `review.evaluate` | Judges the latest review: no findings proceeds; any finding goes back to `fix`, which files the ones outside the brief under Remaining. Fails the step (`onFail`) when there are findings to fix. |
| `review.publishList` | `review.publishList` | `--mr` review: the recorded findings as a numbered list; none ends the route. |
| `review.command` | `review.command` | Review route: prints the review command for the model to run. |

`produces` takes any ledger kind, with an optional qualifier: `note{investigation}`, `policy{before-work}`, `check{green}`, `review{recorded}`, `envelope`, `map`, ... The qualifier is matched against the record, not checked at load.

Evidence-writing commands write their ledger entry and then advance the route at their tail: `check`, `format`, `review` (writes `review{pending}`), `review record` (writes `review{recorded}` from the `ambicode:reviewer` subagent's JSON on stdin), `note save`, `note promote`, `requirements normalize`.

### Scripts (`script(<name>)`)

A skill-local script is a plain ESM file (`skills/<skill>/scripts/<name>.mjs`, no imports from `src/`, no npm packages) run with `node`. It reads one JSON object on stdin: `{task, skill, repositoryRoot, taskDir, steps, args, params, revise, raisedBy, headless}` (`params` are the arguments after the name; `steps` is the task's steps directory). It prints one JSON object on stdout, every key optional: `payload` (text for the model, saved as `script:<name>`), `record` (fields merged into the step's completion entry), `entries` (ledger entries, each with a `kind`, appended before any `failed`), `failed: {code, message, recoverable?, revise?: {args, lastRound?}}`, `raise: {gate, values}`, `exit` and `exitDetail`. A non-zero exit, a timeout (60 s) or output that is not JSON fails the step with `script-failed` or `script-output-invalid`. A script never writes the ledger itself.

### Conditions (`when`)

| Condition | True when |
|---|---|
| `args.hasRequirement` | The request names a requirement (URL, `--requirement`, or a bare key with an MCP server configured). |
| `args.hasMergeRequest` | The review route was started with `--mr <url>`. |
| `map.empty` | The search map found nothing. |
| `plan.isDraft` | The plan is still a draft. |
| `gate.<id>.is(<option>)` / `gate.<id>.isnt(<option>)` | The gate's answer is that option / is any other answer, free text included. |

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
| `question` | string | Shown to the user. `{name}` is filled from the values the raising code passes (registry gates). |
| `options` | list, at least one | The choices. `{list…}` expands a list of values, `{key}` fills a value. Free text the user types is allowed only if `onAnswer` has `*`. |
| `default` | one of `options` | Taken when nobody answers (headless, timeout). Never an acting option. |
| `acting` | list of options | Options that change something that matters. They count only from the user's own answer in the dialog (bound by the hook) or a trusted `--answer` at start, never from a model-typed answer. Use for approve, accept, overwrite. |
| `onAnswer` | `{ <option or *>: "revise <step> [--name value]" }` | Send the route back to a step after that answer. `*` handles free text. `$answer` is the user's text, `$raisedBy` the step that raised the gate. |
| `repeat` | integer >= 1, default 3 | One counter: how many times the user can send the route back through this gate, and how many times the gate step may run. |
| `object` | `kind` or `kind{value}` | The record the question is about; its path and hash are printed. An earlier step must `produce` it. |
| `policy` | `{ <skill>: stop }` | For that skill the gate gets a `stop` option and `stop` becomes the default. Used when one route must never continue past it (review). |

An unanswered gate has one rule: `route next` shows the same print again, as it was, and never counts toward a default. Only a headless route takes the `default` at once.

In a headless route the guard turns a permission ask into a deny; the model then finishes with a final message that says `permission-denied: <what>`.

Special answers: `stop` and `pause` end the route. The exit is `human` for the `scope` and `project-ambiguous` gates and `blocked` for every other gate. Name the option `pause` when the user can supply what is missing later in the chat; a paused route cannot be resumed, the user starts a new one, and a new start ends the session's live route as `superseded`.

Gates are asked with AskUserQuestion; the printed line `[ambicode gate <id> <instance>]` must stay verbatim in the question so the hook can bind the answer.

`gates.yaml` entries have the same fields, keyed by gate id. They are raised by handler code (for example requirement capture) or by `onError: ask <id>`. The `decision:*` entry is the template for plan decisions.

## Adding or changing a route

1. Write or edit `routes/<skill>/<skill>.yaml`; the folder and file name equal `skill`.
2. Put model instruction text longer than a few lines in `routes/<skill>/<step>.md`.
3. Every `run` name must be a registered handler; new handlers live in `src/route/handlers*.ts`.
4. Check the route: `npm run build` (validates every file). Add a walk test in `src/route/` named after the rule it covers.
5. The validator checks what would break a route at load: unique step ids, registered handlers, an instruction on every model step and a gate on every human step, `when` gate references and revise targets that exist, and a default that is an option and never acting. Whether a revised step has enough `repeat` is yours to state; a revise past it writes a `limit` entry at run time.
