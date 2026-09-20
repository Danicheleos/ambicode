import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectProjects } from './detect.ts';
import { planInit } from './init.ts';
import { parseConfig, validateArgv } from './load.ts';
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

test('path normalization keeps repository-relative form', () => {
  assert.equal(normalizeRelative('./apps/web/'), 'apps/web');
  assert.equal(normalizeRelative('.'), '');
  assert.equal(normalizeRelative('apps//web'), 'apps/web');
});
