import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { projectForPath } from '#modules/config/workspace';
import { DECLARATION_PATTERNS } from '#types/modules/ecosystems';
import { loadConfig, parseConfig } from './load.ts';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { REPO_ROOT } from '#testing/paths';
import { CONFIG_HEAD } from '#testing/fixtures/route-fixture';

async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const ECO = 'ecosystem: { languages: [typescript], frameworks: [], packageManager: null }';

function withProjects(body: string, extra = ''): string {
  return `${CONFIG_HEAD}\n${body}${extra}`;
}

const ONE = `  - { id: app, root: ".", paths: [src/], ${ECO} }`;

test('U01 an unknown field is an error rather than being ignored', () => {
  assert.throws(
    () => parseConfig(withProjects(ONE, '\nreviewModel: sonnet\n')),
    (error: Error & { details?: string[] }) => error.details?.some((detail) => detail.includes('reviewModel')) === true,
  );
});

test('v4: rules are capped at 10 and carry a source', () => {
  const rules = (n: number): string => `[${Array.from({ length: n }, (_, i) => `{ source: manual, rule: "r${i}" }`).join(', ')}]`;
  const body = (n: number): string => `  - { id: app, root: ".", paths: [], ${ECO}, rules: ${rules(n)} }`;
  assert.equal(parseConfig(withProjects(body(10))).projects[0]?.rules.length, 10);
  assert.throws(() => parseConfig(withProjects(body(11))), (error: Error & { code?: string }) => error.code === 'config-invalid');
});

test('older and newer schema versions: one config-invalid asking for init again, or too-new', () => {
  for (const version of [1, 2, 3]) {
    assert.throws(
      () => parseConfig(withProjects(ONE).replace('schemaVersion: 4', `schemaVersion: ${version}`)),
      (error: Error & { code?: string; details?: string[] }) => error.code === 'config-invalid' && /run \/ambicode:init again/.test(`${error.message} ${(error.details ?? []).join(' ')}`),
    );
  }
  assert.throws(() => parseConfig(withProjects(ONE).replace('schemaVersion: 4', 'schemaVersion: 5')), (error: Error & { code?: string }) => error.code === 'config-schema-too-new');
});

test('U01 an invalid field reports its path and expected shape without echoing the value', () => {
  try {
    parseConfig(withProjects(`  - { id: "Web App", root: ".", paths: [], ${ECO} }`));
    assert.fail('expected a rejection');
  } catch (error) {
    const details = (error as { details: string[] }).details;
    assert.ok(details.some((detail) => detail.startsWith('projects.0.id:')));
    assert.ok(details.some((detail) => detail.includes('kebab-case')));
    assert.ok(!details.some((detail) => detail.includes('Web App')), 'the offending value is not echoed');
  }
});

test('U02 duplicate project ids are rejected', () => {
  assert.throws(
    () => parseConfig(withProjects([`  - { id: a, root: "apps/web", paths: [], ${ECO} }`, `  - { id: a, root: "apps/web2", paths: [], ${ECO} }`].join('\n'))),
    (error: Error & { details?: string[] }) => error.details?.some((d) => d.includes('duplicate')) === true,
  );
});

test('v4: projectForPath picks the deepest root, then the project whose paths hold the file', () => {
  const config = parseConfig(withProjects([
    `  - { id: root, root: ".", paths: [tools/], ${ECO} }`,
    `  - { id: web, root: "apps/web", paths: [src/, lib/], ${ECO} }`,
    `  - { id: feature, root: "apps/web/feature", paths: [], ${ECO} }`,
  ].join('\n')));
  assert.equal(projectForPath(config, 'apps/web/feature/a.ts')?.id, 'feature');
  assert.equal(projectForPath(config, 'apps/web/src/a.ts')?.id, 'web');
  assert.equal(projectForPath(config, 'tools/x.ts')?.id, 'root');
  assert.equal(projectForPath(config, 'apps/website/a.ts')?.id === 'web', false);
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

test('path normalization keeps repository-relative form', () => {
  assert.equal(normalizeRelative('./apps/web/'), 'apps/web');
  assert.equal(normalizeRelative('.'), '');
  assert.equal(normalizeRelative('apps//web'), 'apps/web');
});

test('a stale config fails with one config-invalid error, and loading never writes the file', async (t) => {
  const stale = withProjects(ONE).replace('schemaVersion: 4', 'schemaVersion: 3');
  const directory = await sandbox(t);
  await mkdir(path.join(directory, '.ambicode'), { recursive: true });
  const file = path.join(directory, '.ambicode', 'config.yaml');
  await writeFile(file, stale, 'utf8');
  await assert.rejects(loadConfig(nodeFileSystem, directory), (error: Error & { code?: string }) => error.code === 'config-invalid');
  assert.equal(await readFile(file, 'utf8'), stale);
  assert.throws(() => parseConfig('a: [unclosed'), (error: Error & { code?: string }) => error.code === 'config-invalid');
});

test('03c-S1: search keeps one declaration list and reads no ecosystem', async () => {
  assert.ok(DECLARATION_PATTERNS.length > 0);
  const directory = path.join(process.cwd(), 'src/modules/search');
  const scanned = (await readdir(directory, { recursive: true })).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('code-index') && path.basename(file) !== 'navigation.ts');
  for (const name of scanned) {
    assert.doesNotMatch(await readFile(path.join(directory, name), 'utf8'), /\.ecosystem\b/, name);
  }
});

test('03-C6: no ecosystem or language name in routes, step texts or the route engine', async () => {
  const names = new RegExp(`\\b(${['generic', 'typescript', 'python', 'javascript', 'java', 'go', 'rust'].join('|')})\\b`, 'i');
  const root = REPO_ROOT;
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
  await walk(path.join(root, 'src', 'harness'));
  files.push(path.join(root, 'src', 'skills', 'common.ts'));
  for (const file of files) {
    const match = names.exec(await readFile(file, 'utf8'));
    assert.equal(match, null, `${path.relative(root, file)} names "${match?.[0]}"`);
  }
});
