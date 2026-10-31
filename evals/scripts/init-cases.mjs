// The /ambicode:init --auto cases: one per stack, each with the result init should reach. cases.mjs spreads `initCases` into
// CASES; the truth below also renders `expected-config.yaml` and `truth.json` beside each case, which the graders do not read:
// they are what a human compares a run against, and init-cases.test.mjs checks that the expected config passes `config validate`.
import { stringify } from 'yaml';
import { fixtureByName } from '../../fixtures/definitions.mjs';
import { buildModuleTree, maxModulesFor } from '../../src/modules/context/context.ts';
import { SUPPORTED_SCHEMA_VERSION } from '../../src/types/modules/config.ts';

const COMMON = ['common-design', 'common-code', 'common-errors', 'common-security', 'common-verification', 'common-checks'].map((id) => `builtin/${id}`);
const packFile = (pack) => `.ambicode/policies/${pack.split('/')[1].split('-')[0]}/${pack.split('/')[1]}.yaml`;

/**
 * conventions[].basis: `written` when the document at `doc` states it, `inferred` when only the code shows it. `quote` is a
 * verbatim line of `location`, so a draft rule can be checked against it. `draft` is a tight pattern for the text of a draft
 * pack's rule or quote: it names something only the code or the document shows, so a rule guessed from file and folder
 * names does not match (the former `Outcome` pattern matched a name seen in a directory listing).
 * Every fixture has about 30 modules in its own architecture (fixtures/init-stacks.mjs); `modules` below is derived from it.
 */
export const INIT_TRUTHS = [
  {
    slug: 'ts',
    doc: 'scratch/page-7.md',
    stack: 'TypeScript service by bounded context with a shared kernel, jest and eslint declared in package.json',
    fixture: 'ts-service-lendbox',
    flags: '',
    projects: [{
      id: 'lendbox', root: '.', paths: ['src/'], languages: ['typescript'], frameworks: [], packageManager: 'npm',
      testGlobs: ['test/**'], include: ['src/**'], exclude: ['test/**'], packs: COMMON,
      checks: { test: { all: 'npm test', file: 'npx jest --findRelatedTests {file}' }, lint: { all: 'npm run lint', file: 'npx eslint {file}' } },
      checkPatterns: { test: 'jest|npm (run )?test', lint: 'eslint|npm run lint' },
      filePatterns: ['jest', 'eslint'],
    }],
    wrongPacks: ['angular-', 'express-', 'python-quality'],
    conventions: [
      { id: 'context-index-imports', basis: 'written', quote: 'Import another context only through its `index.ts`', location: 'scratch/page-7.md:5', draft: String.raw`index\.ts` },
      { id: 'event-names', basis: 'written', quote: 'Event names are `<context>.<past-tense-verb>`', location: 'scratch/page-7.md:9', draft: String.raw`[a-z]+\.[a-z]+(-[a-z]+)+|<context>\.<|past[- ]tense` },
      { id: 'use-case-factories', basis: 'inferred', quote: 'export const addItem = (deps: CatalogDeps) => async (input: AddItemInput)', location: 'src/contexts/catalog/application/add-item.ts:14', draft: String.raw`\(deps: \w+Deps\) =>|deps\) => async|factory|curried` },
      { id: 'create-returns-result', basis: 'inferred', quote: 'export function createLoan(input: NewLoan): Result<Loan, DomainError> {', location: 'src/contexts/lending/domain/loan.ts:24', draft: String.raw`Result<\w+, DomainError>|create[A-Z]\w*\(` },
    ],
  },
  {
    slug: 'python',
    doc: 'notes/field-notes.md',
    stack: 'Python service in layers (domain, app, infra, api) with a plugin directory, pytest and ruff declared in pyproject.toml',
    fixture: 'py-service-tidewatch',
    flags: '',
    projects: [{
      id: 'tidewatch', root: '.', paths: ['src/'], languages: ['python'], frameworks: [], packageManager: 'uv',
      testGlobs: ['tests/**'], include: ['src/**'], exclude: ['tests/**'], packs: [...COMMON, 'builtin/python-quality'],
      checks: { test: { all: 'uv run pytest', file: 'uv run pytest {file}' }, lint: { all: 'uv run ruff check src tests', file: 'uv run ruff check {file}' } },
      checkPatterns: { test: 'pytest', lint: 'ruff' },
      filePatterns: ['pytest', 'ruff'],
    }],
    wrongPacks: ['angular-', 'express-'],
    conventions: [
      { id: 'tw-error-codes', basis: 'written', quote: 'raise StaleReadingError("TW-203"', location: 'src/tidewatch/domain/rules/staleness.py:11', document: 'notes/field-notes.md:5', draft: String.raw`TW-(\d{3}|nnn)` },
      { id: 'test-names', basis: 'written', quote: 'Name each test `test_<module>__<behaviour>`', location: 'notes/field-notes.md:9', draft: String.raw`test_\w*<?\w+>?__<?\w+|double[- ]underscore` },
      { id: 'keyword-only-args', basis: 'inferred', quote: 'def tide_window(services: Services, gauge_id: str, *, start: datetime, hours: int) -> dict:', location: 'src/tidewatch/api/handlers/window.py:9', draft: String.raw`[Kk]eyword[- ]only|, \*, ` },
      { id: 'plugin-constant', basis: 'inferred', quote: 'PLUGIN = SourcePlugin(name="buoy_csv", parse=parse_text)', location: 'src/tidewatch/plugins/sources/buoy_csv/plugin.py:4', draft: String.raw`SourcePlugin\(|\bPLUGIN\b` },
    ],
  },
  {
    slug: 'go',
    doc: 'CONTRIBUTING.md',
    stack: 'Go module with cmd/ and many small internal/ packages (one nested five levels deep), go test, go vet and golangci-lint',
    fixture: 'go-module-parcelhub',
    flags: '',
    projects: [{
      id: 'parcelhub', root: '.', paths: ['cmd/', 'internal/'], languages: ['go'], frameworks: [], packageManager: 'go',
      testGlobs: ['**/*_test.go'], include: ['cmd/**', 'internal/**'], exclude: ['**/*_test.go'], packs: COMMON,
      checks: { test: { all: 'go test ./...', file: null }, vet: { all: 'go vet ./...', file: null }, lint: { all: 'golangci-lint run', file: 'golangci-lint run {file}' } },
      checkPatterns: { test: 'go test', lint: 'golangci-lint|go vet' },
      filePatterns: [],
    }],
    wrongPacks: ['angular-', 'express-', 'python-quality'],
    conventions: [
      { id: 'wrap-with-operation', basis: 'written', quote: 'fmt.Errorf("tracking.Lookup: %w", err)', location: 'CONTRIBUTING.md:5', draft: String.raw`[a-z]+\.[A-Z][A-Za-z]*: %w` },
      { id: 'injected-clock', basis: 'written', quote: 'Never call `time.Now` outside `internal/clock`', location: 'CONTRIBUTING.md:9', draft: String.raw`time\.Now` },
      { id: 'core-interfaces', basis: 'inferred', quote: 'func New(store core.Store, clock core.Clock) *Service {', location: 'internal/tracking/service.go:16', draft: String.raw`core\.(Store|Tracker|Clock|Notifier|Auditor)` },
      { id: 'interface-assertions', basis: 'inferred', quote: 'var _ core.Store = (*Store)(nil)', location: 'internal/memstore/store.go:10', draft: String.raw`var _ core\.|\(\*\w+\)\(nil\)|compile-time` },
    ],
  },
  {
    slug: 'jvm',
    doc: 'team/wiki/week-12.md',
    stack: 'Kotlin on Gradle, hexagonal across seven subprojects (domain, application, four adapters, bootstrap), JUnit 5 and ktlint',
    fixture: 'jvm-gradle-seedvault',
    flags: '',
    projects: [{
      id: 'seedvault', root: '.', paths: ['domain/src/main/', 'application/src/main/', 'adapters/persistence/src/main/', 'adapters/rest/src/main/', 'adapters/messaging/src/main/', 'adapters/cli/src/main/', 'bootstrap/src/main/'], languages: ['kotlin'], frameworks: [], packageManager: 'gradle',
      testGlobs: ['**/src/test/**'], include: ['**/src/main/**'], exclude: ['**/src/test/**'], packs: COMMON,
      checks: { test: { all: './gradlew test', file: './gradlew test --tests {file}' }, lint: { all: './gradlew ktlintCheck', file: null } },
      checkPatterns: { test: String.raw`gradlew?\s+test|gradle(w)? .*test`, lint: 'ktlint' },
      filePatterns: [],
    }],
    scoutRoots: ['adapters', 'application', 'bootstrap', 'domain'],
    // The baseline summaries name the Gradle subprojects, never the repository id.
    nameInSummary: 'seedvault|domain|adapters',
    wrongPacks: ['angular-', 'express-', 'python-quality'],
    conventions: [
      { id: 'value-class-ids', basis: 'written', quote: 'Identifiers are value classes (`LotId`, `SpeciesId`)', location: 'team/wiki/week-12.md:5', draft: String.raw`value class|@JvmInline` },
      { id: 'outcome-not-exceptions', basis: 'written', quote: 'is returned as `Outcome.Rejected`', location: 'team/wiki/week-12.md:9', draft: String.raw`Outcome\.Rejected` },
      { id: 'structured-log-keys', basis: 'inferred', quote: 'log.atInfo().addKeyValue("lotId", command.lotId.value)', location: 'application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt:32', draft: String.raw`addKeyValue|key-value` },
      { id: 'use-case-invoke', basis: 'inferred', quote: 'override fun invoke(command: SowLotCommand): Outcome<Sowing> {', location: 'application/src/main/kotlin/org/seedvault/application/usecase/germination/SowLotService.kt:25', draft: String.raw`operator fun invoke|override fun invoke|invoke\(` },
    ],
  },
  {
    slug: 'monorepo',
    doc: 'CONTRIBUTING.md',
    stack: 'monorepo: Rust workspace (engine/), TypeScript Express app (dashboard/) with a generated client, Python tooling (tools/), vendored code (vendor/)',
    fixture: 'monorepo-rust-ts-kiln',
    flags: '',
    projects: [
      {
        id: 'engine', root: 'engine', paths: ['crates/'], languages: ['rust'], frameworks: [], packageManager: 'cargo',
        testGlobs: ['crates/*/tests/**'], include: ['crates/**'], exclude: ['crates/*/tests/**'], packs: COMMON,
        checks: { test: { all: 'cargo test', file: null }, lint: { all: 'cargo clippy --all-targets', file: null }, format: { all: 'cargo fmt --check', file: 'rustfmt --check {file}' } },
        checkPatterns: { test: 'cargo test', lint: 'cargo clippy' },
        filePatterns: [],
      },
      {
        id: 'dashboard', root: 'dashboard', paths: ['src/'], languages: ['typescript'], frameworks: ['express'], packageManager: 'npm',
        testGlobs: ['test/**'], include: ['src/**'], exclude: ['test/**', 'src/__generated__/**'], packs: [...COMMON, 'builtin/express-http', 'builtin/express-errors'],
        checks: { test: { all: 'npm test', file: 'npx vitest run {file}' }, lint: { all: 'npm run lint', file: 'npx eslint {file}' } },
        checkPatterns: { test: 'vitest|npm (run )?test', lint: 'eslint|npm run lint' },
        filePatterns: ['vitest', 'eslint'],
      },
      {
        id: 'tools', root: 'tools', paths: ['src/'], languages: ['python'], frameworks: [], packageManager: 'uv',
        testGlobs: ['tests/**'], include: ['src/**'], exclude: ['tests/**'], packs: [...COMMON, 'builtin/python-quality'],
        checks: { test: { all: 'uv run pytest', file: 'uv run pytest {file}' }, lint: { all: 'uv run ruff check src tests', file: 'uv run ruff check {file}' } },
        checkPatterns: { test: 'pytest', lint: 'ruff' },
        filePatterns: ['pytest', 'ruff'],
      },
    ],
    // Generated client the config must keep out of the project's include set (CONTRIBUTING.md says never edit it).
    generated: '__generated__',
    scoutRoots: ['engine', 'dashboard', 'tools'],
    wrongPacks: ['angular-'],
    conventions: [
      { id: 'deci-celsius-names', basis: 'written', quote: 'its name ends in `_dc` in Rust', location: 'CONTRIBUTING.md:5', draft: String.raw`_dc\b|\b\w+Dc\b|tenths of a degree` },
      { id: 'invariant-expect', basis: 'written', quote: '.expect("invariant: ...")', location: 'CONTRIBUTING.md:9', draft: String.raw`invariant:` },
      { id: 'register-app-routes', basis: 'inferred', quote: 'export function register(app: Express): void {', location: 'dashboard/src/routes/firings.routes.ts:4', draft: String.raw`register\(app|export function register` },
      { id: 'error-trait-impl', basis: 'inferred', quote: 'impl std::error::Error for SafetyError {}', location: 'engine/crates/safety/src/error.rs:26', draft: String.raw`std::error::Error|impl\s+(std::)?(error::)?Error for` },
    ],
  },
];

/**
 * Where `context tree` is run for a case. The scout runs before the config exists and picks the top-level source directories
 * from `git ls-files` (agents/scout.md step 2), so `scoutRoots` names them when they are shallower than the project paths (jvm,
 * monorepo: a root with submodules gets its own overview.md, 41 and 33 notes in the baseline runs); otherwise the project paths.
 */
const rootsOf = (truth) => truth.scoutRoots ?? truth.projects.flatMap((project) => project.paths.map((p) => `${project.root === '.' ? '' : `${project.root}/`}${p}`.replace(/\/$/, '')));
const CONTEXT_LIMITS = { maxTotalTokens: 60000, maxFileTokens: 2500, maxIndexTokens: 5000 };

/** The module notes the scout must write: exactly what `context tree` prints for the fixture, computed by the same function. */
export function modulesOf(truth) {
  const files = Object.keys(Object.assign({}, ...fixtureByName(truth.fixture).steps.map((step) => step.write ?? {})));
  const tree = buildModuleTree(files, { roots: rootsOf(truth), maxModules: maxModulesFor(CONTEXT_LIMITS) });
  return tree.modules.map((module) => ({ note: module.note, dir: module.path, depth: module.depth }));
}

/** A schema-5 config holding the result init should reach; `config validate` accepts it (init-cases.test.mjs). */
export function expectedConfig(truth) {
  const run = { model: 'sonnet', effort: 'medium', timeoutMinutes: 15 };
  return stringify({
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    id: truth.fixture,
    context: { maxTotalTokens: 60000, maxFileTokens: 2500, maxIndexTokens: 5000 },
    skills: {
      init: { ...run, scout: run },
      review: { ...run, maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null, excludePaths: [] },
      task: { ...run, checkTimeoutSeconds: 120 },
      plan: run,
      investigate: run,
      rules: run,
    },
    requirements: { runtimes: {}, mcps: [], lsps: [], env: [] },
    projects: truth.projects.map((project) => ({
      id: project.id,
      root: project.root,
      paths: project.paths,
      ecosystem: { languages: project.languages, frameworks: project.frameworks, packageManager: project.packageManager },
      include: project.include,
      exclude: project.exclude,
      ignored: [],
      packs: project.packs,
      policyFiles: project.packs.map(packFile),
      commands: {},
      checks: project.checks,
    })),
  }, { aliasDuplicateObjects: false });
}

const truthJson = (truth) => `${JSON.stringify({
  stack: truth.stack,
  projects: truth.projects.map(({ id, root, paths, languages, packs, checks }) => ({ id, root, paths, languages, packs, checks })),
  plausiblePacks: [...new Set(truth.projects.flatMap((project) => project.packs))],
  packsThatDoNotFit: truth.wrongPacks,
  conventions: truth.conventions.map(({ id, basis, quote, location, document }) => ({ id, basis, quote, location, ...(document ? { document } : {}) })),
  contributorDocument: truth.doc,
  modules: modulesOf(truth).map((module) => module.note),
}, null, 2)}\n`;

const CONFIG = '.ambicode/config.yaml';
// A draft is whatever tool put it under .ambicode/policies/drafts/ (Write, Edit or a Bash heredoc: 2 of 7 drafting runs on 2026-10-21 used
// a heredoc and a Write-only grader missed them). `regex` on `trace` sees one JSON line per call, so one line must be a Write/Edit/Bash
// call whose input names the drafts folder and then holds the content; a Read of the skill's reference text is another tool and never matches.
const DRAFTS_DIR = String.raw`\.ambicode/policies/drafts/`;
const DRAFT_CALL = String.raw`(?:^|\n)(?=[^\n]*"(?:Write|Edit|Bash)")[^\n]*${DRAFTS_DIR}`;
// The scaffolded config keeps example entries in # comments (templates/config.yaml); a pattern must start on a line that is not one.
const LIVE = String.raw`(^|\n)[^#\n]*`;
const anyOf = (words) => `(${words.join('|')})`;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Each path and every directory above it: a top-level folder holding the source paths is a sound `paths` entry (`domain` for `domain/src/main/`). */
export const containingDirs = (paths) => [...new Set(paths.flatMap((p) => {
  const parts = p.replace(/\/$/, '').split('/');
  return parts.map((_, i) => escapeRegex(parts.slice(0, i + 1).join('/')));
}))];
/** Modules per coverage grader: the score then says how much of the tree was written, not only whether all of it was. */
const MODULES_PER_GROUP = 6;
const CONTEXT = '.ambicode/context';

/**
 * What the scout wrote, checked without a model. Coverage: `context write` refuses an index.md link to a missing note, so a link in
 * index.md proves the note exists; one lookahead grader per group of modules (a file_exists grader per module would be ~30 per case),
 * one for the whole tree, one count that catches notes the tree does not have, and a file_exists on the deepest note.
 * Facts: the contributor document was read, and conventions.md holds descriptions, no rule wording.
 */
export function scoutGraders(b, truth) {
  const { regex, tool, exists } = b;
  const modules = truth.modules ?? modulesOf(truth);
  const linked = (list) => `^${list.map((module) => `(?=[\\s\\S]*\\]\\(${escapeRegex(module.note)}\\))`).join('')}`;
  const groups = [];
  for (let i = 0; i < modules.length; i += MODULES_PER_GROUP) groups.push(modules.slice(i, i + MODULES_PER_GROUP));
  const deepest = modules.reduce((best, module) => (module.depth > best.depth ? module : best), modules[0]);
  return [
    ...groups.map((group, i) => regex(`modules-linked-${i + 1}-of-${groups.length}`, linked(group), { file: `${CONTEXT}/index.md` })),
    regex('index-links-every-module', linked(modules), { file: `${CONTEXT}/index.md`, weight: 2 }),
    regex('index-has-no-extra-notes', String.raw`\]\(modules/[^)\s]+\.md\)`, { file: `${CONTEXT}/index.md`, match: `count:${modules.length}` }),
    exists('deepest-module-note', `${CONTEXT}/${deepest.note}`),
    // Whether the harness lists a subagent's own Read calls in the trace is unverified; a read by the main session counts too.
    tool('contributor-doc-read', 'Read', escapeRegex(truth.doc)),
    regex('conventions-descriptive', String.raw`\b([Mm]ust|[Nn]ever|[Aa]lways|MUST|NEVER|ALWAYS)\b`, { file: `${CONTEXT}/conventions.md`, match: 'not_contains' }),
    // Same tight patterns as the draft-* graders, on the file the scout writes: `init --auto` makes no draft pack, so these measure the scout.
    ...truth.conventions.map((convention) => regex(`scout-convention-${convention.id}`, `(${convention.draft})`, { file: `${CONTEXT}/conventions.md` })),
  ];
}

/** Deterministic graders first, one llm grader for the judgement no pattern carries. `b` is cases.mjs's builder set. */
export function initGraders(b, truth) {
  const { regex, tool, never, exists, llm } = b;
  const many = truth.projects.length > 1;
  const first = truth.projects[0];
  const graders = [
    tool('scaffold-ran', 'Bash', 'scaffold\\.mjs'),
    tool('scout-invoked', 'Agent', 'ambicode:scout'),
    tool('config-validated', 'Bash', 'config validate'),
    tool('config-packs-ran', 'Bash', 'config packs'),
    never('no-questions', 'AskUserQuestion', '.'),
    never('no-rules-route', 'Bash', 'route start rules'),
    exists('config-written', CONFIG),
    ...['overview', 'navigation', 'conventions', 'index'].map((name) => exists(`context-${name}`, `.ambicode/context/${name}.md`)),
    ...scoutGraders(b, truth),
    regex('gitignore-has-ambicode', String.raw`(^|\n)/?\.ambicode/?\s*(\n|$)`, { file: '.gitignore' }),
    regex('schema-version', `schemaVersion:\\s*${SUPPORTED_SCHEMA_VERSION}`, { file: CONFIG }),
    // Both forms: one project reads as a single `- id:` under projects, and a monorepo needs a second.
    regex(many ? 'projects-two-or-more' : 'projects-single', String.raw`\n\s*- id:[\s\S]*\n\s*- id:`, { file: CONFIG, match: many ? 'contains' : 'not_contains' }),
  ];
  for (const project of truth.projects) {
    const where = many ? `-${project.id}` : '';
    graders.push(
      regex(`ecosystem${where}`, `${LIVE}languages:[\\s\\S]{0,80}\\b${anyOf(project.languages.flatMap((l) => (l === 'kotlin' ? ['kotlin', 'java'] : [l])))}\\b`, { file: CONFIG }),
      regex(`root-or-paths${where}`, many ? `${LIVE}(root|paths):[\\s\\S]{0,40}${project.id}` : `${LIVE}paths:[\\s\\S]{0,40}(?<![\\w/-])${anyOf(containingDirs(project.paths))}(?![\\w-])`, { file: CONFIG }),
      regex(`test-check${where}`, `${LIVE}(all|file):[^\\n]*(${project.checkPatterns.test})`, { file: CONFIG, weight: 2 }),
      regex(`lint-check${where}`, `${LIVE}(all|file):[^\\n]*(${project.checkPatterns.lint})`, { file: CONFIG }),
    );
    if (project.filePatterns.length > 0) {
      graders.push(regex(`file-placeholder${where}`, `${LIVE}file:[^\\n]*${anyOf(project.filePatterns)}[^\\n]*\\{file\\}`, { file: CONFIG }));
    }
  }
  // Rules are packs since config v5: init copies the built-ins it selects and writes no config rules.
  graders.push(
    exists('common-design-copied', packFile('builtin/common-design')),
    regex('policy-file-listed', 'policies/common/common-design\\.yaml', { file: CONFIG }),
    regex('no-misfit-pack', `builtin/${anyOf(truth.wrongPacks)}`, { file: CONFIG, match: 'not_contains' }),
    regex('no-config-rules', String.raw`source:\s*(scout|manual|web)|(^|\n)rules:|\n\s+instruction:`, { file: CONFIG, match: 'not_contains' }),
  );
  for (const pack of first.packs.filter((p) => !COMMON.includes(p) && truth.projects.length === 1)) graders.push(exists(`${pack.split('/')[1]}-copied`, packFile(pack)));
  if (truth.generated !== undefined) graders.push(regex('generated-excluded', String.raw`(exclude|ignored):[\s\S]{0,300}${truth.generated}`, { file: CONFIG }));
  if (truth.conventions.length > 0) {
    // file_exists reads the harness's list of files created in the sandbox (a snapshot diff, whatever tool wrote them); only a content check needs the trace.
    graders.push(exists('drafts-written', '.ambicode/policies/drafts/*.y*ml'));
    // --auto still drafts the scout's conventions (skills/init/SKILL.md step 6); it only skips the web search, the question and the rules route.
    for (const convention of truth.conventions) graders.push(regex(`draft-${convention.id}`, `${DRAFT_CALL}[^\\n]*(${convention.draft})`, { trace: true }));
  }
  // The final message (summary step of skills/init/SKILL.md) is checked by regex wherever a fact is a name; the llm grader keeps
  // only the two judgements a pattern cannot carry. 12/15 baseline runs failed one rubric holding all of this with no reason given.
  const lookahead = (parts) => `^${parts.map((part) => `(?=[\\s\\S]*(${part}))`).join('')}`;
  graders.push(
    regex('summary-names-projects', lookahead(many ? truth.projects.map((p) => p.id) : [truth.nameInSummary ?? first.id])),
    regex('summary-lists-checks', lookahead(truth.projects.flatMap((p) => (many ? [p.checkPatterns.test] : [p.checkPatterns.test, p.checkPatterns.lint])))),
    regex('summary-says-missing', String.raw`\b[Mm]issing\b|\b[Nn]o (end-to-end|e2e|[a-z]+ )?(check|command|test)|\b(not found|none found|not configured)\b`),
    regex('summary-lists-context', lookahead(['overview', 'navigation', 'index'])),
    regex('summary-says-drafts', String.raw`[Dd]raft`),
    // 7 of 15 correct summaries (2026-10-21T07-55..08-04) said "validate passes", "validation passes" or "the config validates" and failed `passed` alone.
    regex('summary-reports-validate', String.raw`validat\w*\b[^\n]{0,60}\b(ok|pass(?:e[sd])?|valid|succe)|\b(ok|pass(?:e[sd])?|valid)\b[^\n]{0,60}validat|\bconfig[^\n]{0,20}\bvalidates\b`),
  );
  const wrong = truth.wrongPacks.map((p) => p.replace(/-$/, '')).join(', ');
  const fits = [...new Set(truth.projects.flatMap((p) => p.packs.filter((id) => !COMMON.includes(id)).map((id) => id.replace('builtin/', ''))))];
  graders.push(llm('summary-and-pack-fit', `
Judge only the final message, with these checks.
1. Packs: it names the policy packs chosen. PASS if every pack it names is a common-* pack${fits.length > 0 ? `, one of ${fits.join(', ')}, or another pack of the same family (express-*, python-*, angular-*) for the project of that stack` : ''}. FAIL if it names a pack for another stack: ${wrong}.
2. Honesty: FAIL if it says a check or the build passed that it shows no run of, or says config validate passed while listing errors. Saying it did not run a check is fine.
PASS only if both hold. Do not fail it for omitting a fact; other graders check names, checks, context files and drafts.`));
  return graders;
}

export function initCases(b) {
  return INIT_TRUTHS.map((truth) => ({
    name: `init-auto-${truth.slug}`,
    description: `/ambicode:init --auto on an uninitialised repository: ${truth.stack}. Config, packs, context${truth.conventions.length > 0 ? ' and draft rules for four planted conventions' : ''}.`,
    tags: ['init'],
    version: 3,
    fixture: truth.fixture, flags: truth.flags,
    prompt: '/ambicode:init --auto',
    bare: null,
    graders: initGraders(b, truth),
    files: { 'expected-config.yaml': expectedConfig(truth), 'truth.json': truthJson(truth) },
  }));
}
