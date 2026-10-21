// $0 checks of the init --auto cases: each fixture materializes, its expected config passes the real scaffold, `config validate`
// and `config packs`, every planted convention quotes a real line, and the deterministic graders pass on a hand-built good
// run and fail on an empty or half-done one. No model runs here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { materialize } from '../../fixtures/materialize.mjs';
import { FIXTURES, fixtureByName } from '../../fixtures/definitions.mjs';
import { EVALS, render } from './cases.mjs';
import { INIT_TRUTHS, expectedConfig, modulesOf } from './init-cases.mjs';

const ROOT = path.dirname(EVALS);
const CLI = path.join(ROOT, 'scripts', 'ambicode.mjs');
const SCAFFOLD = path.join(ROOT, 'skills', 'init', 'scripts', 'scaffold.mjs');
const FILES = render();

/** What a model would write for each convention: a paraphrase, so the tight patterns are tested on prose and not on the quote alone. */
const WORDING = {
  'context-index-imports': 'Reach another context through its index.ts, never through its domain or application folders.',
  'event-names': 'Name events <context>.<past-tense-verb>, for example lending.loan-returned.',
  'use-case-factories': 'Write each use case as a factory: (deps: CatalogDeps) => async (input) => result.',
  'create-returns-result': 'Build entities with createX functions that return Result<Entity, DomainError>.',
  'tw-error-codes': 'Raise TidewatchError subclasses with a TW-nnn code as the first argument.',
  'test-names': 'Name tests test_<module>__<behaviour>, with a double underscore.',
  'keyword-only-args': 'Take every parameter after the first as a keyword-only argument.',
  'plugin-constant': 'Each adapter folder ends plugin.py with PLUGIN = SourcePlugin(name=..., parse=...).',
  'wrap-with-operation': 'Wrap each returned error with the package and function that returns it: pkg.Func: %w.',
  'injected-clock': 'Take a core.Clock instead of calling time.Now outside internal/clock.',
  'core-interfaces': 'Constructors take interfaces from internal/core, such as core.Store and core.Clock.',
  'interface-assertions': 'Assert that a type satisfies its interface with var _ core.Store = (*Store)(nil).',
  'value-class-ids': 'Identifiers are value classes, never a bare String in a signature.',
  'outcome-not-exceptions': 'Return an expected failure as Outcome.Rejected instead of throwing.',
  'structured-log-keys': 'Log with structured key-values through addKeyValue.',
  'use-case-invoke': 'Every use case is a class with a single operator fun invoke.',
  'deci-celsius-names': 'Name every temperature with a _dc suffix: tenths of a degree Celsius.',
  'invariant-expect': 'Use expect with an invariant: message instead of unwrap.',
  'register-app-routes': 'Each routes module exports register(app) and the server calls it.',
  'error-trait-impl': 'Every crate error type implements std::error::Error.',
};

/** What a scout would say after reading only folder and file names: none of it may satisfy a convention's pattern. */
const NAME_GUESS = {
  'context-index-imports': 'Contexts are separate folders under src/contexts.',
  'event-names': 'There is a shared event bus in the shared kernel.',
  'use-case-factories': 'Use cases live in the application folder of each context.',
  'create-returns-result': 'Domain code returns a Result type.',
  'tw-error-codes': 'Errors live in domain/errors.py and are named after what went wrong.',
  'test-names': 'Tests sit in tests/ with one file per module.',
  'keyword-only-args': 'Handlers are in api/handlers, one file per endpoint.',
  'plugin-constant': 'Feed adapters are in plugins/sources, one folder per feed.',
  'wrap-with-operation': 'Errors are returned, not thrown.',
  'injected-clock': 'There is a clock package.',
  'core-interfaces': 'internal/core holds the shared types.',
  'interface-assertions': 'Each package has a constructor named New.',
  'value-class-ids': 'There are ids in the domain.',
  'outcome-not-exceptions': 'The domain has an Outcome type.',
  'structured-log-keys': 'Services write log lines.',
  'use-case-invoke': 'Use cases are in application/usecase.',
  'deci-celsius-names': 'Temperatures are integers.',
  'invariant-expect': 'Rust code checks its inputs.',
  'register-app-routes': 'Routes are in dashboard/src/routes.',
  'error-trait-impl': 'Each crate has an error module.',
};

const frontmatter = (text) => parse(text.split('---')[1]);
const graderTexts = (name) => [...FILES].filter(([file]) => file.startsWith(`cases/${name}/graders/`)).map(([file, text]) => ({ name: path.basename(file, '.md'), ...frontmatter(text) }));

const listFiles = (dir, base = '') => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? listFiles(path.join(dir, entry.name), `${base}${entry.name}/`) : [`${base}${entry.name}`])) : []);

/** The deterministic grader types a case uses, evaluated the way the harness documents them; a missing file never matches. */
function passes(grader, workspace, trace) {
  if (grader.type === 'file_exists') {
    // The harness matches the glob against its list of created files (claude 2.1.303 `cwdDiff`): `*` is [^/]*, `**/` any directories.
    const glob = new RegExp(`^${grader.path.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*')}$`);
    return listFiles(workspace).some((file) => glob.test(file));
  }
  if (grader.type === 'regex' && grader.target === 'trace') {
    // The harness serialises one JSON line per call; the key order inside it is not known, so both orders are tried.
    const lines = trace.map((call) => JSON.stringify(call));
    const hit = new RegExp(grader.pattern).test(lines.join('\n'));
    return grader.match === 'not_contains' ? !hit : hit;
  }
  if (grader.type === 'regex') {
    const lastMessage = grader.target === 'last_message';
    const file = lastMessage ? null : path.join(workspace, grader.target.path);
    if (!lastMessage && !existsSync(file)) return false;
    const text = lastMessage ? (trace.message ?? '') : readFileSync(file, 'utf8');
    if (grader.match?.startsWith('count:')) return (text.match(new RegExp(grader.pattern, 'g')) ?? []).length === Number(grader.match.slice(6));
    const hit = new RegExp(grader.pattern).test(text);
    return grader.match === 'not_contains' ? !hit : hit;
  }
  if (grader.type === 'tool_used') {
    const pattern = new RegExp(grader.input_match);
    const count = trace.filter((call) => call.name === grader.tool && pattern.test(JSON.stringify(call.input))).length;
    return count >= (grader.min ?? 1) && (grader.max === undefined || count <= grader.max);
  }
  throw new Error(`${grader.name}: ${grader.type} is not evaluated here`);
}

const cli = (cwd, ...args) => execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

/** A run as init leaves it: scaffold, the expected config, copied packs, context stubs and one draft per planted convention. */
async function goodRun(truth, parent) {
  const repo = path.join(parent, 'repo');
  await materialize(fixtureByName(truth.fixture), repo);
  const trace = [{ name: 'Bash', input: { command: `node "/p/skills/init/scripts/scaffold.mjs" --task init` } }, { name: 'Agent', input: { subagent_type: 'ambicode:scout', prompt: 'Map this repo' } }];
  execFileSync(process.execPath, [SCAFFOLD, '--task', 'init'], { cwd: repo });
  writeFileSync(path.join(repo, '.ambicode', 'config.yaml'), expectedConfig(truth));
  assert.equal(cli(repo, 'config', 'validate').trim(), 'ok');
  cli(repo, 'config', 'packs', '--task', 'init');
  trace.push({ name: 'Bash', input: { command: 'node ambicode.mjs config packs --task init' } }, { name: 'Bash', input: { command: 'node ambicode.mjs config validate --task init' } });
  const context = path.join(repo, '.ambicode', 'context');
  const modules = modulesOf(truth);
  // conventions.md paraphrases each planted convention in descriptive wording (no must/never/always).
  const described = truth.conventions.map((convention) => `- ${WORDING[convention.id].replace(/\b(never|must|always)\b/gi, 'not')}\n`).join('');
  for (const name of ['overview', 'navigation']) writeFileSync(path.join(context, `${name}.md`), `# ${name}\n\n- Everything here is a description of the code as it is.\n`);
  writeFileSync(path.join(context, 'conventions.md'), `# conventions\n\n${described}`);
  for (const module of modules) {
    mkdirSync(path.dirname(path.join(context, module.note)), { recursive: true });
    writeFileSync(path.join(context, module.note), `# ${module.dir} module\n`);
  }
  writeFileSync(path.join(context, 'index.md'), `# Index\n${modules.map((module) => `${'  '.repeat(module.depth - 1)}- [${module.dir}](${module.note})\n`).join('')}`);
  trace.push({ name: 'Read', input: { file_path: path.join(repo, truth.doc) } });
  const commands = truth.projects.flatMap((project) => Object.values(project.checks).map((check) => check.all));
  trace.message = `Projects: ${truth.projects.map((project) => project.id).join(', ')} (${truth.nameInSummary ?? ''}). Config validate passed. Packs: common-design and the other common packs. Checks found: ${commands.join(', ')}. Missing: no end-to-end check. Context files: overview.md, navigation.md, conventions.md, index.md. Drafts waiting: none.\n`;
  mkdirSync(path.join(repo, '.ambicode', 'policies', 'drafts'), { recursive: true });
  for (const convention of truth.conventions) {
    const file = path.join(repo, '.ambicode', 'policies', 'drafts', `${convention.id}.yaml`);
    const content = `schemaVersion: 1\nid: ${convention.id}\nrules:\n  - id: ${convention.id}\n    instruction: ${WORDING[convention.id]}\n    source: { quote: ${JSON.stringify(convention.quote)}, location: ${JSON.stringify(convention.location)} }\n`;
    writeFileSync(file, content);
    trace.push({ name: 'Write', input: { file_path: file, content } });
  }
  return { repo, trace };
}

describe('init --auto cases', () => {
  it('five cases, each on a different fixture', () => {
    assert.deepEqual(INIT_TRUTHS.map((truth) => truth.slug), ['ts', 'python', 'go', 'jvm', 'monorepo']);
    assert.equal(new Set(INIT_TRUTHS.map((truth) => truth.fixture)).size, 5);
  });

  for (const truth of INIT_TRUTHS) {
    const name = `init-auto-${truth.slug}`;
    const fixture = fixtureByName(truth.fixture);
    const written = Object.assign({}, ...fixture.steps.map((step) => step.write ?? {}));

    it(`${name}: the fixture has 60-150 files, about 30 modules, and every planted convention quotes a real line`, () => {
      assert.ok(Object.keys(written).length >= 60 && Object.keys(written).length <= 150, `${Object.keys(written).length} files`);
      const modules = modulesOf(truth);
      // jvm (41) and monorepo (33) count the notes of the scout's top-level roots, which add one overview.md per root with submodules.
      assert.ok(modules.length >= 28 && modules.length <= 42, `${modules.length} modules`);
      assert.equal(truth.conventions.length, 4);
      assert.equal(truth.conventions.filter((convention) => convention.basis === 'inferred').length, 2);
      for (const convention of truth.conventions) {
        assert.ok(convention.quote.length >= 20, `${convention.id}: quote under 20 characters`);
        const [file, line] = convention.location.split(/:(?=\d+$)/);
        assert.ok(written[file] !== undefined, `${convention.id}: ${file} is not in the fixture`);
        assert.ok(written[file].split('\n')[Number(line) - 1].includes(convention.quote), `${convention.id}: line ${line} of ${file} lacks the quote`);
        if (convention.document !== undefined) {
          const [doc, docLine] = convention.document.split(/:(?=\d+$)/);
          assert.ok(written[doc].split('\n')[Number(docLine) - 1].length > 0, `${convention.id}: ${convention.document} is empty`);
        }
        // A written convention is in the contributor document; an inferred one must not be.
        const documented = convention.location.startsWith(`${truth.doc}:`) || convention.document !== undefined;
        assert.equal(documented, convention.basis === 'written', `${convention.id}: basis ${convention.basis}`);
      }
    });

    it(`${name}: the expected config passes scaffold, config validate and config packs; graders pass on a good run and fail on bad ones`, async () => {
      const parent = mkdtempSync(path.join(tmpdir(), 'init-case-'));
      try {
        const { repo, trace } = await goodRun(truth, parent);
        const graders = graderTexts(name).filter((grader) => grader.type !== 'llm');
        assert.ok(graders.length >= 30, `${graders.length} deterministic graders`);
        assert.equal(graderTexts(name).filter((grader) => grader.type === 'llm').length, 1);
        // The expected module notes are what the real `context tree` prints on the scaffolded fixture.
        const roots = truth.scoutRoots ?? [...new Set(truth.projects.flatMap((project) => project.paths.map((p) => `${project.root === '.' ? '' : `${project.root}/`}${p}`.replace(/\/$/, ''))))];
        const printed = cli(repo, 'context', 'tree', ...roots.flatMap((root) => ['--root', root])).split('\n').filter((line) => line.startsWith('modules/')).map((line) => line.split(/\s+/)[0]);
        assert.deepEqual(modulesOf(truth).map((module) => module.note), printed, 'module notes match context tree');
        const failing = graders.filter((grader) => !passes(grader, repo, trace)).map((grader) => grader.name);
        assert.deepEqual(failing, [], 'graders failing on the good run');

        // Scaffold only: what a run that stops after step 1 leaves behind.
        const bare = path.join(parent, 'bare');
        await materialize(fixtureByName(truth.fixture), bare);
        execFileSync(process.execPath, [SCAFFOLD, '--task', 'init'], { cwd: bare });
        const scaffoldOnly = graders.filter((grader) => passes(grader, bare, [])).map((grader) => grader.name);
        const mustFail = graders.filter((grader) => !['never', 'no-misfit-pack', 'no-config-rules', 'gitignore-has-ambicode', 'config-written', 'schema-version', 'projects-single'].some((kept) => grader.name === kept || (kept === 'never' && grader.max === 0)));
        assert.deepEqual(mustFail.filter((grader) => scaffoldOnly.includes(grader.name)).map((grader) => grader.name), [], 'graders passing on a scaffold-only run');

        // Empty directory and empty trace: only the "never" graders may pass.
        const empty = mkdtempSync(path.join(parent, 'empty-'));
        assert.deepEqual(graders.filter((grader) => passes(grader, empty, [])).map((grader) => grader.name).sort(), graders.filter((grader) => grader.max === 0).map((grader) => grader.name).sort());

        // A misfit pack and an inline rules key each trip their grader.
        const config = path.join(repo, '.ambicode', 'config.yaml');
        const original = readFileSync(config, 'utf8');
        writeFileSync(config, `${original}    - builtin/angular-http\n`);
        assert.equal(passes(graders.find((grader) => grader.name === 'no-misfit-pack'), repo, trace), false);
        writeFileSync(config, `${original}rules:\n  - id: x\n    instruction: y\n`);
        assert.equal(passes(graders.find((grader) => grader.name === 'no-config-rules'), repo, trace), false);
        writeFileSync(config, original);

        // Scout output that is wrong in one place trips only the grader for that place.
        const context = path.join(repo, '.ambicode', 'context');
        const indexFile = path.join(context, 'index.md');
        const index = readFileSync(indexFile, 'utf8');
        const modules = modulesOf(truth);
        writeFileSync(indexFile, index.split('\n').filter((line) => !line.includes(`(${modules[2].note})`)).join('\n'));
        const afterDrop = graders.filter((grader) => !passes(grader, repo, trace)).map((grader) => grader.name);
        assert.deepEqual(afterDrop.filter((grader) => grader.startsWith('modules-linked-')), [`modules-linked-1-of-${Math.ceil(modules.length / 6)}`], 'only the coverage group that names the dropped module fails');
        assert.ok(afterDrop.includes('index-links-every-module') && afterDrop.includes('index-has-no-extra-notes'), 'the whole-tree grader and the count both see a missing module');
        writeFileSync(indexFile, `${index}- [invented](modules/invented.md)\n`);
        assert.equal(passes(graders.find((grader) => grader.name === 'index-has-no-extra-notes'), repo, trace), false);
        assert.equal(passes(graders.find((grader) => grader.name === 'index-links-every-module'), repo, trace), true);
        writeFileSync(indexFile, index);
        const conventions = path.join(context, 'conventions.md');
        writeFileSync(conventions, '# conventions\n\n- Every handler must return a reply.\n');
        assert.equal(passes(graders.find((grader) => grader.name === 'conventions-descriptive'), repo, trace), false);
        assert.equal(passes(graders.find((grader) => grader.name === 'contributor-doc-read'), repo, trace.filter((call) => call.name !== 'Read')), false);

        // Each summary regex fails when its fact is absent from the final message.
        const summaryGraders = graders.filter((grader) => grader.name.startsWith('summary-'));
        assert.equal(summaryGraders.length, 6);
        for (const grader of summaryGraders) {
          assert.equal(passes(grader, repo, trace), true, `${grader.name} on the good summary`);
          assert.equal(passes(grader, repo, Object.assign([], { message: 'Done.' })), false, `${grader.name} on a summary with nothing in it`);
        }

        // The scout-convention graders read conventions.md: a paraphrase passes, a names-only guess fails, and each is independent.
        const conventionsFile = path.join(context, 'conventions.md');
        const goodConventions = `# conventions\n\n${truth.conventions.map((convention) => `- ${WORDING[convention.id].replace(/\b(never|must|always)\b/gi, 'not')}\n`).join('')}`;
        writeFileSync(conventionsFile, goodConventions);
        for (const convention of truth.conventions) {
          const grader = graders.find((one) => one.name === `scout-convention-${convention.id}`);
          assert.ok(grader, `${convention.id}: scout-convention grader exists`);
          assert.equal(grader.target.path, '.ambicode/context/conventions.md');
          assert.equal(passes(grader, repo, []), true, `${convention.id}: paraphrase in conventions.md`);
          writeFileSync(conventionsFile, `# conventions\n\n- ${NAME_GUESS[convention.id]}\n`);
          assert.equal(passes(grader, repo, []), false, `${convention.id}: name-only guess in conventions.md`);
          writeFileSync(conventionsFile, goodConventions);
        }

        // Each planted convention's draft grader accepts a paraphrase of the rule and refuses what folder names alone give.
        for (const convention of truth.conventions) {
          const grader = graders.find((one) => one.name === `draft-${convention.id}`);
          const draft = (text) => [{ name: 'Write', input: { file_path: '/r/.ambicode/policies/drafts/a.yaml', content: `instruction: ${text}` } }];
          assert.equal(passes(grader, '/nowhere', draft(WORDING[convention.id])), true, `${convention.id}: paraphrase`);
          assert.equal(passes(grader, '/nowhere', draft(NAME_GUESS[convention.id])), false, `${convention.id}: name-only guess`);
        }
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });
  }

  it('root-or-paths accepts a top-level folder holding a truth path and rejects unrelated or look-alike ones', () => {
    const truth = INIT_TRUTHS.find((one) => one.slug === 'jvm');
    const grader = graderTexts('init-auto-jvm').find((one) => one.name === 'root-or-paths');
    const parent = mkdtempSync(path.join(tmpdir(), 'init-paths-'));
    try {
      const verdict = (paths) => {
        mkdirSync(path.join(parent, '.ambicode'), { recursive: true });
        writeFileSync(path.join(parent, '.ambicode', 'config.yaml'), `projects:\n  - id: x\n    root: .\n    paths: ${paths}\n    ecosystem: { languages: [ kotlin ] }\n`);
        return passes(grader, parent, []);
      };
      assert.equal(verdict(`[ ${truth.projects[0].paths.join(', ')} ]`), true, 'the full truth paths');
      assert.equal(verdict('[ adapters, application, bootstrap, domain ]'), true, 'top-level folders');
      assert.equal(verdict('[ domain/ ]'), true, 'one top-level folder with a slash');
      assert.equal(verdict('[ lib, tools ]'), false, 'unrelated folders');
      assert.equal(verdict('[ domains ]'), false, 'a look-alike name');
      assert.equal(verdict('[ other/domain ]'), false, 'the name under another folder');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('a draft that misses a planted convention fails only its grader', () => {
    const grader = graderTexts('init-auto-go').find((one) => one.name === 'draft-injected-clock');
    const draft = (text) => [{ name: 'Write', input: { file_path: '/r/.ambicode/policies/drafts/a.yaml', content: text } }];
    assert.equal(passes(grader, '/nowhere', draft('instruction: Take a core.Clock instead of calling time.Now')), true);
    assert.equal(passes(grader, '/nowhere', draft('instruction: Wrap errors with %w')), false);
    assert.equal(passes(grader, '/nowhere', [{ name: 'Write', input: { file_path: '/r/src/x.go', content: 'time.Now' } }]), false);
  });

  it('the harness has Agent for the scout-invoked grader', () => {
    for (const truth of INIT_TRUTHS) assert.match(FILES.get(`cases/init-auto-${truth.slug}/prompt.md`), /allowed_tools: \[[^\]]*\bAgent\b/);
  });

  describe('draft graders read the produced files and the call that wrote them, whatever the tool', () => {
    const drafted = (name, truth) => truth.conventions.map((c) => graderTexts(name).find((one) => one.name === `draft-${c.id}`));
    const at = (cmd) => [{ name: 'Bash', input: { command: cmd } }];

    it('a Bash heredoc and an Edit count; a Read of the reference text and a write outside the drafts folder do not', () => {
      const truth = INIT_TRUTHS.find((one) => one.slug === 'go');
      const grader = graderTexts('init-auto-go').find((one) => one.name === 'draft-injected-clock');
      const body = 'instruction: Take a core.Clock instead of calling time.Now';
      assert.equal(passes(grader, '/nowhere', at(`mkdir -p .ambicode/policies/drafts && cat > .ambicode/policies/drafts/go.yaml <<'EOF'\n${body}\nEOF`)), true, 'heredoc');
      assert.equal(passes(grader, '/nowhere', [{ name: 'Edit', input: { file_path: '/r/.ambicode/policies/drafts/go.yaml', old_string: 'x', new_string: body } }]), true, 'edit');
      assert.equal(passes(grader, '/nowhere', [{ input: { file_path: '/r/.ambicode/policies/drafts/go.yaml', content: body }, name: 'Write' }]), true, 'key order');
      assert.equal(passes(grader, '/nowhere', [{ name: 'Read', input: { file_path: '/p/skills/init/references/rules.md' }, output: `drafts go in .ambicode/policies/drafts/ ${body}` }]), false, 'read');
      assert.equal(passes(grader, '/nowhere', at(`cat > notes.md <<'EOF'\n${body}\nEOF`)), false, 'elsewhere');
      assert.equal(truth.conventions.length, 4);
    });

    it('drafts-written is a glob over the created files, so any tool counts and an empty drafts folder does not', () => {
      const grader = graderTexts('init-auto-go').find((one) => one.name === 'drafts-written');
      assert.equal(grader.type, 'file_exists');
      const parent = mkdtempSync(path.join(tmpdir(), 'init-drafts-'));
      try {
        mkdirSync(path.join(parent, '.ambicode', 'policies', 'drafts'), { recursive: true });
        assert.equal(passes(grader, parent, []), false, 'empty folder');
        writeFileSync(path.join(parent, '.ambicode', 'policies', 'drafts', 'a.yaml'), 'id: a\n');
        assert.equal(passes(grader, parent, []), true, 'one draft');
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });

    // Real runs of 2026-10-21 (traces in this repo, workspaces in the sibling eval-archive); skipped where the archive is absent.
    const TRACES = path.join(ROOT, 'evals', 'cases', 'results', 'traces', 'plugin');
    const ARCHIVE = path.join(ROOT, '..', 'eval-archive', 'evals', 'cases', 'results', 'traces', 'plugin');
    const calls = (file) => readFileSync(file, 'utf8').split('\n').flatMap((line) => {
      try { return (JSON.parse(line).message?.content ?? []).filter((block) => block.type === 'tool_use').map(({ name, input }) => ({ name, input })); } catch { return []; }
    });
    const run = (stamp, name) => ({ trace: path.join(TRACES, stamp, `${name}.jsonl`), workspace: path.join(ARCHIVE, stamp, `${name}.ambicode`) });

    it('a monorepo run that drafted by heredoc passes drafts-written and the drafts it wrote', { skip: !existsSync(run('2026-10-21T07-07-36-777Z', 'init-auto-monorepo-2').workspace) }, () => {
      const { trace, workspace } = run('2026-10-21T07-07-36-777Z', 'init-auto-monorepo-2');
      const truth = INIT_TRUTHS.find((one) => one.slug === 'monorepo');
      const heredoc = calls(trace).filter((call) => call.name === 'Bash' && /drafts\//.test(call.input.command));
      assert.ok(heredoc.length > 0, 'the run drafted through Bash');
      assert.equal(calls(trace).filter((call) => call.name === 'Write' && /drafts\//.test(call.input.file_path)).length, 0, 'no Write drafted');
      assert.equal(passes(graderTexts('init-auto-monorepo').find((one) => one.name === 'drafts-written'), workspace, calls(trace)), true);
      const verdicts = Object.fromEntries(drafted('init-auto-monorepo', truth).map((grader) => [grader.name, passes(grader, workspace, calls(trace))]));
      assert.ok(Object.values(verdicts).some(Boolean), JSON.stringify(verdicts));
    });

    it('summary-reports-validate accepts "validate passes" and "validation passes" and still rejects a summary without a validate verdict', () => {
      const finalMessage = (file) => readFileSync(file, 'utf8').split('\n').flatMap((line) => {
        try { const entry = JSON.parse(line); return entry.type === 'assistant' && !entry.parent_tool_use_id ? entry.message.content.filter((block) => block.type === 'text').map((block) => block.text) : []; } catch { return []; }
      }).at(-1);
      // These 7 final messages of 2026-10-21T07-55..08-04 all report a passing validate in the words "passes" or "validates"; the old pattern failed them.
      for (const [stamp, slug, n] of [['07-55-55-899Z', 'ts', 2], ['07-55-55-899Z', 'ts', 3], ['08-00-09-856Z', 'go', 2], ['08-00-09-856Z', 'go', 3], ['08-02-09-331Z', 'jvm', 2], ['08-02-09-331Z', 'jvm', 3], ['08-04-39-209Z', 'monorepo', 1]]) {
        const file = path.join(TRACES, `2026-10-21T${stamp}`, `init-auto-${slug}-${n}.jsonl`);
        if (!existsSync(file)) continue;
        assert.equal(passes(graderTexts(`init-auto-${slug}`).find((one) => one.name === 'summary-reports-validate'), '/nowhere', { message: finalMessage(file) }), true, `${slug}-${n}`);
      }
      const grader = graderTexts('init-auto-go').find((one) => one.name === 'summary-reports-validate');
      for (const [text, expected] of [['Config validation passes.', true], ['`config validate` passed.', true], ['The config validates.', true], ['config validate: ok', true], ['config validate failed with 2 errors', false], ['The config is invalid.', false], ['Packs and checks listed.', false]]) {
        assert.equal(passes(grader, '/nowhere', { message: text }), expected, text);
      }
    });

    it('a python run that wrote no draft still fails drafts-written and every draft grader', { skip: !existsSync(run('2026-10-21T06-09-32-705Z', 'init-auto-python-1').workspace) }, () => {
      for (const n of [1, 2]) {
        const { trace, workspace } = run('2026-10-21T06-09-32-705Z', `init-auto-python-${n}`);
        const truth = INIT_TRUTHS.find((one) => one.slug === 'python');
        assert.equal(passes(graderTexts('init-auto-python').find((one) => one.name === 'drafts-written'), workspace, calls(trace)), false, `run ${n}: drafts-written`);
        for (const grader of drafted('init-auto-python', truth)) assert.equal(passes(grader, workspace, calls(trace)), false, `run ${n}: ${grader.name}`);
      }
    });
  });

  it('every new fixture is an uninitialised repository with no install step', () => {
    for (const truth of INIT_TRUTHS) assert.equal(fixtureByName(truth.fixture).install, undefined);
    assert.equal(FIXTURES.filter((fixture) => /^(ts-service|py-service|go-module|jvm-gradle|monorepo-rust)/.test(fixture.name)).length, 5);
  });
});
