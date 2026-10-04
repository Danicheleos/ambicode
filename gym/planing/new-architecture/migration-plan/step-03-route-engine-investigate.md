# Step 3 — Route engine with the investigate route only; hooks; the point of no return

> **Dispatcher block (fill in before hand-off; the agent stops if empty)**
> - Branch: `__________`
> - Commit policy: `__________`
> - Spend authorization: probes P2/P48 (≤ $1 together): `__________`; `evals:walk` (≈ $1.2): `__________`; `evals:decide` (≈ $14): `__________`
> - Decision 0-V outcome from step 0 (how `evals:gate` accepts the cached baseline): `__________`
> - Probe P37 result from step 0: `fired+expanded` | `fired, not expanded` | `neither` — `__________`

## Why this step exists

This is the plugin's own harness (02 §1–§3): code performs every fixed step, hands the model one
step's text at a time, gives every gate a release and a non-acting default taken only on record,
folds position from the ledger with bounded re-entry, and records all of it. It ships with **one
route, investigate**, and is then measured against the cached baseline (33 §1–2). The result is
**decision A, the point of no return** (41 step 3): the user decides whether the engine proceeds.
Nothing is built on the engine before that. Design: [../v5/modules/12-route.md](../v5/modules/12-route.md)
whole, [../v5/skills/22-investigate.md](../v5/skills/22-investigate.md),
[../v5/32-artifacts.md](../v5/32-artifacts.md) §3–§4, [../v5/30-harness.md](../v5/30-harness.md),
[../v5/02-overview.md](../v5/02-overview.md) §5, [../v5/33-measurement.md](../v5/33-measurement.md) §1, §2, §7, §8.

## Read first (all of it; this step touches every module)

1. `CLAUDE.md`.
2. Design: `../v5/02-overview.md`; `../v5/modules/12-route.md` (every section; §4 is the fold you
   implement line by line); `../v5/skills/22-investigate.md`; `../v5/32-artifacts.md` §3 (route
   DSL and schema rules), §4 (the complete gate registry), §5 (config deltas), §7 (step payload
   file); `../v5/30-harness.md` §1–§6, §8–§9; `../v5/modules/13-evidence.md` §1 (kinds you write);
   `../v5/modules/14-requirements.md` ("`args.hasRequirement`", §1–§3, §5); `../v5/modules/10-search.md`
   §1, §2, §5, Interfaces, Failure modes; `../v5/modules/11-policy.md` §2; `../v5/modules/15-guard.md`
   §3–§4; `../v5/31-cli.md`; `../v5/33-measurement.md` §1, §2, §7, §8; `../v5/40-open-problems.md`
   P1, P2, P3, P31, P37, P45, P48, P53, P54; `../v5/01-goals-and-constraints.md` §1 (the investigate
   bar), D2, D7, D9, D10, D14–D17, D19, R1–R5, R7, R12–R16.
3. Code: `src/hook/run-hook.ts`, `src/hook/prepare-on-skill.ts` (what the hook does today — you
   replace it), `src/hook/markers.ts` (session state), `src/contracts/hook.ts`
   (`ADDITIONAL_CONTEXT_EVENTS`), `hooks/hooks.json`, `src/cli/commands/prepare.ts`
   (`runPrepare`: the compact projection you keep), `src/contracts/prepare.ts`,
   `src/requirements/normalize.ts` (envelope schema and `normalizeRequirements`),
   `src/code-intelligence/locate.ts` (`locate`, `termsFromRequirements`, `shortlistRules`),
   `src/code-intelligence/dependents.ts:25-40` (`DECLARATIONS`, `declaredNames`),
   `src/code-intelligence/navigation.ts` (`READING_ORDER`: deleted in this step), `src/git/git.ts:217-229`
   (`grepFiles`), `src/policy/resolve.ts` (`applicablePrepareStages`, `PREPARE_PROMPT_STAGES`),
   `src/task/*` (step 2), `src/hook/guard-core.ts` (step 1), `skills/investigate/SKILL.md` (6.5 KB
   today), `skills/shared/*.md` (deleted in this step), `src/util/skill-content.test.ts` (the tests
   that constrain skill bodies), `package-candidate.mjs` (`validatePlugin`: the packaged tree must
   include `routes/`), `build.mjs`.
4. `gym/planing/investigation/archive/probes-2026-09-30.md` (probe method), `baseline-2026-10-02.md`
   §Example 1 and §Localize correction (what the +4.7 turns were spent on).

## Order of work

Probes first (§1), then the engine without hooks (§2–§4, all unit-testable), then hooks (§5), then
the modules the investigate route calls (§6–§8), then the route itself and the skill body (§9–§10),
then fixtures and byte ceilings (§11), then the measurement (§12). Commit per section.

### 1. Probes P2 and P48 (≤ $1, needs go)

Design: 12 §3.4, P2, P48; 30 §1 row `PostToolUse(AskUserQuestion)`. Build a throwaway plugin in the
scratchpad whose `PostToolUse` hook with matcher `AskUserQuestion` writes its whole stdin JSON to a
file and returns `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"PROBE-P48 next step text"}}`.
Run one `claude -p` session that is told to ask one question through `AskUserQuestion` with the text
`Pick one [ambicode gate probe]` and answer it (headless `AskUserQuestion` may auto-answer or fail —
record what happens). Record:
- **P2**: which fields the hook input carries — is the question text present (`tool_input.questions[*].question`
  or similar) and is the chosen option present (`tool_response.…`)? Quote the key paths, not the content.
- **P48**: does the model's next turn see `PROBE-P48 next step text`?
Outcomes: P2 holds → marker binding as designed (§5.3). P2 fails → the fallback in 12 P2: the gate
text ends with "then run `$A route next --answer <gate>=<option>`" and acting options need headless
or a human-visible re-confirmation in the next gate print; build that fallback. P48 holds → the
hook returns the next step; fails → the gate text ends with "then run `$A route next`" (+1 ceremony
turn per gate; 22's table says so). Build only the branch the probe supports; state which in the
report. If spend is not authorized: build **both** branches behind a constant `GATE_HOOK_RETURNS_STEP`
and `GATE_HOOK_BINDS_ANSWER` defaulting to the fallbacks, and report the probes as pending.

### 2. Route definitions: `routes/*.yaml`, loader, schema (32 §3)

- `src/route/routes.ts`: zod schema for a route file exactly per 12 §1 fields and 32 §3 "Schema
  rules": `when` from the fixed vocabulary (`args.hasRequirement`, `!args.hasRequirement`,
  `map.empty`, `plan.isDraft`, `headless`, `interactive`, `index.present`, `gate.<id>.answered`,
  `gate.<id>.is(<option>)`); `gate` only on `human` steps, with `release` and a **non-acting**
  `default` (acting options are those listed in 12 §3.4; the route file marks an option acting with
  `acting: [..]` on the gate, and the schema refuses a default that is in that list — the design
  says "default must be a non-acting option" and does not say how the engine knows; this is the
  implementation's reading, report it); `onAnswer` keys are option names or `"*"`; `onAnswer`/`onFail`
  targets per the #103 rule (earlier step, the firing step itself as `$raisedBy`, or the consumer of
  a tail-evaluated `onFail`; later than the next step → refused at build); `maxRevises ≥ 1` default
  3; `revisable` lists step ids; `instruction` ≤ 1,500 chars after `file:` inclusion; `produces`
  are known kinds (13 §1) optionally `kind{value}` on a field that kind lists (#105); `repeat ≥ 1`;
  `budget.modelSteps` present; `exits` as listed. Nothing in a route names a language (R16): a test
  greps route files and step texts for `typescript|python|\.ts\b|\.py\b` and fails on a hit.
- Loader: reads `routes/<skill>.yaml` and `routes/gates.yaml` from the plugin root at runtime; a
  **build-time test** validates every file under `routes/` (this is the "zod-validated at build").
- `routes/investigate.yaml` per 22's table (steps: `template` (when `args.hasRequirement`), `fetch`
  (model, when `args.hasRequirement`), `ground` (code, `produces: [envelope, map, policy{before-work}]`,
  `repeat: 2`), `scope` (human, `when: map.empty`, `onAnswer: {"*": revise ground --term $answer}`,
  default and release *search anyway*), `read` (model, `produces: [search]` is **not** required —
  a later `step` entry completes it, 12 §4), `report-step` (code, `produces: [policy{before-report}]`),
  `write` (model, `produces: [note{investigation}]`); `budget: {modelSteps: 6}`; `revisable: []`).
  `routes/steps/investigate-*.md` hold the model instructions; each ≤ 1,500 chars; the read step's
  text carries 10 §5's reading guidance (five points) and the "`collides` → verify imports" line.
- `routes/gates.yaml`: **the complete registry of 32 §4**, verbatim entries, even though only
  `project-ambiguous`, `requirements-*`, `check-only-unauthorized`, `budget-exhausted` and `decision:*`
  can be reached in this step. The table test (§4) drives all of them.

### 3. Engine: `src/route/engine.ts`, `fold.ts`, `flags.ts` (12 §2–§7)

Implement `Engine` exactly as 12 Interfaces declares:

```ts
interface Engine {
  start(input: {skill; args; task?; headless?; project?; answers?: Answer[]; fresh?: boolean; cwd; session; channel: 'hook'|'cli'}): Promise<StepMessage>;
  advance(input: {task; session; answers?; default?; revise?; conflict?; project?; show?; cause: 'route-next'|CommandName|'gate-hook'}): Promise<StepMessage>;
  status(task, session): Promise<Position>;
  stop(task, session, reason, detail?): Promise<void>;
}
```

- **Start** (12 §2, five numbered points, in order): resolve repo/config (`config-missing` names
  `/ambicode:init`; two projects → raised gate `project-ambiguous`); slug (`mintTaskSlug` exists);
  dedup and resume (**all four bullets of 12 §2.3**: same session + same `hash(args)` → re-print;
  another session + same hash → adopt with `route {resumes}` and the "resumed route … `--fresh`
  restarts" line; same session + different args → `exit {superseded}` then a new route, and
  supersede any other open route of this session; another session + different args → a new route
  beside, never superseding); `preanswer` only when `channel: 'hook'` or `headless` — from
  `channel: 'cli'` interactive, an acting option is recorded `declined {via: flag, reason:
  'acting-needs-human'}` and a non-acting one is kept (12 §2.4, #102); run `code` steps until the
  first unmet `needs` or non-`code` actor, print the first `model` step. `hash(args)` = sha256 of the
  args with flags removed and whitespace normalized; record the function and test it.
- **Fold** (12 §4): transcribe the pseudo-code. Window = entries since the last `revise` whose `from`
  index ≤ this step's index. `done` per actor, with the qualified `(kind, qualifier)` match (#105)
  and the two human-line exceptions (`declined {reason: acting-needs-human}` does not count, #115;
  a `preanswer` for the gate converts to `acceptance {via: prompt}` at the moment the gate is
  reached, outside the window). `when` predicates read the latest answer in the step's window (#98).
  Skipped steps are recorded `step {skipped}` once.
- **Bounds** (12 §4 "Bounds, two kinds", §5 table): automatic revises (`via: code|model`) count
  against `repeat` within the current human cycle and are refused with `limit {repeat, step}`; human
  revises (`via: gate`) start a new cycle (`cycle` increments) and reset the covered steps' counters;
  bounded by `maxRevises`, after which the gate prints "(0 left — restart the route to continue)"
  and choosing it records `declined {reason: max-revises}`. Same-error ×2 → offer `stop:blocked`;
  identical `route next` ×3 → advance with `limit`; unanswered gate ×3 → `default-taken {via:
  never-asked|unanswered}` by `gate.asked` (incremented only by the hook, #54); `budget.modelSteps`
  → raised gate `budget-exhausted`; `wallMinutes` headless only.
- **Advance** (12 §3.2 order): fold; previous model step's `produces` missing → print what is
  missing and the producing command (×2 adds `route stop`, ×3 advances with `limit`); run reachable
  code steps with `onError`/`onFail`; human step → §3.4 semantics; print the next model step or the
  report step. **Every evidence-writing command calls `advance({cause: <name>})` after its own
  ledger write** (12 Interfaces) — in this step: `route next`, `requirements normalize`, `note save`.
- **Flags** (12 §3.3, one vocabulary): `--answer <gate>=<option>` (records per the table incl. the
  `route start` cases), `--default <gate>` (headless or `gate.asked ≥ 1`, else refused "ask first"),
  `--revise <stepId>` (only `revisable`; `via: model`; counts against `repeat`), `--conflict "<s>"
  --sources A,B` (raises `requirements-conflicting`). Acting options honoured per 12 §3.4: `via:
  hook`, `via: prompt`, and `via: flag` only in a headless route; a model-typed acting flag
  interactively → `declined {acting-needs-human}` and the gate re-prints.
- **Step message** (12 §6): three fixed first lines (route/step id; what to do now; the command that
  ends the step); payload ≤ the module caps; inline when ≤ 9,800 chars through the hook and ≤ 8,000
  design cap on CLI; larger → `steps/<id>.md` with the 300-char preview "Read it whole; N bytes"
  (32 §7 header format).
- **Status** (`route status`): the fold as a table with revises, remaining repeats, sessions
  involved (P54), and each `map`'s layers (D9). **Stop** (`route stop`): appends `exit`.
- **Session state** (30 §2): the engine writes `<hook-state>/active-route` = `{task, skill}` on start
  and removes it on `exit`/completion; the guard (step 1) reads it. Readers fall back to scanning
  `.ambicode/task/*` for the latest open route of this session (P31); measure the scan over 50
  synthetic task dirs and report (P31's threshold: delete the pointer if < 20 ms — report, do not
  decide).

### 4. Gate registry and the table test (12 §3.5, 15 §4, 33 §8)

`src/route/gates.ts` loads `routes/gates.yaml`; a raised gate is appended `gate {id, class:
'raised', raisedBy}` when printed; `$raisedBy` in `onAnswer` resolves to that step. Model-raised
`decision:*` gates: the hook appends `gate {class: 'decision'}` and the answer together; the
registry fixes default *keep open* and release. `policy: {<skill>: stop}` lets one skill override
(`requirements-server-disconnected: {review: stop}`).

**The table test** (`src/route/gates.test.ts`): enumerates every declared gate in every route file
and every registry entry and drives each through: accept; release; `--answer`; `--default`
(refused interactively before asked, accepted after `asked ≥ 1` and in headless); headless default
(`default-taken {via: headless}`); three advances with `asked = 0` → `never-asked`; a late answer
superseding a default (P3); every `onAnswer: revise` to its `maxRevises` (then `declined
{max-revises}`); every `onFail: revise` to its `repeat` (then `limit`); asserts every default is
non-acting and present (#80), every gate has a release. For investigate the fixtures of 33 §8 that
apply: `scope` gate free-text revise of `ground` with `--term`; a `preanswer` consumed only when its
gate is reached and surviving an earlier revise (#78); model `--revise` cannot consume a human
allowance. (The plan/task fixtures of 33 §8 come with their routes in steps 6–7; the test is
written so adding a route file adds its cases.)

### 5. Hooks (30 §1 matrix; 15 §3)

Rewrite `hooks/hooks.json` to the matrix:
- `SessionStart` (`startup|resume|clear|fork`), `PostCompact`, `SessionEnd` → `$A hook` (as today).
- `UserPromptSubmit` → `$A hook`: re-inject the contract after compaction (as today); a prompt
  matching `^/ambicode:(\w+)` → `Engine.start({channel: 'hook', …})` with the text after the command
  as args; **mid-route after an epoch change** → re-inject the current step from the fold (30 §5).
  The start work runs synchronously here (12 §2.5); measure it (33 §7, target ≤ 3 s on the three
  repos; report the number).
- `PostToolUse` `mcp__.*` → `$A hook`: exits at once when no route is active (< 90 ms, P53); with a
  route: binding rule (14 §1) inside the hook, bound server → capture (14 §3 steps 1–3) and append
  `requirement`; **nothing else** (no map, no step message). The `ticket-prepare` dedup marker and
  `prepareForTicket` go.
- `PostToolUse` `AskUserQuestion` → `$A hook`: find `[ambicode gate <id>]` in the question; append
  `gate.asked`, the answer `{via: hook}`, apply `onAnswer`; return the next step as
  `additionalContext` if P48 held, else nothing (§1).
- `Stop` → `$A hook`: 15 §3 — checks **only** on (a) an `exit` since the last stop, (b) a last
  assistant message starting with the report header, (c) a `note` appended since the last stop (then
  the note **file** is checked). Mechanical checks only: every `path:line` exists and `line ≤
  lines(file)`; generated sections unchanged (hash comment, else normalized diff); "accepted"/"approved"
  needs an `acceptance`; "tests pass" needs `check {green, ran ≥ 1}`; red before green for a defect
  brief. Block once with the list and `limit {stop-block}`; second failing stop → allow; transcript
  unreadable → allow + `limit {stop-unreadable}` (P9). Main thread only (`agent_id` absent). If the
  Stop output cannot carry the list → `stop-check.md` and the reason names it (P17 is probed in
  step 7; here, write the list into both and let the test assert the file).
- `PreToolUse` entries as step 1 left them.
- **Removed**: `PostToolUse(Skill)` (dead under D2) and `PostToolUse(Edit|Write)` (inert until a pack
  sets `remindOnEdit`, G18; 41 "Deleted"). The `edit-reminder` code path in `run-hook.ts` and
  `authoring.editReminders` config stay in code but are not registered; say so in `docs/compatibility.md`.
- `src/contracts/hook.ts`: `ADDITIONAL_CONTEXT_EVENTS` already allows `PostToolUse`, `SessionStart`,
  `UserPromptSubmit`; `Stop` output is a different shape (`decision: 'block', reason`) — add its type.
- `docs/compatibility.md` hook section updated to the new matrix; the release checklist's "five
  hooks" line changes to the new count.

### 6. Requirements, the part investigate needs (14; the rest is step 4)

- `src/requirements/has-requirement.ts`: the predicate exactly as 14 "`args.hasRequirement`":
  interactive → URL or `--requirement`, or a bare key only when `requirements.mcpServer` is set;
  **headless → only `--requirement <url>`** (D17). Tests include the `NOM-36`-in-prose false positive
  (now false) and the FE-config-with-`mcpServer`-in-headless case (false).
- `requirements template --requirement <url>… --task <slug>`: binding and match rule (14 §1), the
  fetch calls **with field lists** and the expansion rule including "if the JQL returned more than 10
  hits, stop here and run `route next`" (14 §2), ~1.2 KB; replaces `skills/shared/requirements-mcp.md`.
- `capture(hookInput, task)` (14 §3): tool classes `get*|search*|fetch*|read*`, document extraction
  with the existing `NOT_THE_TICKET` stripping (move it out of `prepare-on-skill.ts`), `search*`
  reduced to key + summary **on disk**, `requirements/<key>.json` per 32 §6, `requirement` entry with
  `rawHash`. Fixtures: the two server response shapes seen in the captured sessions (P8) — build
  them **synthetically** with the same key structure; never copy a real payload.
- `requirements normalize --task <slug>` ⤵: envelope from captures (`builtFrom: captures`, with the
  `derivedFrom` chain and `requirements-derived-orphan`) or from the args text (`builtFrom: args`, one
  source `{key: 'ARGS', title: first line, content: rest}`); `requirements-not-captured` on the first
  advance without captures when `hasRequirement`, the raised gate `requirements-not-captured-twice` on
  the second. Reuse the zod schema in `normalize.ts`; add `relation`/`derivedFrom`.
- `requirements acs --task <slug>` (14 §4): the splitter as written; `AC-<key>-<nn>`; it is a signal
  (P23) — ground calls it; nothing gates on it in this step.
- The gates `requirements-server-disconnected|ambiguous|expansion-capped|conflicting|not-captured-twice`
  are raised from code paths that exist after this section; `requirements-expansion-capped` is
  raised by ground **before** any child read when the model's early `route next` arrives (14 §2, #81).

### 7. Search, the part investigate needs (10; the rest is step 5)

- `grepWords(term, pathspec)` in `src/git/git.ts` beside `grepFiles`: `git grep --untracked -I -l -z
  -w -F -e <term>`; test both.
- `src/code-intelligence/harvest.ts`: the `DECLARATIONS` patterns of `dependents.ts:25-33` run
  **globally** over a file (today `declaredNames` takes the first match per pattern), returning
  `{name, kind, path, line}` per declaration; **declaration counts per name** across the harvested
  files (`collides: count > 1`); the TypeScript `export` filter and any other ecosystem-specific
  filter live in an **adapter table keyed by `ecosystem`** (R16), not in `harvest.ts`'s logic.
- `src/code-intelligence/map.ts`: `Search.map({mode: 'prompt'|'context', layers?, terms, paths,
  symbols})` runs the configured layer list in order (`search.layers.<mode>` from config, 32 §5;
  `init` writes it in step 9 — until then `DEFAULTS` supply `prompt: [shortlist, harvest, shortlist]`,
  `context: [grep, harvest]` and `map` prints that the list came from defaults); refuses an unknown
  layer name (`search-layer-unknown`); `layers` override accepted **only from a route step in-process**
  — the CLI has **no** `--layers` flag (D15, #112; a typed one is `search-layers-not-for-model`);
  records `map {terms by pass, layers: [{name, ms, hits}], candidates, collisions, index: 'none', bytes}`;
  prints the layer list on its first line; output ≤ 6 KB, candidates cut from the bottom with a
  count. Layers in this step: `shortlist` (= `locate`), `harvest`, `grep` (= `grepWords`),
  `history` (inside shortlist as today). `index.*` layers are refused with `index: none` until step 5
  ships the adapter (`map` runs the list minus `index.*` and says so, 10 Failure modes).
- Term extraction (10 §2): `termsFromRequirements` re-ranked — identifiers first, quoted UI strings
  mapped through i18n keys **when the ecosystem adapter names an i18n location**, prose last and only
  when fewer than 3 identifiers; hyphenated compounds split (M5); per-term hit counts; breadth guard
  (> 60% of files → dropped, listed under limitations).
- `refs <name>…` (`grepWords`, collisions flagged from the harvest) and `find <name> [--kind]`
  (harvest) as CLI commands, each ≤ 4 KB with `--show`; both append `search {command, names, files, ms}`.
- Reading guidance (10 §5) is text in the read step; `READING_ORDER` and `navigation.ts` are deleted.

### 8. Policy stage (11 §2)

`policy.stage(req & {stage})` projection over the existing resolver: `before-work` (architecture,
correctness, security, workflow rules for the mapped paths, plus code-style when ≤ 8 such rules,
P15; ≤ 4 KB, rest behind `$A policy --stage before-work --show`), `before-report` (presentation
rules, ≤ 1.5 KB). Rules render as text `pack/rule (authority): instruction`. Ledger `policy {stage,
packs, rules, omitted}` per delivery. `$A policy … --stage <s> [--show]` gains the flag. Resolver
unchanged.

### 9. CLI surface for this step (31)

Register in `SPECS` and `USAGE`: `route start|next|status|stop`, `map`, `refs`, `find`,
`requirements template|normalize|acs`, `policy --stage`, `report` (step 2). Flags exactly as 31's
table rows for these commands. Every command `--json`; errors `AmbicodeError{code}` with the release;
every new code in `skills/review/references/outcomes.md`. **`prepare`** becomes an alias that prints
one deprecation line and runs `route start` (41: one release). Evidence-writing commands (⤵) print
their ledger id and then the next step (31 Conventions).

### 10. The investigate route in use; skill body (22; 02 §5)

- `skills/investigate/SKILL.md` ≤ **2 KB** (22 "What the model loads"): what an investigation is, the
  judgment asked (≥ 2 hypotheses; confirm or reject each candidate; facts apart from assumptions),
  the read-only boundary with its reason, and the fallback line
  `if no step message appeared, run $A route start investigate "$ARGUMENTS"`. `disable-model-invocation:
  true` (D2). `allowed-tools: Read, Grep, Glob, Bash(node *ambicode.mjs*)` unchanged. No step list,
  no `prepare`, no `ToolSearch`, no LSP words. The `description` drops the "Use when…" model-trigger
  sentence (D2; `evals/evals-triggers` cases are kept as negatives, 41 "Deleted").
- Delete `skills/shared/prepare-output.md` and `skills/shared/requirements-mcp.md` (41 "Deleted");
  `src/util/skill-content.test.ts` tests that assert their content are rewritten to assert the new
  shape (bodies ≤ 2 KB for investigate; others unchanged until their steps).
- The ceremony table of 22 is a test over a **synthetic** route walk: no-requirement path = 2
  ceremony turns (`route next` ×1 + `note save`), with-requirement = 3; +1 expansion gate; the test
  drives the engine with a fake model and counts the commands the model had to run.
- `02 §5`'s one-run table is the integration fixture: a materialized fixture repo
  (`ts-feature-boundary`), a synthetic ticket in the args, `route start investigate "<text>"` →
  ground → read step printed; `route next` → report step; `note save --kind investigation` → route
  complete; `route status` shows the fold with the map's layers. Show the ledger in the report.

### 11. Byte ceilings and fixtures (30 §3, 33 §7, §8)

- Tests: every `routes/steps/*.md` ≤ 1,500 chars; investigate body ≤ 2,048 bytes; start message ≤ 4
  KB; ground payload ≤ 8 KB inline else file; report step ≤ 2 KB; `map` ≤ 6 KB; `refs`/`find` ≤ 4
  KB; `report` ≤ 3 KB. Assert on the **built** CLI's output where a command is involved.
- Hook timings over 20 spawns (33 §7): guard ≤ 50 ms, `$A hook` ≤ 120 ms, MCP hook no-route exit ≤
  90 ms; `route start` synchronous work on the three repos (this repo and the two NDA snapshots,
  locally) ≤ 3 s. Report all numbers; a miss is a finding, not a reason to relax the test.
- Guard fixtures (step 1) and Stop fixtures (33 §8): block on a bad citation in a report-shaped stop;
  allow on a conversational stop; allow on the second failing stop; check the note file for note routes.

### 12. Measurement and decision A (33 §1–2; needs go for each run)

1. `npm run verify` green; `npm run build`; `npm run evals:select`.
2. **Walk** (≈ $1.2): `npm run evals:walk` with `--prompt with` (step 0) — one case per kind per side,
   plugin arm. Read every run's first deviation in `walk-<ts>.md` (`evals-core/README.md` tier 1).
   Report: did the route start (hook or fallback line, per P37), did `ground` run with pass 2
   (`map-pass2` from the ledger copy-out), ceremony turns vs the budget of 22, cost. Fix mechanics
   defects found here before spending on decide; each fix ships with its test.
3. **Decide** (≈ $14): `npm run evals:decide` with `--prompt with`; then
   `npm run evals:gate -- <result>.json --baseline evals/evals-core/results/eval-2026-10-02T11-51-10-906Z.json`
   plus whatever decision 0-V requires. The gate's `maxCostRatio` is 1.1 in `eval-gate.mjs:13` and the
   design's bar is **1.15x** (D7, 01 §1): pass `--max-cost-ratio 1.15` and say so; do not edit the
   constant without recording it. Turns are **reported**, not gated (D10): pass `--max-extra-turns`
   large enough not to fail and print the measured turns beside the budget.
4. **Decision A**: recall(with) within the band of recall(without) **and** cost ≤ 1.15x → report
   "criterion met" with the numbers. Otherwise report both arms' numbers, the loser's detail, the
   per-route ceremony count, and the options 33 §2 names (pass 2 only; text guidance without a map)
   with their cost. **The user decides** whether the engine proceeds, is cut down, or is abandoned
   (41 step 3). Do not start step 4 until the user has answered.

## Do not

- Do not build plan, task, review, rules or init routes; do not change their skill bodies beyond
  what the deleted shared files force (a reference to a deleted file is replaced by the equivalent
  inline sentence, nothing more).
- Do not implement the index adapter, `relates`, `index build` (step 5), `check`, `format`,
  `review --task/--estimate` (step 7–8), `plan check`, `note promote`'s route tail (step 6),
  `rules *`, `init --apply` (step 9), workers (none ship).
- Do not add a `--layers` CLI flag (D15). Do not let the model choose layers.
- Do not write source files or anything outside `.ambicode/` from a hook or a code step (30 §9).
- Do not take a default without a record; do not honour an acting option from `via: flag`
  interactively; do not let a `preanswer` be written from a `channel: cli` interactive start.
- Do not alter `eval-gate.mjs` thresholds in code; pass flags and record them.
- Do not run `evals:baseline` (D19).
- Do not mention LSP anywhere in a route, step text or skill body (D8).

## Done when

§2–§11 are built with their tests and `verify` is green; the integration fixture of §10 is shown; the
hook timings and `route start` time are reported; walk and decide have run (or are "not run, awaiting
go") and decision A is presented in the report with both arms' numbers, exactly as 33 §1–2 and 41
step 3 describe. The report names which probe branches (P2, P48) were built.
