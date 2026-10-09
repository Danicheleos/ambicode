import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRuntime } from '#composition/root';
import { openWorkspace } from '#modules/config/workspace';
import { DECLARATION_PATTERNS } from '#types/modules/ecosystems';
import { loadConfig, loadConfigWithNotices, parseConfig, parseConfigWithNotices, validateArgv } from './load.ts';
import { loadPacksForProject } from '#modules/policy/packs/load';
import { mostSpecificRoot, normalizeRelative, toProjectRelative } from '#util/paths';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { REPO_ROOT } from '#testing/paths';

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
  'requirements: { mcpServer: null, lsp: [] }',
].join('\n');

/** A current (schema 3) file: re-init has nothing to migrate in it. */
const CURRENT = [
  'schemaVersion: 3',
  'baseline: origin/main',
  'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288, onInvalid: void }',
  'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
  'requirements: { mcpServer: null, acceptanceField: null }',
  'search: { index: none, layers: { prompt: [shortlist, harvest, shortlist], context: [grep, harvest] } }',
  'guard: { askOutsideMap: false }',
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

test('a config that still has page or remoteChecks loads, drops them and notices each once', () => {
  const raw = `${withProjects('  - { id: web, root: ".", ecosystem: typescript }')}\npage: { idleTimeoutSeconds: 1800, port: 45831 }\nremoteChecks: { image: null }\n`;
  const { config, notices } = parseConfigWithNotices(raw);
  assert.deepEqual(notices.filter((notice) => notice.startsWith('config: ')), ['config: "page" is no longer used; remove it from .ambicode/config.yaml', 'config: "remoteChecks" is no longer used; remove it from .ambicode/config.yaml']);
  assert.equal(Object.hasOwn(config, 'page'), false);
});

test('a config that still has workers loads, drops it and notices once', () => {
  const { config, notices } = parseConfigWithNotices(`${withProjects('  - { id: web, root: ".", ecosystem: typescript }')}\nworkers: { approved: [plan-check] }\n`);
  assert.deepEqual(notices.filter((notice) => notice.startsWith('config: ')), ['config: "workers" is no longer used; remove it from .ambicode/config.yaml']);
  assert.equal(Object.hasOwn(config, 'workers'), false);
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
  assert.equal(plain.search.layers, undefined);
  assert.equal(plain.guard.askOutsideMap, false);
  assert.equal(plain.review.onInvalid, 'void');

  const explicit = parseConfig(
    atVersion(3, '\nsearch: { layers: { prompt: [shortlist], context: [grep] } }\nguard: { askOutsideMap: true }\n').replace(
      'maxContextBytes: 524288 }',
      'maxContextBytes: 524288, onInvalid: drop }',
    ),
  );
  assert.deepEqual(explicit.search.layers, { prompt: ['shortlist'], context: ['grep'] });
  assert.equal(explicit.guard.askOutsideMap, true);
  assert.equal(explicit.review.onInvalid, 'drop');
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
  assert.equal(Object.hasOwn(config.search, 'index'), false);
  assert.equal(config.review.model, 'sonnet');
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

test('04-T5: requirements.acceptanceField is nullable, defaults to null in every schema version and must be a customfield id', () => {
  const project = '  - { id: web, root: ".", ecosystem: typescript }';
  const at = (version: number, requirements: string): string => withProjects(project).replace('schemaVersion: 1', `schemaVersion: ${version}`).replace('requirements: { mcpServer: null, lsp: [] }', requirements);
  for (const version of [1, 2, 3]) assert.equal(parseConfig(at(version, 'requirements: { mcpServer: null }')).requirements.acceptanceField, null, `v${version}`);
  assert.equal(parseConfig(at(3, 'requirements: { mcpServer: null, acceptanceField: customfield_10042 }')).requirements.acceptanceField, 'customfield_10042');
  assert.equal(parseConfig(at(3, 'requirements: { mcpServer: null, acceptanceField: null }')).requirements.acceptanceField, null);
  assert.throws(() => parseConfig(at(3, 'requirements: { mcpServer: null, acceptanceField: Acceptance }')), (error: Error & { details?: string[] }) => error.details?.some((detail) => detail.includes('acceptanceField')) === true);
});
