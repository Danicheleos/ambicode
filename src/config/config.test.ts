import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRuntime, openWorkspace } from '../composition/root.ts';
import { Ecosystem } from '../contracts/primitives.ts';
import { TEST_EXCLUDES } from './defaults.ts';
import { GENERIC_PROFILE, sourceGlob } from '../code-intelligence/profile.ts';
import { DECLARATION_PATTERNS } from './ecosystems.ts';
import { detectProjects } from './detect.ts';
import { planInit } from './init.ts';
import { loadConfig, loadConfigWithNotices, parseConfig, parseConfigWithNotices, validateArgv } from './load.ts';
import { loadPacksForProject } from '../policy/load.ts';
import { mostSpecificRoot, normalizeRelative, toProjectRelative } from '../util/paths.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';

async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const MINIMAL = [
  'schemaVersion: 1',
  'baseline: origin/main',
  'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }',
  'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
  'page: { idleTimeoutSeconds: 1800, port: 45831 }',
  'requirements: { mcpServer: null, lsp: [] }',
  'remoteChecks: { image: null }',
].join('\n');

const BEFORE_PORT = MINIMAL.replace(', port: 45831 }', ' }');

function withProjects(body: string): string {
  return `${MINIMAL}\nprojects:\n${body}`;
}

test('U01 an unknown field is an error rather than being ignored', () => {
  assert.throws(
    () => parseConfig(`${withProjects('  - { id: web, root: ".", ecosystem: typescript }')}\nreviewModel: sonnet\n`),
    (error: Error & { details?: string[] }) =>
      error.details?.some((detail) => detail.includes('reviewModel')) === true,
  );
});

test('a lint check may name the generic adapter; an adapter AMBICODE does not know is refused with the list', () => {
  const project = (adapter: string): string =>
    withProjects(
      [
        '  - id: web',
        '    root: .',
        '    ecosystem: typescript',
        '    commands: { format: { argv: ["./node_modules/.bin/prettier", "--check", "--", "{files}"] } }',
        `    checks: { format: { command: format, adapter: ${adapter} } }`,
      ].join('\n'),
    );

  assert.equal(parseConfig(project('generic')).projects[0]?.checks['format']?.adapter, 'generic');
  assert.throws(
    () => parseConfig(project('prettier')),
    (error: Error & { details?: string[] }) =>
      error.details?.some((detail) => detail.includes('checks.format.adapter') && detail.includes('"generic"')) === true,
  );
});

test('03c: a project profile parses; a malformed one fails validation with its path', () => {
  const profile = (exportOnly: string): string =>
    withProjects(
      [
        '  - id: web',
        '    root: .',
        '    ecosystem: typescript',
        `    profile: { stamp: { commit: abc, files: 3 }, sources: [ts], companions: [[html, ts]], catalogs: ["i18n/*.json"], featureKinds: [], exportOnly: ${exportOnly} }`,
      ].join('\n'),
    );

  assert.deepEqual(parseConfig(profile('true')).projects[0]?.profile?.companions, [['html', 'ts']]);
  assert.throws(
    () => parseConfig(profile('yes please')),
    (error: Error & { details?: string[] }) => error.details?.some((detail) => detail.includes('profile.exportOnly')) === true,
  );
});

test('U01 a newer schema version asks for an upgrade instead of guessing a migration', () => {
  assert.throws(
    () => parseConfig(MINIMAL.replace('schemaVersion: 1', 'schemaVersion: 4')),
    (error: Error & { code?: string }) => error.code === 'config-schema-too-new',
  );
});

test('U01 an invalid field reports its path and expected shape without echoing the value', () => {
  try {
    parseConfig(withProjects('  - { id: "Web App", root: ".", ecosystem: typescript }'));
    assert.fail('expected a rejection');
  } catch (error) {
    const details = (error as { details: string[] }).details;
    assert.ok(details.some((detail) => detail.startsWith('projects.0.id:')));
    assert.ok(details.some((detail) => detail.includes('kebab-case')));
    assert.ok(!details.some((detail) => detail.includes('Web App')), 'the offending value is not echoed');
  }
});

test('U02 duplicate project roots are rejected', () => {
  assert.throws(
    () =>
      parseConfig(
        withProjects(
          [
            '  - { id: a, root: "apps/web", ecosystem: typescript }',
            '  - { id: b, root: "apps/web/", ecosystem: typescript }',
          ].join('\n'),
        ),
      ),
    (error: Error & { details?: string[] }) => error.details?.some((d) => d.includes('duplicate root')) === true,
  );
});

test('U02 project membership uses the most specific configured root', () => {
  const projects = [{ root: '.' }, { root: 'apps/web' }, { root: 'apps/web/feature' }];
  assert.equal(mostSpecificRoot(projects, 'apps/web/feature/a.ts')?.root, 'apps/web/feature');
  assert.equal(mostSpecificRoot(projects, 'apps/web/src/a.ts')?.root, 'apps/web');
  assert.equal(mostSpecificRoot(projects, 'tools/x.ts')?.root, '.');
  assert.equal(mostSpecificRoot([{ root: 'apps/web' }], 'services/api/a.ts'), null);
  // "apps/website" must not be treated as living under "apps/web".
  assert.equal(mostSpecificRoot([{ root: 'apps/web' }], 'apps/website/a.ts'), null);
});

test('U02 a repository path seen from a project root, the one definition every caller shares', () => {
  assert.equal(toProjectRelative('', 'src/a.ts'), 'src/a.ts');
  assert.equal(toProjectRelative('apps/web', 'apps/web/src/a.ts'), 'src/a.ts');
  assert.equal(toProjectRelative('apps/web', 'apps/web'), '');
  assert.equal(toProjectRelative('apps/web', 'apps/website/a.ts'), null);
  assert.equal(toProjectRelative('apps/web', 'services/api/a.ts'), null);
  assert.equal(toProjectRelative('apps/web', './apps/web/src/../lib/a.ts'), 'lib/a.ts');
  assert.equal(toProjectRelative('apps/web', 'apps/web/'), '');
});

test('U01 a check must reference a declared command', () => {
  assert.throws(
    () =>
      parseConfig(
        withProjects(
          [
            '  - id: web',
            '    root: "."',
            '    ecosystem: typescript',
            '    commands: { lint: null }',
            '    checks: { lint: { command: linter, adapter: eslint } }',
          ].join('\n'),
        ),
      ),
    (error: Error & { details?: string[] }) =>
      error.details?.some((d) => d.includes('is not declared in projects.web.commands')) === true,
  );
});

test('U14 placeholder misuse and shell syntax are rejected at the boundary', () => {
  assert.deepEqual(validateArgv('argv', ['eslint', '--', '{files}']), []);
  assert.ok(validateArgv('argv', ['eslint', '--file={files}'])[0]?.includes('must be the entire argument'));
  assert.ok(validateArgv('argv', ['eslint', '{paths}'])[0]?.includes('unsupported placeholder'));
  assert.ok(validateArgv('argv', ['eslint', '{files}', '{files}'])[0]?.includes('at most once'));
  assert.ok(validateArgv('argv', ['eslint . && rm -rf /'])[0]?.includes('not a shell expression'));
});

test('U01 init writes null commands with notices, and a second run preserves user edits', async (t) => {
  const directory = await sandbox(t);
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'fixture', devDependencies: { eslint: '^9.0.0' } }),
    'utf8',
  );

  const detected = await detectProjects(nodeFileSystem, directory);
  const first = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected,
    baseline: '',
    baselineNotice: 'no baseline',
  });

  assert.equal(first.created, true);
  assert.ok(first.yaml !== null);
  assert.ok(first.notices.some((notice) => notice.includes('declared in package.json but not installed')));
  assert.equal(first.config.projects[0]?.commands['lint'], null);
  assert.equal(first.config.baseline, '');

  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  const edited = first.yaml.replace(
    'lint: null',
    'lint:\n        argv: ["./node_modules/.bin/eslint", "--", "{files}"]',
  );
  await writeFile(path.join(directory, '.ambicode', 'config.yaml'), edited, 'utf8');

  const second = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected,
    baseline: '',
    baselineNotice: 'no baseline',
  });

  assert.equal(second.yaml, null, 'nothing changed, so nothing is rewritten');
  assert.deepEqual(second.config.projects[0]?.commands['lint'], {
    argv: ['./node_modules/.bin/eslint', '--', '{files}'],
  });
});

test('U01 re-init adds a newly detected project without touching the existing one', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'apps', 'web'), { recursive: true });
  await writeFile(path.join(directory, 'apps', 'web', 'package.json'), '{"name":"web"}', 'utf8');

  const first = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: 'origin/main',
    baselineNotice: 'baseline from origin/HEAD',
  });
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  const annotated = `# my own note\n${first.yaml ?? ''}`;
  await writeFile(path.join(directory, '.ambicode', 'config.yaml'), annotated, 'utf8');

  await mkdir(path.join(directory, 'services', 'api'), { recursive: true });
  await writeFile(path.join(directory, 'services', 'api', 'pyproject.toml'), '[project]\nname="api"\n', 'utf8');

  const second = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: 'origin/main',
    baselineNotice: 'baseline from origin/HEAD',
  });

  assert.ok(second.yaml !== null);
  assert.ok(second.yaml.includes('# my own note'), "the user's comment survives");
  assert.deepEqual(
    second.config.projects.map((project) => project.id).sort(),
    ['apps-web', 'services-api'],
  );
  assert.ok(second.changes.some((change) => change.includes('Added project "services-api"')));
});

test('U01 a python project without a mapping leaves the unit check null with an example', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.venv', 'bin'), { recursive: true });
  await writeFile(path.join(directory, 'pyproject.toml'), '[project]\nname="api"\n', 'utf8');
  for (const binary of ['python', 'pytest', 'ruff']) {
    await writeFile(path.join(directory, '.venv', 'bin', binary), '', 'utf8');
  }

  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: '',
    baselineNotice: 'no baseline',
  });

  const project = plan.config.projects[0];
  assert.deepEqual(project?.commands['unit'], { argv: ['./.venv/bin/python', '-m', 'pytest', '--', '{files}'] });
  assert.equal(project?.checks['unit'], null, 'no mapping means no bounded selection, so no check');
  assert.ok(project?.checks['lint'] !== null, 'lint needs no selector');
  assert.ok(plan.notices.some((notice) => notice.includes('selector:') && notice.includes('kind: mapping')));
});

test('U01 detects Python tools in a Windows virtual environment', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.venv', 'Scripts'), { recursive: true });
  await writeFile(path.join(directory, 'pyproject.toml'), '[project]\nname="api"\n', 'utf8');
  for (const binary of ['python.exe', 'pytest.exe', 'ruff.exe']) {
    await writeFile(path.join(directory, '.venv', 'Scripts', binary), '', 'utf8');
  }

  const [project] = await detectProjects(nodeFileSystem, directory);
  assert.deepEqual(project?.lint?.argv, ['./.venv/Scripts/ruff.exe', 'check', '--', '{files}']);
  assert.deepEqual(project?.unit?.argv, ['./.venv/Scripts/python.exe', '-m', 'pytest', '--', '{files}']);
});

test('U01 the generated configuration always parses', async (t) => {
  const directory = await sandbox(t);
  await writeFile(path.join(directory, 'package.json'), '{"name":"x"}', 'utf8');
  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: 'origin/main',
    baselineNotice: 'x',
  });
  assert.ok(plan.yaml !== null);
  assert.doesNotThrow(() => parseConfig(plan.yaml as string));
});

async function initWithDependencies(
  t: { after(fn: () => unknown): void },
  dependencies: Record<string, string>,
): Promise<{ directory: string; plan: Awaited<ReturnType<typeof planInit>> }> {
  const directory = await sandbox(t);
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'x', dependencies }), 'utf8');
  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: 'origin/main',
    baselineNotice: 'x',
  });
  return { directory, plan };
}

const ANGULAR_PACKS = [
  'builtin/angular-architecture',
  'builtin/angular-components',
  'builtin/angular-http',
  'builtin/angular-state',
  'builtin/angular-style',
];
const EXPRESS_PACKS = [
  'builtin/express-errors',
  'builtin/express-http',
  'builtin/express-persistence',
  'builtin/express-style',
];

test('init enables the Angular packs for a project that declares @angular/core, and every one loads', async (t) => {
  const { plan } = await initWithDependencies(t, { '@angular/core': '^21.0.0' });
  const project = plan.config.projects[0];
  assert.ok(project !== undefined);
  assert.deepEqual(project.packs, ['builtin/common-quality', 'builtin/common-checks', ...ANGULAR_PACKS]);
  assert.ok(plan.notices.some((notice) => notice.includes('declares @angular/core')));

  const loaded = await loadPacksForProject({
    fs: nodeFileSystem,
    project,
    builtinDirectory: path.join(import.meta.dirname, '..', '..', 'policies'),
    repositoryRoot: '.',
  });
  assert.deepEqual(loaded.diagnostics, []);
  assert.equal(loaded.packs.length, project.packs.length);
});

test('init enables the Express packs for a project that declares express', async (t) => {
  const { plan } = await initWithDependencies(t, { express: '^4.19.2' });
  assert.deepEqual(plan.config.projects[0]?.packs, ['builtin/common-quality', 'builtin/common-checks', ...EXPRESS_PACKS]);
});

test('an Angular SSR app declaring express gets the Angular packs only', async (t) => {
  const { plan } = await initWithDependencies(t, { '@angular/core': '^21.0.0', '@angular/ssr': '^21.0.0', express: '^4.21.0' });
  const packs = plan.config.projects[0]?.packs ?? [];
  assert.ok(ANGULAR_PACKS.every((pack) => packs.includes(pack)));
  assert.ok(!packs.some((pack) => pack.startsWith('builtin/express-')));
});

test('a TypeScript project with no known framework keeps only the common packs', async (t) => {
  const { plan } = await initWithDependencies(t, { lodash: '^4.0.0' });
  assert.deepEqual(plan.config.projects[0]?.packs, ['builtin/common-quality', 'builtin/common-checks']);
});

test('re-init enables the framework packs an existing project lacks, keeping the packs it has', async (t) => {
  const directory = await sandbox(t);
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { '@angular/core': '^21.0.0' } }),
    'utf8',
  );
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  const existing = withProjects(
    [
      '  - id: app',
      '    root: .',
      '    ecosystem: typescript',
      '    packs: [builtin/common-quality, builtin/angular-style]',
      '    commands: { lint: null, unit: null, e2e: null }',
      '    checks: { lint: null, unit: null, e2e: null }',
      'authoring: { editReminders: true }',
    ].join('\n'),
  );
  await writeFile(path.join(directory, '.ambicode', 'config.yaml'), existing, 'utf8');

  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: 'origin/main',
    baselineNotice: 'x',
  });

  assert.deepEqual(plan.config.projects[0]?.packs, [
    'builtin/common-quality',
    'builtin/angular-style',
    'builtin/angular-architecture',
    'builtin/angular-components',
    'builtin/angular-http',
    'builtin/angular-state',
  ]);
  const change = plan.changes.find((value) => value.startsWith('Enabled builtin/angular-architecture'));
  assert.ok(change !== undefined, plan.changes.join('\n'));
  assert.ok(!change.includes('builtin/angular-style'), 'a pack already enabled is not re-added');
  assert.ok(
    !plan.config.projects[0]?.packs.includes('builtin/common-checks'),
    'a removed common pack stays the user\'s choice',
  );
  assert.ok(!plan.notices.some((notice) => notice.includes('not enabled')), plan.notices.join('\n'));
  // Whitespace collapsed because yaml wraps a long flow list.
  assert.ok(plan.yaml !== null);
  assert.match(
    plan.yaml.replace(/\s+/g, ' '),
    /packs: \[ ?builtin\/common-quality, builtin\/angular-style, builtin\/angular-architecture/,
  );
});

test('re-init leaves a project that already has every framework pack untouched', async (t) => {
  const directory = await sandbox(t);
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { '@angular/core': '^21.0.0' } }),
    'utf8',
  );
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  await writeFile(
    path.join(directory, '.ambicode', 'config.yaml'),
    withProjects(
      [
        '  - id: app',
        '    root: .',
        '    ecosystem: typescript',
        `    packs: [builtin/common-quality, builtin/common-checks, ${ANGULAR_PACKS.join(', ')}]`,
        '    shortlist: { include: ["**/*.ts"], exclude: [] }',
        '    commands: { lint: null, unit: null, e2e: null }',
        '    checks: { lint: null, unit: null, e2e: null }',
        'authoring: { editReminders: true }',
      ].join('\n'),
    ),
    'utf8',
  );

  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: 'origin/main',
    baselineNotice: 'x',
  });
  assert.equal(plan.yaml, null, plan.changes.join('\n'));
  assert.deepEqual(plan.changes, []);
});

test('P2.4 correction F: fresh init writes the documented authoring.editReminders default, visibly', async (t) => {
  const directory = await sandbox(t);
  await writeFile(path.join(directory, 'package.json'), '{"name":"x"}', 'utf8');
  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: 'origin/main',
    baselineNotice: 'x',
  });
  assert.ok(plan.yaml !== null);
  assert.match(plan.yaml, /authoring:\s*\n?\s*editReminders:\s*true/);
  assert.equal(plan.config.authoring.editReminders, true);
});

test('P2.4 correction F: re-init adds the missing authoring section to a pre-existing schema-version-1 config, without touching anything else', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  await writeFile(
    path.join(directory, '.ambicode', 'config.yaml'),
    withProjects(
      '  - id: app\n    root: .\n    ecosystem: typescript\n    packs: []\n    policyFiles: []\n    commands: {}\n    checks: {}\n',
    ),
    'utf8',
  );

  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: [],
    baseline: '',
    baselineNotice: 'x',
  });

  assert.ok(plan.yaml !== null, 'a missing authoring section is itself a change to write');
  assert.ok(plan.changes.some((change) => change.includes('authoring.editReminders')));
  assert.equal(plan.config.authoring.editReminders, true);
});

test('fresh init writes the review page port, visibly', async (t) => {
  const directory = await sandbox(t);
  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: [],
    baseline: '',
    baselineNotice: 'x',
  });
  assert.match(plan.yaml ?? '', /page:\s*\n\s*idleTimeoutSeconds: 1800\s*\n\s*port: 45831/);
  assert.equal(plan.config.page.port, 45831);
});

test('re-init adds page.port to an existing config, and never overwrites one already set', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  const project =
    '  - id: app\n    root: .\n    ecosystem: typescript\n    packs: []\n    policyFiles: []\n    commands: {}\n    checks: {}\n';
  const configPath = path.join(directory, '.ambicode', 'config.yaml');
  const options = { fs: nodeFileSystem, repositoryRoot: directory, detected: [], baseline: '', baselineNotice: 'x' };

  assert.match(BEFORE_PORT, /page: \{ idleTimeoutSeconds: 1800 \}/);
  await writeFile(configPath, `${BEFORE_PORT}\nprojects:\n${project}`, 'utf8');
  const added = await planInit(options);
  assert.ok(added.changes.includes('Added "page.port: 45831" (the documented default).'), added.changes.join('\n'));
  assert.match(added.yaml ?? '', /page: \{ idleTimeoutSeconds: 1800, port: 45831 \}/);

  await writeFile(configPath, withProjects(project).replace('port: 45831', 'port: 0'), 'utf8');
  const kept = await planInit(options);
  assert.ok(!kept.changes.some((change) => change.includes('page.port')));
  assert.equal(kept.config.page.port, 0);
});

test('fresh init writes the shortlist the project type calls for, visibly', async (t) => {
  const directory = await sandbox(t);
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8');
  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: '',
    baselineNotice: 'x',
  });
  assert.match(plan.yaml ?? '', /shortlist:\s*\n\s*include:/);
  assert.deepEqual(plan.config.projects[0]?.shortlist, {
    include: [sourceGlob(GENERIC_PROFILE.sources)],
    exclude: [...TEST_EXCLUDES],
  });
});

test('re-init adds the shortlist to a project without one, and never rewrites one already set', async (t) => {
  const directory = await sandbox(t);
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8');
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  const configPath = path.join(directory, '.ambicode', 'config.yaml');
  const project = (extra: string) =>
    withProjects(
      `  - id: app\n    root: .\n    ecosystem: typescript\n    packs: []\n${extra}    commands: { lint: null, unit: null, e2e: null }\n    checks: { lint: null, unit: null, e2e: null }\nauthoring: { editReminders: true }`,
    );
  const options = async () => ({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: '',
    baselineNotice: 'x',
  });

  await writeFile(configPath, project(''), 'utf8');
  const added = await planInit(await options());
  assert.ok(added.changes.some((change) => change.startsWith('Added "shortlist" for project "app"')), added.changes.join('\n'));
  assert.deepEqual(added.config.projects[0]?.shortlist?.include, [sourceGlob(GENERIC_PROFILE.sources)]);

  await writeFile(configPath, project('    shortlist: { include: ["**/*.html"], exclude: [] }\n'), 'utf8');
  const kept = await planInit(await options());
  assert.ok(!kept.changes.some((change) => change.includes('shortlist')));
  assert.deepEqual(kept.config.projects[0]?.shortlist?.include, ['**/*.html']);
});

test('fresh init requires the language server of the first project, and says how to turn that off', async (t) => {
  const directory = await sandbox(t);
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8');
  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: '',
    baselineNotice: 'x',
  });
  assert.match(plan.yaml ?? '', /requirements:\s*\n\s*mcpServer: null\s*\n\s*lsp:\s*\n\s*- typescript-lsp@claude-plugins-official/);
  assert.ok(plan.notices.some((notice) => notice.includes('requirements.lsp') && notice.includes('[]')), plan.notices.join('\n'));
});

test('init requires one language server per ecosystem the repository holds', async (t) => {
  const directory = await sandbox(t);
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'web' }), 'utf8');
  await mkdir(path.join(directory, 'services', 'api'), { recursive: true });
  await writeFile(path.join(directory, 'services', 'api', 'pyproject.toml'), '[project]\nname = "api"\n', 'utf8');
  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: '',
    baselineNotice: 'x',
  });
  assert.match(plan.yaml ?? '', /lsp:\s*\n\s*- typescript-lsp@claude-plugins-official\s*\n\s*- pyright-lsp@claude-plugins-official|lsp:\s*\n\s*- pyright-lsp@claude-plugins-official\s*\n\s*- typescript-lsp@claude-plugins-official/);
});

test('re-init adds requirements.lsp to a config without it, and never rewrites a value set, empty included', async (t) => {
  const directory = await sandbox(t);
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8');
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  const configPath = path.join(directory, '.ambicode', 'config.yaml');
  const body = '  - { id: app, root: ".", ecosystem: typescript, packs: [], commands: {}, checks: {}, shortlist: {} }\nauthoring: { editReminders: true }';
  const options = async () => ({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: await detectProjects(nodeFileSystem, directory),
    baseline: '',
    baselineNotice: 'x',
  });

  await writeFile(configPath, withProjects(body).replace(', lsp: []', ''), 'utf8');
  const added = await planInit(await options());
  assert.ok(added.changes.some((change) => change.startsWith('Added "requirements.lsp: [typescript-lsp@claude-plugins-official]"')), added.changes.join('\n'));
  assert.match(added.yaml ?? '', /lsp: \[ typescript-lsp@claude-plugins-official \]/);

  await writeFile(configPath, withProjects(body), 'utf8');
  const kept = await planInit(await options());
  assert.ok(!kept.changes.some((change) => change.includes('requirements.lsp')), kept.changes.join('\n'));
});

test('P2.4 correction F: re-init never overwrites an explicit authoring.editReminders: false', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  await writeFile(
    path.join(directory, '.ambicode', 'config.yaml'),
    `${MINIMAL}\nauthoring:\n  editReminders: false\nprojects:\n` +
      '  - id: app\n    root: .\n    ecosystem: typescript\n    packs: []\n    policyFiles: []\n    commands: {}\n    checks: {}\n',
    'utf8',
  );

  const plan = await planInit({
    fs: nodeFileSystem,
    repositoryRoot: directory,
    detected: [],
    baseline: '',
    baselineNotice: 'x',
  });

  assert.equal(plan.yaml, null, 'the user-set value must not trigger a rewrite');
  assert.equal(plan.config.authoring.editReminders, false);
});

test('path normalization keeps repository-relative form', () => {
  assert.equal(normalizeRelative('./apps/web/'), 'apps/web');
  assert.equal(normalizeRelative('.'), '');
  assert.equal(normalizeRelative('apps//web'), 'apps/web');
});

const V3_BODY = '  - { id: app, root: ".", ecosystem: typescript, packs: [], commands: {}, checks: {} }';

function atVersion(version: number, extra = ''): string {
  return `${withProjects(V3_BODY).replace('schemaVersion: 1', `schemaVersion: ${version}`).replace(', lsp: []', '')}${extra}`;
}

test('03-C1: schema versions 1, 2 and 3 load; 4 refuses with config-schema-too-new', () => {
  for (const version of [1, 2, 3]) assert.equal(parseConfig(atVersion(version)).schemaVersion, version);
  assert.throws(() => parseConfig(atVersion(4)), (error: Error & { code?: string }) => error.code === 'config-schema-too-new');
});

test('03-C2: v3 fields default in memory and parse when present', () => {
  const plain = parseConfig(atVersion(3));
  assert.equal(plain.search.index, 'none');
  assert.equal(plain.search.layers, undefined);
  assert.deepEqual(plain.workers.approved, []);
  assert.equal(plain.guard.askOutsideMap, false);
  assert.equal(plain.review.onInvalid, 'void');

  const explicit = parseConfig(
    atVersion(3, '\nsearch: { index: codeindex, layers: { prompt: [shortlist], context: [grep] } }\nworkers: { approved: [plan-check] }\nguard: { askOutsideMap: true }\n').replace(
      'maxContextBytes: 524288 }',
      'maxContextBytes: 524288, onInvalid: drop }',
    ),
  );
  assert.equal(explicit.search.index, 'codeindex');
  assert.deepEqual(explicit.search.layers, { prompt: ['shortlist'], context: ['grep'] });
  assert.deepEqual(explicit.workers.approved, ['plan-check']);
  assert.equal(explicit.guard.askOutsideMap, true);
  assert.equal(explicit.review.onInvalid, 'drop');
  assert.throws(() => parseConfig(atVersion(3, '\nsearch: { index: other }\n')));
});

test('03-C2: projects[].commands.format is a valid key, null or a command', () => {
  const body = (format: string): string => `  - { id: app, root: ".", ecosystem: typescript, commands: { format: ${format} } }`;
  assert.equal(parseConfig(withProjects(body('null'))).projects[0]?.commands['format'], null);
  assert.deepEqual(parseConfig(withProjects(body('{ argv: [prettier, --write, "{files}"] }'))).projects[0]?.commands['format']?.argv, ['prettier', '--write', '{files}']);
});

test('03-C3: removed fields are accepted in any version, dropped, and noticed once each', () => {
  const raw = atVersion(3, '\ntask: { lspPlugins: [x] }\nsearch: { exactMaxFiles: 40 }\n').replace('requirements: { mcpServer: null }', 'requirements: { mcpServer: null, lsp: [a] }');
  const { config, notices } = parseConfigWithNotices(raw);
  assert.deepEqual(notices, ['config-field-removed: requirements.lsp', 'config-field-removed: task.lspPlugins', 'config-field-removed: search.exactMaxFiles']);
  assert.equal(Object.hasOwn(config.requirements, 'lsp'), false);
  assert.equal(config.search.index, 'none');
  assert.equal(config.review.model, 'sonnet');
  assert.equal(config.page.port, 45831);
});

test('03-C4: v1 and v2 files add config-schema-old; v3 adds nothing', () => {
  assert.deepEqual(parseConfigWithNotices(atVersion(1)).notices, ['config-schema-old: schemaVersion 1 read with v3 defaults; init --apply writes v3']);
  assert.deepEqual(parseConfigWithNotices(atVersion(2)).notices, ['config-schema-old: schemaVersion 2 read with v3 defaults; init --apply writes v3']);
  assert.deepEqual(parseConfigWithNotices(atVersion(3)).notices, []);
});

test('03-C4: loadConfigWithNotices returns the notices and never writes the file', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  const file = path.join(directory, '.ambicode', 'config.yaml');
  const raw = atVersion(1);
  await writeFile(file, raw, 'utf8');
  const loaded = await loadConfigWithNotices(nodeFileSystem, directory);
  assert.equal(loaded.notices.length, 1);
  assert.equal(await readFile(file, 'utf8'), raw);
  assert.equal((await loadConfig(nodeFileSystem, directory)).config.schemaVersion, 1);
});

test('03-C4: the notices reach the CLI user once, on stderr', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  await writeFile(path.join(directory, '.ambicode', 'config.yaml'), atVersion(1), 'utf8');
  const runtime = await createRuntime({ cwd: directory, runner: { run: async () => ({ exitCode: 0, stdout: `${directory}\n`, stderr: '' }) } as never });
  await openWorkspace(runtime).catch(() => undefined);
  await openWorkspace(runtime).catch(() => undefined);
  assert.ok((runtime.notices ?? []).length <= 1);
});

test('03c-S1: search keeps one declaration list and reads no ecosystem', async () => {
  assert.ok(DECLARATION_PATTERNS.length > 0);
  const directory = path.join(process.cwd(), 'src/code-intelligence');
  for (const name of (await readdir(directory)).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'navigation.ts')) {
    assert.doesNotMatch(await readFile(path.join(directory, name), 'utf8'), /\.ecosystem\b/, name);
  }
});

test('03-C6: no ecosystem or language name in routes, step texts or the route engine', async () => {
  const names = new RegExp(`\\b(${[...Ecosystem.options, 'typescript', 'python', 'javascript', 'java', 'go', 'rust'].join('|')})\\b`, 'i');
  const root = path.resolve(import.meta.dirname, '..', '..');
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (!/\.test\.ts$/.test(entry.name) && /\.(ts|ya?ml|md)$/.test(entry.name)) files.push(full);
    }
  };
  await walk(path.join(root, 'routes'));
  await walk(path.join(root, 'src', 'route'));
  for (const file of files) {
    const match = names.exec(await readFile(file, 'utf8'));
    assert.equal(match, null, `${path.relative(root, file)} names "${match?.[0]}"`);
  }
});

test('04-T5: requirements.acceptanceField is nullable, defaults to null in every schema version and must be a customfield id', () => {
  const project = '  - { id: web, root: ".", ecosystem: typescript }';
  const at = (version: number, requirements: string): string => withProjects(project).replace('schemaVersion: 1', `schemaVersion: ${version}`).replace('requirements: { mcpServer: null, lsp: [] }', requirements);
  for (const version of [1, 2, 3]) assert.equal(parseConfig(at(version, 'requirements: { mcpServer: null }')).requirements.acceptanceField, null, `v${version}`);
  assert.equal(parseConfig(at(3, 'requirements: { mcpServer: null, acceptanceField: customfield_10042 }')).requirements.acceptanceField, 'customfield_10042');
  assert.equal(parseConfig(at(3, 'requirements: { mcpServer: null, acceptanceField: null }')).requirements.acceptanceField, null);
  assert.throws(() => parseConfig(at(3, 'requirements: { mcpServer: null, acceptanceField: Acceptance }')), (error: Error & { details?: string[] }) => error.details?.some((detail) => detail.includes('acceptanceField')) === true);
});
