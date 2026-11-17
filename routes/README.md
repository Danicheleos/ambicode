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
  run: [requirements.normalize, search.map]
  produces: [envelope, map]
  repeat: 2
```

Unknown fields are rejected. Step ids are unique inside a route.

| Field | Values | Meaning and when to use |
|---|---|---|
| `id` | string | Name used in the ledger, in `when` and revise targets. |
| `actor` | `code`, `model`, `human` | `code`: runs handlers, no model turn. `model`: the model gets instruction text and must do the work. `human`: asks the user through a gate. |
| `run` | handler call or list | **Code steps only** (required there). Handlers run in order, as `name` or `name(param, param)`. Allowed names are listed below. |
| `instruction` | inline text or `file:<path>` | **Model steps only** (required there). Put long text in `routes/<skill>/<step>.md` and reference it. The placeholders `{cli}` (command prefix), `{task}` (task slug) and `{steps}` (the task's absolute `steps/` directory: the task lives under the repository root, which the session's directory need not be) and `{plan}` (the absolute path of the task's `plan.md`) are filled in; so are `{request}` (the request as typed, or the pointer to the envelope when a captured ticket carries it), `{repo}` (the shell-quoted checkout root, for a command line) and `{root}` (the same path unquoted, for a tool's `path` argument). |
| `work` | inline text or `file:<path>` | **Model steps.** Delegates the step to a subagent (`ambicode:implementer`; the review step's `ambicode:reviewer`; the plan route's `ambicode:plan-critic`): this text, the revise args, the request where the work text places `{request}` (as typed, line breaks kept; the pointer to the envelope when it carries the captured ticket) and every `payload` section are written whole and in order to `.ambicode/tasks/<task>/steps/work-<step>.md`; over 32 KiB (one Read) the file is written as parts `work-<step>-2.md`, `-3.md`, … of at most 32 KiB each, a section larger than a part is split on line boundaries (a single line longer than a part is cut at the part's size), part 1 lists the parts and says to read every part in order before the first action, the launch names every part, and a rerun removes stale parts. `instruction` only launches the subagent on `{work}`. While the step is open a `check` is recorded without advancing the route and prints no route text, so the model runs `route next` when the subagent returns. A step whose `produces` is still missing then reads `Not done yet`, three times at most, and is released as a gap. |
| `payload` | list of keys | **Model steps.** Outputs of earlier handlers appended to the instruction under `## <key>`. Empty outputs are left out and leave no file; the others are saved as `.ambicode/tasks/<task>/steps/<route id>-<key>.md` (`:` in a key becomes `-`). A key written `file:<key>` delivers only a pointer line to that saved file (its size included) instead of the text; the step reads the file with its first reads. `{policy}` in a step's `.md` is replaced by the path of the `policy:before-work` file. Keys below. |
| `produces` | list of `kind` or `kind{value}` | Records the step must leave in the ledger. A code step that does not write them fails with `route-produces-missing`. A model step stays open ("Not done yet") until they exist. |
| `when` | condition | Run the step only if true; otherwise it is recorded as skipped. Conditions below. |
| `gate` | gate object | **Human steps only** (required there). See Gates. |
| `onFail` | `revise <step> [--name value]` or `record` | Code step that finishes but reports a failed result. `revise`: return to that step instead of stopping; the target must be a step of this route. `record`: keep the failure on the ledger as a Not verified line and continue, with no return; use it for a check whose first result must stay visible. |
| `onError` | `stop:<exit>` | What an error in the step does. Default: the route stays open and the error is shown with the retry (`route next`) and stop (`route stop`) commands. `stop:` ends the route with that exit. |
| `repeat` | integer >= 1 | How many times the step may run (revises included). Default 1; there is no table by id, so every revised step states its own. A human step is not bounded by it: a user's Revise through a gate has no limit. |

Delivery has no size limit. The CLI (`route next`, `check`, `note save`, `requirements normalize`) prints the whole step text; Claude Code saves a Bash output over 30,000 characters to a file itself. A hook (the route's start by `/ambicode:<skill>`, a gate answer, a re-injection, and the Stop block that follows a saved answer whose check failed) writes the whole text, header and body, to `.ambicode/tasks/<task>/steps/step-<step>.md` and answers with one line, `Read <file> whole now: it is this step (<N> bytes).`, with no preview.

### Handlers (`run`)

| Handler | Produces payload key | What it does |
|---|---|---|
| `requirements.normalize` | `envelope` | Builds the requirement envelope from the task's captures (or from the request text) and records it. Renders every captured source whole as readable text (a Jira capture drops edit history, work logs, watcher and vote counts and account metadata). Gaps lead the text: an asked key that was not captured is listed as `Not captured`, and a bare key with no requirements server configured as `looks like a ticket key; no requirements server is configured, so it was not fetched`. The text is the step's saved `envelope` payload, the one copy; a step delivers it with `payload: ["file:envelope"]`, and the gap lines follow the pointer in the message. A ticket asked by URL in one route and by key in another is one source: it is not fetched again. A request that names no key, URL or `--requirement` is saved as typed (line breaks kept) as the source `request`, once per task and not for review, so a pasted ticket is delivered like a fetched one. The task route's `change` and `fix` steps deliver the envelope inline (`payload: [envelope]`); the other steps point at it, except in a route other than task (plan, investigate) that has just saved the typed request and has nothing else to report: it gets no envelope, since the typed request is already the skill argument. Line breaks are saved as LF, and a start that only continues the task (empty text, so the text is the task's name) saves nothing. |
| `search.map[(review)]` | `map`, or `map:review` for `search.map(review)` | Builds the search map for the request. The parameter `review` seeds it from the pinned review's changed files and added lines instead (the checkout of a merge request head when there is one; changed files are never listed): the reviewer brief inlines its files as the Related section. The task route seeds it from the iteration brief, else from the investigation; the plan route seeds it from the investigation; the review route seeds it from the review only; the investigate route seeds it from nothing. The investigation is the one the request names by path, else the task's latest saved one, and adds an `Investigation: <path>` line. A map with no rows ends with a line saying it found no files and the model searches the repository itself; the ledger entry's `limitations` records it. The plan draft and the task change step deliver that line; investigate stops at its `scope` gate first (its read step runs only after a non-empty map), and the review brief reads only the JSON line, so the reviewer does not see it. |
| `policy.stage(before-work[, <activity>])` | `policy:before-work`, or `policy:before-work:<activity>` when an activity is given | The resolved pack rules for the route's activity and the files it knows (the touched files, or the pinned review's files for the review brief; before any file is touched no path scopes the stage) as `pack/rule: instruction` grouped under `Rules (team|observed|inherited):` headers, every rule whole with no byte cap (the plan route, and the task route before any edit, take every pack of the activity, since no file is known yet); a second param names the activity when it differs from the route's (the task route's reviewer brief passes `review`). The task route with no plan also takes the `plan` rules, each rule once. The activity is part of the payload key, so the reviewer brief's rules never replace the task rules that `change` and `fix` read. |
| `policy.enabled` | `policy.enabled` | Every rule in force for the project (id and the whole instruction), so a rules draft does not restate one word for word. |
| `context.list` | `context.list(docs)` | The tracked documentation files (path, bytes) outside `.ambicode/`; none when there are none. Named because no map row reaches a file that shares no word with the request. Only the plan route uses it; the notes listing it once carried is gone with the notes. |
| `plan.critic` | none | Reads the plan critic's `critic-answer.json` from the task's `steps/` folder (then removes it) and records a `plan-critic` worker entry: its defects and its `claims` rows (one per claim of the `script:plan-check` list; a `wrong` row becomes a `claim-wrong` defect at the claim's `plan.md:L`), or why there is no valid answer. Each defect and each `not-checked` row is a Not verified line, and so is `no iteration in the plan` when the plan has no `## Iteration` heading (the summary holds `iterations`; the plan is not rejected), also in the report of a task run on that plan (the newest `plan-critic` entry of the plan route that noted the plan the task used; none when `--plan` names another file); an interactive session also prints them with the `plan-accept` question. The route runs the `critic` and `critic-record` steps on the first draft only (`when: unrevised`): a draft revised by the critic's send-back or a human Revise goes through `plan-check` straight to the gate. Fails the step (`onFail: revise draft`, code `plan-critic-defects`) with any defect (headless too), with the defects as the `Critic defects` revise arg: a defect of any kind sends the first draft back once. After a revise to draft the gate print and the report prefix the critic's lines with `revision not re-checked`, and give the one line `plan critic: revision not re-checked` when it has none. |
| `evidence.plan.accept` | none | Mark the task's plan.md `status: accepted` as it is now and record its hash (after the user's Accept). |
| `script(<name>)` | `script:<name>` | Runs `skills/<skill>/scripts/<name>.mjs`; see Scripts. |
| `review.evaluate` | `review.evaluate` | Judges the latest review: no findings proceeds; any finding goes back to `fix`, which fixes a finding outside the brief that the change breaks or blocks (listed under `### Cross Boundary`) and leaves one the change does not touch under Gaps. Fails the step (`onFail`) when there are findings to fix. |
| `review.page` | `review.page` | Starts the repository's local review page server as a detached process, or registers with the one already running, and delivers a login link (24 h); none for a local review with no finding. |
| `check` limit | none | A step window allows 5 runs per phase. The task route's `change` step, when no iteration is named, allows 2 per covered iteration (`start.iteration` through `start.through`), since one window spans them all. |
| `task.verdict` | none | Ends the route `blocked` when its last check is red (named first) or its independent review failed (the reviewer ran and its answer could not be verified), so the iteration is not done and the next start redoes it. It also appends a `test-removal` worker entry (before `evidence.report`, so the same report lists it): per changed test file, the test-case declarations removed against the baseline tree and not re-added in any changed test file. The report lists each as `test cases removed and not re-added: <path> (<n>)` under Not verified, or `test cases removed: not checked (<reason>)` when the diff failed. The entry also holds `filesChanged`, the files touched since the baseline, listed as `no file changed` when 0, or `filesUnknown` (no baseline, HEAD moved, git failed), listed as `files changed: unknown (<reason>)`. The newest entry stands and it never changes the verdict. |
| `task.start` | `brief` | The task's brief: iteration and plan path, then the plan's current iteration or the request. With no iteration named the brief holds every iteration not done, in order, through the last (the entry records `iteration` and `through`). Exits `iterations-complete` when every iteration is done. A plan that is not `status: accepted` (a `plan.md` whose frontmatter says `status: draft` or has no `status:` line, or none at all; or one accepted and since redrafted) raises the `plan-unaccepted` gate once: `run on the draft` (acting: a human's answer, or the default in headless) runs it as it is, the file stays `status: draft`, and the report lists "plan run without being accepted"; the next start asks again; a flag answer is declined `acting-needs-human`; `stop` ends the route `blocked`. A plan named with `--plan` is run as it is, unasked. The brief carries nothing of the plan critic; its lines are in the report. |
| `evidence.report` | `report` | The Checks, Review and Not verified facts of the route, for its final message to copy. A gate answered by a preset `--answer` at start is a Not verified line (`<gate>: answered "<option>" by a preset answer from the start args, not by a human at the question`); a gate whose answer already has a line (a declined check question, a skipped re-review or checks offer, a run on a draft plan) carries `(preset answer from the start args)` on that line instead. A task's report includes the latest bound `plan-accept` answer of the plan stage it consumed. |
| `checks.runnable` | `checks.runnable` | Per project, the checks `check` will run: those with a command and the forms they take (all or `--file`), minus any a pack forbids; per form, `runs freely` or `needs approval` (the all form always, the `--file` form on a `propose`). |
| `checks.baseline` | `baseline` | Records HEAD and the files already changed, once per route; a task route that follows one that ended `interrupted` or `blocked` reuses that route's baseline, so the work it left stays in review. |
| `checks.scope` | none | The end checks of a task: every runnable key by the files the task changed (a key with a file form on those files, a key without one in its all form, once). A key with a file form runs unasked; a key without one runs only after `checks-offer` was answered `run`; a `propose` key raises `check-only-unauthorized` and nothing runs before its answer (a headless run takes the decline default and the report lists it). The route's own start is never the consent. Red goes back to `fix` on its own once with the output and re-runs only the red keys; a later round raises `checks-again`, whose default `report the gap` keeps the red key in Not verified. |
| `checks.approved` | none | Runs each check the user approved that has no check entry after the approval, so an answer given after the model moved on still gets its run. |
| `checks.format` | none | Runs the formatter (the format key's file form, which rewrites the file) on the touched files; one that needs approval raises the check gate and the answer re-runs the step. |
| `review.mrFetch` | `review.mrFetch` | `--mr` review: saves the diff, the human discussions and the head sha; lists the requirements the title and description name, which the `fetch` step then fetches and `requirements.normalize` reports as not verified when they are missing. |
| `review.estimate` | `review.estimate` | Sizes the review (files, lines, refusal) for the estimate gate, with any `--narrow` in force. |
| `review.pin` | none | Pins the change as a pending `review` entry. The review route first runs each configured check that has a file form on the changed files, as `check` entries; a check that needs approval raises the check gate and the answer revises the step. |

`produces` takes any ledger kind, with an optional qualifier: `note{investigation}`, `policy{before-work}`, `check{green}`, `review{recorded}`, `envelope`, `map`, ... The qualifier is matched against the record, not checked at load.

Evidence-writing commands write their ledger entry and then advance the route at their tail: `check`, `review` (writes `review{pending}`), `note save`, `requirements normalize`. `check` and the implementer's closing-report `note save --kind report`, run by a delegated step's subagent, record without advancing; the main model runs `route next` when the subagent returns, background or not. The `review.record` handler then reads the reviewer's `answer.json` and writes `review{recorded}`; no file records a failed review.

A `check` run writes its whole output (stdout, then stderr) to `.ambicode/tasks/<task>/checks/<key>_<n>.log`, one file per run, kept after the route ends. Its ledger entry carries `exit`, `output` (the repository-relative path) and `bytes`, no output text; the CLI line, the reviewer brief, the `Failing checks` of the fix step and the report's Not verified line name the path and the model reads the file itself.

### Scripts (`script(<name>)`)

Every route exit (done, blocked, interrupted by a new start, stopped) removes the task's `steps/` and rewrites `.ambicode/tasks/<task>/summary.md` from the ledger (request, plan with the decisions taken, one row per iteration with its final status, a link to the saved final message (path and size, no preview), files, checks and review, then Not verified; the Stop hook saves a route's final message as a `result` note once it states every gap). Only `step-complete.md` outlives its exit, and only when a gate answer through the hook ended the route: it holds the closing text that hook's link line names, until the Stop hook of that turn removes it (the Stop removes `steps/` of every route that is no longer live, so a route the Stop itself ends keeps no step file); the plan is `plan.md` in the task folder, not in `steps/`.

A skill-local script is a plain ESM file (`skills/<skill>/scripts/<name>.mjs`, no imports from `src/`, no npm packages) run with `node`. It reads one JSON object on stdin: `{task, skill, repositoryRoot, cwd, taskDir, steps, args, params, revise, raisedBy, headless, testPatterns, autoLoadedPatterns, planFences, bound}` (`params` are the arguments after the name; `steps` is the task's steps directory; `testPatterns` and `autoLoadedPatterns` are the sources of the engine's test-path and Claude-Code-loaded-file regular expressions; `planFences` is the task plan's fenced code ranges `[from, to)` as character offsets; `bound` is the latest bound answer per gate). It prints one JSON object on stdout, every key optional: `payload` (text for the model, saved as `script:<name>`), `record` (fields merged into the step's completion entry), `entries` (ledger entries, each with a `kind`, appended before any `failed`), `failed: {code, message, recoverable?, revise?: {args}}`, `raise: {gate, values}`, `exit` and `exitDetail`. A non-zero exit, a timeout (100 s) or output that is not JSON fails the step with `script-failed` or `script-output-invalid`. A script never writes the ledger itself.

### Conditions (`when`)

| Condition | True when |
|---|---|
| `args.hasRequirement` | The request names a requirement (URL, `--requirement`, or a bare key with an MCP server configured). |
| `args.hasMergeRequest` | The review route was started with `--mr <url>`, or with a merge-request URL as its text. |
| `mr.requirements` | The `mr-fetch` step recorded issue keys or issue/wiki links from the merge request's title or description (so the step must come after `mr-fetch`). |
| `requirements.missing` | The request names a requirement (as `args.hasRequirement`) or the `mr-fetch` step recorded issue keys or links from the merge request, and at least one asked key is not yet captured for the task: by an earlier route (recorded on the route's head as `captured`). This route's own captures do not count, so fetch stays open until `route next` and its linked reads are captured. A ticket is fetched once per task. |
| `estimate.asks` / `estimate.run` | `estimate.asks`: the latest `estimate-step` recorded a refusal or no estimate (`asks: true`). `estimate.run`: the opposite, so the review goes on without a question. |
| `map.empty` | The search map found nothing. |
| `iteration.named` | The request text names `iteration N` and the session is interactive (task route): the checks by file run unasked. It does not hold in a headless session, whose checks questions take their defaults. A headless request with no iteration still runs every iteration, in the one route. |
| `review.unasked` | The session is interactive and the start did not carry `--no-review` (task route only), whether or not an iteration is named: the review runs with no question. A headless session starts no reviewer, and the report lists `The independent review was not run: the run was headless` under Not verified. With `--no-review` the review steps are skipped and no review fix round opens, while the end checks (`scope-checks`, `checks-offer`) still run; the report lists `review skipped (--no-review)` under Not verified. |
| `checks.offer` | The `baseline` step recorded at least one runnable key with no file form (`full`), in any run: only those keys, which run the whole project, are asked about (`checks-offer`; its print names them, and a skip is listed by key in Not verified). A headless run prints it and takes the skip default. |
| `checks.auto` | The end checks of the keys with a file form run without a question (task route): no iteration is named (one route covers every iteration not done), or the session is headless and names one. |
| `revised` | The step is entered by a revise (review findings or an approved key), not in the normal walk. |
| `unrevised` | No revise opened the step's window: the first pass of the chain up to this step (the plan critic runs only on the first draft). |
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
| `options` | list, at least one | The choices, as written. Free text the user types is allowed only if `free: true` or `onAnswer` has `*`; options match case-insensitively and ignore a trailing "(Recommended)". |
| `default` | one of `options` | Taken when nobody answers (headless, timeout). It may be an acting option: a headless route takes it at once and the report lists it as a gap. A route that ends with the gate open takes no default; see Special answers. |
| `acting` | list of options | Options a flag cannot take: they change something that matters. They count only from the user's own answer in the dialog (bound by the hook) or a trusted `--answer` at start, never from a model-typed answer. Use for approve, accept, overwrite. |
| `onAnswer` | `{ <option or *>: "revise <step> [--name value]" }` | `revise`: send the route back to a step after that answer. `*` handles free text. `$answer` is the user's text, `$raisedBy` the step that raised the gate. |
| `free` | boolean, default false | The user's own words are an answer, recorded as typed and read by a later step. `onAnswer: { "*": … }` implies it. |
| `object` | `kind` or `kind{value}` | The record the question is about; its path and hash are printed. An earlier step must `produce` it. |
| `policy` | `{ <skill>: stop }` | For that skill the gate gets a `stop` option and `stop` becomes the default. Used when one route must never continue past it (review). |

An unanswered gate has one rule: `route next` shows the same print again, as it was, and never counts toward a default. Only a headless route takes the `default` at once.

In a headless route the guard turns a permission ask into a deny; the model then finishes with a final message that says `permission-denied: <what>`.

Special answers: `stop` and `pause` end the route. The exit is `human` for the `scope` gate and `blocked` for every other gate. Name the option `pause` when the user can supply what is missing later in the chat; a paused route cannot be resumed, the user starts a new one, and a new start on the task ends its live route as `interrupted`. Every exit (`stop`, `pause`, `interrupted`, any reason) lists the gates it left open, step gates included, as `unanswered: [<gate ids>]` and records no default, because nothing ran on it: summary.md shows each as a gap line. The reply of the start that closed it names the route, its step and those gates; for a route of another task it adds `/ambicode:<skill> --task <slug>` to continue.

Gates are asked with AskUserQuestion; the printed line `[ambicode gate <id> <instance>]` must stay verbatim in the question so the hook can bind the answer.

`gates.yaml` entries have the same fields, keyed by gate id. They are raised by handler code (for example requirement capture). The `decision:*` entry is the template for plan decisions.

## Adding or changing a route

1. Write or edit `routes/<skill>/<skill>.yaml`; the folder and file name equal `skill`.
2. Put model instruction text longer than a few lines in `routes/<skill>/<step>.md`.
3. Every `run` name must be a registered handler; new handlers live in `src/skills/<skill>/handlers.ts`.
4. Check the route: `npm run build` (validates every file). Add a walk test in `src/skills/<skill>/` named after the rule it covers.
5. The validator checks what would break a route at load: unique step ids, registered handlers, an instruction on every model step and a gate on every human step, `when` gate references and revise targets that exist, and a default that is an option (an acting default is allowed: only the user's answer, never a flag, takes the option; headless takes it as the default and the report lists it). Whether a revised step has enough `repeat` is yours to state; a revise past it writes a `limit` entry at run time.
