# Step 09 — Init and rules: proposal, accepted config v3, doctor, ecosystem adapters, rule drafts

> Prerequisites: steps 00–05 integrated; decision A: proceed. Dispatch order: after 05, before 06.
> 5-I: none until user decision. Spend: $0. Read [05-working-rules.md](05-working-rules.md) first;
> it governs this brief, the review and the report.
> Normative sources (read the sections, not the whole files): [01-contracts](01-contracts.md) §1, §3,
> §5, §7, §8; [v6/20](../v6/skills/20-init.md) and [v6/21](../v6/skills/21-rules.md) whole;
> [v6/11](../v6/modules/11-policy.md) §3–§4 and Failure modes; [v6/10](../v6/modules/10-search.md) §1
> (layer lists, adapter table), §4 (the `index/` ignore line) and Failure modes;
> [v6/32](../v6/32-artifacts.md) §1, §3, §4, §5; [v6/12](../v6/modules/12-route.md) §1, §2.1, §3.4, §3.5,
> §8 ("Standalone commands"); [v6/15](../v6/modules/15-guard.md) §1 (init deny rows);
> [v6/30](../v6/30-harness.md) §9; [v6/01](../v6/01-goals-and-constraints.md) D2, D8, D9, D18, R4, R16;
> [v6/40](../v6/40-open-problems.md) P16, P24, P57; [v6/41](../v6/41-migration.md) "Compatibility".

## Goal

Today `init` writes `config.yaml` and `.gitignore` on its first run, and `rules` lets the model edit
config and make packs live with no confirmation (F7). After this step `init` only proposes; one gate
with a non-acting default decides; `init --apply --set` writes config v3 and the ignore lines on an
honoured acceptance with the exact accepted values, then `doctor` proves every non-null command
starts. `rules` writes drafts with verbatim quotes, `policy check --drafts` verifies them, and
`rules apply` wires packs only on an honoured `rules-table` acceptance; `rules revert` undoes one pack.

## Starting point

Recheck these at dispatch. Code planned by steps 03–05 does not exist at the time of writing; it is
named here as those steps' v6 briefs and the [00-README](00-README.md) ownership table name it. Use
the actual symbols from their reports, and list any renamed symbol in this step's report.

- `src/cli/commands/init.ts` (133 lines): `INIT_OPTIONS = {flags: ['json','dry-run']}`, `runInit`,
  `renderInit`, `addIgnoreEntries`. Without `--dry-run`, `runInit` writes `config.yaml` and the
  `IGNORE_ENTRIES` lines at once. Its output lists each project's LSP `navigation` block.
- `src/config/init.ts` (342 lines): `planInit` → `createFresh` (a new `Document`, header comment,
  `requirements.lsp` filled with LSP plugin names) or `updateExisting` (YAML document API, comments
  kept, adds missing slots only, never overwrites a set value); `detectRuleSources` (existence of
  `CLAUDE.md`, `CONTRIBUTING.md`, `docs`, `.cursor/rules`, `.github/instructions`,
  `.github/copilot-instructions.md`).
- `src/config/detect.ts` (401 lines): `detectProjects` (manifest roots: `package.json`,
  `pyproject.toml`; depth 4), `detectTypescript` / `detectPython` (argv forms such as
  `./node_modules/.bin/eslint -- {files}` and `./.venv/bin/ruff check -- {files}`), `suggestedPacks`,
  `detectBaseline`. No formatter or index-tool detection.
- `src/config/defaults.ts`: `DEFAULTS`, `SHORTLIST_DEFAULTS`, `CONFIG_FILE`, `TASKS_DIR`,
  `PROJECT_POLICIES_DIR`, `IGNORE_ENTRIES = ['.ambicode/reviews/', LEGACY_NOTES_DIR, '.ambicode/task/']`.
- `src/contracts/policy.ts` (140 lines): `PolicyRule` (strict; `id, category, instruction, check,
  remindOnEdit`), `PolicyPack` (pack-level `source: {location, externalVersion?}`).
- `src/cli/commands/policy-check.ts` (299 lines): `POLICY_CHECK_OPTIONS = {values: ['project'],
  flags: ['json'], positionals: true}`, `runPolicyCheck` (opens the workspace, validates positional
  files with `validatePack`/`validatePackSet`, counts glob matches, `pack-glob-matches-nothing`).
- `src/policy/{load,validate,resolve,provenance}.ts`; `src/checks/authorize.ts`: `authorizeCommand`
  (forbid/undeclared refuse, propose needs approval). 12 built-in packs under `policies/`, 56 rules.
- `src/cli/main.ts` (400 lines): `SPECS`, `USAGE`, `dispatch`; multiword names resolved at the
  `const name = …` line; `src/cli/args.ts` `OptionSpec` supports `repeated`.
- `skills/init/SKILL.md` (4,199 bytes): `disable-model-invocation: true`; `allowed-tools` includes
  `Write(.ambicode/config.yaml)` and `Edit(.ambicode/config.yaml)`. `skills/rules/SKILL.md`
  (9,994 bytes): `disable-model-invocation: true`; `allowed-tools` includes `Write(.ambicode/policies/**)`
  and `Edit(.ambicode/config.yaml)`. `skills/rules/references/pack-format.md` (28 lines).
- `fixtures/definitions.mjs`: `FIXTURES` has 20 entries. `fixtures/materialize.mjs` (210 lines):
  `--ambicode-init` runs `<bundle> init --json` and commits the result. 78 tracked files use
  `--ambicode-init` (every `evals/evals-triggers` and `evals/evals-archived` scaffold).
- About 40 test call sites use `runInit(runtime, parseArgs('init', [], INIT_OPTIONS))` only to create
  a config (`src/cli/prepare.test.ts` 18, `bundle-fs.test.ts` 4, review, hook, locate, view tests).
- `evals/evals-triggers`: 28 cases. No grader asserts that `ambicode:init` or `ambicode:rules` fires
  (the `*-fired` graders name investigate, plan, task and review only).
- From step 01: `src/hook/guard/guard-core.ts` denies Write/Edit on `.ambicode/config.yaml` and
  `.gitignore` when the active-route pointer's skill is `init`. The pointer is read only from
  `<scratchpad_dir>/ambicode-hook-state/active-route`; the tmpdir fallback is an open decision (a/b/c,
  step-01 report). `skills/review/references/outcomes.md` has "Init owns its files".
- From step 02 ([step-02-evidence](step-02-evidence.md) Contract): `withLedgerLock`, `LockedLedger`,
  `appendLedger`, `readLedgerStrict`, `resolveTaskDir`/`taskDirFor`, `parseEntry`, the `policy` kind
  schema (loose, D4), the `step` kind (`file`, `bytes` optional), `ArtifactRef`, `contentHash`,
  `session-unbound`.
- From step 03 ([step-03](step-03-route-engine-investigate.md) Contract, groups C, R, G, T):
  config v3 reader and defaults in `src/contracts/config.ts` / `src/config/load.ts`
  (`loadConfigWithNotices`) with `SUPPORTED_SCHEMA_VERSION = 3` for reading, v1/v2 legacy notices,
  and writing left at v1 (03-C1); the minimal ecosystem table `src/config/ecosystems.ts`
  (`ECOSYSTEMS` `{sourceGlobs, declarationPatterns, exportFilter, i18nGlobs}` and
  `FALLBACK_ECOSYSTEM`, 03-C5; `sourceGlobs` still reference `SHORTLIST_DEFAULTS` in `defaults.ts`;
  `Ecosystem` = `typescript | python`); `src/route/` `routes.ts` (DSL validation, build), `gates.ts`
  (registry, dynamic options instantiated from raise values only, `raiseGate`), `handlers.ts`
  (`HandlerRegistry`), `engine.ts`,
  `consent.ts`, `context.ts` (`RouteContextPort`, `ConsentResult`), `command-tail.ts` (one tail per
  evidence-writing wrapper, extension seam); `routes/gates.yaml` with `config-unparsable` (`acting:
  ["back up and regenerate"]`, no `onAnswer`, 03-R7); init's
  repository-only bootstrap and its fixed `task/init-<date>` ledger directory; the 0-S session
  adapter; the full gate-table test; the Stop hook's generated-section check; package-candidate
  inclusion of `routes/*.yaml` and `routes/steps/*.md`; skill body cap tests.
- From step 04 ([step-04](step-04-requirements.md) Contract, Config): the nullable config
  value `requirements.acceptanceField` (schema and default; step 09 proposes and writes it).
- From step 05 ([step-05](step-05-search.md) Contract, 05-B1 … 05-B6): `IndexAdapter` with
  `src/code-intelligence/index/{none,codeindex}.ts`; `index build` refuses (`index-not-ignored`)
  unless `.ambicode/index/` is gitignored, and `startIndexBuild(deps, project)` spawns nothing and
  returns state `error` in that case (05-B4); `indexGrammar` per ecosystem; `map` runs only the
  configured layers; the 5-I report.

## Files

Budgets are source lines, tests excluded (05-working-rules §2.3). As a guide, tests for this step
should total about 1,800 lines.

| File | Action | Budget | Purpose |
|---|---|---|---|
| `src/config/ecosystems.ts` | change | +120 | adapter facts per ecosystem: manifests, source globs (`SHORTLIST_DEFAULTS` move here from `defaults.ts`; step 03 left them there), formatter adapters, command probes, i18n location (step 03's `i18nGlobs`), index grammars (step 05's `indexGrammar`) |
| `src/config/detect.ts` | change | +80 | ecosystem per project from the table; formatter and index-tool detection; unknown ecosystem |
| `src/config/init.ts` | change | 420 | v3 fresh document; 1/2 → 3 migration through the document API; `--set` overrides; no LSP fields |
| `src/config/init-sets.ts` | create | 90 | `parseSet`, `canonicalSets`, `SETTABLE_KEYS` |
| `src/config/proposal.ts` | create | 160 | `buildProposal`: the dry-run shape, gitignore lines, layers, index, 6 KB cap |
| `src/config/apply.ts` | create | 170 | `applyInit`: consent, value match, config and ignore write, doctor call |
| `src/config/doctor.ts` | create | 160 | `runDoctor`: probes, policy decision, table, detached index build |
| `src/config/init-route.ts` | create | 110 | code handlers `init.propose`, `init.close` |
| `src/config/defaults.ts` | change | ±10 | ignore lines; `DEFAULTS.schemaVersion` 1 → 3 (step 03 left writing at v1, 03-C1) |
| `src/contracts/config.ts`, `src/contracts/primitives.ts` | change | ±10 | project `ecosystem` widened to a kebab-case string (D6) |
| `src/contracts/policy.ts` | change | +15 | `RuleSource`; optional `PolicyRule.source`; `DraftPolicyRule` |
| `src/policy/drafts.ts` | create | 200 | draft listing, quote verification, near-duplicate detection |
| `src/policy/rules.ts` | create | 230 | `discoverRules`, `applyRules` (consent, object, write, probes), `revertRule` |
| `src/policy/rules-route.ts` | create | 120 | code handlers `rules.discover`, `rules.context`, `rules.draftsCheck`, `rules.close` |
| `src/task/kinds.ts` | change | ±10 | optional `policy` fields for `stage: 'drafts' \| 'apply'` (09-T3) |
| `src/cli/commands/init.ts` | change | 170 | `--dry-run`, `--apply`, `--set`, `--task` wrapper; rendering; tail |
| `src/cli/commands/doctor.ts` | create | 60 | the `doctor` wrapper |
| `src/cli/commands/rules.ts` | create | 140 | `rules discover`, `rules apply`, `rules revert` wrappers |
| `src/cli/commands/policy-check.ts` | change | +70 | `--drafts`, `--task`, the `policy` entry, tail |
| `src/cli/main.ts` | change | +35 | `doctor`, `rules discover\|apply\|revert` in SPECS, USAGE, dispatch; new init options |
| `src/route/handlers.ts` | change | ±10 | register the six handlers (mechanical) |
| `src/route/gates.ts` | change | ±40 | the question-text seam: per gate id a print-time `{line, offered?}`, registered by modules; `offered` ⊆ declared options and always contains default and release; init-apply's `Values:` line and offered set (09-G1, 09-G2) are its first user, steps 07 and 08 register on it. Step 03 instantiates options only |
| `routes/init.yaml`, `routes/rules.yaml` | create | 40, 60 | the two routes (09-R1, 09-T1) |
| `routes/steps/init-*.md`, `routes/steps/rules-*.md` | create | — | instructions, each ≤ 1,500 characters |
| `routes/gates.yaml` | change | ±4 | `config-unparsable`: `onAnswer: {"back up and regenerate": revise $raisedBy}` (09-P6); `acting` is already set by 03-R7 |
| `skills/init/SKILL.md`, `skills/rules/SKILL.md` | change | ≤ 1,536 / ≤ 2,560 bytes | bodies and `allowed-tools` (09-R3, 09-T7) |
| `skills/rules/references/pack-format.md` | change | — | rule `source.quote` / `source.location` |
| `fixtures/materialize.mjs` | change | ±25 | `--ambicode-init` writes config through the pure writer (D15) |
| `src/testing/init-config.ts` | create | 30 | test helper replacing `runInit` as config setup (D15) |
| `docs/policy-authoring.md`, `docs/rule-migration.md`, `docs/installation.md` | change | — | 09-W1 |
| `skills/review/references/outcomes.md` | change | — | the codes in Contract |
| `evals/evals-triggers/*` | change, only if needed | — | 09-M3 |

Unchanged in this step: `src/policy/resolve.ts` (02 §6: "no measured defect"), `src/policy/load.ts`
except schema acceptance of `source`, `hooks/hooks.json`, the guard's parser and decisions,
`src/route/ownership.ts`, `src/code-intelligence/navigation.ts`, `skills/{investigate,plan,task,review}/SKILL.md`,
`evals/evals-archived/**` (archived eval stays unchanged; its scaffolds keep calling
`--ambicode-init`). The ~40 `runInit` setup call sites change mechanically to the helper; list them
under *Files* in the report.

## Contract

```ts
// src/config/init-sets.ts
export const SETTABLE_KEYS: readonly RegExp[];   // see 09-G3
export type SetValue = string | null | readonly string[];
export function parseSet(raw: string): { key: string; value: SetValue };          // bad-argument on failure
export function canonicalSets(pairs: readonly { key: string; value: SetValue }[]): string;
  // sorted by key, `key=<JSON value>` joined by one space; '' for no pairs

// src/config/proposal.ts
export interface InitProposal {
  command: 'init'; mode: 'dry-run';
  configPath: string; configState: 'missing' | 'current' | 'legacy' | 'unparsable-backed-up';
  projects: { id: string; root: string; ecosystem: string; adapter: 'known' | 'unknown';
    commands: Record<string, readonly string[] | null>; format: readonly string[] | null; packs: string[] }[];
  ruleSources: string[];
  gitignore: { missing: string[]; present: string[] };
  index: { proposed: 'none' | 'codeindex'; tool: string | null; decision5I: string };
  searchLayers: { prompt: string[]; context: string[] };
  acceptanceField: { current: string | null; candidates: string[] };
  removedFields: string[];             // requirements.lsp, task.lspPlugins, search.exactMaxFiles present in the file
  changes: string[]; notices: string[]; noticesOmitted: number;
  values: string;                      // canonicalSets of the overrides this proposal was built with
  applyLine: string;                   // the exact `init --apply --task <slug> [--set …]` line
}
export function buildProposal(runtime: Runtime, repositoryRoot: string,
  overrides: readonly { key: string; value: SetValue }[]): Promise<InitProposal>;

// src/config/apply.ts
export interface ApplyDeps { runtime: Runtime; session: string | null; context: RouteContextPort | null }
export function applyInit(deps: ApplyDeps, input: { task: string; sets: readonly string[] }): Promise<{
  configPath: string; created: boolean; changes: string[]; notices: string[];
  gitignoreAdded: string[]; doctor: DoctorTable }>;
export function writeConfig(fs: FileSystem, repositoryRoot: string, proposal: InitProposal,
  overrides: readonly { key: string; value: SetValue }[]): Promise<{ created: boolean; changes: string[];
  gitignoreAdded: string[] }>;       // pure writer: no consent check; callers in 09-G4 and D15 only

// src/config/doctor.ts
export interface DoctorRow { project: string; slot: string; argv0: string; resolved: string | null;
  probe: readonly string[] | null; result: 'ok' | 'failed' | 'not-found' | 'timeout' | 'null' | 'not-run';
  detail: string }
export interface DoctorTable { rows: DoctorRow[]; index: string | null; text: string; hash: string }
export function runDoctor(runtime: Runtime, repositoryRoot: string, config: AmbicodeConfig,
  options?: { project?: string }): Promise<DoctorTable>;

// src/contracts/policy.ts
export const RuleSource = z.strictObject({ quote: z.string(), location: z.string().min(1) });
// PolicyRule gains `source: RuleSource.optional()`; DraftPolicyRule = PolicyRule with `source` required

// src/policy/drafts.ts
export const DRAFTS_DIR = '.ambicode/policies/drafts';
export const DUPLICATE_SIMILARITY: number;                    // 09-Q4
export function checkDrafts(runtime: Runtime, workspace: Workspace, options: { project: string | null;
  taskDir: TaskDir | null }): Promise<DraftsCheck>;
export interface DraftsCheck { files: { path: string; contentHash: string; packId: string | null }[];
  diagnostics: Diagnostic[]; rulesBySource: Record<string, number>; notMigrated: { rule: string; reason: string }[];
  aggregateHash: string; ok: boolean }

// src/policy/rules.ts
export function discoverRules(runtime: Runtime, args: readonly string[]): Promise<RulesDiscovery>;
export function applyRules(deps: ApplyDeps, input: { task: string; project: string | null }): Promise<RulesApplied>;
export function revertRule(runtime: Runtime, packId: string, project: string | null): Promise<{ from: string; to: string }>;
```

**CLI** (each with `--json`; no invalid mixed output):

```text
init [--dry-run] [--task <slug>]                       # writes nothing (D1)
init --apply --task <slug> [--set <key>=<value>]…      # ⤵ evidence-writing; doctor runs inside
doctor [--project <id>]
policy check --drafts [--project <id>] [--task <slug>] # ⤵ when --task names a live rules route
rules discover [--json] [sources…]
rules apply --task <slug> [--project <id>]             # ⤵
rules revert <pack-id> [--project <id>]
```

**Persisted.** Config v3 as written by `init --apply` (v6/32 §5, v6/20 "Config written by init"):
`schemaVersion: 3`; `search.index: none|codeindex`; `search.layers.prompt: [shortlist, harvest,
shortlist]` (+ `index.find` when index ≠ none); `search.layers.context: [grep, harvest]`
(+ `index.relates` when index ≠ none); `workers.approved: []`; `guard.askOutsideMap: false`;
`review.onInvalid: void`; `projects[].commands.format: null | {argv}`; `requirements.acceptanceField:
null | <id>`. Removed on write: `requirements.lsp`, `task.lspPlugins`, `search.exactMaxFiles`.
Gitignore lines: `.ambicode/index/`, `.ambicode/metrics.jsonl`, `.ambicode/reviews/`,
`.ambicode/task/`, the legacy notes directory. Ledger: `policy {stage: 'drafts', path, contentHash,
drafts[], errors}` from `policy check --drafts --task`; `policy {stage: 'apply', packs[], probes[]}`
from `rules apply`. Files: `<initTask>/steps/proposal.json`, `<initTask>/steps/doctor.md`,
`<rulesTask>/steps/rules-apply.md`, `.ambicode/config.yaml.bak-<localTimestamp>`.

**New error codes**, each documented in `skills/review/references/outcomes.md` with its release:
`init-unconfirmed` (with `reason`: `no-init-route`, a `ConsentResult` refusal reason, or
`values-differ`; release: answer the init gate in `/ambicode:init`), `rules-apply-unconfirmed`
(with `reason`: `no-rules-route`, a refusal reason, or `object-changed`; release: the `rules-table`
gate; headless default: do not apply). New diagnostics: `pack-quote-missing` (error; release: fix the
quote or drop the rule; after 3 writes "not migrated"), `pack-duplicates-builtin` (warning naming the
built-in rule). Documented if not already present: `search-layer-unknown`,
`search-layers-not-for-model`, and the `config-unparsable` gate.

## Rules

**C — config v3 writer and migration** (v6/32 §5; v6/41 "Compatibility")
- 09-C1 This step builds no second config schema or reader. It writes what step 03's reader accepts
  and extends step 03's loader tests only for the writer's output.
- 09-C2 A fresh config written by `init --apply` has every field of the Persisted list, with
  `schemaVersion: 3`, and has no `requirements.lsp`. Each project's `ecosystem` field is the adapter
  name (no separate persisted adapter block).
- 09-C3 Applying to a schema 1 or schema 2 file migrates it to 3 through the YAML document API:
  `schemaVersion` set to 3; `requirements.lsp`, `task.lspPlugins`, `search.exactMaxFiles` deleted,
  each named in a notice (D8); the missing v3 fields added with the values of 09-C2; every comment and
  every other existing value kept byte-for-byte in place.
- 09-C4 On an existing current file, detection fills missing slots only and never overwrites a set
  value, including an explicit `null` command (`updateExisting`'s rule). Accepted `--set` pairs
  override their slots (D17). The output lists every change as one `changes` line.
- 09-C5 `config-schema-too-new` keeps its message shape. A file declaring `schemaVersion: 4` makes
  `init --dry-run` and `init --apply` fail with it, writing nothing.
- 09-C6 `init` no longer prints the LSP `navigation` block, writes no LSP notice, and never reads
  `claude plugin list` (P24 closed).

**E — ecosystem adapter table** (R16, D18; v6/10 §1; v6/20 step 1)
- 09-E1 Extend step 03's `src/config/ecosystems.ts`, same file and symbols. Each entry (`typescript`,
  `python`) adds: manifest file names; source globs (`SHORTLIST_DEFAULTS` live here); the TypeScript
  `export` filter stays step 03's `exportFilter`; i18n location (`assets/i18n/*.json` for
  `typescript`, none for `python`); formatter adapters in detection order (09-E3); a command probe per
  runner adapter (09-D2); index grammar names.
- 09-E2 `detectProjects` takes manifests from the table. `init` writes the detected name into the
  project's `ecosystem`. `map`, harvest and format read the table by that name.
- 09-E3 Formatter detection fills `commands.format`: `typescript`: `./node_modules/.bin/prettier`
  present → `{argv: ['./node_modules/.bin/prettier', '--write', '--', '{files}']}`; `python`:
  `<venv>/bin/black` → `[bin, '--', '{files}']`, else `<venv>/bin/ruff` → `[bin, 'format', '--',
  '{files}']`; declared but not installed → `null` with a notice (the lint pattern); nothing → `null`.
- 09-E4 A repository with no recognised manifest gets one root project with `ecosystem: unknown`
  (D6) and the notice `unknown ecosystem: shortlist and grep only`. A table lookup of a name not in
  the table returns `null`; callers fall back to shortlist and grep and the route still runs.
- 09-E5 Ecosystem facts stay in adapters. Existing runner adapters (`src/checks/adapters.ts`) and
  synthetic fixture names are legitimate and stay where they are.

**P — proposal** (`init` without `--apply`; v6/20 step 1)
- 09-P1 `init` and `init --dry-run` write nothing outside the init task directory and print an
  `InitProposal` (`--json`) or its rendering. Missing config is normal input, never `config-missing`.
  The init path uses `openRepository`, never `openWorkspace`.
- 09-P2 The proposal contains every `InitProposal` field. `gitignore.missing` is computed against the
  existing `.gitignore` with the current anchoring rule (`/x/` equals `x/`).
- 09-P3 Index tooling: `codeindex` found in `<root>/node_modules/.bin/` or on `PATH` sets
  `index.tool`. Decision 5-I unknown/failed/no authorized change → propose none; never auto-append index layers based on detected tool alone. Honor explicit user index choice, write layers visibly, and refuse index build without ignore acceptance.
  `index.decision5I` prints the state the dispatch supplied (default `pending`).
- 09-P4 `searchLayers` are the v6/10 §1 defaults, plus `index.find` / `index.relates` only when the
  index in the proposal (after overrides) is not `none`. An existing file's explicit lists are
  proposed unchanged except for adding or removing those two index layers when the index changes.
- 09-P5 The `--json` proposal is at most 6,144 bytes on each of the `FIXTURES`. Above that size,
  `notices` are dropped from the end and counted in `noticesOmitted`.
- 09-P6 An existing config that fails YAML parsing raises the registry gate `config-unparsable`
  (*back up and regenerate* / *stop*, default and release *stop*). *back up and regenerate* is acting
  and re-enters `propose` (`onAnswer: revise $raisedBy`). With an honoured answer, `propose` copies
  the file to `.ambicode/config.yaml.bak-<localTimestamp>` with `createExclusive`, **before** it builds
  the proposal from detection alone (`configState: 'unparsable-backed-up'`). Without one, nothing is
  copied and nothing else is written.

**G — the init-apply gate and `init --apply`** (v6/20 steps 3–5; v6/12 §3.4, §8)
- 09-G1 The `init-apply` gate declares `options: [Apply as proposed, Apply as adjusted, Adjust,
  Cancel]`; `acting: [Apply as proposed, Apply as adjusted]`; default and release *Cancel*
  (non-acting: writes nothing); `onAnswer: {Adjust: revise init-apply, "*": revise init-apply}`;
  `maxRevises: 3`. So `acting ⊆ options` (03-R5) and both `gate.init-apply.is(Apply as …)`
  predicates name declared options (03-R2). Each print is one `AskUserQuestion` offering three of
  them, chosen through the question-text seam: no adjustment in force (no free-text answer in the
  chain since the route start, or the latest one parsed to no values) → *Apply as proposed* /
  *Adjust* / *Cancel*; an adjustment in force → *Apply as adjusted* / *Adjust* / *Cancel*. The print
  records the offered list in the gate entry's `options` field (step 03's persisted field).
- 09-G2 Every print's question carries one line `Values: <canonicalSets>` (`Values: as proposed`
  for none) and the option descriptions name the exact `applyLine`. A free-text answer is parsed with
  `parseSet` per whitespace-separated token. The re-print quotes the human's text, shows the adjusted
  `Values:` line and offers *Apply as adjusted* / *Adjust* / *Cancel*. Tokens that do not parse are
  listed as `not understood: …` and leave the previous values in place.
- 09-G3 `SETTABLE_KEYS`: `requirements.mcpServer` (string or `null`), `requirements.acceptanceField`
  (string or `null`), `search.index` (`none` | `codeindex`), `projects.<id>.commands.<slot>` with
  `<slot>` ∈ `lint|unit|e2e|format` (`null` or a JSON array of strings with at least one element).
  Any other key, an unknown project id, a repeated key or an unparsable value → `bad-argument`
  (field `--set`).
- 09-G4 `init --apply` runs these checks in this order and writes nothing before the last passes:
  1. `session === null` → `session-unbound`.
  2. `view = context.resolve(task, session)`; null or `view.skill !== 'init'` →
     `init-unconfirmed {reason: 'no-init-route'}`; then `context.assertOwner(view)`.
  3. `consent = context.consent(view, 'init-apply')` must be `honoured`, from an `acceptance` with
     `answer` *Apply as proposed* or *Apply as adjusted*, `via: hook` with a non-null `instance` or
     `via: prompt`, and no `unbound`. Otherwise `init-unconfirmed` with the consent's reason or
     `not-accepted`. `via: flag` is refused on every channel and mode.
  4. The `Values:` line of the gate entry whose id is `consent.source.instance`, canonicalized, must
     equal `canonicalSets` of the typed `--set` pairs → else `init-unconfirmed {reason:
     'values-differ'}`, naming both lines.
  5. If the config file is unparsable, the chain must hold an honoured `config-unparsable` answer and
     a `.bak-` file with identical bytes → else `config-unparsable`.
- 09-G5 Then, in order: `writeConfig` (YAML through the document API), the missing gitignore lines
  appended (30 §9: written now, on acceptance), `runDoctor`, `steps/doctor.md` written, the result
  printed, and the command tail invoked exactly once. A doctor failure does not fail the command
  (exit 0).
- 09-G6 *Cancel*, the headless default and `default-taken {never-asked|unanswered}` write nothing.
  `init.close` then prints the proposal path, the exact `applyLine`, and that
  `.ambicode/task/init-<date>/` is untracked until an applied config ignores it, with
  `rm -r .ambicode/task/init-<date>` as the clean-up. Nothing outside that directory is named for
  removal.
- 09-G7 A model-typed `route next --answer init-apply=<acting option>` records `declined {via: flag,
  reason: acting-needs-human}` (step 03) and `init --apply` then refuses (09-G4.3).

**D — doctor** (v6/20 step 5)
- 09-D1 `runDoctor` emits one row per command slot of each project (or of `--project`). A `null`
  slot gives `result: 'null'`. It never edits config: a failing command is reported, not nulled.
- 09-D2 Per non-null command: resolve `argv[0]` (relative to the project root, or a `PATH` search) →
  `not-found` when absent. Decide with `authorizeCommand` against the project's resolved policy for
  activity `task`, with no approvals: refused or needs-approval → `not-run`, `detail` = the policy
  reason. Otherwise run the adapter's probe (D5) with a 15 s timeout: exit 0 → `ok`; nonzero →
  `failed` with the exit code and the first stderr line; timeout → `timeout`.
- 09-D3 When `search.index` is not `none`, `runDoctor` calls step 05's `startIndexBuild(deps,
  project)` (detached `index build`) and puts its returned status (`building`, or state `error` with
  the reason, e.g. the index directory not ignored) in `index`. It does not wait.
- 09-D4 `text` is a fixed-width table followed by `<!-- ambicode doctor <hash> -->`, where `hash =
  contentHash(table)`. Same config and same probe results give the same bytes.
- 09-D5 Standalone `doctor` prints the table and writes nothing. Inside `init --apply`, the table is
  also written to `<initTask>/steps/doctor.md`; that file is what the Stop hook's check (b) compares
  the model's read-back with (step 03's generated-section mechanism).

**R — init route and skill** (v6/20; v6/12 §2.1)
- 09-R1 `routes/init.yaml`: `propose` (code, `init.propose`; writes `steps/proposal.json`, payload the
  proposal) → `init-apply` (human, 09-G1; the print carries the guidance of v6/20 step 2: list the
  visible Jira/Confluence MCP servers and the `Adjust` pair that selects one) → `apply` (model,
  `when: gate.init-apply.is(Apply as proposed)`) and `apply-adjusted` (model, `when:
  gate.init-apply.is(Apply as adjusted)`), both with `file:routes/steps/init-apply-run.md` ("run the
  line printed with the option the human chose") → `close` (code, `init.close`: the read-back guidance
  after an apply, else 09-G6). `budget: {modelSteps: 2}`. No language or ecosystem name (09-M2).
- 09-R2 Ceremony: 1 gate + 1 work command (`init --apply`) on the Apply path; 1 gate on the Cancel
  path. No `route next` is required on either path.
- 09-R3 `skills/init/SKILL.md` ≤ 1,536 bytes: purpose, the fallback start line, how to present the
  proposal, the one gate. `allowed-tools` loses `Write(.ambicode/config.yaml)` and
  `Edit(.ambicode/config.yaml)`. `disable-model-invocation: true` stays.
- 09-R4 Cancel or default leaves only `.ambicode/task/init-<date>/`: no config, no ignore line, no
  index, no backup. Missing config reaches the proposal; unparsable config reaches `config-unparsable`
  without calling `openWorkspace`.

**Q — drafts, quotes, duplicates** (v6/11 §4; v6/21 steps 4–5)
- 09-Q1 Drafts live in `.ambicode/policies/drafts/*.yaml`. They are never loaded as live policy.
  Each draft rule must carry `source: {quote, location}` (`DraftPolicyRule`); built-in and live
  rules may carry it. `quote` is at least 20 characters after whitespace collapse.
- 09-Q2 `policy check --drafts` validates every `*.yaml` in `DRAFTS_DIR` (positional files with
  `--drafts` → `bad-argument`) with the existing loader validation, glob counts and the two checks
  below. It prints `rulesBySource`, the total rule count, diagnostics, and `notMigrated` when present.
- 09-Q3 Quote verification (D11): `location` is a repository-relative file path, optionally suffixed
  `:<line>` or `#<anchor>` (ignored), or an `https://` URL. A file location passes when the quote,
  whitespace-collapsed, is a case-sensitive substring of the whitespace-collapsed file text. A URL
  passes when a captured payload under `<task>/requirements/*.json` has `url` equal to the location
  and its `content` contains the quote the same way. Otherwise `pack-quote-missing` (error) naming the
  rule and the reason (`not in file`, `file missing`, `source not captured`).
- 09-Q4 Near-duplicates: similarity = 1 − Levenshtein distance / longer length, over instructions
  lowercased and whitespace-collapsed. A draft rule with similarity ≥ `DUPLICATE_SIMILARITY` to a
  built-in rule gets `pack-duplicates-builtin` (warning) naming the built-in `pack/rule`. The constant
  is the smallest multiple of 0.05 strictly above the highest similarity between two built-in rules;
  its code comment records that measured value (P16).
- 09-Q5 With `--task` naming a rules route owned by the caller, the command appends `policy {stage:
  'drafts', path: DRAFTS_DIR, contentHash: aggregateHash, drafts: files, errors}` inside one
  `withLedgerLock` and invokes the tail once. `aggregateHash = contentHash` of the sorted lines
  `<path> <contentHash>`. Without `--task` it writes nothing and runs no tail.

**T — rules route, table, apply, revert** (v6/21; v6/11 §4)
- 09-T1 `routes/rules.yaml`: `discover` (code, `rules.discover`, payload ≤ 2,048 bytes) →
  `sources` (human: dynamic `{sources…}` from discovery plus *none — stop*; non-acting; default = the
  files named in args, else *none — stop*; release *none — stop*) → `context` (code, `rules.context`:
  `config --json` for the projects and their built-in rules, ≤ 4,096 bytes; *none — stop* →
  `onError: stop:human`) → `draft` (model, `repeat: 3`, `file:routes/steps/rules-draft.md`, ends with
  `policy check --drafts --task <slug> --project <id>`) → `drafts-check` (code, `rules.draftsCheck`,
  consumes the check's entry, `produces: [policy{drafts}]`, `onFail: revise draft`) → `rules-table`
  (human, 09-T2) → `apply` (model, `when: gate.rules-table.is(Apply all)`, `produces:
  [policy{apply}]`) → `close` (code, `rules.close`). `budget: {modelSteps: 8}`.
- 09-T2 `rules-table`: options *Apply all* / *Apply with changes* / *Discard drafts*;
  `acting: [Apply all]`; `object: policy{drafts}` (D8); default and release *Discard drafts*
  (non-acting: applies nothing, deletes nothing; the drafts stay, D9); `onAnswer: {Apply with changes:
  revise draft, "*": revise draft}` with the free text substituted for `$answer` in the draft
  re-entry; `maxRevises: 3`. The print carries the disposition-table guidance (one row per rule,
  applied or not migrated with the reason, duplicates named).
- 09-T3 After the third failing `drafts-check` in a cycle, the step's output lists `not migrated:
  <code>` per failing rule and the route moves forward to `rules-table` (step 03's bound). The
  `revise draft` loop stops at 3 writes with a permanently bad quote.
- 09-T4 `rules apply` checks, in order, writing nothing before the last passes: `session === null` →
  `session-unbound`; `view` for `--task` with `skill: 'rules'` (else `rules-apply-unconfirmed
  {reason: 'no-rules-route'}`) and `assertOwner`; `consent(view, 'rules-table')` honoured, answer
  *Apply all*, `via: hook` with an instance or `via: prompt`, no `unbound` (else
  `rules-apply-unconfirmed` with the reason); `consent.object` equals the latest `policy{drafts}`
  entry's ref on all five fields **and** the current files' `aggregateHash` equals its `contentHash`
  (else `rules-apply-unconfirmed {reason: 'object-changed'}`). A prior default or *Discard drafts*
  never wires a pack.
- 09-T5 Mutation, inside one `withLedgerLock` with `assertOwner` re-run: re-validate the drafts
  (09-Q2). A pack with a pack-level error (unparsable, invalid, glob matches nothing) is not applied
  and is reported. A rule with `pack-quote-missing` is removed from the live copy and reported `not
  migrated`. The rest: write `.ambicode/policies/<file>` (refuse a pack whose live file exists, with
  `bad-argument` naming it), remove the draft, append the live path to the project's `policyFiles`
  through the document API (comments kept). Then run one covered and one uncovered probe per pack
  (`resolvePolicy` on the first project file its `appliesTo` matches, and on the first file it does
  not match; a `**/*` pack reports `uncovered: n/a`). A probe failure is reported; the pack stays live.
  Append `policy {stage: 'apply', packs, probes}`, write `steps/rules-apply.md` (table + `<!-- ambicode
  rules <hash> -->`), invoke the tail once.
- 09-T6 `rules revert <pack-id>` removes the pack's path from `policyFiles` through the document API
  and moves the file back into `DRAFTS_DIR`. One command, no gate (D13). A pack id not wired in any
  (or the named) project, or a draft file of that name already present → `bad-argument`. No code path
  calls revert automatically.
- 09-T7 `skills/rules/SKILL.md` ≤ 2,560 bytes: the scope judgment (global vs path pattern), the
  drafting rules (one instruction per rule, verbatim quote, prefer `observed`, drop version-bound API
  rules), the fallback start line, and `references/pack-format.md` named by the draft step.
  `allowed-tools` narrows to `Write(.ambicode/policies/drafts/**)` and loses
  `Edit(.ambicode/config.yaml)`. `rules discover` lists rule-source candidates (`detectRuleSources`)
  and, for each Confluence URL in the args, the requirements template's fetch lines (capture on read).

**W — documentation**
- 09-W1 `docs/policy-authoring.md` and `docs/rule-migration.md` describe drafts, quotes, the table,
  `rules apply` and `rules revert`. `docs/installation.md` describes `init` → gate → `init --apply
  --set`, config v3 and the removed fields. `outcomes.md` documents every code in Contract.

**M — mechanisms and checks**
- 09-M1 No hook and no code step calls `init --apply`, `doctor`, `rules apply` or `rules revert`, or
  runs a project command. Doctor probes run only inside the model-run `init --apply` and `doctor`
  commands, through the existing command policy.
- 09-M2 A test greps `src/route/`, `routes/`, `src/code-intelligence/map.ts` and every
  `routes/steps/*.md` for the ecosystem table's names (whole word, case-insensitive) and fails on a hit.
- 09-M3 Trigger suite (D2): in the same change, every `evals/evals-triggers` case that expects
  `ambicode:init` or `ambicode:rules` to fire becomes "no AMBICODE skill fires", keeping its input and
  validity checking, with a synthetic assertion of the changed expectation. If the count at dispatch
  is 0, nothing changes and the report states the count. Step 03 retires the old gate script. Do not
  run this paid suite without named authorization.
- 09-M4 `fixtures/materialize.mjs --ambicode-init` still commits a config and the ignore lines for
  every fixture, produced by `buildProposal` + `writeConfig` with no overrides (D15).

## Decided readings

These choices are fixed by this brief. Do not reopen them; report a conflict as PLAN instead.

- D1 `init` without `--apply` is a dry run. v6/20: "the default writes nothing"; v6/31: "write config
  and `.gitignore` on acceptance". The first-run write of v0.4.0 is removed (named behaviour change).
- D2 The accepted values are the `Values:` line of the printed `init-apply` instance the acceptance
  binds (`acceptance.instance` → `gate.question`). This is v6/20's "the written values are in an
  `acceptance.answer` (#96)" carried by the bound print, since the hook records the option label;
  `init-apply` has no `object` (v6/12 §3.4). *Apply as proposed* binds an empty override set.
- D3 MCP server choice, runner mapping or null, and `search.index` are selected through *Adjust*
  pairs on the one question. v6/20 step 2's model guidance is delivered with the gate print, so the
  route keeps v6/20's ceremony (1 gate + 1 work command).
- D4 `doctor` runs inside `init --apply` (v6/31: "runs `doctor` at its tail"), not as a separate route
  step; v6/20 step 6's read-back guidance comes from `close`. `rules` folds steps 6 and 9 the same way
  into the `rules-table` print and `close`, matching v6/21's ceremony (2 gates + work commands).
  `apply` and `apply-adjusted` are two steps because the `when` vocabulary has no disjunction.
- D5 The doctor probe is the adapter's `--version` form: tokens before the first `--` or `{files}`,
  plus `--version` (`./node_modules/.bin/eslint --version`, `./.venv/bin/python -m pytest --version`).
  An adapter may override it in the table (for example `ruff --version` without the subcommand). The
  "empty selection" form is not used: eslint and jest treat zero files as the whole project.
- D6 An unrecognised repository is written as `ecosystem: unknown`. Step 03's schema limits
  `ecosystem` to the table's names (`Ecosystem` = `typescript | python`); widen it to a kebab-case string in the same schema (every file
  valid before stays valid). This implements v6/20's "an ecosystem with no adapter … the route still runs".
- D7 `acceptanceField.candidates` lists only the current config value. Code cannot see the Jira
  field catalogue; the human sets the id through *Adjust* (`requirements.acceptanceField=customfield_…`).
- D8 `rules-table` declares `object: policy{drafts}`. v6/12 §3.4: "A gate whose acting option
  consumes an artifact declares `object`"; *Apply all* consumes the drafts. The ref is `{kind:
  'policy', value: 'drafts', id, path: DRAFTS_DIR, contentHash: aggregateHash}`. This implements v6/11
  "Applying changes must reflect the accepted disposition" through the existing object mechanism.
- D9 *Discard drafts* is the non-acting default and release: nothing is applied, no file is deleted.
  That is v6/21's "default: do not apply (drafts stay)". *Apply with changes* is non-acting: it
  revises `draft` with the human's text; only *Apply all* of the then-current drafts is acting
  (01-contracts §5: free text is never acting).
- D10 Partial application (09-T5): pack-level errors skip the pack; rule-level quote failures drop the
  rule as "not migrated"; duplicate warnings do not block; probe failures are reported and the pack
  stays live. v6/21: "past `repeat` → 'not migrated: <reason>' per rule, forward".
- D11 Quote matching collapses whitespace runs to one space and is otherwise exact. A line or anchor
  suffix in `location` is not verified.
- D12 `policy check --drafts` checks the whole drafts directory. `--task` is optional; without it,
  no ledger entry, no tail, and URL quotes fail as `source not captured`.
- D13 `rules revert` has no gate: v6/21 and v6/11 §4 define none, and it removes authority rather
  than granting it. The skill body says to run it only when the human asks.
- D14 Budgets: init `modelSteps: 2` (one apply position plus one spare); rules `modelSteps: 8`
  (draft ×3, one human change cycle with draft ×3, apply ×1, one spare). Beyond that, the registry's
  `budget-exhausted` gate applies. 01-contracts §4 lists no init or rules budget.
- D15 Fixture tooling and test setup write config through `writeConfig` directly
  (`fixtures/materialize.mjs`, `src/testing/init-config.ts`). They stand in for a user who wrote a
  config. The CLI has no write path without consent, and neither file ships.
- D16 The CLI passes the session from step 03's 0-S adapter. If 0-S is pending, the CLI passes
  `session: null`, so `init --apply` and `rules apply` refuse `session-unbound` at runtime; tests
  inject sessions and use step 03's ledger-backed port.
- D17 An accepted `--set` pair overrides its slot even when the file already sets it; the human
  accepted that exact value. Detection never overwrites (09-C4).
- D18 `config-unparsable`'s *back up and regenerate* is acting (it writes a file outside the ledger).
  Step 03's registry entry has the `acting` value (03-R7) and no `onAnswer`; this step adds
  `onAnswer: revise $raisedBy`.
- D19 `init` accepts `--task <slug>` (v6/31: every step text carries `--task`). The default is
  today's init slug computed by step 03's bootstrap helper.

If the dispatch records a 5-I outcome other than "none": `PROPOSED_INDEX` follows that recorded
outcome, `index.decision5I` prints it, and 09-P4 appends the index layers only to the proposed lists.
If 5-I is pending or failed: `index.proposed` is `none` whatever tool is found.

If step 01's tmpdir-fallback decision is (a): the guard's init deny fires only when the hook input
has `scratchpad_dir`; test with it and report hosts without it as a limitation. If (b) or (c): run the
same guard test also through the fallback path step 03 implemented.

## Non-goals (a reviewer may not raise these)

- No second config schema, reader, ecosystem table, task-directory resolver, consent predicate,
  ledger reader, lock or route engine. No change to `src/policy/resolve.ts`.
- No codeindex by default without the 5-I decision; no index build in `init --dry-run`; no
  `claude plugin list`; no LSP field, notice or probe (D8).
- No guard change: the init deny row exists from step 01. No deny of shell writes to `config.yaml`
  or of rules writes outside drafts.
- No crash recovery or idempotent re-apply for `init --apply` beyond the engine's generic rerun.
  No automatic rollback of a pack after a failed probe or measurement.
- No CLI fetch of Confluence or Jira; no Jira field-catalogue discovery (D7).
- No natural-language parsing of *Adjust* text; only `key=value` tokens (09-G2).
- No changes to built-in packs, to `docs/compatibility.md`, to `navigation.ts`, or to any
  `SKILL.md` other than init and rules.
- No multi-question `AskUserQuestion` binding; one gate per question.
- No adversarial inputs: quote matching, set parsing and Levenshtein work on ordinary text. The
  plugin is not a security sandbox (01-contracts §5).
- No running of the trigger suite, a live init or rules session, or any other paid item.

## Tests

Name each test after its rule. Use real temporary directories and materialized fixtures. Inject
clocks, sessions, the process runner and hook payloads. Drive answers through step 03's hook adapter
with synthetic `AskUserQuestion` payloads carrying the marker. No test reads anything under `gym/`.

1. `init.test.ts` (writer): fresh v3 document fields and no `requirements.lsp` (09-C2); schema 1 and
   schema 2 fixtures with comments → v3 with comments and other values unchanged, removed fields named
   (09-C3, diff shown in the report); detection fills only missing slots, explicit `null` kept, `--set`
   overrides (09-C4, D17); `schemaVersion: 4` refused, nothing written (09-C5); no LSP output (09-C6).
2. `ecosystems.test.ts` / `detect.test.ts`: manifests from the table (09-E2); prettier, black, ruff
   format, declared-not-installed and none (09-E3); no manifest → `unknown` with the notice and a
   `null` lookup (09-E4).
3. `ecosystem-neutral.test.ts`: the grep of 09-M2.
4. `proposal.test.ts`: every field present (09-P2); codeindex found but 5-I pending → `none`, no
   index layers; explicit `search.index=codeindex` override → both index layers, explicit lists kept
   (09-P3, 09-P4); ≤ 6,144 bytes on each of `FIXTURES`, counted from the definitions (09-P5); nothing
   written by `init` / `init --dry-run` (09-P1, D1).
5. `init-sets.test.ts`: each settable key form; unknown key, unknown project, repeated key, bad JSON →
   `bad-argument`; canonical order and spacing (09-G3).
6. `init-route.test.ts` (engine, hook entry, injected session):
   - S6: fresh repository: investigate → `config-missing`; init start → proposal → gate → *Cancel* →
     only `task/init-<date>/` exists, the message names it untracked with `rm -r` (09-G6, 09-R4); a
     second init → *Apply as proposed* → `init --apply` writes config and ignore lines, doctor table,
     then investigate loads the config;
   - *Adjust* free text `search.index=codeindex` → re-print quotes it with the adjusted `Values:` line
     → *Apply as adjusted* → typed `--set search.index=codeindex` applies; typing the earlier (stale)
     values → `values-differ`, nothing written (09-G2, 09-G4);
   - headless start, no preanswer → default *Cancel*, nothing written, apply line printed; trusted
     preanswer `init-apply=Apply as proposed` → honoured at the print (09-G4.3);
   - first print offers *Apply as proposed* / *Adjust* / *Cancel*, the print after a free-text
     adjustment offers *Apply as adjusted* / *Adjust* / *Cancel*; `routes/init.yaml` passes build
     validation; a hook answer or trusted preanswer naming the option the print does not offer →
     `declined {option-not-offered}`, gate reprinted, `init --apply` refuses (09-G1, 03-G14);
   - `route next --answer init-apply=Apply as proposed` → `acting-needs-human`, then `init --apply`
     → `init-unconfirmed` (09-G7);
   - standalone `init --apply` with no init route → `no-init-route`; null session → `session-unbound`;
   - unparsable config: default *stop* → no backup; *back up and regenerate* bound → `.bak-` exists
     before `steps/proposal.json`; `init --apply` without the backup → `config-unparsable` (09-P6,
     09-G4.5); the unparsable path never calls `openWorkspace` (09-R4);
   - ceremony counts on both paths (09-R2);
   - the guard denies Write to `config.yaml` and `.gitignore` while the init pointer is set (per the
     tmpdir branch above) and allows it after `close`.
7. `doctor.test.ts` (fake process runner): `null`, `not-found`, `not-run` for forbid and propose,
   `ok`, `failed` with exit code, `timeout` (09-D1, 09-D2); a failing command stays in config;
   detached index build called and not awaited when index ≠ none (09-D3); stable bytes and hash
   (09-D4); standalone writes nothing, in-route writes `steps/doctor.md` (09-D5).
8. `drafts.test.ts`: draft without `source` → `pack-invalid`; quote < 20 characters (09-Q1); file
   quote present across a line break, absent, file missing; URL quote with and without a captured
   payload (09-Q3); a draft copying a built-in instruction → `pack-duplicates-builtin`; the constant
   test: no pair of built-in rules reaches `DUPLICATE_SIMILARITY`, and it prints the measured maximum
   (09-Q4); positional with `--drafts` refused; `rulesBySource` equals the drafts' rule count (09-Q2).
9. `rules.test.ts` and `rules-route.test.ts` (engine, hook entry, injected session):
   - the walk-through on `ts-feature-boundary` with a synthetic `CONTRIBUTING.md`: discover → drafts
     written by test code with one bad quote → `policy check --drafts` fails it → corrected → table →
     bound *Apply all* → live, probes pass → `rules revert` → back in drafts (09-T1, 09-T5, 09-T6);
   - a declining fake human (default / *Discard drafts*) → 0 packs live, drafts unchanged (09-T2, 09-T4);
   - a draft edited after *Apply all* → `object-changed` (09-T4, D8);
   - permanently bad quote → exactly 3 draft deliveries, then `not migrated` and the table (09-T3);
   - *Apply with changes* free text → `revise draft` with `$answer`, no pack live (D9);
   - glob-matches-nothing pack skipped; quote-failing rule dropped (09-T5, D10);
   - standalone `rules apply` without consent → `rules-apply-unconfirmed`; `policy check --drafts`
     without `--task` writes no entry (09-Q5);
   - the ledger entries for `policy{drafts}` and `policy{apply}` and one tail each (09-Q5, 09-T5).
10. Gate table (step 03's test, extended): `init-apply`, `config-unparsable`, `sources`, `rules-table`
    and the `revise draft` bound are driven; every default writes no config, applies no pack and
    copies no file.
11. Skill content: body byte caps and `allowed-tools` lines (09-R3, 09-T7); each step instruction
    ≤ 1,500 characters; the F3 outcomes test passes with the new codes (09-W1).
12. `materialize` test: `--ambicode-init` on two fixtures still commits config and ignore lines
    (09-M4). The trigger-case count check (09-M3).

**Proofs for the report** (model-free; no authorization needed):

- `node fixtures/materialize.mjs --all <dir>`: for each fixture, `init --dry-run --json`, a synthetic
  bound acceptance, `init --apply`, `doctor`. Report the number of non-null commands and how many pass.
  Without `--install` every command may be `null`; report that as "0 non-null, vacuous", not as 100%.
  If the environment allows the free package install, repeat with `--install` and report both. Report
  the guard deny for a `Write` to `config.yaml` while the init route is active (the ledger shows the
  route and the pointer exists), and the median wall time of the code path.
- Migration: the v1 fixture with `requirements.lsp` loads with the notice; `init --apply` writes v3
  with comments kept; show the diff.
- Rules: the walk-through of test 9, with its output.

**Measurement status.** v6/20 and v6/21's measured acceptance that needs a live model (0 model edits
of YAML or `.gitignore` by guard deny count; median command-to-config under 60 s including the model
and the human; 0 near-duplicates and 100% verified quotes from a real drafting session) is pending
unless the dispatch names a paid run. The model-free numbers above are a lower bound for the latency
and a mechanism check for the rest. If a paid proof is not authorized, report it as pending with its
exact downstream limitation; do not claim the skill's bar is met.

## Done when

- [ ] Every rule id above appears in at least one test name, and all pass.
- [ ] `npm run verify` is green; the report states the counts.
- [ ] Files changed ⊆ the Files table, plus mechanical changes listed in the report; budgets are
      reported with actual line counts.
- [ ] `git diff` of `src/policy/resolve.ts`, `hooks/hooks.json`, `src/route/ownership.ts`,
      `evals/evals-archived/**` and `skills/{investigate,plan,task,review}/SKILL.md` is empty.
- [ ] The three proofs are in the report with their commands and numbers; paid items are listed as
      pending.
- [ ] The report lists every step 03/04/05 symbol used under its actual name.
- [ ] The report follows 05-working-rules §4.

## Hand-off to step 06

- First install exists: `init` → gate → `init --apply` writes config v3 with explicit
  `search.layers`, `commands.format` and `requirements.acceptanceField`. Steps 06–08 read config through
  step 03's reader and must not write config.
- `commands.format` is filled or `null`; step 07 runs `format` through the existing command policy and
  must not re-detect formatters.
- The ecosystem table holds formatter adapters, probes, i18n and index grammars; later steps add facts
  there and keep route, engine and step texts language-free (09-M2).
- `doctor` is the command that proves commands start; later steps call `runDoctor`, not a copy.
- `writeConfig` and `src/testing/init-config.ts` are the only consent-free writers, for fixtures and
  tests. Every new fixture uses `--ambicode-init` or the helper.
- S6 is closed here against the shipped `routes/init.yaml`. Core acceptance reruns it from `dist`.
- Steps 06–08 convert their own trigger cases (09-M3 pattern) in the change that disables model
  invocation for their skill.

## Coverage of the v6 brief

| v6 step-09 requirement | Here |
|---|---|
| Complete step 03's v3 reader/write migration; no second schema; v1/v2 legacy notices | 09-C1, 09-C3, Starting point |
| New fields: `search.index`, `search.layers`, `workers.approved`, `guard.askOutsideMap`, `review.onInvalid`, `commands.format`, `requirements.acceptanceField` | Contract (Persisted), 09-C2 |
| Ecosystem selects the table; no persisted adapter block | 09-C2, 09-E2 |
| Removed `requirements.lsp`, `task.lspPlugins`, `search.exactMaxFiles` load with notice (D8) | 09-C3, Proofs (migration) |
| `init --apply` migrates 1 → 3 through the document API, comments kept | 09-C3, test 1 |
| `SUPPORTED_SCHEMA_VERSION` 3 from step 03; `config-schema-too-new` unchanged in shape | 09-C1, 09-C5 |
| Extend step 03's `ecosystems.ts`: declaration patterns, source globs (`SHORTLIST_DEFAULTS`), export filter, i18n, runner and formatter adapters, index grammars | 09-E1, 09-E3 |
| Route/step/engine logic ecosystem-neutral; existing adapters may name tools | 09-E5, 09-M2 |
| `init` writes the adapter name; `map`, harvest, format read the table | 09-E2 |
| Unknown ecosystem → "shortlist and grep only", route still runs | 09-E4, D6 |
| Grep test over `src/route/`, `routes/`, `map.ts`, `routes/steps/*.md` | 09-M2, test 3 |
| Dry-run proposal fields (projects, commands, packs, rule sources, gitignore lines incl. index/metrics/reviews/task/notes, format, index tooling, layers, acceptanceField candidates) | 09-P2, 09-P3, 09-P4, Contract, D7 |
| Index layers only when the proposed index is not none; default none unless 5-I | 09-P3, 09-P4, 5-I branch |
| Proposal ≤ 6 KB | 09-P5 |
| `not-a-repository`; `config-unparsable` gate, back up / stop, default stop | 09-P1 (bootstrap from step 03), 09-P6, D18 |
| One gate *Apply as proposed* / *Adjust* / *Cancel*; MCP server; runner mapping or null; `search.index` | 09-G1, 09-G3, D3 |
| *Adjust* re-print with free text quoted, *Apply as adjusted*, values in the acceptance (#96) | 09-G2, D2 |
| Release *Cancel*; default writes nothing and prints proposal and the exact line | 09-G1, 09-G6 |
| `init --apply --set` only with a bound hook answer or consumed trusted preanswer, never a flag; exact values or `init-unconfirmed` | 09-G4, 09-G7 |
| YAML through the document API; existing file → diff and missing slots only | 09-C4, 09-G5, D17 |
| `.gitignore` lines written on acceptance (30 §9); tail `doctor` | 09-G5, D4 |
| `doctor`: `--version` or empty selection; `argv[0]` resolved; detached index build; failure reported, not nulled | 09-D1 … 09-D3, D5 |
| Doctor table output; Stop hook (b) equality | 09-D4, 09-D5 |
| `routes/init.yaml`; bootstrap via `openRepository`; fixed `task/init-<date>` | 09-R1, 09-P1, Starting point (step 03) |
| Missing config → proposal; unparsable → `config-unparsable` without `openWorkspace` | 09-R4, test 6 |
| Cancel/default leaves only the init directory, named untracked with clean-up; no config/ignore/index | 09-G6, 09-R4 |
| Backup requires acting consent before backup | 09-P6, D18, test 6 |
| S6: fresh repo, Cancel then Apply then investigate, adjusted values, stale values | test 6 |
| `allowed-tools` loses config Write/Edit; body ≤ 1.5 KB with the four contents | 09-R3 |
| Measured: 100% non-null commands pass doctor on 20 fixtures; 0 model edits; median < 60 s via `materialize --all` | Proofs, Measurement status |
| `rules discover [--json]`: candidates + Confluence URLs → requirements template | 09-T7, 09-T1 |
| Drafts only under `policies/drafts/`; `allowed-tools` narrowed | 09-Q1, 09-T7 |
| Draft rule `source.quote` (≥ 20, verbatim) and `source.location`; `PolicyRule.source` required for drafts, optional for built-ins | 09-Q1, Contract |
| `policy check --drafts --project`: schema, loader rules, glob counts, quote verification incl. Confluence payload, near-duplicates with printed threshold and fixing test (P16) | 09-Q2 … 09-Q4, D11, D12 |
| Tail `onFail: revise draft`, `draft repeat 3`, then "not migrated" per rule | 09-T1, 09-T3, D10 |
| `rules-table` gate, release *Discard*, default do not apply | 09-T2, D9 |
| `rules apply`: drafts → live, `policyFiles` via document API, covered/uncovered probes; `rules-apply-unconfirmed` | 09-T4, 09-T5 |
| `rules revert <pack-id>`: unwire and move back, one command | 09-T6, D13 |
| `routes/rules.yaml` per v6/21 (`sources` default args files else exit human); body ≤ 2.5 KB; `pack-format.md` named | 09-T1, 09-T7 |
| Rules measured acceptance (0 glob-matches-nothing, 0 duplicates, 100% quotes, 0 packs live before the gate, rule count = table rows, loop stops at 3) | test 9, 09-Q2, Measurement status |
| Docs and `outcomes.md` codes | 09-W1, Contract |
| Proofs: gates table covers init-apply, config-unparsable, sources, rules-table, revise bound | test 10 |
| Proofs: 20-fixture run with guard deny and median; migration diff; rules walk-through | Proofs |
| Do not: model writes config/ignore/live packs; codeindex default; LSP fields; `claude plugin list`; language logic in routes; resolver change | 09-R3, 09-T7, 09-P3, 09-C6, 09-M2, Non-goals |
| Order after 05, before 06; 5-I unknown → none; explicit index choice honoured; no index build without ignore acceptance | Prerequisites, 09-P3, 09-D3 |
| Schema fields are 03's, acceptanceField 04's; this step owns proposal/write | 09-C1, Starting point |
| Apply and doctor model-run through existing policy; hooks cannot run source-mutating commands | 09-M1, 09-D2 |
| Bound values canonicalized and compared before any config/ignore byte | 09-G4, 09-G3 |
| `rules apply` consumes the honoured answer; default/discard cannot wire; same consent origin/instance rules | 09-T4 |
| Draft quote errors revise draft to 3; covered validation reruns despite default repeat 1 | 09-T3 (step 03 bounds) |
| Applying reflects the accepted disposition; failures reported | D8, 09-T5, D10 |
| Revert explicit, never automatic | 09-T6, D13 |
| Existing comments and non-missing command values retained | 09-C3, 09-C4 |
| Tests: v1/v2 notices, too-new refusal, backup before regeneration, Adjust re-ask, forbidden model writes, standalone apply without consent | tests 1, 6, 9 |
| Fixtures counted from definitions, not a hard-coded 20 | 09-P5, test 4, Proofs |
| Measurement separate from implementation acceptance; unauthorized paid proof pending | Measurement status |
| Trigger-suite migration for init and rules; paid run needs authorization | 09-M3 |
