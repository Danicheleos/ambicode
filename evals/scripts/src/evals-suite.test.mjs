// Fixture tests run under a two-matcher `test`/`expect` shim rather than jest: fixtures install
// nothing by default, and a fixture's test is two lines of `toEqual`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadScaffolds } from './evals-reviewer.mjs';
import { fixtureByName } from '../../../fixtures/definitions.mjs';
import { FIXTURE_DATE, installPlanFor, materialize } from '../../../fixtures/materialize.mjs';
import { renderReport } from '../../../src/review/report.ts';
import { reviewResult } from '../../../src/testing/review-fixture.ts';
import { formatJsonOutput } from '../../../src/util/json-output.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EVALS = path.join(ROOT, 'evals', 'evals-archived', 'typescript');

async function loadCases() {
  const cases = [];
  for (const entry of await readdir(EVALS, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'results') continue;
    const graderDirectory = path.join(EVALS, entry.name, 'graders');
    const graders = [];
    for (const name of (await readdir(graderDirectory)).filter((file) => file.endsWith('.md')).sort()) {
      const source = await readFile(path.join(graderDirectory, name), 'utf8');
      const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(source);
      assert.ok(match, `${entry.name}/graders/${name} has no frontmatter`);
      graders.push({ name, ...parseYaml(match[1]), body: source.slice(match[0].length) });
    }
    cases.push({ name: entry.name, graders });
  }
  assert.ok(cases.length > 0, 'no eval case found');
  // The harness collects `<eval dir>/**/case.yaml`, so a Python case moved in here would run
  // with this suite again.
  assert.deepEqual(
    cases.filter((evalCase) => evalCase.name.endsWith('-py')).map((evalCase) => evalCase.name),
    [],
    'Python cases are archived in evals/evals-archived/, beside this suite',
  );
  return cases;
}

function gitOutput(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function skillSubcommands() {
  const subcommands = new Set();
  for (const file of await readdir(path.join(ROOT, 'skills'), { recursive: true })) {
    if (!file.endsWith('.md')) continue;
    const source = await readFile(path.join(ROOT, 'skills', file), 'utf8');
    for (const match of source.matchAll(/ambicode\.mjs" ([a-z-]+)/g)) subcommands.add(match[1]);
  }
  assert.ok(subcommands.has('review'), 'the skills no longer call ambicode.mjs review');
  return [...subcommands];
}

/**
 * `new Function` rather than `node:vm`: arrays built by the module and by the test's literals
 * must share one `Array.prototype`, or `deepStrictEqual` fails on identical contents.
 */
function runJestStyle(source, require) {
  const cases = [];
  const test = (name, body) => cases.push({ name, body });
  const expect = (actual) => ({
    toBe: (expected) => assert.strictEqual(actual, expected),
    toEqual: (expected) => assert.deepStrictEqual(actual, expected),
  });
  new Function('require', 'test', 'expect', source)(require, test, expect);
  return cases.map(({ name, body }) => {
    try {
      body();
      return { name, passed: true };
    } catch (error) {
      return { name, passed: false, error: error.message };
    }
  });
}

describe('a fixture has the same commits whenever and wherever it is built', () => {
  let scratch;

  before(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-evals-'));
  });

  after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('dates every commit at the fixed fixture date, so HEAD is reproducible', async () => {
    const heads = [];
    for (const name of ['first', 'second']) {
      const repo = path.join(scratch, name);
      await materialize(fixtureByName('ts-off-by-one'), repo);
      const dates = execFileSync('git', ['log', '--format=%aI %cI'], { cwd: repo, encoding: 'utf8' }).trim().split('\n');
      assert.ok(dates.length > 0);
      for (const line of dates) {
        assert.deepEqual(line.split(' ').map((date) => new Date(date).toISOString()), [
          new Date(FIXTURE_DATE).toISOString(),
          new Date(FIXTURE_DATE).toISOString(),
        ]);
      }
      heads.push(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim());
    }
    assert.equal(heads[0], heads[1]);
  });
});

describe('correctness-ts: ts-off-by-one is a boundary the existing test does not cover', () => {
  let scratch;
  let repo;

  before(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-evals-'));
    repo = path.join(scratch, 'repo');
    await materialize(fixtureByName('ts-off-by-one'), repo);
  });

  after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('keeps the existing test passing under the uncommitted change', async () => {
    const testFile = path.join(repo, 'tests', 'page.test.js');
    const outcomes = runJestStyle(await readFile(testFile, 'utf8'), createRequire(testFile));
    assert.ok(outcomes.length > 0, 'the fixture test declares no test');
    assert.deepEqual(
      outcomes.filter((outcome) => !outcome.passed),
      [],
      'the ground truth says the existing test still passes under the defect',
    );
  });

  it('also passes the existing test on the committed code, so it is a genuine pre-existing test', async () => {
    const testFile = path.join(repo, 'tests', 'page.test.js');
    const committed = execFileSync('git', ['show', 'HEAD:src/page.js'], { cwd: repo, encoding: 'utf8' });
    const module = { exports: {} };
    new Function('module', committed)(module);
    const committedRequire = (specifier) => {
      assert.equal(specifier, '../src/page', 'the fixture test requires something else');
      return module.exports;
    };
    const outcomes = runJestStyle(await readFile(testFile, 'utf8'), committedRequire);
    assert.ok(outcomes.length > 0);
    assert.deepEqual(outcomes.filter((outcome) => !outcome.passed), []);
  });

  it('still carries the defect the case is graded on: a full page loses its last item', () => {
    const { page } = createRequire(path.join(repo, 'package.json'))('./src/page.js');
    assert.deepEqual(page([1, 2, 3, 4], 0, 2), [1]);
  });
});

// `tool_used.input_match` is a regex over the tool call's JSON-encoded input, in which the prescribed
// `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" review` appears as `ambicode.mjs\\" review`.
describe('eval graders: Bash indicators match the command the skills prescribe', () => {
  const roots = ['${CLAUDE_PLUGIN_ROOT}', '/Users/someone/.claude/plugins/cache/ambicode/ambicode/0.3.1'];

  it('every Bash tool_used pattern matches both the bundled and the bare form of the subcommand it names', async () => {
    const subcommands = await skillSubcommands();
    const failures = [];
    for (const evalCase of await loadCases()) {
      for (const grader of evalCase.graders) {
        if (grader.type !== 'tool_used' || grader.tool !== 'Bash') continue;
        const where = `${evalCase.name}/graders/${grader.name} (${grader.input_match})`;
        const pattern = new RegExp(grader.input_match);
        // Only `prepare` takes `--term`, so only its probe carries it.
        const probeArgs = (sub) => (sub === 'prepare' ? ' --term x' : '');
        const named = subcommands.filter((sub) => pattern.test(JSON.stringify({ command: `ambicode ${sub}${probeArgs(sub)}` })));
        if (named.length === 0) {
          failures.push(`${where}: matches no bare \`ambicode <subcommand>\` a skill uses`);
          continue;
        }
        for (const sub of named) {
          for (const root of roots) {
            const command = `node "${root}/scripts/ambicode.mjs" ${sub} --json${probeArgs(sub)}`;
            if (!pattern.test(JSON.stringify({ command }))) failures.push(`${where}: misses ${command}`);
          }
        }
      }
    }
    assert.deepEqual(failures, []);
  });
});

// In a two-arm run the harness drops `arm: with-only` graders and `tool_used` on `Skill`, and
// scores all of them when that drops every grader. Outcome graders weigh 3, hygiene graders 1.
describe('eval graders: every case scores its outcome in both arms', () => {
  it('has a grader that survives two-arm exclusion and outweighs the hygiene graders', async () => {
    const failures = [];
    for (const evalCase of await loadCases()) {
      const outcome = evalCase.graders.filter(
        (grader) =>
          grader.arm !== 'with-only' &&
          !(grader.type === 'tool_used' && grader.tool === 'Skill') &&
          (grader.weight ?? 1) > 1,
      );
      if (outcome.length === 0) failures.push(evalCase.name);
    }
    assert.deepEqual(failures, []);
  });
});

// A scaffold finds the repository by counting `../` from its own directory, so moving a
// suite silently breaks every one of them.
describe('eval scaffolds: every tracked scaffold reaches the repository root', () => {
  const SUITES = ['evals/evals-archived', 'evals/evals-triggers'];
  const ROOT_EXPRESSION = /"\$\(cd "\$\(dirname "\$0"\)\/((?:\.\.\/)*\.\.)" && pwd\)\/fixtures\/materialize\.mjs"/g;

  async function scaffoldsUnder(directory) {
    const found = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'results') continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) found.push(...(await scaffoldsUnder(full)));
      else if (entry.name === 'scaffold.sh') found.push(full);
    }
    return found;
  }

  it('resolves each scaffold\'s one root expression to fixtures/materialize.mjs', async () => {
    const wrong = [];
    let checked = 0;
    for (const suite of SUITES)
      for (const file of await scaffoldsUnder(path.join(ROOT, suite))) {
        checked += 1;
        const hits = [...(await readFile(file, 'utf8')).matchAll(ROOT_EXPRESSION)];
        const where = path.relative(ROOT, file);
        if (hits.length !== 1) wrong.push(`${where}: ${hits.length} root expressions`);
        else if (path.resolve(path.dirname(file), hits[0][1]) !== ROOT) wrong.push(`${where}: ${hits[0][1]} lands at ${path.resolve(path.dirname(file), hits[0][1])}`);
      }
    assert.deepEqual(wrong, []);
    assert.ok(checked >= 27, `found only ${checked} scaffolds: a suite moved out from under this test`);
  });
});

describe('eval scaffolds: every fixture is configured before its change', () => {
  let scratch;

  before(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-evals-init-'));
  });

  after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('passes --ambicode-init in every scaffold that does not write its own config', async () => {
    const missing = (await loadScaffolds())
      .filter((scaffold) => !scaffold.source.includes('.ambicode/config.yaml'))
      .filter((scaffold) => !/materialize\.mjs" .*--ambicode-init/.test(scaffold.source))
      .map((scaffold) => scaffold.name);
    assert.deepEqual(missing, []);
  });

  it('commits the config on top of the fixture and leaves the uncommitted change byte-identical', async () => {
    const fixtures = [...new Set((await loadScaffolds()).map((scaffold) => scaffold.fixture))].sort();
    const pairs = await Promise.all(
      fixtures.map(async (name) => ({
        name,
        plain: await materialize(fixtureByName(name), path.join(scratch, name, 'plain')),
        configured: await materialize(fixtureByName(name), path.join(scratch, name, 'configured'), {
          ambicodeInit: true,
        }),
      })),
    );
    for (const { name, plain, configured } of pairs) {
      gitOutput(configured, ['ls-files', '--error-unmatch', '.ambicode/config.yaml']);
      assert.equal(
        gitOutput(configured, ['rev-parse', 'HEAD~1^{tree}']),
        gitOutput(plain, ['rev-parse', 'HEAD^{tree}']),
        `${name}: the commit under the config commit is not the fixture's own`,
      );
      assert.deepEqual(
        gitOutput(configured, ['diff', '--name-only', 'HEAD~1', 'HEAD']).trim().split('\n'),
        ['.ambicode/config.yaml', '.gitignore'],
        `${name}: the config commit touches more than init writes`,
      );
      for (const args of [
        ['status', '--porcelain=v1', '--untracked-files=all'],
        ['diff', '--cached'],
        ['diff'],
      ]) {
        assert.equal(gitOutput(configured, args), gitOutput(plain, args), `${name}: git ${args.join(' ')} differs`);
      }
    }
  });

  it('keeps clean-ts\'s same-length revert invisible and its staged/unstaged split', async () => {
    const repo = await materialize(fixtureByName('ts-staged-unstaged'), path.join(scratch, 'split'), {
      ambicodeInit: true,
    });
    // The index still holds the staged `99`; only the work tree is back to the
    // committed bytes, so the file is in `status` but not in the working target.
    assert.deepEqual(gitOutput(repo, ['diff', 'HEAD', '--name-only']).trim().split('\n'), [
      'src/staged.ts',
      'src/unstaged.ts',
    ]);
    const status = gitOutput(repo, ['status', '--porcelain=v1']);
    assert.match(status, /^M  src\/staged\.ts$/m);
    assert.match(status, /^ M src\/unstaged\.ts$/m);
    assert.match(status, /^MM src\/reverted\.ts$/m);
  });

  it('takes the option on the command line the scaffolds use', () => {
    const repo = path.join(scratch, 'cli');
    execFileSync(
      process.execPath,
      [path.join(ROOT, 'fixtures', 'materialize.mjs'), 'ts-no-tests', repo, '--ambicode-init'],
      { encoding: 'utf8' },
    );
    gitOutput(repo, ['ls-files', '--error-unmatch', '.ambicode/config.yaml']);
    assert.equal(gitOutput(repo, ['log', '-1', '--format=%s']).trim(), 'configure ambicode');
  });
});

// `init` detects jest only in `node_modules/.bin` and pytest only in a project `.venv`, so
// without an install every unit command is null and no test can run in either arm.
describe('eval fixtures: the verification cases get a real test runner', () => {
  it('installs jest from the committed lockfile', () => {
    assert.deepEqual(installPlanFor(fixtureByName('ts-source-regression'), '/r'), [
      ['npm', 'ci', '--include=dev', '--no-audit', '--no-fund'],
    ]);
  });

  it('installs the Python dev group the fixture declares into a project .venv', () => {
    const fixture = fixtureByName('py-source-regression');
    const declared = /^dev = \[(.*)\]$/m
      .exec(fixture.steps[0].write['pyproject.toml'])[1]
      .split(', ')
      .map((entry) => JSON.parse(entry));
    assert.deepEqual(declared, ['pytest>=9', 'ruff>=0.14']);
    assert.deepEqual(installPlanFor(fixture, '/r'), [
      ['python3', '-m', 'venv', '.venv'],
      [path.join('/r', '.venv', 'bin', 'pip'), 'install', '--quiet', '--disable-pip-version-check', ...declared],
    ]);
  });

  it('installs nothing for any other fixture', () => {
    assert.deepEqual(installPlanFor(fixtureByName('ts-off-by-one'), '/r'), []);
  });

  it('passes --install in exactly the scaffolds whose fixture declares an install', async () => {
    const wrong = (await loadScaffolds())
      .filter(
        (scaffold) =>
          (installPlanFor(fixtureByName(scaffold.fixture), '/r').length > 0) !==
          /materialize\.mjs" .*--install/.test(scaffold.source),
      )
      .map((scaffold) => scaffold.name);
    assert.deepEqual(wrong, []);
    const installing = (await loadScaffolds()).filter((scaffold) => /--install/.test(scaffold.source));
    assert.deepEqual(installing.map((scaffold) => scaffold.name).sort(), [
      'p2-task-regression-fix',
      'regression-ts',
    ]);
  });
});

// Claude Code runs a scaffold with NODE_ENV=production, under which npm omits devDependencies,
// all a fixture manifest declares. A local `file:` devDependency reproduces it without the registry.
describe('eval fixtures: an install that provides nothing fails the scaffold', () => {
  const tool = {
    'vendor/tool/package.json': JSON.stringify({ name: 'tool', version: '1.0.0', bin: { tool: 'bin/tool.js' } }),
    'vendor/tool/bin/tool.js': '#!/usr/bin/env node\n',
  };
  const manifest = JSON.stringify({ name: 'probe', private: true, devDependencies: { tool: 'file:./vendor/tool' } });
  // `npm ci` installs nothing without a lockfile; npm writes it, offline, so
  // its format follows whichever npm runs the suite.
  let lockfile;
  const fixture = (overrides) => ({
    name: 'install-probe',
    steps: [
      {
        write: {
          // npm marks the linked bin executable, a mode change git would report.
          '.gitignore': 'node_modules/\nvendor/\n',
          'package.json': manifest,
          'package-lock.json': lockfile,
          ...tool,
        },
      },
      { commit: 'init' },
    ],
    ...overrides,
  });
  let scratch;
  const saved = {};
  const harnessEnvironment = { NODE_ENV: 'production', npm_config_offline: 'true', npm_config_update_notifier: 'false' };

  before(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-evals-install-'));
    const locking = path.join(scratch, 'lock');
    for (const [relative, contents] of Object.entries({ 'package.json': manifest, ...tool })) {
      await mkdir(path.dirname(path.join(locking, relative)), { recursive: true });
      await writeFile(path.join(locking, relative), contents);
    }
    execFileSync('npm', ['install', '--package-lock-only', '--offline', '--no-audit', '--no-fund'], {
      cwd: locking,
      stdio: 'ignore',
    });
    lockfile = await readFile(path.join(locking, 'package-lock.json'), 'utf8');
    for (const [name, value] of Object.entries(harnessEnvironment)) {
      saved[name] = process.env[name];
      process.env[name] = value;
    }
  });

  after(async () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(scratch, { recursive: true, force: true });
  });

  it('installs devDependencies under NODE_ENV=production with the npm install the fixtures use', async () => {
    const npmInstall = fixtureByName('ts-source-regression').install;
    const repo = await materialize(
      fixture({ install: npmInstall, provides: ['node_modules/.bin/tool'] }),
      path.join(scratch, 'npm'),
      { install: true },
    );
    await stat(path.join(repo, 'node_modules', '.bin', 'tool'));
  });

  it('refuses an install that exits 0 without what the fixture says it provides', async () => {
    await assert.rejects(
      materialize(
        fixture({ install: [['true']], provides: ['node_modules/.bin/tool'] }),
        path.join(scratch, 'empty'),
        { install: true },
      ),
      /install-probe.*did not provide node_modules\/\.bin\/tool/,
    );
  });

  it('refuses an init that leaves a check the install was for unwired', async () => {
    await assert.rejects(
      materialize(
        fixture({ install: [['mkdir', 'node_modules']], provides: ['node_modules'], wires: ['unit'] }),
        path.join(scratch, 'unwired'),
        { install: true, ambicodeInit: true },
      ),
      /install-probe.*init left checks\.unit unwired/,
    );
  });

  it('declares what every installing fixture provides and which checks init must wire', () => {
    assert.deepEqual(
      ['ts-source-regression', 'py-source-regression'].map((name) => {
        const { provides, wires } = fixtureByName(name);
        return { name, provides, wires };
      }),
      [
        {
          name: 'ts-source-regression',
          provides: ['node_modules/.bin/jest', 'node_modules/.bin/eslint'],
          wires: ['lint', 'unit'],
        },
        { name: 'py-source-regression', provides: ['.venv/bin/pytest', '.venv/bin/ruff'], wires: ['lint'] },
      ],
    );
  });
});

// `npm ci` pins jest, but only to a lockfile that matches the manifest, and only harmlessly
// if the lockfile is not itself part of the change the agent is asked about.
describe('eval fixtures: the npm install is pinned by a committed lockfile', () => {
  const fixture = fixtureByName('ts-source-regression');
  const files = fixture.steps[0].write;
  let scratch;

  before(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-evals-lockfile-'));
  });

  after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('locks exactly the manifest it is committed beside, down to each tarball', () => {
    const manifest = JSON.parse(files['package.json']);
    const lockfile = JSON.parse(files['package-lock.json']);
    assert.equal(lockfile.name, manifest.name);
    assert.deepEqual(lockfile.packages[''].devDependencies, manifest.devDependencies);
    const unpinned = Object.entries(lockfile.packages)
      .filter(([key, entry]) => key !== '' && !(entry.resolved && entry.integrity))
      .map(([key]) => key);
    assert.deepEqual(unpinned, []);
  });

  it('commits the lockfile before the change, so the change is still one source file', async () => {
    const repo = await materialize(fixture, path.join(scratch, 'repo'));
    const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(git(['log', '--format=%s', '--', 'package-lock.json']), 'init\n');
    assert.equal(git(['show', 'HEAD:package-lock.json']), files['package-lock.json']);
    assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), ' M src/math.js\n');
  });
});

// A judge given "PASS if A" and "PASS if B" on separate lines has to guess whether both are
// needed, so every scored rubric has one "PASS only if all of:" or "PASS if either:" block.
describe('eval graders: scored rubrics state how their conditions combine', () => {
  it('has at most one PASS line in every scored llm grader', async () => {
    const ambiguous = [];
    for (const evalCase of await loadCases()) {
      for (const grader of evalCase.graders) {
        if (grader.type !== 'llm' || grader.arm === 'with-only') continue;
        if (grader.body.split('\n').filter((line) => /^PASS\b/.test(line)).length > 1) {
          ambiguous.push(`${evalCase.name}/graders/${grader.name}`);
        }
      }
    }
    assert.deepEqual(ambiguous, []);
  });
});

/** Whether a `regex` grader passes on `text`, as the harness evaluates it (`match` unset: contains). */
function regexPasses(grader, text) {
  return new RegExp(grader.pattern, grader.flags ?? '').test(text);
}

// A reply can claim a fix the file lacks, so each task case scores the file it asks for. Cases are
// replayed from their fixtures so a pattern is shown to fail on the agent's starting state.
describe('eval graders: task cases grade the file, not the reply', () => {
  const cases = [
    {
      name: 'p2-task-regression-fix',
      grader: 'add-restored.md',
      fixture: 'ts-source-regression-feature',
      file: 'src/math.js',
      correct: [
        'module.exports.add = (a, b) => a + b;\nmodule.exports.multiply = (a, b) => a * b;\n',
        'module.exports.add = (a, b) => a + b;\n',
        'module.exports.add = (a, b) => b + a;\n',
        'function add(a, b) {\n  return a + b;\n}\nmodule.exports.add = add;\n',
        '// was `a - b`, which subtracted\nmodule.exports.add = (a, b) => a + b;\n',
      ],
      wrong: [
        'module.exports.add = (a, b) => a * b;\n',
        'module.exports.add = (a, b) => Math.abs(a - b);\n',
        'module.exports.add = (a, b) => a - b; // a + b\n',
        'module.exports.add = (a, b) => a * b;\nmodule.exports.multiply = (a, b) => a * b;\n',
      ],
    },
    {
      name: 'p2-task-finding-fix-rereview',
      grader: 'page-count-added.md',
      fixture: 'ts-off-by-one',
      file: 'src/page.js',
      correct: [
        'module.exports.page = (items, index, size) => items.slice(index * size, (index + 1) * size);\n' +
          'module.exports.pageCount = (items, size) => Math.ceil(items.length / size);\n',
        'const page = (items, index, size) => items.slice(index * size, index * size + size - 1);\n' +
          'const pageCount = (items, size) => Math.ceil(items.length / size);\n' +
          'module.exports = { page, pageCount };\n',
      ],
      wrong: [
        // The helper replaced the file instead of being added next to `page`.
        'module.exports.pageCount = (items, size) => Math.ceil(items.length / size);\n',
        // Defined but never exported: the tests `require` the module.
        'module.exports.page = (items, index, size) => items.slice(index * size, (index + 1) * size);\n' +
          'const pageCount = (items, size) => Math.ceil(items.length / size);\n',
      ],
    },
    {
      name: 'p2-task-trivial',
      grader: 'implemented.md',
      fixture: 'ts-no-tests',
      // The scaffold's `git checkout -- .`: the case starts from the committed file.
      reset: true,
      file: 'src/index.ts',
      correct: [
        'export const value = 1;\nexport const double = (n: number): number => n * 2;\n',
        'export const value = 1;\n\nexport function double(value: number): number {\n  return 2 * value;\n}\n',
      ],
      wrong: [
        'export const value = 1;\nconst double = (n: number): number => n * 2;\n',
        'export const value = 1;\nexport const double = (n: number): number => n + 2;\n',
        'export const value = 1;\nexport const triple = (n: number): number => n * 3;\n',
      ],
    },
  ];

  it('has a scored regex grader over a repository file in every task case', async () => {
    const taskCases = (await loadCases()).filter((evalCase) => evalCase.name.startsWith('p2-task-'));
    assert.deepEqual(taskCases.map((evalCase) => evalCase.name).sort(), cases.map((c) => c.name).sort());
    const missing = taskCases
      .filter(
        (evalCase) =>
          !evalCase.graders.some(
            (grader) =>
              grader.type === 'regex' &&
              grader.target?.source === 'file' &&
              /^repo\//.test(grader.target.path) &&
              grader.arm !== 'with-only' &&
              (grader.weight ?? 1) > 1,
          ),
      )
      .map((evalCase) => evalCase.name);
    assert.deepEqual(missing, []);
  });

  it('fails each on the state the agent starts from, and passes only on a correct result', async () => {
    const byName = new Map((await loadCases()).map((evalCase) => [evalCase.name, evalCase]));
    const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-evals-file-graders-'));
    try {
      const failures = [];
      for (const c of cases) {
        const grader = byName.get(c.name)?.graders.find((candidate) => candidate.name === c.grader);
        assert.ok(grader, `${c.name}/graders/${c.grader} is missing`);
        assert.deepEqual(grader.target, { source: 'file', path: `repo/${c.file}` }, `${c.name}/graders/${c.grader}`);
        const repo = await materialize(fixtureByName(c.fixture), path.join(scratch, c.name));
        if (c.reset) gitOutput(repo, ['checkout', '-q', '--', '.']);
        const start = await readFile(path.join(repo, c.file), 'utf8');
        if (regexPasses(grader, start)) failures.push(`${c.name}: passes on the scaffolded ${c.file}`);
        for (const text of c.correct) {
          if (!regexPasses(grader, text)) failures.push(`${c.name}: fails ${JSON.stringify(text)}`);
        }
        for (const text of c.wrong) {
          if (regexPasses(grader, text)) failures.push(`${c.name}: passes ${JSON.stringify(text)}`);
        }
      }
      assert.deepEqual(failures, []);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});

// `helper-ran` matches the Bash input, so it passes even when review did nothing; these read what
// `review` printed. A trace is JSON per line, so printed text arrives JSON-escaped once.
describe('eval graders: trace indicators match what review prints, and only a completed run', () => {
  const traced = (printed) =>
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: printed }] } });

  /** Check keys ordered as `src/checks/run.ts` writes them, and a replay's `source` last. */
  function printed(options) {
    const plain = reviewResult({ reviewerStatus: options.reviewerStatus });
    const base = options.replay ? { ...plain, reviewer: { ...plain.reviewer, source: 'replay' } } : plain;
    const [lint] = base.checks;
    const unit = { ...lint, checkId: 'unit', adapter: 'jest', status: options.unitStatus };
    return [
      [lint, unit],
      [unit, lint],
    ].flatMap((checks) => {
      const output = {
        command: 'review',
        result: { ...base, checks },
        snapshotDirectory: '/tmp/snapshot',
        resultPath: '/work/repo/.ambicode/reviews/r-0001/result.json',
        pendingApprovals: [],
      };
      return [renderReport(output), formatJsonOutput(output)].map(traced);
    });
  }

  async function skillBodies() {
    const bodies = [];
    for (const directory of ['skills', path.join('skills', 'shared')]) {
      for (const entry of await readdir(path.join(ROOT, directory), { withFileTypes: true })) {
        const file = entry.isDirectory()
          ? path.join(directory, entry.name, 'SKILL.md')
          : path.join(directory, entry.name);
        if (!file.endsWith('.md')) continue;
        const text = await readFile(path.join(ROOT, file), 'utf8').catch(() => null);
        if (text !== null) bodies.push(traced(text));
      }
    }
    assert.ok(bodies.length > 5, 'no skill body found');
    return bodies;
  }

  async function indicator(name) {
    const copies = (await loadCases()).flatMap((evalCase) =>
      evalCase.graders.filter((grader) => grader.name === `${name}.md`).map((grader) => ({ evalCase, grader })),
    );
    assert.ok(copies.length > 0, `no case carries ${name}`);
    for (const { evalCase, grader } of copies) {
      const { body: _body, ...frontmatter } = grader;
      const { body: _first, ...expected } = copies[0].grader;
      assert.deepEqual(frontmatter, expected, `${evalCase.name}/graders/${name}.md differs from its other copies`);
    }
    assert.equal(copies[0].grader.type, 'regex');
    assert.equal(copies[0].grader.target, 'trace');
    assert.equal(copies[0].grader.arm, 'with-only');
    return { grader: copies[0].grader, cases: copies.map(({ evalCase }) => evalCase.name).sort() };
  }

  it('reviewer-completed matches an ok reviewer and never a failed or skipped one, or a skill body', async () => {
    const { grader } = await indicator('reviewer-completed');
    for (const line of printed({ reviewerStatus: 'ok', unitStatus: 'skipped' })) {
      assert.ok(regexPasses(grader, line), line.slice(0, 200));
    }
    for (const reviewerStatus of ['failed', 'not-run']) {
      for (const line of printed({ reviewerStatus, unitStatus: 'passed' })) {
        assert.ok(!regexPasses(grader, line), reviewerStatus);
      }
    }
    for (const body of await skillBodies()) assert.ok(!regexPasses(grader, body), body.slice(0, 120));
  });

  it('reviewer-completed reads a replayed answer as completed, and a failed replay as not', async () => {
    // Deliberate: in `claude plugin eval` every review is a replay, and this
    // indicator says the workflow reached a validated answer. Which kind it
    // was is `source`, on the same line of both forms.
    const { grader } = await indicator('reviewer-completed');
    for (const line of printed({ reviewerStatus: 'ok', unitStatus: 'skipped', replay: true })) {
      assert.ok(regexPasses(grader, line), line.slice(0, 200));
      assert.match(line, /REPLAYED from a recording|\\"source\\": \\"replay\\"/);
    }
    for (const line of printed({ reviewerStatus: 'failed', unitStatus: 'passed', replay: true })) {
      assert.ok(!regexPasses(grader, line));
    }
  });

  it('unit-check-ran matches a unit check that executed, and never a skipped one beside an executed lint', async () => {
    const { grader } = await indicator('unit-check-ran');
    for (const unitStatus of ['passed', 'failed']) {
      for (const line of printed({ reviewerStatus: 'failed', unitStatus })) {
        assert.ok(regexPasses(grader, line), unitStatus);
      }
    }
    // `lint` is `failed` in every one of these, so a pattern not anchored to
    // the unit check's own status would pass them.
    for (const unitStatus of ['skipped', 'timed-out', 'error']) {
      for (const line of printed({ reviewerStatus: 'ok', unitStatus })) {
        assert.ok(!regexPasses(grader, line), unitStatus);
      }
    }
    for (const body of await skillBodies()) assert.ok(!regexPasses(grader, body), body.slice(0, 120));
  });

  it('sits in every case whose run needs what it reports', async () => {
    const reviewing = (await loadCases())
      .filter((evalCase) =>
        evalCase.graders.some(
          (grader) => grader.type === 'tool_used' && grader.tool === 'Bash' && /review/.test(grader.input_match),
        ),
      )
      .map((evalCase) => evalCase.name);
    const { cases: withReviewer } = await indicator('reviewer-completed');
    assert.deepEqual(
      reviewing.filter((name) => !withReviewer.includes(name)),
      [],
    );
    // Only a fixture that wires `unit` can pass it; anywhere else it would be
    // a with-arm indicator that is false by construction.
    const wiringUnit = (await loadScaffolds())
      .filter((scaffold) => fixtureByName(scaffold.fixture).wires?.includes('unit'))
      .map((scaffold) => scaffold.name)
      .sort();
    assert.deepEqual((await indicator('unit-check-ran')).cases, wiringUnit);
  });
});

// Running pytest writes untracked `__pycache__` files. The review target excludes them, but mutation
// detection fingerprints porcelain status, so the unit check would be reported as mutating the workspace.
describe('eval fixtures: running a Python test leaves nothing git can see', () => {
  it('ignores __pycache__ bytecode in every fixture', async () => {
    const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-evals-pyc-'));
    try {
      const repo = await materialize(fixtureByName('py-source-regression'), path.join(scratch, 'repo'));
      const before = gitOutput(repo, ['status', '--porcelain=v1', '--untracked-files=all']);
      for (const directory of ['src', 'tests']) {
        await mkdir(path.join(repo, directory, '__pycache__'), { recursive: true });
        await writeFile(path.join(repo, directory, '__pycache__', 'module.cpython-313.pyc'), '');
      }
      assert.equal(gitOutput(repo, ['status', '--porcelain=v1', '--untracked-files=all']), before);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
