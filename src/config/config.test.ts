import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectProjects } from './detect.ts';
import { planInit } from './init.ts';
import { parseConfig, validateArgv } from './load.ts';
import { loadPacksForProject } from '../policy/load.ts';
import { mostSpecificRoot, normalizeRelative } from '../util/paths.ts';
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
  'page: { idleTimeoutSeconds: 1800 }',
  'requirements: { mcpServer: null }',
  'remoteChecks: { image: null }',
].join('\n');

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

test('U01 a newer schema version asks for an upgrade instead of guessing a migration', () => {
  assert.throws(
    () => parseConfig(MINIMAL.replace('schemaVersion: 1', 'schemaVersion: 2')),
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
  // eslint is declared but not installed, so the command is null with a notice.
  assert.ok(first.notices.some((notice) => notice.includes('declared in package.json but not installed')));
  assert.equal(first.config.projects[0]?.commands['lint'], null);
  assert.equal(first.config.baseline, '');

  // Write it, edit it by hand, then re-run.
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

  // The user's own list first, then only what was missing, in the detected order.
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
  // Written in place: the flow-style list the user wrote is extended, not
  // replaced. Whitespace collapsed, because yaml wraps a long flow list.
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
  // A config written before "authoring" existed: no such key at all.
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
