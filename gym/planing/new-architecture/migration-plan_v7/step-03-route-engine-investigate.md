# Step 03 — Shared engine, hooks and investigate; decision A

> Prerequisites: steps 00, 01 and 02 integrated. Use their APIs and reports; never build
> replacements. Spend: $0 by default. Read [05-working-rules.md](05-working-rules.md) first; it
> governs this brief, the review and the report.
> Normative sources (read the sections, not whole files unless stated):
> [01-contracts](01-contracts.md) in full; [02-scenarios](02-scenarios.md) in full;
> [v6/12](../v6/modules/12-route.md) whole, especially §8; [v6/22](../v6/skills/22-investigate.md);
> [v6/30](../v6/30-harness.md) §1, §2, §4–§7; [v6/31](../v6/31-cli.md); [v6/32](../v6/32-artifacts.md)
> §3–§6; [v6/33](../v6/33-measurement.md) §1, §2, §7, §8; [v6/14](../v6/modules/14-requirements.md)
> (intake, §1–§4); [v6/10](../v6/modules/10-search.md) §1, §2, §4, §5; [v6/11](../v6/modules/11-policy.md)
> §2; [v6/15](../v6/modules/15-guard.md) §3.
> Owner of: the generic engine, fold, context port, consent, ownership coordination and command
> tail; the config reader foundation; the minimal requirements, search and policy handlers that
> investigate uses; the hooks; the gate registry; the investigate route and body. No live
> plan/task/review/init/rules route ships here. Synthetic fixture routes may exercise every actor.

## Goal

Build the one route engine that every skill uses: the six-step advance algorithm behind five entry
points, the fold over a route chain, consent bound to printed gate instances, plan ownership
coordination and the command tail. Ship the first live route, `investigate`, with the hooks,
config, requirements, search and policy pieces it needs. Then prepare decision A, which is run
only with named authorization.

## Starting point

Recheck these at dispatch. Use the actual paths if an integration moved them.

- From step 02 (its Contract is the starting API): `src/task/kinds.ts` (21 kinds, `parseEntry`,
  `ArtifactRef`); `src/task/ledger.ts` (`appendLedger`, lenient `readLedger`, `readLedgerStrict` →
  `absent | ok | unreadable`, `MAX_ENTRY_BYTES`, `WARN_LEDGER_BYTES`); `src/task/ledger-lock.ts`
  (`withLedgerLock(fs, taskDir, now, writer, body)`, `LockedLedger {append, read}`, non-reentrant);
  `src/task/task-dir.ts` (`TaskDir`, `taskDirFor`, `resolveTaskDir`, `resolveFrom`);
  `src/task/notes.ts` (`saveNote`, `promotePlan`, `listNotes`, `NoteDeps {runtime, session,
  context}`); `src/task/report.ts` (`buildReport(entries, {current?})`);
  `src/task/navigation-line.ts`; `src/route/context.ts` (types only: `StartChannel`, `Cause`,
  `RouteView` with `skill`, `RouteContextPort`, `ConsentResult`). Step 02's D2: the CLI passes
  `session: null` and `context: null`. This step replaces that (03-S, 03-T).
- From step 01: hook sources live in `src/hook/{guard,shell,events,session}/` with
  `src/hook/index.ts`. `src/route/ownership.ts`: `ownerOf(entries, slug)` → `owned {session,
  routeId, chainIds, takenOver} | none | unknown {reason}`, `OWNING_SKILLS = {'plan'}`.
  `src/hook/guard/guard-state.ts` (84 lines): node:fs only, `POINTER_LIMIT` 4 KiB, `LEDGER_LIMIT`
  1 MiB, reads the active-route pointer only from `<scratchpad_dir>/ambicode-hook-state/active-route`
  (the tmpdir fallback was not built). `guard-core.ts` allows the plan-body write only when
  `session_id` is present, the scratchpad pointer names `plan` on the slug, and `ownerOf` names
  that session. `hooks/hooks.json` is unchanged; P47 was not run, so there is no `updatedInput` row.
  The step-01 report (PRIMARY `plan/migration-v6-reports/step-01/implementation.md`) records: the
  route session must equal the hook's `session_id`; importing `ownership.ts` into the CLI may move
  it into a shared chunk, so re-measure the guard (the bundle test allows at most 2 files).
- From step 00: prompt mechanism B (swap); `evals-bench.mjs run [--prompt naked|with] [--dry-run]`
  with `--tag`, `--no-publish` in its argv; `npm run evals:gate` =
  `evals/scripts/src/validation/eval-gate.mjs`; all probes pending; P-S recorded or pending.
- `src/hook/events/run-hook.ts` (228 lines): `runHook` switch; `handlePostToolUse` sends `Skill`
  to `prepareForSkill`, Atlassian MCP to `dedupedTicketPrepare`, `Edit|Write` to reminders.
- `src/hook/events/prepare-on-skill.ts` (203 lines): `prepareForSkill`, `SLASH_COMMAND`
  (`investigate|plan|task`), `prepareForSlashCommand`, the key regex (fires on key-shaped prose),
  `prepareForTicket`, `TICKET_TOOL`, `NOT_THE_TICKET`, `textOf`, `requiredLsp`.
- `src/hook/session/markers.ts` (73 lines): `hookStateBaseDir(fs, session, scratchpad?)` →
  `<scratchpad>/ambicode-hook-state` or `<tmp>/ambicode-hook-state/<sha40>`; `currentEpoch`,
  `resetEpoch`, `cleanupSessionState`, `DeliveryKey` (`edit-reminder | shared-contract |
  ticket-prepare`), `deliverOnce`.
- `src/contracts/hook.ts` (45 lines): `HookInput` (looseObject), `ADDITIONAL_CONTEXT_EVENTS =
  ['PostToolUse','SessionStart','UserPromptSubmit']`, `EMPTY_HOOK_OUTPUT`.
- `hooks/hooks.json`: PostToolUse `Edit|Write`, `mcp__.*([Aa]tlassian|[Jj]ira|[Cc]onfluence|[Rr]ovo).*`,
  `Skill`; PreToolUse `Bash` (`if` rows `git *`, `glab mr*`, `*.ambicode/task*`) and
  `Write|Edit|MultiEdit|NotebookEdit` → `guard.mjs`; SessionStart; UserPromptSubmit; PostCompact;
  SessionEnd. That is six events; `docs/compatibility.md` and `docs/release-checklist.md` say five.
- `src/cli/main.ts` (400 lines): `USAGE`, `SPECS`, `dispatch`, the multiword `const name = …` line.
  `src/cli/commands/prepare.ts` (632 lines): `PREPARE_OPTIONS` (`activity`, `project`, `evidence`,
  `task-open`, repeated `requirement`/`term`, flags `json`/`verbose`/`with-contract`),
  `RULE_CATEGORIES_NOT_CARRIED` (investigate: all categories; plan: `code-style`).
- Config: `src/contracts/config.ts` (148 lines; strict `AmbicodeConfig`, `schemaVersion:
  literal(1)`, `requirements {mcpServer, lsp[]}`, `projects[].commands` is a record of nullable
  `CommandSpec`, so `commands.format` is already a valid key; `SUPPORTED_SCHEMA_VERSION = 1`);
  `src/config/load.ts` (162 lines; `config-missing`, `config-unparsable`, `config-invalid`,
  `config-schema-too-new`); `src/config/defaults.ts` (`SHORTLIST_DEFAULTS`, `TASKS_DIR`);
  `src/contracts/primitives.ts` (`Ecosystem` = typescript | python, `RuleCategory`, `PromptStage`).
- Search: `src/code-intelligence/locate.ts` (524 lines; `locate`, `termsFromRequirements`, the 60%
  breadth guard, `PREPARE_SHORTLIST_LIMIT`); `dependents.ts` (127 lines; private `DECLARATIONS`,
  7 regexes; `declaredNames` takes the first match per pattern); `navigation.ts` (82 lines;
  `READING_ORDER`, `readingOrder`, `navigationFor`); `src/git/git.ts` `grepFiles` (`-I -l -z -i -F`).
- `src/policy/resolve.ts` (247 lines): `resolvePolicy`, `PREPARE_PROMPT_STAGES`,
  `applicablePrepareStages`. `src/requirements/normalize.ts` (401 lines): `RequirementEvidence`,
  `normalizeRequirements`, `canonicalUrl`. `src/contracts/requirements.ts`.
- `src/task/slug.ts`: `mintTaskSlug(text)` (ticket key, else kebab of 5 words, else `task-<hash8>`).
  `src/composition/root.ts`: `Runtime`, `openRepository`, `openWorkspace`.
- `skills/investigate/SKILL.md` is 6,503 bytes with no `disable-model-invocation`.
  `skills/shared/prepare-output.md` and `requirements-mcp.md` are referenced by the plan,
  investigate, review, rules and task bodies, `skills/review/references/requirements.md`,
  `docs/review.md`, `src/util/skill-content.test.ts` (which also imports `READING_ORDER`),
  `src/cli/context-cost.test.ts` and `navigation.ts`.
- `scripts/package-candidate.mjs` `DIRECTORY_ALLOWLIST` has no `routes`. `build.mjs` entry points:
  `ambicode` (`src/cli/main.ts`) and `guard` (`src/hook/guard/guard.ts`).
- `evals/evals-triggers`: 28 cases; investigate positives (grader `investigate-fired.md`) are
  `casual-look`, `how-much-work`, `url-question`, `which-files`, `why-question`. `package.json`
  has `evals:triggers` and `evals:triggers:gate`. `fixtures/definitions.mjs` defines
  `ts-feature-boundary`; `fixtures/materialize.mjs` materializes it.

## Files

Budgets are source lines, tests excluded (05-working-rules §2.3). Tests for this step should total
about 5,000 lines; the scenario and gate-table suites are the largest part. File splitting inside
an assigned module is routine (00-README, fixed layout); a split file shares its parent's budget.

**Route core**

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/route/routes.ts` | create | 380 | DSL zod schema, loader, normalization, `validateRouteFiles` |
| `src/route/gates.ts` | create | 220 | registry loader, dynamic options, `policy` override, gate print text |
| `src/route/fold.ts` | create | 340 | chain, windows, step done-ness, counters, preanswer lookup |
| `src/route/consent.ts` | create | 180 | answer recording, binding, `consent()` evaluation |
| `src/route/flags.ts` | create | 120 | `--answer`/`--default`/`--revise`/`--conflict` → records |
| `src/route/engine.ts` | create | 460 | `createEngine`: start, advance, status, stop; the six steps |
| `src/route/context.ts` | change | 70 → 230 | `ledgerRouteContext` implementing `RouteContextPort` |
| `src/route/command-tail.ts` | create | 90 | `runCommandTail`, once per wrapper |
| `src/route/handlers.ts` | create | 120 | handler registry and the handler adapters for modules |
| `src/route/delivery.ts` | create | 130 | step message, 3-line header, overflow file and preview |
| `src/route/session.ts` | create | 110 | `SessionSource` (0-S adapters) and harness token port |
| `src/route/active-route.ts` | create | 80 | pointer write/read/clear and the fallback scan |
| `src/route/ownership.ts` | — | 0 | unchanged (step 01) |

**Hooks**

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/hook/events/run-hook.ts` | change | ±150 | v6/30 matrix routing; Skill and Edit/Write handling unregistered |
| `src/hook/events/prompt-launch.ts` | create | 130 | UserPromptSubmit launch and re-injection |
| `src/hook/events/gate-answer.ts` | create | 170 | AskUserQuestion adapter, binding, `decision:*`, delivery |
| `src/hook/events/stop-check.ts` | create | 270 | Stop conditions, checks, block once, file fallback |
| `src/hook/events/platform.ts` | create | 25 | P2/P48 support flags (default unsupported) |
| `src/hook/events/prepare-on-skill.ts` | change | −120 | remove `prepareForSkill`, `prepareForTicket`; narrow slash command to `plan\|task` |
| `src/hook/session/markers.ts` | change | +20 | `DeliveryKey` kind `route-step`; stop cursor helpers |
| `src/contracts/hook.ts` | change | +35 | AskUserQuestion input/response, `transcript_path`, Stop output |
| `src/hook/index.ts` | change | ±10 | re-exports (mechanical) |
| `hooks/hooks.json` | change | — | 03-H1 matrix |

**Config**

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/contracts/config.ts` | change | +70 | schema versions 1–3, v3 fields, removed fields accepted |
| `src/config/load.ts` | change | +60 | `loadConfigWithNotices`; v1/v2 notices; drops with notices |
| `src/config/defaults.ts` | change | +15 | v3 defaults (search, workers, guard, review.onInvalid) |
| `src/config/ecosystems.ts` | create | 60 | the ecosystem table (03-C5) |

**Requirements** (file names are the ones step 04 extends)

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/requirements/has-requirement.ts` | create | 50 | `hasRequirement` |
| `src/requirements/template.ts` | create | 120 | `requirementsTemplate` |
| `src/requirements/capture.ts` | create | 200 | MCP payload → `requirements/<key>.json` + `requirement` |
| `src/requirements/envelope.ts` | create | 200 | normalize: asked/missingAsked, branches, envelope entry |
| `src/requirements/acs.ts` | create | 90 | `splitAcs` |
| `src/requirements/normalize.ts` | change | ±20 | reuse from envelope; no behaviour change for review |
| `src/contracts/requirements.ts` | change | +30 | `relation`, `derivedFrom`, capture file schema |

**Search and policy**

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/git/git.ts` | change | +25 | `grepWords` beside `grepFiles` |
| `src/code-intelligence/harvest.ts` | create | 110 | global declaration harvest |
| `src/code-intelligence/map.ts` | create | 280 | layers, term ranking, map output and entry |
| `src/code-intelligence/refs.ts` | create | 130 | `refs` and `find` |
| `src/code-intelligence/dependents.ts` | change | ±10 | import the patterns from `ecosystems.ts` |
| `src/code-intelligence/navigation.ts` | change | ±40 | v6/10 §5 guidance replaces `READING_ORDER` |
| `src/policy/stage.ts` | create | 140 | `policyStage` projection |
| `src/task/kinds.ts` | change | +40 | tighten `map`, `search`, `policy` (step 02 D4) |
| `src/task/report.ts` | change | +20 | leading status line (03-E12) |

**CLI**

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/cli/commands/route.ts` | create | 230 | `route start\|next\|status\|stop` |
| `src/cli/commands/search.ts` | create | 130 | `map`, `refs`, `find` |
| `src/cli/commands/requirements.ts` | create | 120 | `requirements template\|normalize\|acs` |
| `src/cli/commands/policy.ts` | change | +40 | `--stage`, `--show` |
| `src/cli/commands/prepare.ts` | change | ±60 | deprecated adapter (03-T6) |
| `src/cli/commands/note.ts` | change | ±30 | real session and port; tail on save and promote |
| `src/cli/main.ts` | change | +70 | SPECS, USAGE, dispatch, multiword names |

**Route data, skills, docs, evals, packaging**

| File | Action | Purpose |
|---|---|---|
| `routes/investigate.yaml`, `routes/gates.yaml` | create | the route (03-I1) and the full registry (03-R7) |
| `routes/steps/investigate-fetch.md`, `-read.md`, `-write.md` | create | model step texts (03-I2) |
| `skills/investigate/SKILL.md` | rewrite | ≤ 2,048 bytes (03-I3) |
| `skills/shared/prepare-output.md`, `skills/shared/requirements-mcp.md` | delete | 03-I4 |
| plan/task/review/rules `SKILL.md`, `skills/review/references/requirements.md`, `docs/review.md` | change | dangling references only (03-I4) |
| `skills/review/references/outcomes.md` | change | new codes |
| `docs/compatibility.md`, `docs/release-checklist.md` | change | actual hook count and matrix |
| `scripts/package-candidate.mjs`, `build.mjs` | change | routes packaged and validated (03-R9) |
| `evals/evals-triggers/{casual-look,how-much-work,url-question,which-files,why-question}/graders/` | change | 03-V1 |
| `evals/evals-triggers/README.md`, `package.json` | change | 03-V2 |
| `src/util/skill-content.test.ts`, `src/cli/context-cost.test.ts` | change | follow the deletions |

Unchanged in this step: `src/route/ownership.ts`; the guard's parser and decisions
(`src/hook/guard/*`, `src/hook/shell/*`) except under tmpdir outcome (b) or (c) (03-S8); the review
runner and `src/review/*`; `skills/shared/*` other than the two deleted files; `evals/evals-core/`
and `evals/evals-archived/`; `src/task/notes.ts` predicates (step 02).

## Contract

```ts
// src/route/context.ts — 01-contracts §2 types (from step 02) plus the implementation
export type CommandName = 'requirements normalize' | 'check' | 'format' | 'review' | 'plan check'
  | 'policy check --drafts' | 'rules apply' | 'init --apply' | 'note save' | 'note promote';
export type Cause = 'route-next' | 'gate-hook' | CommandName;
export function ledgerRouteContext(deps: { runtime: Runtime; routes: RouteRegistry }): RouteContextPort;
// resolve(task, session): the latest route entry of `session` on the slug, its transitive
// `resumes` chain, the fold position. null when the session has no route there.

// src/route/engine.ts
export interface Answer { gate: string; option: string; instance?: string; freeText?: boolean }
export interface StartInput { skill: string; text: string; requirements: readonly string[];
  task?: string; headless?: boolean; project?: string; answers?: readonly Answer[];
  fresh?: boolean; adopt?: boolean; cwd: string; session: string; channel: StartChannel;
  scratchpadDir?: string }
export interface AdvanceInput { task: string; session: string; answers?: readonly Answer[];
  default?: string; revise?: string; conflict?: { summary: string; sources: readonly string[] };
  project?: string; show?: string; cause: Cause; scratchpadDir?: string }
export interface StepMessage { task: string; routeId: string; position: string | 'complete';
  text: string; file: string | null; bytes: number; ledgerIds: readonly string[] }
export interface Position { routeId: string; skill: string; chainIds: readonly string[];
  sessions: readonly { session: string; routeId: string; adopts: boolean }[];
  owner: PlanOwnership | null; position: string | 'complete';
  steps: readonly { id: string; state: 'done' | 'pending' | 'skipped'; windowStart: number }[];
  cycles: number; repeatsLeft: Readonly<Record<string, number>>; revisesLeft: Readonly<Record<string, number>>;
  limits: readonly LedgerEntry[]; maps: readonly { id: string; layers: readonly MapLayer[] }[];
  orphans: readonly string[] }
export interface Engine {
  start(input: StartInput): Promise<StepMessage>;
  advance(input: AdvanceInput): Promise<StepMessage>;
  status(task: string, session: string | null): Promise<Position[]>;   // read-only
  stop(task: string, session: string, reason: 'blocked' | 'human' | 'inconclusive' | 'budget',
    detail?: string): Promise<void>;
}
export function createEngine(deps: { runtime: Runtime; routes: RouteRegistry;
  handlers: HandlerRegistry; pointer: ActiveRoutePointer }): Engine;

// src/route/handlers.ts — handlers never parse CLI flags, call wrappers or advance the engine
export interface HandlerInput { view: RouteView; context: RouteContextPort; dir: TaskDir;
  args: RouteArgs; params: readonly string[]; ledger: LockedLedger; runtime: Runtime; raisedBy: string;
  revise: { args: Readonly<Record<string, readonly string[]>> } | null }   // 03-F12
export type HandlerResult =
  | { state: 'ok'; payload: string | null }
  | { state: 'failed'; code: string; message: string; recoverable: boolean }
  | { state: 'raise'; gate: string; values: Readonly<Record<string, readonly string[]>> };
export type Handler = (input: HandlerInput) => Promise<HandlerResult>;
export interface HandlerRegistry { get(name: string): Handler | null; names(): readonly string[] }

// persisted route args (route entry field `args`)
export interface RouteArgs { text: string; requirements: readonly string[]; project: string | null;
  plan: string | null; fromDraft: string | null; answers: readonly string[]; headless: boolean;
  hasRequirement: boolean; hash: string }

// src/route/routes.ts — normalized DSL (never persisted as-is)
export interface RouteDef { skill: string; version: 3; budget: { modelSteps: number; wallMinutes?: number };
  exits: readonly Exit[]; revisable: readonly string[]; steps: readonly StepDef[] }
export interface StepDef { id: string; index: number; actor: 'code' | 'model' | 'worker' | 'human';
  run: readonly Call[]; instruction: string | null; payload: readonly string[];
  needs: readonly Qualified[]; produces: readonly Qualified[]; when: When | null;
  gate: GateDef | null; onFail: Revise | null; onError: OnError; repeat: number }
export interface GateDef { id: string; class: 'declared' | 'raised' | 'decision'; question: string;
  options: readonly string[]; default: string; release: string; acting: readonly string[];
  onAnswer: Readonly<Record<string, Revise>>; maxRevises: number; object: Qualified | null;
  policy: Readonly<Record<string, 'stop'>> }
export function validateRouteFiles(root: string): Promise<{ routes: RouteDef[]; registry: GateDef[] }>;

// src/route/gates.ts — the print writer the engine uses for a handler `raise` (03-G13)
export function raiseGate(ledger: LockedLedger, view: RouteView, input: { gate: string;
  values: Readonly<Record<string, readonly string[]>>; raisedBy: string }): Promise<LedgerEntry>;

// src/route/command-tail.ts
export function runCommandTail(deps: TailDeps, input: { task: string; cause: CommandName;
  session: SessionBinding }): Promise<StepMessage | null>;

// src/route/session.ts
export type SessionBinding = { state: 'bound'; session: string; via: 'hook' | 'env' | 'updated-input' | 'association' }
  | { state: 'unbound'; reason: 'missing' | 'stale' | 'ambiguous' };
export interface SessionSource { resolve(runtime: Runtime): Promise<SessionBinding> }
export interface HarnessTokenPort { validate(runtime: Runtime, session: string, intendedStart: string): Promise<boolean> }

// src/route/active-route.ts
export interface ActiveRoutePointer { write(session: string, scratchpad: string | undefined,
  value: { task: string; skill: string }): Promise<void>;
  clear(session: string, scratchpad: string | undefined): Promise<void>;
  read(session: string, scratchpad: string | undefined): Promise<{ task: string; skill: string } | null>;
  // 03-S7: written when exit/completion clears active-route; read and removed only by Stop (03-K1)
  readEnded(session: string, scratchpad: string | undefined): Promise<{ task: string; skill: string; routeId: string } | null>;
  clearEnded(session: string, scratchpad: string | undefined): Promise<void> }

// requirements, search, policy
export function hasRequirement(args: { text: string; requirements: readonly string[]; headless: boolean },
  config: { mcpServer: string | null }): boolean;
export function requirementsTemplate(input: { sources: readonly string[]; task: string;
  mcpServer: string | null }): { text: string; bytes: number };
export function captureRequirement(input: HookInput, deps: CaptureDeps): Promise<LedgerEntry | null>;
export function normalizeEnvelope(input: EnvelopeInput): Promise<EnvelopeResult>;
export function splitAcs(sources: readonly EnvelopeSource[]): { id: string; key: string; quote: string }[];
export function grepWords(runner: Runner, root: string, words: readonly string[], paths?: readonly string[]): Promise<string[]>;
export function harvest(fs: FileSystem, root: string, files: readonly string[], ecosystem: Ecosystem | null):
  Promise<{ name: string; kind: string; path: string; line: number; declarations: number }[]>;
export type LayerName = 'grep' | 'shortlist' | 'harvest' | 'history' | 'index.find' | 'index.relates';
export function buildMap(input: { runtime: Runtime; project: ProjectConfig; mode: 'prompt' | 'context';
  layers: readonly string[]; layersSource: 'config' | 'default' | 'route'; terms: readonly string[];
  paths: readonly string[]; symbols: readonly string[] }): Promise<MapResult>;
export function refs(runtime: Runtime, names: readonly string[], options: { project: ProjectConfig; show: boolean }): Promise<RefsResult>;
export function find(runtime: Runtime, name: string, options: { project: ProjectConfig; kind: string | null }): Promise<Declaration[]>;
export function policyStage(input: { runtime: Runtime; project: ProjectConfig; activity: Activity;
  paths: readonly string[]; stage: 'before-work' | 'before-report'; show: boolean }): StagePayload;
```

**CLI syntax** (v6/31; every command takes `--json`, stdout is valid JSON only, notices go to
stderr):

```
route start <skill> [--task <slug>] [--headless] [--project <id>] [--answer <gate>=<option>]… [--fresh | --adopt] [--requirement <url>]… [args…]
route next --task <slug> [--answer <gate>=<option>]… [--default <gate>] [--revise <stepId>] [--conflict "<summary>" --sources A,B] [--project <id>] [--show <payload>]
route status --task <slug>
route stop --task <slug> --reason blocked|human|inconclusive|budget [--detail <text>]
map --task <slug> [--project <id>] [--mode prompt|context] [--term <t>]… [--symbol <s>]… [paths…] [--show]
refs <name>… [--project <id>] [--task <slug>] [--show]
find <name> [--kind <k>] [--project <id>] [--task <slug>]
requirements template --requirement <url>… --task <slug>
requirements normalize --task <slug>
requirements acs --task <slug>
policy [paths…] [--project <id>] [--activity <a>] [--stage before-work|before-report] [--show]
```

There is no `--channel`, `--trusted` or `--session` flag on any public command (01-contracts §2),
except the transport flag of 0-S outcome "updatedInput" (03-S4), which carries identity, never trust.

**Persisted fields added by this step** (all additive; step 02 schemas are `passthrough()`):

| kind | added fields |
|---|---|
| route | `args: RouteArgs`; `epoch` = 1 (D11) |
| gate | `object: ArtifactRef` when the gate declares one; `options` (the instantiated list) |
| acceptance | `preanswer: <preanswer id>` when converted at a print; `trusted` copied from the preanswer |
| declined | `unbound: true`, `reason` for an unbindable hook answer (D7) |
| revise | `args: Record<string, string[]>` from the re-entry's `--<name> $answer` tokens (investigate: `term`); `gate` for a human revise |
| limit | `which`: `repeat`, `max-revises`, `same-error`, `identical-next`, `missing-produces`, `budget`, `stop-block`, `stop-unreadable` |
| map | `mode`, `layers [{name, ms, hits}]`, `layersSource`, `terms {pass1, pass2}`, `candidates`, `limitations[]`, `index`, `bytes` (tightened in `kinds.ts`) |
| search | `command` `refs\|find`, `names[]`, `hits`, `bytes` (tightened) |
| policy | `stage`, `packs[]`, `rules`, `omitted`, `bytes` (tightened) |
| requirement | `relation` `asked\|child\|parent\|link\|list`, `capture` `full\|list`, `derivedFrom` |

**New error codes**, each documented in `skills/review/references/outcomes.md` with its release:

| Code | Release |
|---|---|
| `route-invalid` | names the file, the step or gate, and the field (build and load) |
| `route-unknown` | lists the shipped route skills |
| `route-not-open` | `route start <skill> --task <slug>` |
| `route-needs-unmet` | names the missing kinds and the command that produces each |
| `gate-unknown` | lists the gates of the route and the registry |
| `gate-option-unknown` | lists the gate's options |
| `default-not-allowed` | "ask first": put the gate to the user through AskUserQuestion |
| `revise-not-allowed` | lists the route's `revisable` steps |
| `search-layers-not-for-model` | edit `search.layers` in `.ambicode/config.yaml` |
| `search-layer-unknown` | fix `search.layers`; lists the known layer names |
| `requirements-not-captured` | names the fetch call for each missing source |
| `requirements-missing` | fetch them and `route next`, or `route start` without that `--requirement` |

Notices (printed, never thrown): `requirements-partial`, `requirements-derived-orphan`,
`config-schema-old`, `config-field-removed`, `prepare-deprecated`. Existing codes reused:
`config-missing`, `not-a-repository`, `unknown-project`, `bad-argument`, and step 02's
`session-unbound` (release names decision 0-S), `ledger-unreadable` (release `route start --task
<slug>-2`), `route-busy`, `route-taken-over`, `ledger-busy`.

## Rules

**W — work order.** Each milestone ends with `npm run verify` green. The order does not change the
scope; it fixes when each part becomes testable.
- 03-W1 Milestone 1: config v3 reader and `ecosystems.ts` (group C).
- 03-W2 Milestone 2: route schema, registry, build and package validation (group R).
- 03-W3 Milestone 3: fold, consent, context, engine, ownership, session sources, command tail and
  the `route` CLI, proven on fixture routes (groups F, G, E, O, S, T).
- 03-W4 Milestone 4: requirements, search and policy handlers (groups Q, M, P).
- 03-W5 Milestone 5: hooks, Stop and the pointer (groups H, K, S6–S9).
- 03-W6 Milestone 6: the investigate route, body, shared-file cleanup, evals and docs (groups I, V).
- 03-W7 Milestone 7: model-free measurements (group X). Milestone 8: decision A preparation (group A).

**L — platform support for gate answers (P2/P48)**
- 03-L1 `src/hook/events/platform.ts` exports `ASK_BINDING: 'supported' | 'unsupported'` and
  `ANSWER_CONTEXT: 'supported' | 'unsupported'`, both `'unsupported'` until the P2 and P48 probe
  report records support. Changing either requires that report.
- 03-L2 The AskUserQuestion adapter (03-H5) is implemented and tested against synthetic supported
  and unsupported payloads whatever the flags say. Fixtures contain observed structure with
  synthetic values, never benchmark payloads.
- 03-L3 With `ASK_BINDING = 'unsupported'` the hook records nothing for gate answers. The gate print
  (03-G9) then tells the model to put the question to the user and, for a **non-acting** option
  only, to run `route next --task <slug> --answer <gate>=<option>`. Acting options have no
  model-typed fallback: they are honoured only from a trusted-start preanswer (03-G3). No
  "headless authorizes it" path and no re-confirmation through a model flag.
- 03-L4 With `ANSWER_CONTEXT = 'unsupported'` the hook returns no `additionalContext` after an
  answer, and the gate print ends with "then run `route next --task <slug>`" (+1 ceremony turn per
  gate). With it supported, the hook delivers the next step (03-H5).
- 03-L5 The P2/P48 probe runs only when separately authorized, at ≤ $1 combined: a synthetic
  interactive AskUserQuestion with a printed marker containing the logical gate AND the instance.
  It records the actual hook key paths for the question, marker, option, session and object
  lookup, and, separately, whether `additionalContext` reaches the next turn (P48). A headless
  auto-answer alone does not prove human answer binding.

**C — config and ecosystems** (pulled forward from step 09)
- 03-C1 `AmbicodeConfig` accepts `schemaVersion` 1, 2 or 3. `SUPPORTED_SCHEMA_VERSION` becomes 3
  for reading; 4 or more → `config-schema-too-new`. Writing stays as it is (init writes v1 until
  step 09).
- 03-C2 v3 fields, all optional with in-memory defaults: `search.index: none | codeindex` (default
  `none`); `search.layers.prompt` (default `[shortlist, harvest, shortlist]`) and
  `search.layers.context` (default `[grep, harvest]`), each a string array; `workers.approved:
  string[]` (default `[]`); `guard.askOutsideMap: boolean` (default `false`); `review.onInvalid:
  void | drop` (default `void`); `projects[].commands.format: null | {argv}` (already valid).
- 03-C3 `requirements.lsp`, `task.lspPlugins` and `search.exactMaxFiles` are accepted in any
  version and dropped from the normalized config, one `config-field-removed: <path>` notice each.
  All other existing fields (review, checks, page, remoteChecks, authoring, baseline) keep their
  current schema and values.
- 03-C4 `loadConfigWithNotices(...) → {config, notices}`; `loadConfig` returns `config` from it.
  A v1 or v2 file adds `config-schema-old: schemaVersion <n> read with v3 defaults; init --apply
  writes v3`. Nothing writes or migrates the user's file. The map's first line marks lists that
  came from defaults: `layers (default): shortlist → harvest → shortlist`.
- 03-C5 `src/config/ecosystems.ts` exports `ECOSYSTEMS: Record<Ecosystem, {sourceGlobs,
  declarationPatterns, exportFilter, i18nGlobs}>` and `FALLBACK_ECOSYSTEM` for an unknown or null
  ecosystem. `declarationPatterns` is the current `DECLARATIONS` list, moved verbatim;
  `dependents.ts` imports it. `exportFilter`: typescript `/^\s*export\b/`, python `null`.
  `sourceGlobs` reference `SHORTLIST_DEFAULTS`. `i18nGlobs`: typescript `['assets/i18n/*.json']`,
  python `[]`. Step 09 extends this same table; nothing creates another.
- 03-C6 No ecosystem or language name appears in `routes/**`, `src/route/**` or step texts. A test
  greps them for every `Ecosystem` value and for `typescript|python|javascript|java|go|rust`.
  Existing ecosystem-specific runner adapters stay where they are.

**R — route schema, loader, registry, build**
- 03-R1 `routes.ts` validates `routes/<skill>.yaml` per v6/12 §1 and v6/32 §3: `skill`, `version:
  3`, `budget.modelSteps` present, `exits` ⊆ `[done, blocked, human, inconclusive, superseded,
  budget]`, `revisable`, `steps`. Step ids unique and non-empty; actors `code|model|worker|human`.
  Route files are parsed with the `yaml` package; any parse error → `route-invalid` with its line.
  Inside a flow sequence, a value containing `{`, `}`, `,` or `: ` is written as a quoted string
  (`produces: ["policy{before-report}"]`, `run: ["evidence.notes.save(plan-draft, from:
  steps/plan-body.md)"]`); the loader parses the qualifier and the handler parameters from the
  string. The route blocks in v6/32 §3 are not valid YAML as printed and are never copied unquoted.
- 03-R2 `when` is one of `args.hasRequirement`, `!args.hasRequirement`, `map.empty`,
  `plan.isDraft`, `headless`, `interactive`, `index.present`, `gate.<id>.answered`,
  `gate.<id>.is(<option>)`, where `<id>` is a gate of this route and `<option>` one of its options.
- 03-R3 `needs` and `produces` are known kinds, optionally `kind{value}` where `value` is checked
  against the kind's qualifier field: `note` → `note`, `policy` → `stage`, `check` → `green` (D14),
  `requirement` → `capture`. Any other qualified kind → `route-invalid`.
- 03-R4 A `model` step has `instruction` (inline or `file:routes/steps/<name>.md`) of at most 1,500
  characters after inclusion. `run` names registered handlers only; unknown → `route-invalid`.
- 03-R5 `gate` only on `human` steps (worker gates are deferred). A gate has `question`,
  `options`, `default`, `release`, optional `onAnswer`, `maxRevises` (≥ 1, default 3), `acting`
  (⊆ options, default `[]`) and `object`. `default` and `release` must exist and must not be in
  `acting`. `object` must be a `kind{value}` that an **earlier** step of the same route produces.
- 03-R6 Revision targets: `onAnswer` keys are options or `"*"`; `onAnswer` and `onFail` targets are
  step ids of the same route that are earlier, the firing step (`$raisedBy`), or, for an `onFail`
  at a command tail, the step that consumes the result. A target later than the next step is
  refused. Every `onFail` and `revisable` target has `repeat ≥ 2`, except a `human` target and
  `$raisedBy`. `onAnswer` targets are not repeat-checked. Default `repeat`: `ground`/`design` 2,
  `plan-write`/`draft` 3, `fix`/`review-run` 2, others 1 (`check` 5 per phase is step 07's).
- 03-R7 `routes/gates.yaml` holds the complete v6/32 §4 registry: `requirements-server-disconnected`,
  `requirements-server-ambiguous`, `requirements-expansion-capped`, `requirements-conflicting`,
  `requirements-not-captured-twice`, `check-only-unauthorized`, `scope-expanding`,
  `project-ambiguous`, `config-unparsable`, `budget-exhausted`, `decision:*`, with questions,
  options, defaults and releases as written there. The three review missing-source gates
  (`-server-disconnected`, `-server-ambiguous`, `-not-captured-twice`) carry `policy: {review:
  stop}`. `acting`: `check-only-unauthorized: [approve]`, `config-unparsable: ["back up and
  regenerate"]`, all others `[]` (D13). `decision:*` has default and release `keep open`, no
  `acting` and no `object`.
- 03-R8 Dynamic options (`{projects…}`, `{servers…}`, `{sources…}`, `{keys}`) are instantiated from
  the raise values before validation and printing. An instantiated option list with an acting
  default still fails.
- 03-R9 The normalized DSL (`GateDef.id`) and persisted gate fields (`gate` = logical id, entry `id`
  = instance) stay distinct; the writer maps one to the other (01-contracts §1).
- 03-R10 `validateRouteFiles(root)` validates every route file, the registry and every
  `routes/steps/*.md` reference. `build.mjs` imports and calls it on the source tree and fails the
  build on any error. `package-candidate.mjs` adds `routes` to `DIRECTORY_ALLOWLIST` (files
  `routes/*.yaml`, `routes/gates.yaml`, `routes/steps/*.md`) and calls it on the candidate
  directory. No runtime or test import from `gym/`.

**F — fold, windows and bounds** (01-contracts §4, v6/12 §4–§5)
- 03-F1 Chain: from the route entry `resolve` selected, follow `resumes` transitively; the entries
  are those whose `route` is in the chain, in file order, from any session. Legacy entries without
  `route` are never in a chain. Unrelated records on the slug never satisfy needs, consent or
  producer lookup.
- 03-F2 Window of a step: entries after the latest `revise` in the chain whose target index is ≤
  the step's index, else from the chain start. Preanswers are read outside windows (03-G3).
- 03-F3 Done: `code` → its own `step {actor: code, status: completed}` in the window AND every
  qualified `produces` in the window; `model` → every qualified `produces` in the window, or, when
  it has none, its own `step {actor: model, status: completed}`; `human` → a bound answer for its
  gate in the window (03-G5); `worker` → a `worker` entry in the window. Empty `produces` proves
  nothing for a code step.
- 03-F4 A false `when` records `step {status: skipped}` once per window and the step counts as done;
  its `needs` are not checked.
  Gate predicates read the latest bound answer in the step's window.
- 03-F5 Position = the first not-done step, else `complete`.
- 03-F6 Automatic revise (`via: code|model`): refused with `limit {which: repeat, step: <target>}`
  when the target's executions in the current human cycle + 1 > its `repeat`; the route continues
  with the last evidence. Covered steps rerun without consulting their own `repeat`. A `human`
  target and `$raisedBy` are not repeat-checked; they are bounded by 03-F8.
- 03-F7 Human revise (`via: gate`, from `onAnswer`): starts a new cycle (resets every covered step's
  repeat count) and consumes one of that gate's `maxRevises`, counted over the chain. When 0 are
  left the option prints "(0 left — restart the route to continue)" and choosing it records
  `declined {reason: max-revises}`; the default's effect stands. A model `--revise` never consumes
  `maxRevises`.
- 03-F8 Same error code twice from one command or step in the window → the message adds "or `route
  stop --task <slug> --reason blocked`" (`stop:blocked` offered) and records `limit {which:
  same-error}`. It does not exit by itself.
- 03-F9 Three consecutive `route next` with no new entry other than their own → `limit {which:
  identical-next}` and advance. A model step whose produces are missing: first and second advance
  print what is missing and the producing command (the second adds the `stop:blocked` offer); the
  third records `limit {which: missing-produces, step}`, which counts as done for that step (D8).
- 03-F10 Budget: `budget.modelSteps` counts distinct `(model step, window start)` deliveries in the
  chain; when the next delivery would exceed it, raise `budget-exhausted` (default `stop` → `exit
  {budget}`). `budget.wallMinutes` (default 45) applies only when `mode: headless`; exceeded → `exit
  {budget}`. No idle timeout and no interactive wall timeout.
- 03-F11 Counters (repeat, same-error, identical-next, asked, maxRevises) are counts over chain
  entries only. No counter lives outside the ledger.
- 03-F12 A re-entry `revise <step> --<name> $answer` records `revise {args: {<name>: [<answer
  text>]}}`; several `--<name>` tokens give several keys. The engine passes the `revise` entry that
  opened the running step's window (03-F2) as `HandlerInput.revise`, else `null`. This is how a
  revised step receives the answer: investigate's `ground` reads `revise.args.term`; nothing reads
  the answer from the gate's own window.

**G — gates, answers and consent** (01-contracts §5, v6/12 §3.3–§3.5)
- 03-G1 `route next --answer <gate>=<option>`: a non-acting option → `acceptance {via: flag,
  instance: <latest print of that gate in the window, else null>}`. An acting option →
  `declined {via: flag, reason: acting-needs-human}` on every channel and in every mode, and the
  gate is reprinted (headless: then its default). An unknown option → `gate-option-unknown`, unless
  the gate's `onAnswer` has `"*"`: then `acceptance {answer: <text>}` and `$answer` is substituted
  into that re-entry. Free text is never acting. An unknown gate → `gate-unknown`.
- 03-G2 `route start --answer`: validated against the route and registry before any entry is
  written (unknown gate or option → refusal, nothing written). Trusted start: `preanswer {gate,
  option, via: prompt, trusted: true}`. Untrusted start: an acting option → `declined {via: flag,
  reason: acting-needs-human}`, no preanswer; a non-acting option → `preanswer {trusted: false}`.
- 03-G3 Conversion at the print: when the fold reaches a gate with an unconsumed preanswer, the
  engine appends the `gate` print, then `acceptance {via: prompt, instance: <that print>, object:
  <its object>, preanswer: <id>, trusted}`. A preanswer is consumed once (an acceptance names it).
  An untrusted preanswer's `onAnswer` revise is recorded `via: model`; the gate is then printed to
  the human when it is reached again.
- 03-G4 Hook answer (cause `gate-hook`): parse `[ambicode gate <logical-id> <ledger-id>]` from the
  question; find the `gate` entry with that id in this chain and check its `gate` equals
  `<logical-id>`; append `acceptance {via: hook, instance, answer, object: <copied from that
  entry>}`. No marker, an unknown instance, another chain, or a logical-id mismatch → `declined
  {via: hook, unbound: true, reason, instance: null}`; no effect; the next advance reprints with
  "put the marker back".
- 03-G5 Bound answers: `acceptance` or `declined` or `default-taken` without `unbound`, excluding
  `declined {reason: acting-needs-human}` and `declined {reason: option-not-offered}` (03-G14).
  The latest bound answer in the window wins; a late bound `acceptance` supersedes an earlier
  `default-taken` and its `onAnswer` applies then (S12).
- 03-G6 `decision:<slug>` marker without an instance: the hook appends `gate {gate:
  'decision:<slug>', class: decision, question, print: 1}` and then the bound acceptance for it.
  This is the only case where a print and its answer are minted together.
- 03-G7 Unanswered: interactive → each advance reprints (a new `gate` entry). When the window
  already holds 3 prints and no bound answer, the advance records `default-taken {via:
  never-asked}` if `asked = 0`, else `{via: unanswered}`. `asked` counts entries written by the hook
  for this gate in the window, unbound included; prints never count. Headless → the advance appends
  the print and `default-taken {via: headless, instance}` without delivering the question.
- 03-G8 `--default <gate>` → `default-taken {via: flag}`, accepted only when `mode: headless` or
  `asked ≥ 1`; else `default-not-allowed`. Defaults and releases are always non-acting; an option
  named `stop` records `exit` (D12).
- 03-G9 Gate print text: the question; each option with its consequence; "Revise (N left)" when it
  revises; the object identity (`path`, first 12 hex of `contentHash`) when the gate has one; the
  marker on its own line; then the 03-L3/03-L4 instructions for the current platform flags.
- 03-G10 Object: resolved in the window of the earlier step that produces it (H3): the latest entry
  matching the qualified kind there, as an `ArtifactRef`. The print records it; the answer copies
  the print's, never the latest print's.
- 03-G11 `consent(view, gateId, binding?)` returns `honoured {source, object}` only for the latest
  bound answer in the gate step's window that is an `acceptance` and, for an acting option, has
  `via: hook` with a non-null instance in this chain, or `via: prompt` with `trusted: true`.
  Otherwise `refused` with `no-answer`, `superseded` (a later bound non-accepting answer),
  `unbound`, `acting-needs-human` or `not-accepted`. With `binding.key` or `binding.set`, the
  recorded answer must match exactly. Legacy notes, delivered steps, raw flags and other routes
  never yield `honoured`.
- 03-G12 Registry `policy: {<skill>: stop}` replaces the gate's default and release with `stop`
  for that skill; the other options are still printed. `$raisedBy` resolves to the step that raised
  the gate; `revise $raisedBy` re-enters it.
- 03-G13 `gates.ts` exports `raiseGate(ledger, view, {gate, values, raisedBy})`: it instantiates
  dynamic options (03-R8), applies `policy` (03-G12) and appends the `gate` print with `raisedBy`.
  The engine uses it for a handler `raise` (03-E4). A later command that raises a registry gate
  outside a handler (step 07's `check`, `format` and `review --task`) calls it inside its own
  `withLedgerLock`; nothing else writes a gate print.
- 03-G14 A gate print may offer a subset of the declared options (a module's print-time selection
  through the question-text seam, step 09); the gate entry's `options` then lists the offered ones.
  A hook answer, or a preanswer at conversion, naming a declared option outside that print's
  `options` records `declined {reason: option-not-offered, instance}`, which is not a bound answer
  (03-G5), and the gate reprints. Without a selection every declared option is offered.

**E — engine and entry points** (01-contracts §3, v6/12 §8)
- 03-E1 Every advancing entry point (start, `route next`, command tail, bound gate hook,
  cross-session resume) runs one function in this order: record input → fold → needs/when/bounds/
  budget → run reachable code → record outputs then code completion → deliver. Start adds step 0
  (resolve, slug, ownership then dedup, `route` entry) and skips recording. Adoption runs 0 then 2–6.
- 03-E2 Same-session reprint and UserPromptSubmit re-injection run fold and deliver only: no code,
  no completion record, no counter change.
- 03-E3 `route next` and a command tail at a model position without `produces` record `step {step,
  actor: model, status: completed, cause}` first. Delivery never completes anything.
- 03-E4 Reachable code: the position if `code`, then each following `code` step up to the next
  model/human/worker step. Each writes its outputs, then `step {status: completed, cause}`. A
  handler `raise` appends the gate print with `raisedBy`; a `failed` writes no completion and enters
  `onError` (03-E9) or `onFail` (`revise`, then fold again under 03-F6).
- 03-E5 Delivery writes `step {status: delivered, channel, bytes, file?}` and prints the 3-line
  header (route/step id; what to do now; the command that ends the step), then the payload. Over
  8,000 characters on the CLI or 9,800 in a hook → `steps/<id>.md` plus a 300-character preview and
  "Read it whole: <n> bytes".
- 03-E6 Start: resolve repository and config (`config-missing` names `/ambicode:init`). For `skill:
  init` only: `openRepository` (`not-a-repository`), a missing config is normal, an unparsable one
  goes to the `config-unparsable` gate, and the slug is `init-<YYYY-MM-DD>`. Tested with a fixture
  init route and handler (S6 bootstrap mechanism).
- 03-E7 Slug: `--task` (step 02 D2 validation), else `mintTaskSlug(<requirement keys and text>)`.
- 03-E8 `RouteArgs.hash = contentHash(JSON)` of `{text (trimmed, whitespace collapsed),
  requirements (canonicalUrl, sorted, unique), project, plan, fromDraft, answers (sorted
  "gate=option"), headless}`. `fresh`, `adopt`, `task`, `json` and `show` are excluded (D2).
  `hasRequirement` is computed once at start and stored in `args`.
- 03-E9 `onError` default: print the code and its release; the 03-F8 counter offers `stop:blocked`
  on the second identical failure. Only an explicit `stop:<reason>` exits. A `recoverable`
  refusal (`requirements-missing`, `requirements-not-captured`) is never turned into an exit.
- 03-E10 Status is read-only: no entry, no preanswer consumption, no pointer change. It lists the
  sessions and owner, each step's state, cycles, repeats and revises left, limits, each map's
  layers, and orphan files (files under the task directory that no entry names).
- 03-E11 Stop appends `exit {reason, detail?}` and clears the pointer. A completed route clears it
  too. Exit `done` only when the final windows hold no `limit`, declined check, failed or skipped
  reviewer, or `default-taken {never-asked|unanswered}`.
- 03-E12 `buildReport` gains a first line: `complete` or `complete, <n> items not verified`, or the
  exit reason; an exit whose `detail` starts with `permission-denied` leads with it. The engine
  passes `current` (D10).
- 03-E13 `ledger-unreadable` from a strict read refuses start and advance with release `route start
  --task <slug>-2`. Headless step texts tell the model that a guard `ask` it cannot answer is
  recorded with `route stop --task <slug> --reason blocked --detail "permission-denied: <command>"`.

**O — ownership and concurrency** (01-contracts §6, v6/12 §2.3)
- 03-O1 Start order inside one `withLedgerLock`: strict read → for an owning skill (`OWNING_SKILLS`),
  `ownerOf` **before** any args comparison: owned by another live session and neither `--adopt`
  nor `--fresh` → `route-busy` naming the session and route id, whatever the args.
- 03-O2 `--adopt` appends `route {…, resumes: <routeId>, adopts: true}` and keeps the position.
  `--fresh` appends `exit {superseded}` on the other route, then a new `route`. Plain start after
  an `exit` opens a new route. Age and idle time are never consulted.
- 03-O3 Non-owning skill, same `(slug, skill)` open route: this session and same hash → reprint, no
  entry; another session and same hash → `route {…, resumes}` (adopt, message "resumed route <id> at
  step <x>; `route start --fresh` restarts"); this session and a different hash → `exit
  {superseded}` then a new route; another session and a different hash → a new route beside it.
- 03-O4 One active route per session: starting a route records `exit {superseded}` on this
  session's other open routes on any slug (found through the pointer, validated, else the scan of
  03-S7), each in its own lock.
- 03-O5 `assertOwner(view)` for an owning skill: `ownerOf(strict entries, slug)`; `owned` by
  `view.session` → pass; `view.session` in `takenOver` → `route-taken-over` naming the new session;
  other → `route-busy`; `unknown` → `ledger-unreadable`; non-owning skill → pass. It runs at write
  time in `route next` and every tail, inside the same lock as the write.
- 03-O6 Claims, takeovers and writes use step 02's one ledger lock and `LockedLedger.append`; no
  second lock and no nested acquisition. One advance holds the lock for its whole duration (D3).
  A handler that calls a step 02 writer (`saveNote`, `promotePlan`) passes `HandlerInput.ledger` as
  `NoteDeps.ledger` (02-L7); standalone CLI commands acquire the lock once.

**S — session transport and the active-route pointer**
- 03-S1 Hook entry points use the hook input's `session_id` (`via: hook`). A CLI command gets its
  session from the `SessionSource` that decision 0-S selects. **Never** from the latest route on
  the slug and never from a single open route.
- 03-S2 0-S pending (the default): the CLI `SessionSource` returns `unbound {missing}`. Routed CLI
  calls (`route start` from the CLI, `route next`, `route stop`, command tails) refuse with
  `session-unbound`, whose release names decision 0-S. Hook-started routes still start and deliver.
  Tests inject sessions.
- 03-S3 Outcome "environment binding": `resolve` reads the variable P-S recorded; absent or empty →
  `unbound {missing}`; the staleness and ambiguity checks are the ones P-S recorded (if P-S
  recorded none, the report says so).
- 03-S4 Outcome "PreToolUse updatedInput" (P47 is a hard prerequisite): `hooks.json` adds the
  `Bash(*ambicode.mjs*)` `if` row; the guard returns `updatedInput` adding `--session <session_id>`
  to an ambicode command that lacks it; the CLI accepts `--session` only as the binding (`via:
  updated-input`), never as trust. Without P47 support this outcome cannot be implemented.
- 03-S5 Outcome "hook-written association": every hook event writes `<os tmpdir>/ambicode-hook-state/
  assoc/<sha40(repositoryRoot)>/<session>` with its time; SessionEnd removes it. The CLI binds when
  exactly one association exists for its repository; none → `missing`; more than one →
  `ambiguous`.
- 03-S6 Harness channel: a start is `channel: harness` only when a `HarnessTokenPort` validates the
  run, session and intended start (P58). The runtime default port rejects; tests inject. Token
  values are never stored in ledgers, output or artifacts.
- 03-S7 Pointer: start, adopt and fresh write `{task, skill}` (≤ 4 KiB JSON) at
  `hookStateBaseDir(fs, session, scratchpad)`; exit and completion clear it and, in the same call,
  write `ended-route` `{task, skill, routeId}` beside it (≤ 4 KiB, replacing an older one); the
  ledger stays. Only Stop reads `ended-route` (03-K1); the guard and every other reader see no
  active route.
  Readers validate the pointer against the ledger (an open route of this session on that slug) and
  otherwise scan `.ambicode/task/*/ledger.jsonl` for this session's open routes. The pointer is
  never route authority.
- 03-S8 Tmpdir fallback (step-01 decision, user's): **(a) default, undecided**: the guard keeps
  reading only `<scratchpad_dir>/ambicode-hook-state/active-route`; with no scratchpad the guard
  fails closed (no plan-body allow). **(b)**: `guard-state.ts` may import `node:os` and
  `node:crypto` to compute the `<tmp>/ambicode-hook-state/<sha40>` path that `markers.ts` uses;
  re-measure guard ≤ 50 ms. **(c)**: the pointer is also written at `<process.env.TMPDIR ??
  '/tmp'>/ambicode-hook-state/route-<session with [^A-Za-z0-9_-] → _>/active-route`, and the guard
  reads that path when `scratchpad_dir` is absent. Under (a) the guard files are unchanged.
- 03-S9 Measure a 50-task ledger scan (median of 20). Under 20 ms is reported as a proposal to
  remove the pointer, not applied.

**T — command tail and CLI**
- 03-T1 `runCommandTail` runs once per wrapper invocation after the wrapper's own ledger write:
  bound session → `engine.advance({cause})` and print the step; no open route for the session on
  the slug → nothing; session unbound → the write stands, stderr prints `session-unbound` with the
  0-S release, exit 0 (D4).
- 03-T2 This step wires the tail into `route next`, `requirements normalize`, `note save` and `note
  promote`. The tail is the exported seam for `check`, `format`, `review`, `plan check`, `policy
  check --drafts`, `rules apply`, `init --apply` (later steps).
- 03-T3 Handlers called inside the engine never call `runCommandTail`. An `AsyncLocalStorage` flag
  set by the engine makes a nested tail throw.
- 03-T4 Successful read-only commands (`map`, `refs`, `find`, `requirements template|acs`, `policy`,
  `route status`, `report`, `note list`) never acknowledge a model step. A failed command creates
  no successful output.
- 03-T5 `note.ts` passes the real `SessionSource` binding and `ledgerRouteContext` as `NoteDeps`,
  replacing step 02's D2 nulls. With 0-S pending the binding is unbound, so the step 02 behaviour
  (`session-unbound` on owned plan saves and on promote) stays.
- 03-T6 `prepare` is a one-release deprecated adapter. `--activity investigate` calls `Engine.start`
  (channel `cli`, untrusted, never hook) with: `--task-open` text or the `--term` values joined as
  `text`; positional paths appended to `text`; `--requirement` and `--project` passed through;
  `--evidence` ignored with a notice. Other activities keep their current output. Every call prints
  `prepare-deprecated: use route start <skill>` on stderr. The translation is documented in USAGE.
- 03-T7 `map --layers` (any value) → `search-layers-not-for-model`. Route steps pass `layers` to
  `buildMap` in-process.
- 03-T8 `SPECS`, `USAGE` and `dispatch` register `route start|next|status|stop`, `map`, `refs`,
  `find`, `requirements template|normalize|acs`, `policy --stage`; `report` stays from step 02.
  With `--json`, stdout is one valid JSON document; notices and warnings go to stderr.

**Q — requirements** (v6/14; step 04 extends the same symbols)
- 03-Q1 `hasRequirement`: interactive → a URL in `text`, any `--requirement`, or a first `text`
  token that is a bare key `^[A-Z][A-Z0-9]+-\d+$` while `mcpServer` is set; headless → only a
  `--requirement`. A key elsewhere in prose → false.
- 03-Q2 `requirementsTemplate` (≤ 1,536 bytes): the binding line (configured server name, or "no
  server configured: tell the user to pin `requirements.mcpServer`"); per asked source the calls
  with field lists (`getJiraIssue KEY fields=summary,description,issuetype,parent,issuelinks`;
  `searchJiraIssuesUsingJql "parent = KEY" fields=key,summary`; a Confluence page read in full,
  child pages listed); then, **before** any child read, "if the JQL returned more than 10 hits, stop
  here and run `route next --task <slug>`", else one `getJiraIssue` per child with the same fields;
  last line the completion command `route next --task <slug>`.
- 03-Q3 Capture binding (step 03 part): with a route active and `mcpServer` set, a tool
  `mcp__<server>__<tool>` binds when `<server>` equals `mcpServer`, or, with no exact match, when
  `mcpServer` is a case-insensitive token of `<server>`. Otherwise nothing is captured.
- 03-Q4 Capture: the tool class is the lowercase prefix of `<tool>`: `get`, `search`, `fetch`,
  `read`. Documents are extracted with key, summary, type, parent, links and text fields
  (`NOT_THE_TICKET` stripping, moved from `prepare-on-skill.ts`). `search*` is reduced on disk to
  `{key, summary}` per hit (`capture: list`, file `requirements/search-<12 hex of rawHash>.json`).
  Others write `requirements/<key>.json` `{key, url, title, type, relation, derivedFrom,
  retrievedVia, retrievedAt, sourceVersion, updatedAt, content, rawHash}` with `capture: full`.
  Each appends `requirement {key, via, rawHash, bytes, relation, capture, derivedFrom}`. Nothing
  else: no map, no step, no advance. An unrecognized payload writes nothing.
- 03-Q5 Normalize computes, before choosing a branch: `asked` = the keys of the route's
  `requirements` and of URLs or the bare key in `text`; `complete` = keys with a `capture: full`
  entry whose file has `content`; `missingAsked = asked − complete`. A list-only hit is not a
  capture of the listed document.
- 03-Q6 Branches: complete captures exist → `builtFrom: captures`; a capture with relation
  `child|parent|link` and no chain to an asked key is dropped with `requirements-derived-orphan`;
  non-empty `missingAsked` → `requirements-partial` notice for investigate/plan/task (each missing
  source goes to Not verified), and for review the recoverable refusal `requirements-missing`
  (ground not completed, no exit). No complete capture and `!hasRequirement` → one source `{key:
  ARGS, title: first line, content: rest}`, `builtFrom: args`. No complete capture and
  `hasRequirement` → if the window holds a `continue without` answer to
  `requirements-not-captured-twice` or `requirements-server-disconnected`, `builtFrom: args`; else
  the first time `requirements-not-captured` (recoverable, names the fetch call), the second time
  raise `requirements-not-captured-twice`.
- 03-Q7 The envelope entry: `envelope {sources[], builtFrom, asked[], missingAsked[], hash}`,
  validated with the existing `RequirementEvidence` schema plus `relation`/`derivedFrom`.
- 03-Q8 `splitAcs`: explicit AC or "Definition of done" sections by bullet or number; else bullets
  and numbered items; else sentences of ≥ 40 characters containing `must|should|shall|will|needs?
  to`. Ids `AC-<key>-<nn>` (two digits from 01; `ARGS` for an args envelope), same text → same ids.
  The units are a signal, not validated recall truth.

**M — search** (v6/10; step 05 extends the same symbols)
- 03-M1 `grepWords`: `git grep -I -l -z -w -F -e <w>…` (case-sensitive), beside `grepFiles`.
- 03-M2 `harvest`: run every `declarationPatterns` regex globally (all matches per line, all lines)
  over the given files, applying `exportFilter` to the line when non-null; names of ≥ 3 characters
  not in the existing common-name set; returns each declaration with `path:line` and the count of
  files declaring the name.
- 03-M3 `buildMap` runs the layer list in order and records `{name, ms, hits}` per layer. prompt:
  `shortlist` (pass-1 terms) → `harvest` over the top 8 pass-1 files → `shortlist` again with
  pass-1 terms plus the harvested names (pass 2). context: `grep` on known names and symbols →
  `harvest` on the known paths plus grep hits (top 8). `history` records hits 0 with the limitation
  "history runs inside shortlist". `index.find`/`index.relates` with `search.index: none` are
  skipped with the limitation "index none". Another name → `search-layer-unknown`.
- 03-M4 Term ranking: identifiers (CamelCase, snake_case, dotted, backticked, file-like) first;
  quoted UI strings next, mapped to keys through the ecosystem's `i18nGlobs` when such files exist;
  prose words only when fewer than 3 identifiers exist, hyphenated compounds split. A term whose
  hits exceed 60% of shortlistable files is dropped with a limitation.
- 03-M5 A name declared in more than one file is `collides: true`. The map output is compact JSON
  ≤ 6,144 bytes: its first line is the layer list; candidates `[path, score, reasons, spans?]`,
  symbols per term, terms by pass, layers, `index: none`, limitations; candidates are cut from the
  bottom with a count. Each run appends `map` (Contract table).
- 03-M6 `refs <name>…`: `git grep -w -n` lines per name, collisions flagged; `find <name>`:
  declarations from `grepWords` + `harvest`. Each prints ≤ 4,096 bytes, `--show` writes the full
  result to `steps/`; with `--task` each appends `search {command, names, hits, bytes}`.
- 03-M7 `navigation.ts`: `READING_ORDER` and `readingOrder` are removed; `navigationFor` returns
  the v6/10 §5 guidance (map is a hypothesis; batched then spans; verify imports for `collides`;
  `find` before adding a helper; navigation is recorded by the CLI only).

**P — policy stage** (v6/11 §2; step 07 adds the rest)
- 03-P1 `policyStage` projects `resolvePolicy` output; no resolver rewrite. `before-work` ≤ 4,096
  bytes, `before-report` ≤ 1,536 bytes; overflow cut with "<n> more: `policy --stage <s> --show`".
- 03-P2 Rules render as `pack/rule (authority): instruction`. Stage prompts of the requested stage
  are included. Rules not carried follow `RULE_CATEGORIES_NOT_CARRIED` (moved from `prepare.ts`):
  investigate carries no rules and prints `rulesOmitted: <n>` with the `--show` command; plan
  carries all but `code-style`.
- 03-P3 Each delivery appends `policy {stage, packs, rules, omitted, bytes}`.

**H — hooks** (v6/30 §1)
- 03-H1 `hooks.json` after this step: PostToolUse `mcp__.*` and `AskUserQuestion`; PreToolUse as
  before (plus the 03-S4 row only under that outcome); SessionStart; UserPromptSubmit; `Stop`;
  PostCompact; SessionEnd. The `Skill` and `Edit|Write` PostToolUse entries are removed; the
  reminder code stays in the source, unregistered.
- 03-H2 Every route-related handler returns `EMPTY_HOOK_OUTPUT` when `agent_id` is present.
- 03-H3 UserPromptSubmit: `^/ambicode:(\w+)\b(.*)$` (dotall) on the prompt with a shipped route →
  `Engine.start({channel: 'hook', session: session_id, scratchpadDir})`, args tokenized with quotes
  respected; the message returns as `additionalContext`. `plan|task` keep the existing
  `prepareForSlashCommand` until their routes ship. A prompt without the prefix launches nothing.
- 03-H4 UserPromptSubmit re-injection: with an active route for the session and a new epoch since
  its last delivery (`deliverOnce` key `route-step`, epoch, route id, position), fold and deliver
  only (03-E2). The shared-contract injection stays as it is.
- 03-H5 PostToolUse `AskUserQuestion`: with `ASK_BINDING = 'supported'`, for each answered question
  call `engine.advance({cause: 'gate-hook', answers})`; return the next step as
  `additionalContext` only when `ANSWER_CONTEXT = 'supported'`.
- 03-H6 PostToolUse `mcp__.*`: no active route → return at once (no config load, no ledger read);
  with a route → 03-Q3/03-Q4 capture only. `prepareForTicket` and `dedupedTicketPrepare` are
  removed.
- 03-H7 SessionStart, PostCompact and SessionEnd keep their epoch reset and cleanup;
  SessionEnd also removes the pointer, `ended-route` and stop cursors.
- 03-H8 `docs/compatibility.md`, `docs/release-checklist.md`, `src/contracts/hook.ts` and
  `outcomes.md` state the actual event and handler counts computed from `hooks.json`.

**K — Stop** (v6/15 §3)
- 03-K1 Stop's route: the active route of the session, else the route named by `ended-route`
  (03-S7) after validating it against the ledger (that route exists in this session's chain on that
  slug). Stop allows at once when `agent_id` is present or neither exists. After evaluating an
  ended route (allow or block), Stop removes `ended-route`, so a route that ended is checked by at
  most one Stop. It checks only when:
  (a) an `exit` entry was appended since the last stop; (b) the first non-blank line of the last
  assistant message equals the first `#` heading of the route's last model step instruction; or
  (c) the route's last model step produces a `note{…}` and a `note` entry was appended since the
  last stop — then the checked text is that note file. Every other stop allows.
- 03-K2 "Since the last stop": the hook state keeps per route the ledger entry count seen at the
  previous Stop (`stop/<routeId>`).
- 03-K3 Checks: each `path:line` or `path:line-line` token (path with an extension, no `://`)
  resolves under the repository root with `line ≤ lines(file)`; a generated Evidence/Not verified
  block present in the text matches `buildReport` for the chain after whitespace normalization,
  and its hash comment when present; the words "accepted" or "approved" need a bound `acceptance`
  in the chain; "tests pass(ed)" needs a `check` with `exit 0` and `summary.ran ≥ 1` and
  `summary.failed = 0`.
- 03-K4 `redBeforeGreen(entries, key)` is exported and unit-tested: a failing check (exit ≠ 0,
  `summary.failed ≥ 1`) precedes the first green one. Stop applies it only when called with
  `defectBrief: true`; no step-03 route sets it (step 07 wires detection).
- 03-K5 Failure → `{decision: 'block', reason}` with the reason ≤ 2,048 bytes naming the first
  items and `stop-check.md`; the full list is written to the task directory's `stop-check.md`; and
  `limit {which: stop-block}` is appended. When the chain already has a `stop-block` limit, a
  failing stop allows.
- 03-K6 The transcript is read backwards, at most 1,048,576 bytes from the end. Needed but
  unreadable → allow and append `limit {which: stop-unreadable}`.
- 03-K7 Until P17 is probed only `decision` and `reason` are emitted; no other Stop field is
  claimed to work.

**I — investigate route and body** (v6/22)
- 03-I1 `routes/investigate.yaml`: `template` (code, `when: args.hasRequirement`, `run:
  requirements.template`); `fetch` (model, `when: args.hasRequirement`); `ground` (code, `run:
  [requirements.normalize, requirements.acs, search.map(prompt), policy.stage(before-work)]`,
  `produces: [envelope, map, policy]`, `repeat: 2`); `scope` (human, `when: map.empty`, gate
  options `["search anyway"]` plus free text, default and release `search anyway`, `onAnswer: {"*":
  revise ground --term $answer}`); `read` (model, no `produces`); `report-step` (code, `run:
  [policy.stage(before-report), evidence.navigationLine]`, `produces: [policy{before-report}]`);
  `write` (model, `produces: [note{investigation}]`). `budget: {modelSteps: 6}`. Ground runs
  synchronously in the start when there is no requirement.
- 03-I2 Step texts: `investigate-fetch.md` (the template's calls, then `route next`);
  `investigate-read.md` (the map is a hypothesis; read batched, then spans; keep ≥ 2 hypotheses;
  verify imports for `collides`; reuse `find`; navigation is recorded partially, by CLI calls
  only; no search call is required to finish); `investigate-write.md` (first heading `## Confirmed
  facts`, then Assumptions, Unresolved, Recommendation, What would change this; the generated
  navigation line; `note save --task <slug> --kind investigation`). Each ≤ 1,500 characters. Until
  step 07 supplies `check --only`, the read text omits the diagnostic invocation; the report states
  this temporary deviation.
- 03-I3 `skills/investigate/SKILL.md` ≤ 2,048 bytes with `disable-model-invocation: true`: what an
  investigation is; the judgment (≥ 2 hypotheses; confirm or reject each candidate; facts apart
  from assumptions); the read-only boundary and its reason; the fallback line "if no step message
  appeared, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" route start investigate
  "$ARGUMENTS"`".
- 03-I4 `skills/shared/prepare-output.md`, `skills/shared/requirements-mcp.md`, `READING_ORDER`
  are deleted. Every reference to them in unmigrated bodies and docs is replaced by equivalent
  inline guidance of at most 5 lines each; no other edit to those bodies and no body cap raised.

**V — evals, packaging, docs**
- 03-V1 In the five investigate-positive trigger cases, `graders/investigate-fired.md` is replaced
  by `graders/no-skill-fired.md` with the content of the existing negative grader
  (`ambicode:(investigate|plan|task|review|init|rules)`, min 0, max 0). `url-bare`'s diagnostic
  graders are unchanged.
- 03-V2 `package.json` loses `evals:triggers:gate`; `evals:triggers` and its `run-validity.mjs`
  check stay. The suite README says: the suite becomes a negative-only check as each remaining
  skill migrates; it is no longer a release gate for description edits; steps 06/07/08/09 convert
  their skill's positive cases in the same change as `disable-model-invocation`. Editing cases is
  model-free; executing the suite is a separately authorized paid item.
- 03-V3 Route and step files ship in the package (03-R10).

**X — model-free proofs**
- 03-X1 Byte and character caps are tests on built outputs: investigate body 2,048 B; start 4 KiB;
  ground 8 KiB; report-step 2 KiB; map 6 KiB; refs/find 4 KiB; instruction 1,500 chars; CLI 8,000
  chars; hook 9,800 chars; preview 300 chars. No limit is raised.
- 03-X2 Timing medians of 20 spawns: guard ≤ 50 ms, `$A hook` ≤ 120 ms, MCP no-route ≤ 90 ms;
  synchronous no-requirement start ≤ 3 s on each of the three available repositories. A missing
  snapshot is reported `pending`, never a made-up time.
- 03-X3 The guard bundle is re-measured after the CLI imports `ownership.ts`; the bundle-file test
  stays at ≤ 2 files.

**A — authorized walk, decide and decision A** (needs step 00's prompt mechanism and probe report,
and named run authorization)
- 03-A1 Walk first; fix mechanics through a synthetic regression before decide. Both use `--prompt
  with`, `--tag localize`, pinned `claude-sonnet-5-5`, `--no-publish` and an explicit
  `--max-cost-usd`. Execute from the integrated primary checkout, with its absolute benchmark root
  (step 00's command: `evals-bench.mjs run --tag localize --prompt with --ablation none --runs 3
  --model claude-sonnet-5-5 --max-cost-usd <cap>`; recheck at dispatch).
- 03-A2 Paid walk and decide wait while 0-S is pending (00-README). Before paid decide, the user
  confirms the proposed 10-case population for A. After twins removal, selection still generates
  18 cases. For this investigate-only decision, use step 00's existing `--tag localize` filter: 10
  cases × 3 plugin runs against the same cached naked subset from the new 2026-10-04 naked
  baseline. The old v6 estimate $14/26 is historical; estimate about $5.40 at $0.18/run here, not
  an authorization. Record actual counts/cost and this scheduling interpretation. Review
  measurements wait for 08; do not invent an early review route before A permits dependent
  implementation.
- 03-A3 Gate command (verbatim):

```sh
npm run evals:gate -- <result>.json --baseline "$PRIMARY/evals/evals-core/results/eval-2026-10-04T19-44-56-791Z.json" --max-cost-ratio 1.15 --max-extra-turns 1000
```

  If actual turns exceed that reporting-only sentinel, report and rerun the **offline gate** with an
  explicit larger sentinel; turns never decide A. Do not change default gate thresholds.
- 03-A4 Report measured localize recall/cost against matching cached naked cases, ceremony, peak
  context, permission failures, launch channel and baseline/reference-arm/version provenance.
  Compute the noise band from both compared arms' repetition means through the existing gate;
  0.101 belongs to the historical baseline, not a new threshold. Keep infrastructure absences out
  of metric means while enforcing absent-share/validity checks; own turn/time-limit outcomes remain
  scored. The new control is naked's recorded `with` arm, automatically selected by `withBaseline`.
  Report naked/true-without equivalence as unverified; do not rerun the declined paid comparison.
  A version mismatch refuses rather than falling back to the old baseline or an exception flag.
- 03-A5 A requires recall within band AND cost ≤ 1.15x. A passing criterion is evidence;
  proceeding is the user's decision. A failing criterion lists both arms/loser detail and the pass
  2-only/text guidance options. An unrun measurement cannot be reported as criterion met.
- 03-A6 Present failed or unrun P2/P58 with its actual limitation: unproven/unsupported interactive
  acting answers; acting options require a proven trusted-start preanswer path, and sandbox harness
  trust requires P58. The user decides continuation with these limitations; consent checks are
  never relaxed. Present proceed, cut down, or abandon with steps 4–5 on v0.4.0's hooks. A chosen
  fallback requires a new step file before dispatch. No agent starts 04–09 until the user
  authorizes continuation at A.

## Decided readings

These choices are fixed by this brief. Do not reopen them; report a conflict as PLAN instead.

- D1 Step 02's D2 is replaced: the CLI passes the 0-S `SessionSource` binding and
  `ledgerRouteContext` (03-T5). With 0-S pending the binding is unbound, so runtime behaviour equals
  step 02's until 0-S is decided (01-contracts §1: "With 0-S pending, runtime routed CLI calls
  refuse").
- D2 Canonical args (03-E8) include every behavioural flag and exclude launch identity (`fresh`,
  `adopt`, `task`) and output flags. This implements V6 "Canonical args preserve behavioral flags
  … Record normalization as an implementation reading."
- D3 One advance holds the ledger lock for its whole duration, so two concurrent advances cannot
  both run ground (01-contracts §6: "Ownership check and mutation are one critical section").
- D4 A tail with an unbound session keeps the command's own write and prints `session-unbound` on
  stderr with exit 0 (v6/12 §8 "Without one: … the command's ledger write still happens"); routed
  commands themselves (`route next|start|stop` from the CLI) refuse.
- D5 Step 03's capture binds only when `mcpServer` is set (exact or token match). The `mcpServer:
  null` single/several-match behaviour, the `requirements-server-ambiguous` raise and the expansion
  gate raise are step 04 §2–§3 ("extend in 04"; V6 step 04 names them as its deliverables).
- D6 `prepare` routes only `--activity investigate` to `Engine.start`; other activities keep their
  output plus the deprecation line until their route ships (V6: "No live plan/task/review/init/rules
  route yet").
- D7 An unbindable hook answer is serialized as `declined {via: hook, unbound: true, reason}`, so no
  predicate that forgets the `unbound` check can honour it (v6/12 §3.4 "not a gate answer in the
  fold").
- D8 `limit {missing-produces}` counts as done for that model step; this is how "third → advance
  with limit (the engine never wedges)" (v6/12 §3.2) is expressed in the fold.
- D9 Investigate's policy stages carry no rules, with `rulesOmitted` counts, and the stage prompts
  (v6/11 §2 "investigate gets before-work and before-report with rulesOmitted counts (it edits
  nothing)"; the current `RULE_CATEGORIES_NOT_CARRIED`).
- D10 `current` for `buildReport`: an entry is current when it is in the chain and no later
  `revise` targets a step at or before the step it is attributed to (the step of the latest `step`
  entry before it).
- D11 `route.epoch` is 1; re-injection is decided by hook-state `deliverOnce` keys, not by this
  field (v6/30 §2 keeps the epoch in session state).
- D12 Choosing an option named `stop` records `exit`: `budget-exhausted` → `budget`,
  `project-ambiguous` → `human`, any other → `blocked` (v6/32 §4 comments; v6/14 §5 "exit blocked").
- D13 Registry `acting` lists only side-effect options: `check-only-unauthorized: approve` (runs a
  command) and `config-unparsable: back up and regenerate` (writes config). Reading, scoping and
  continuing are not acting (01-contracts §5 list).
- D14 `check{green}` means `exit 0`, `summary.ran ≥ 1`, `summary.failed = 0`; step 07 may refine it
  when it tightens the `check` schema.
- D15 Stop condition (b) uses the first `#` heading of the route's last model step instruction as
  the report header; no DSL field is added (v6/15 §3 "the report header the report step
  prescribes").
- D16 `plan.isDraft` = `args.fromDraft !== null`; `index.present` is false while `search.index` is
  `none` (no index ships before step 05).
- D17 The Stop module lives at `src/hook/events/stop-check.ts` (step 01's hook layout). Step 07's
  V6 text names `src/hook/stop-check.ts`; it means this file.
- D18 These are user decisions and stay open; this brief gives each branch instead: 0-S (03-S2 …
  03-S5), the tmpdir fallback (03-S8), P2/P48 support (03-L1 … 03-L4), P47 (03-S4), P58 (03-S6),
  0-V (03-A4 version refusal), A and every paid run (group A).

## Non-goals (a reviewer may not raise these)

- No live plan, task, review, init or rules route; fixture routes only. No `note save --kind plan`
  removal (step 06).
- No null-server binding, `requirements-server-ambiguous` raise, expansion gate raise, conflict
  resolution beyond the raised gate, `requirements.acceptanceField`, or stable-AC tests beyond 03-Q8
  (step 04).
- No `relates`, `index build|status`, codeindex adapter, project-wide collision census (step 05).
- No `before-checks` stage, `code-style` ≤ 8 rule, `check --only`, diagnostics text, defect-brief
  detection (step 07). No reviewer or estimate route (step 08). No config writing, migration or
  ecosystem detection (step 09).
- No `updatedInput --task` rewrite unless 0-S selects the updatedInput outcome (P47).
- No Stop output field other than `decision`/`reason` before P17.
- No adversarial hook payloads, forged markers beyond 03-G4's cases, or hostile local processes:
  the plugin is not a security sandbox (01-contracts §5).
- No ledger compaction, no second route-state store, no time-based route expiry.
- No refactor of `locate`, `resolvePolicy`, the guard, `notes.ts` or the review pipeline beyond the
  listed changes. No full rewrite of the unmigrated skill bodies.
- No execution of the trigger suite, probes, walk or decide without named authorization.

## Tests

Name each test after its rule. Use materialized synthetic repositories and real temporary
directories; inject sessions, clocks, writers, platform flags and the harness port. No test reads
`gym/` or NDA inputs.

1. `config.test.ts`: v1/v2/v3 load, defaults, removed-field notices, version 4 refusal, unchanged
   review fields (03-C1 … 03-C4); `ecosystems.test.ts` (03-C5); the language-name grep (03-C6).
2. `routes.test.ts`: one rejection per 03-R1 … 03-R6 rule (duplicate/missing ids, unknown handler
   or predicate, bad qualifier, long instruction, gate on a model step, acting default, missing
   release, object without earlier producer, late or repeat-1 target); registry completeness and
   policy entries (03-R7); dynamic options (03-R8); DSL vs persisted fields (03-R9); build and
   candidate validation (03-R10).
3. `fold.test.ts`: chain and windows, per-chain (03-F1, 03-F2); done-ness per actor including empty
   produces (03-F3); skipped once (03-F4); every counter and limit (03-F6 … 03-F11);
   a gate's free-text answer reaches the revised step as `HandlerInput.revise.args` (03-F12); a
   skipped step with unmet `needs` does not refuse (03-F4).
4. **Full gate table** (02-scenarios): iterate every gate of every shipped and fixture route and
   every registry entry including `decision:*`; drive accept, release, non-acting `--answer`,
   acting flag decline, `--default` before and after `asked`, headless default, three advances with
   `asked = 0`, late bound answer, free text, every `onAnswer`/`onFail` revise and its bound;
   assert defaults never write config, promote, run a reviewer or a check; registry policy
   overrides, dynamic options and `$raisedBy` key isolation (03-G1 … 03-G12, 03-F6, 03-F7); a
   command-side `raiseGate` call writes the same print as a handler `raise` (03-G13).
5. `consent.test.ts`: S1 (untrusted headless `--answer Accept` → declined, report names model-set
   mode); S2 synthetic adapter half (trusted preanswer converted at the reached instance and hash);
   S12 (late bound answer supersedes default; stale object cannot promote); S13 (print instance A,
   new draft B, answer A → refusal and reprint for B; unknown instance, foreign chain, logical-id
   mismatch → unbound); S14 (trusted headless without preanswer: model acting `--answer` declined,
   default taken, no spend; with trusted preanswer honoured and no second question); standalone
   `binding.key`/`binding.set` (03-G11).
   A fixture gate whose print offers a subset: an answer outside it → `declined
   {option-not-offered}`, not bound, reprint (03-G14).
6. `engine.test.ts`: entry-point parity (all five through one function, counts of ground runs);
   reprint and re-injection deliver only (03-E1 … 03-E3); S9 (template completed once; two
   next/resume do not rerun; scope revise keeps template completed; a fixture revisable template
   with repeat 2 reruns once); S10 engine halves (crash after outputs before completion reruns once
   and the report uses the latest; crash after command result before delivery only delivers);
   delivery overflow and read-back (03-E5); init bootstrap with a fixture handler (03-E6, S6
   mechanism); slug and args hash (03-E7, 03-E8); onError and recoverable refusals (03-E9); status
   read-only and orphan list (03-E10); exit `done` vs `complete` (03-E11, 03-E12);
   permission-denied, config-missing and ledger-unreadable recovery paths (03-E13).
7. `ownership.engine.test.ts`: S11 (non-owning same args adopts, different args separate chains;
   plan same or different args from another session → `route-busy`; `--adopt`/`--fresh`; old owner
   `route next`, `note save --from`, `promote` and the guard plan-body write → `route-taken-over`;
   exited route permits a plain start; 60 idle minutes change nothing); two simultaneous claimants
   and a stale write, as child processes (03-O1 … 03-O6). Plan-shaped fixture routes also validate
   the S3 (re-accept B with no new write or check), S4 (two bad checks then a passing third; fourth
   write limited), S5 (model revise vs human Revise counters) and S10 promote-repair mechanisms.
8. `session.test.ts`: pending → `session-unbound` naming 0-S on every routed CLI call; hook
   sessions; each outcome adapter with missing/stale/ambiguous cases; no latest-route inference;
   harness port rejects by default and tokens never persist (03-S1 … 03-S6); pointer write, clear,
   validation and fallback scan; the 50-task scan measurement (03-S7, 03-S9); the active tmpdir
   outcome (03-S8).
9. `command-tail.test.ts`: once per wrapper with call counts; nested tail throws; read-only
   commands acknowledge nothing; unbound session keeps the write (03-T1 … 03-T5); prepare adapter
   (03-T6); `--layers` refusal (03-T7); every command's `--json` parses as one document (03-T8).
10. `requirements` tests: `hasRequirement` table including key-shaped prose (03-Q1); template
    order and byte cap (03-Q2); binding exact/token/none (03-Q3); synthetic get/search/fetch/read
    payloads, `NOT_THE_TICKET`, list-only reduction, no advance (03-Q4); asked/missingAsked,
    orphan, partial notice vs review refusal, not-captured first and second, args envelope
    (03-Q5 … 03-Q7, S8 03/04 mechanism); AC ids and stability (03-Q8).
11. `search` tests: `grepWords` (03-M1); harvest global matches and export filter (03-M2); layer
    order, per-layer record, skipped index, unknown layer (03-M3); term ranking and breadth
    (03-M4); collisions and the 6 KiB cut (03-M5); refs/find caps and entries (03-M6); guidance
    text (03-M7). `policy-stage.test.ts` (03-P1 … 03-P3).
12. `hook` tests: matrix routing and `agent_id` ignore (03-H1, 03-H2); plain question and plain
    ticket read launch nothing (03-H3, 03-H6); re-injection delivers once per epoch (03-H4);
    AskUserQuestion adapter on synthetic supported and unsupported payloads, both flag states
    (03-L1 … 03-L4, 03-H5); MCP no-route fast exit (03-H6); docs counts match `hooks.json`
    (03-H8).
13. `stop-check.test.ts`: a bad citation report blocks once; a conversational stop allows; the
    second failure allows; the note route checks the saved file **after** `note save` completed the
    route and cleared `active-route` (full lifecycle through `ended-route`, which is then removed);
    `route stop` → the next Stop checks the `exit` condition; a second Stop after that allows without
    reading the ledger; the guard sees no active route once completed; generated-section drift; consent
    and test claims; unreadable transcript → allow with `stop-unreadable`; 1 MiB tail; reason cap
    and `stop-check.md` (03-K1 … 03-K7); `redBeforeGreen` table (03-K4).
14. `investigate` integration: materialized `ts-feature-boundary` synthetic walk start → ground →
    read → next → report-step → note save → complete; ceremony 2 without and 3 with a requirement;
    no search call required to finish `read` (03-I1, 03-I2); body size and frontmatter (03-I3);
    no reference to the deleted files remains (03-I4); trigger graders flipped (03-V1, 03-V2).
15. Caps and timings (03-X1 … 03-X3). Every scenario failure prints code, release, missing evidence
    and the final Not verified block (02-scenarios supporting assertions).

## Done when

- [ ] Every rule id above appears in at least one test name, and all pass.
- [ ] S1, S9, S11, S12, S14 core tests pass; the S2, S3, S4, S5, S10, S13 mechanisms pass on
      fixture routes; the S6 bootstrap and S8 03/04 mechanisms pass; the full gate table passes.
- [ ] `npm run verify` is green after each milestone (03-W1 … 03-W7); the report states the counts.
- [ ] Files changed ⊆ the Files table, plus mechanical changes listed in the report; budgets are
      reported with actual line counts.
- [ ] `git diff` of `src/route/ownership.ts`, `src/review/*`, `evals/evals-core/` and
      `evals/evals-archived/` is empty; the guard files are unchanged under tmpdir outcome (a).
- [ ] Caps and timing medians are reported with numbers, or `pending` with the reason.
- [ ] The report lists the open user decisions (0-S, tmpdir fallback, P2/P48, 0-V, A) with the
      branch that is active, and the temporary diagnostics omission.
- [ ] Paid items: performed only with named authorization; otherwise `measurement pending`.
- [ ] The report follows 05-working-rules §4.

## Hand-off to steps 04–09 (after the user authorizes continuation at A)

- Everyone consumes `createEngine`, `ledgerRouteContext`, `consent`, `runCommandTail`, the fold
  and the registry. No step writes a second fold, consent predicate, ownership check, lock or tail.
- Step 04 extends `has-requirement.ts`, `template.ts`, `capture.ts`, `envelope.ts`, `acs.ts`, the
  registry raises and the null-server binding; it reuses the 03-Q6 branches.
- Step 05 extends `map.ts`, `harvest.ts`, `refs.ts` and `ecosystems.ts`; adds `relates` and the
  index adapter behind the same layer names.
- Step 06 binds the real plan route to the S2/S3/S4/S5/S10/S11/S13 mechanisms and the promotion
  fixtures; it relies on the pointer for the guard's plan-body allow (outcome of 03-S8 applies).
- Step 07 wires `check`/`format` into `runCommandTail`, adds the `before-checks` stage through
  `policyStage`, sets `defectBrief` for 03-K4, restores the investigate Diagnostics text, and
  converts its trigger cases. Steps 06/07/08/09 convert their trigger positives with
  `disable-model-invocation`.
- Step 09 writes and migrates config v3 and extends `ecosystems.ts`.
- When 0-S is decided, only `src/route/session.ts` (and `hooks.json`/guard for the updatedInput
  outcome) changes.

## Coverage of the v6 brief

| v6 step-03 requirement | Here |
|---|---|
| 00–02 integrated; use their APIs; spend $0; read list; inspect listed code | Prerequisites, Starting point |
| Owner list; no live plan/task/review/init/rules route; synthetic fixture routes | Prerequisites, Non-goals, Tests 7 |
| P2/P48 probe ≤ $1, synthetic interactive marker with gate and instance, key paths, headless auto-answer not proof, P48 separate, synthetic fixtures | 03-L5, 03-L2 |
| Unrun → adapters tested, runtime unsupported; P2 fail → non-acting `--answer` only, acting needs trusted preanswer; no headless authority or flag re-confirmation; present at A | 03-L1 … 03-L3, 03-A6 |
| P48 unsupported → explicit next instruction, +1 ceremony turn | 03-L4 |
| Config v3 fields; v1/v2 with notices and in-memory defaults; no file write; defaults printed; obsolete fields dropped with notices; unrelated fields preserved; `SUPPORTED_SCHEMA_VERSION` 3 for reading | 03-C1 … 03-C4 |
| Minimal `ecosystems.ts`, harvest reads it, step 09 extends the same table; no language names in routes/engine/steps; runner adapters stay | 03-C5, 03-C6, 03-M2 |
| routes.ts validation: when vocabulary, actors, qualified needs/produces, instruction ≤ 1,500, gate only human, non-acting default/release, acting metadata, target ordering/repeat exceptions, earlier producer, maxRevises, budget, exits; reject duplicate/missing ids, unknown handlers/predicates, invalid targets | 03-R1 … 03-R6 |
| Normalized DSL vs persisted gate fields distinct | 03-R9 |
| Complete gates.yaml; three review missing-source gates `policy review:stop`; `decision:*` keep open, no acting/object; dynamic options before validation/printing | 03-R7, 03-R8 |
| Build validates routes/registry/steps; package-candidate includes and validates them; no runtime gym imports | 03-R10 |
| Engine, port, consent, ownership per 01-contracts §1–7; one six-step algorithm | Contract, 03-E1, groups F/G/O |
| Outputs before completed; reprint/reinjection deliver only; completion is not verified | 03-E2 … 03-E4, 03-E11 |
| Fold chains, windows, qualified outputs; preanswers outside windows; bound answers only; onAnswer/onFail through revise and bounds | 03-F1 … 03-F6, 03-F12, 03-G3, 03-G5 |
| Read-only status | 03-E10 |
| Start resolves repo/config; init bootstrap before its route, fixture handler; slug helper | 03-E6, 03-E7 |
| Canonical args keep behavioural flags, exclude fresh/adopt; not text-only hash; recorded reading | 03-E8, D2 |
| Same session same args reprints; ownership first; adopt/fresh/taken-over; non-owning side-by-side | 03-O1 … 03-O5 |
| Session adapter per 0-S; pending → injected sessions only, paid walk waits; missing/stale/ambiguous → `session-unbound` with 0-S release; no single-route or latest-owner inference; harness trust needs P58, no channel flag | 03-S1 … 03-S6, 03-A2, D18 |
| Cache active-route in hook state; fallback scan; not authority; 50-task scan, < 20 ms is a proposal; clear on exit/completion, keep ledger | 03-S7, 03-S9, 03-E11 |
| (step 01 open item) tmpdir fallback | 03-S8, D18 |
| Serialize plan claim/takeover/write with step 02's lock and step 01's `ownerOf`; never reacquire or create another lock/fold | 03-O5, 03-O6, D3 |
| Fixture tests for two simultaneous claimants and stale writes | Tests 7 |
| Default-1 code steps rerun when covered; target bound decides | 03-F6 |
| Same-error ×2 offers blocked; missing produces ×3 records limit and advances | 03-F8, 03-F9, D8 |
| Partial review requirements refuse ground without completion/exit; onError must not overwrite | 03-Q6, 03-E9 |
| `ledger-unreadable` names a new slug | 03-E13 |
| Permission-denied after headless guard ask → blocked with detail and report lead | 03-E12, 03-E13 |
| Status contents: sessions/owner, outstanding steps, cycles, limits, layers, orphans | 03-E10, Contract `Position` |
| command-tail.ts once per wrapper; handlers tail-free; recursion/double-run tests | 03-T1, 03-T3, Tests 9 |
| Wire requirements normalize and note save; extension seam | 03-T2 |
| Register route/map/refs/find/requirements/policy --stage/report via SPECS/USAGE; `--json` without mixed output | 03-T8 |
| Prepare as one-release deprecated adapter through start; translation documented; model-run prepare is CLI/untrusted | 03-T6, D6 |
| CLI flags per v6/31; `--layers` → `search-layers-not-for-model` | Contract CLI syntax, 03-T7 |
| hasRequirement exactly v6/14 | 03-Q1 |
| Template: binding, field lists, one-level expansion, > 10 early stop before child reads, completion command with task | 03-Q2, D5 |
| Capture get/search/fetch/read, `NOT_THE_TICKET`, rawHash/relations/derivedFrom, list-only reduction, no hook advance | 03-Q3, 03-Q4 |
| Normalize captures or args; asked/missingAsked; list-only not a capture; orphan notice; not-captured first/second; partial notice/refusal by skill; coverage semantics here; 04 expands | 03-Q5 … 03-Q7, Hand-off |
| First acs splitter now; 04 extends; AC-<key>-<nn> as signal | 03-Q8 |
| Reuse locate scoring; grepWords; harvest top 8 globally with adapter filters, names and counts | 03-M1, 03-M2 |
| Map runs configured list in order (prompt/context), per-layer ms/hits, terms by pass, unavailable index layers skipped with limitation; no model layer selection | 03-M3, 03-T7 |
| Term ranking; breadth > 60% dropped | 03-M4 |
| First refs/find ≤ 4 KiB append search; step 05 adds the rest; no duplicate module | 03-M6, Non-goals, Hand-off |
| Policy.stage projects resolver; caps; overflow behind show; plan all but code-style; investigate omitted counts; no resolver rewrite; no check/worker | 03-P1 … 03-P3, D9 |
| Exact v6/30 matrix; remove Skill and Edit/Write post-hooks; reminder code unregistered | 03-H1, 03-H6, 03-H7 |
| Prompt launch on hook channel from user text; plain questions/ticket reads launch nothing; main thread only | 03-H2, 03-H3, 03-H6 |
| Ask hook binds exact instance; unbound diagnostic and reprint; decision:* mints instance+answer, no acting | 03-G4, 03-G6, 03-H5, D7 |
| Stop conditions; path/line, generated section hash/diff, consent/test claims, red-before-green; block once with limit; second allows; unreadable fails open, tail ≤ 1 MiB; bounded reason + stop-check.md until P17 | 03-K1 … 03-K7, D14, D15 |
| Update hook contracts, outcomes, compatibility, release checklist with actual hook count | 03-H8, Files |
| investigate.yaml per v6/22: template/fetch conditional; ground with envelope/map/before-work, repeat 2; scope gate; read without required search; report-step; write produces note; budget 6; ground on no-requirement start | 03-I1 |
| Read guidance contents | 03-I2, 03-M7 |
| Body ≤ 2 KiB with judgment, read-only reason, fallback, disable-model-invocation | 03-I3 |
| Delete shared prepare-output/requirements-mcp and READING_ORDER; inline replacements only | 03-I4, 03-M7 |
| Flip investigate trigger positives; remove `evals:triggers:gate`; keep suite and validity check; README text; later steps convert theirs; editing model-free, execution paid | 03-V1, 03-V2 |
| Package route/step files | 03-V3, 03-R10 |
| Diagnostics omitted until step 07; report the deviation; step 07 restores | 03-I2, Hand-off |
| Model-free proofs: schema, gate matrix, counters, parity, own completion, trusted/untrusted, session lookup, producer object, simultaneous ownership, crash replay, JSON and tail once, no plain-question launch, Stop fixtures, map layers | Tests 2–13 |
| S1, S9, S11, S12, S14 core; plan-shaped fixtures for S2/S3/S4/S5/S10/S13 | Tests 5–7, Done when |
| Materialized ts-feature-boundary walk; ceremony 2/3; no search call required | Tests 14 |
| Caps on built outputs; no limit raised | 03-X1 |
| 20-spawn timing medians; ≤ 3 s start on three repos; missing snapshots pending | 03-X2 |
| Affected tests and `npm run verify` before paid runs | Done when, 03-W |
| Walk/decide prerequisites, flags, primary checkout; population confirmation; 10 × 3 localize; estimate not authorization; record interpretation; review measurements wait for 08 | 03-A1, 03-A2 |
| Gate command; turns sentinel; offline gate rerun; thresholds unchanged | 03-A3 |
| Reported measures; noise band; absences vs scored outcomes; new control; equivalence unverified; version mismatch refuses | 03-A4 |
| A criterion; user decides; failing detail; unrun not met | 03-A5 |
| P2/P58 limitations at A; consent never relaxed; proceed/cut down/abandon; fallback needs a new step file; no 04–09 before authorization | 03-A6 |
| (V7 reconciliation) one gate-print writer shared by handler raises and later command-raised gates | 03-G13 |
