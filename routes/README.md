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
budget: { modelSteps: 6 } # optional, documentation only: nothing enforces it
exits: [done, blocked, human, inconclusive, superseded, budget]
revisable: [ground]       # optional, default []
steps: [ ... ]            # required, at least one
```

| Field | Values | Meaning and when to use |
|---|---|---|
| `skill` | string | The skill the route belongs to; `/ambicode:<skill>` starts it. |
| `version` | `3` | Schema version of the route language. |
| `budget` | any, optional | The size the route was designed for. Ignored: no step count or clock limit is enforced. |
| `exits` | any of `done`, `blocked`, `human`, `inconclusive`, `superseded`, `budget` | The ways the route may end. `done` normal; `blocked` stuck or stopped; `human` waiting for the user; `inconclusive` finished without an answer; `superseded` replaced by another route; `budget` is still accepted in the list but nothing ends a route with it any more. |
| `revisable` | list of step ids | Steps the model may ask to run again with `route next --revise <step>`. A listed code or model step needs `repeat` of at least 2. Use it for a step whose result may need redoing with new input. |

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
| `actor` | `code`, `model`, `human`, `worker` | `code`: runs handlers, no model turn. `model`: the model gets instruction text and must do the work. `human`: asks the user through a gate. `worker`: reserved, not implemented yet. |
| `run` | handler call or list | **Code steps only** (required there). Handlers run in order, as `name` or `name(param, param)`. Allowed names are listed below. |
| `instruction` | inline text or `file:<path>` | **Model steps only** (required there). At most 1,500 characters. Put long text in `routes/<skill>/<step>.md` and reference it. The placeholders `{cli}` (command prefix) and `{task}` (task slug) are filled in. |
| `payload` | list of keys | **Model steps.** Outputs of earlier handlers appended to the instruction under `## <key>`. Empty outputs are left out. Keys below. |
| `needs` | list of `kind` or `kind{value}` | Records that must already be in the ledger when the step starts, else `route-needs-unmet`. |
| `produces` | list of `kind` or `kind{value}` | Records the step must leave in the ledger. A code step that does not write them fails with `route-produces-missing`. A model step stays open ("Not done yet") until they exist. |
| `when` | condition | Run the step only if true; otherwise it is recorded as skipped. Conditions below. |
| `gate` | gate object | **Human steps only** (required there). See Gates. |
| `onFail` | `revise <step> [--name value]` | Code step that finishes but reports a failed result: return to an earlier step instead of stopping. The target must be an earlier step or the next one. |
| `onError` | `retry-with <hint>`, `ask <gate>`, `stop:<exit>` | What an error in the step does. Default: show the error to the model (a second identical error adds a stop hint). `retry-with` adds a hint to the error, `ask` raises that gate (declared on the route or in `gates.yaml`), `stop:` ends the route with that exit. |
| `repeat` | integer >= 1 | How many times the step may run (revises included). Default 1; defaults by id: `ground` 2, `design` 2, `plan-write` 3, `draft` 3, `fix` 2, `review-run` 2. |

### Handlers (`run`)

| Handler | Produces payload key | What it does |
|---|---|---|
| `requirements.template` | `template` | Prints the MCP calls the model must make to fetch the requirement. |
| `requirements.normalize` | `envelope` | Builds the requirement envelope from captures (or from the request text) and records it. |
| `requirements.acs` | `acs` | Splits acceptance criteria from the envelope. |
| `search.map(prompt)` | `map` | Builds the search map for the request. The parameter picks the layer set (`prompt` or `context`). |
| `policy.stage(<stage>)` | `policy:<stage>` | Rules for the stage: `before-work`, `before-checks`, `before-report`. |
| `evidence.navigationLine` | `navigation` | The line saying which navigation calls were recorded. |
| `evidence.notes.save(<kind>)`, `evidence.notes.promote` | none | Save a note / promote a plan draft. |
| `review.evaluate` | `review.evaluate` | Judges the latest review: waiting checks, out-of-scope findings, findings to fix. On the review route it also prints the snapshot and `brief.md` paths the reviewer subagent is given. |
| `review.mrTemplate` | `review.mrTemplate` | `--mr` review: the MCP calls the model makes to fetch the merge request and its diff. |
| `review.publishList` | `review.publishList` | `--mr` review: the recorded findings as a numbered list; none ends the route. |
| `review.await` | `review.await` | Task route, after `review --task`: raises waiting checks, else prints the same two paths. |

Qualifiers for `needs`/`produces`: `note{investigation|plan-draft|plan|notes}`, `policy{before-work|before-checks|before-report}`, `check{green}`, `requirement{full|list}`, `review{pending|recorded}`. Other kinds take no qualifier: `envelope`, `map`, `search`, `gate`, `acceptance`, ... (any ledger kind).

Evidence-writing commands write their ledger entry and then advance the route at their tail: `check`, `format`, `review` (writes `review{pending}`), `review record` (writes `review{recorded}` from the `ambicode:reviewer` subagent's JSON on stdin), `note save`, `note promote`, `plan check`, `requirements normalize`.

### Conditions (`when`)

| Condition | True when |
|---|---|
| `args.hasRequirement` / `!args.hasRequirement` | The request names a requirement (URL, `--requirement`, or a bare key with an MCP server configured) / does not. |
| `args.hasMergeRequest` | The review route was started with `--mr <url>`. |
| `map.empty` | The search map found nothing. |
| `plan.isDraft` | The plan is still a draft. |
| `headless` / `interactive` | The route was started headless / with a user present. |
| `gate.<id>.answered` | The gate has a bound answer. |
| `gate.<id>.is(<option>)` / `gate.<id>.isnt(<option>)` | The gate's answer is that option / is any other answer, free text included. |

## Gates

A gate is a question to the user. Declare one on a `human` step, or register a reusable one in `gates.yaml`.

```yaml
gate:
  question: "Nothing matched the request. Name a file, a symbol or a word, or pause."
  options: ["pause"]
  default: "pause"
  release: "pause"
  onAnswer: { "*": "revise ground --term $answer" }
```

| Field | Values | Meaning and when to use |
|---|---|---|
| `question` | string | Shown to the user. `{name}` is filled from the values the raising code passes (registry gates). |
| `options` | list, at least one | The choices. `{list…}` expands a list of values, `{key}` fills a value. Free text the user types is allowed only if `onAnswer` has `*`. |
| `default` | one of `options` | Taken when nobody answers (headless, timeout). Never an acting option. |
| `release` | string | The fallback named for an unattended release of the gate (an option, or a command hint such as `route next --project <id>`). Never an acting option. The engine only validates it today; keep it equal to `default` unless there is a reason. |
| `acting` | list of options | Options that change something that matters. They count only from the user's own answer in the dialog (bound by the hook) or a trusted `--answer` at start, never from a model-typed answer. Use for approve, accept, overwrite. |
| `onAnswer` | `{ <option or *>: "revise <step> [--name value]" }` | Send the route back to a step after that answer. `*` handles free text. `$answer` is the user's text, `$raisedBy` the step that raised the gate. |
| `maxRevises` | integer >= 1, default 3 | How many times the user can send the route back through this gate. |
| `object` | `kind` or `kind{value}` | The record the question is about; its path and hash are printed. An earlier step must `produce` it. |
| `policy` | `{ <skill>: stop }` | For that skill the gate gets a `stop` option and `stop` becomes default and release. Used when one route must never continue past it (review). |

In a headless route the guard turns a permission ask into a deny; the model then finishes with a final message that says `permission-denied: <what>`.

Special answers: `stop` and `pause` end the route. The exit is `human` for the `scope` and `project-ambiguous` gates and `blocked` for every other gate. Name the option `pause` when the user can supply what is missing later in the chat; a paused route cannot be resumed, the user starts a new one.

Gates are asked with AskUserQuestion; the printed line `[ambicode gate <id> <instance>]` must stay verbatim in the question so the hook can bind the answer.

`gates.yaml` entries have the same fields, keyed by gate id. They are raised by handler code (for example requirement capture) or by `onError: ask <id>`. The `decision:*` entry is the template for plan decisions.

## Adding or changing a route

1. Write or edit `routes/<skill>/<skill>.yaml`; the folder and file name equal `skill`.
2. Put model instruction text longer than a few lines in `routes/<skill>/<step>.md` (limit 1,500 characters).
3. Every `run` name must be a registered handler; new handlers live in `src/route/handlers*.ts`.
4. Check the route: `npm run build` (validates every file). Add a walk test in `src/route/` named after the rule it covers.
5. A revise or `onFail` target must be an earlier step or the next one, and a code or model target needs `repeat` >= 2.
