import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { REPO_ROOT } from '#testing/paths';
import { proseFiles, repoRelativeRoots, baseNameOf, buildModuleTree, checkContext, allFolders, listContext, maxModulesFor, noteOf, parseBundle, planIndex, planIndexOfNotes, renderLevel, renderListing, renderTree, tokensOf, writeContext } from './context.ts';
import type { TreeModule } from './context.ts';

const LIMITS = { maxTotalTokens: 200, maxFileTokens: 50, maxIndexTokens: 5000 };
const bundle = (...files: [string, string][]): string => files.map(([name, body]) => `=== ${name}\n${body}`).join('\n');
const OVERVIEW = '# Overview of x\n## Purpose\n- a tool\n';
const CONVENTIONS: [string, string] = ['conventions.md', '# Conventions of x\n'];

async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ambicode-context-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

describe('context write', () => {
  it('writes accepted kinds and lists them', async (t) => {
    const root = await sandbox(t);
    const out = await writeContext(nodeFileSystem, root, bundle(['overview.md', OVERVIEW], ['modules/search-map.md', '# Search map module\n'], CONVENTIONS), LIMITS, false, []);
    assert.deepEqual(out.written, ['conventions.md', 'modules/search-map.md', 'overview.md']);
    assert.deepEqual(out.check.problems, []);
    const files = await listContext(nodeFileSystem, root);
    assert.deepEqual(files.map((file) => [file.path, file.title]), [['conventions.md', 'Conventions of x'], ['modules/search-map.md', 'Search map module'], ['overview.md', 'Overview of x']]);
    assert.match(renderListing(files, LIMITS), /^\.ambicode\/context\/conventions\.md  Conventions of x  ~\d+ tokens\n\.ambicode\/context\/modules\/search-map\.md /);
    assert.match(renderListing(files, LIMITS), /total ~\d+ of 200 tokens/);
    assert.equal(renderListing([], LIMITS), 'no context: run /ambicode:init');
  });

  it('refuses paths outside the four kinds, code fences, per-file and total overflow, and writes nothing', async (t) => {
    const root = await sandbox(t);
    const cases: [string, [string, string][], string][] = [
      ['path', [['INDEX.md', '# i\n']], 'path'],
      ['path', [['modules/Bad Name.md', '# i\n']], 'path'],
      ['path', [['modules/../overview.md', '# i\n']], 'path'],
      ['path', [['modules/a/./b.md', '# i\n']], 'path'],
      ['path', [['modules/a/b.txt', '# i\n']], 'path'],
      ['path', [['modules/.md', '# i\n']], 'path'],
      ['path', [['modules/a//b.md', '# i\n']], 'path'],
      ['code-fence', [['conventions.md', '# c\n```\nx\n```\n']], 'code-fence'],
      ['file-too-large', [['overview.md', `# o\n${'x'.repeat(400)}\n`]], 'file-too-large'],
    ];
    for (const [, files, kind] of cases) {
      const out = await writeContext(nodeFileSystem, root, bundle(...files), LIMITS, false, []);
      assert.ok(out.check.problems.some((problem) => problem.kind === kind), kind);
      assert.deepEqual(out.written, []);
    }
    const four = bundle(...['overview.md', 'navigation.md', 'conventions.md', 'modules/a.md', 'modules/b.md'].map((name, i): [string, string] => [name, `# T${i}\n${'y'.repeat(180)}\n`]));
    const out = await writeContext(nodeFileSystem, root, four, { maxTotalTokens: 200, maxFileTokens: 50, maxIndexTokens: 5000 }, false, []);
    assert.ok(out.check.problems.some((problem) => problem.kind === 'total-too-large'));
    assert.deepEqual(await listContext(nodeFileSystem, root), []);
  });

  it('refuses duplicate H2 in a file and duplicate H1 across files, also against files already on disk', async (t) => {
    const root = await sandbox(t);
    const dup2 = await writeContext(nodeFileSystem, root, bundle(['overview.md', '# o\n## Purpose\n## Purpose\n']), LIMITS, false, []);
    assert.equal(dup2.check.problems[0]?.kind, 'duplicate-h2');
    const dup1 = await writeContext(nodeFileSystem, root, bundle(['overview.md', '# Same\n'], ['navigation.md', '# Same\n']), LIMITS, false, []);
    assert.equal(dup1.check.problems[0]?.kind, 'duplicate-h1');
    await writeContext(nodeFileSystem, root, bundle(['overview.md', '# Same\n'], CONVENTIONS), LIMITS, false, []);
    const later = await writeContext(nodeFileSystem, root, bundle(['navigation.md', '# Same\n']), LIMITS, false, []);
    assert.equal(later.check.problems[0]?.kind, 'duplicate-h1');
  });

  it('accepts a folder-tree index.md and refuses bad lines, indentation, unresolved links and an over-budget file', async (t) => {
    const root = await sandbox(t);
    const TREE = '- [src/a](modules/a.md) - the a folder\n  - [b](modules/b.md)\n';
    const index = (body: string): [string, string] => ['index.md', `# Index\n${body}`];
    // maxFileTokens 10 proves index.md is judged by its own budget, not by this one.
    const big = { maxTotalTokens: 100000, maxFileTokens: 10, maxIndexTokens: 5000 };
    const ok = await writeContext(nodeFileSystem, root, bundle(['modules/a.md', '# A\n'], ['modules/b.md', '# B\n'], index(TREE)), big, false, []);
    assert.deepEqual(ok.check.problems, []);
    const kinds = async (...files: [string, string][]): Promise<string[]> =>
      (await writeContext(nodeFileSystem, root, bundle(...files), big, false, [])).check.problems.map((problem) => problem.kind);
    assert.deepEqual(await kinds(index('- [src/a](modules/missing.md)\n')), ['index-link']);
    assert.deepEqual(await kinds(index('- src/a\n')), ['index-line']);
    assert.deepEqual(await kinds(index('- [src/a](modules/a.md) - what it holds\n  - [b](modules/b.md)\n')), []);
    assert.deepEqual(await kinds(index('- [src/a](modules/a.md) - what it holds | One, Two\n  - [b](modules/b.md) | One\n')), []);
    assert.deepEqual(await kinds(index('- [src/a](modules/a.md)\n  - card | aka: x\n')), ['index-line']);
    assert.deepEqual(await kinds(index('- [src/a](modules/a.md)\n  - card: Card\n')), ['index-line']);
    assert.deepEqual(await kinds(index('  - card: Card\n')), ['index-line']);
    assert.deepEqual(await kinds(index('- [src/a](modules/a.md)\nnot a bullet\n')), ['index-line']);
    const long = `${Array.from({ length: 400 }, () => `- [src/a](modules/a.md) - ${'k'.repeat(20)}`).join('\n')}\n`;
    assert.deepEqual(await kinds(index(long)), []);
    assert.deepEqual(await kinds(index(`${long}${long}`)), ['file-too-large']);
    assert.deepEqual(await kinds(['conventions.md', `# o\n${'x'.repeat(100)}\n`]), ['file-too-large']);
  });

  it('--replace removes files not in the bundle; without it they stay', async (t) => {
    const root = await sandbox(t);
    await writeContext(nodeFileSystem, root, bundle(['overview.md', '# O\n'], CONVENTIONS, ['modules/old.md', '# Old\n']), LIMITS, false, []);
    await writeContext(nodeFileSystem, root, bundle(['navigation.md', '# N\n']), LIMITS, false, []);
    assert.equal((await listContext(nodeFileSystem, root)).length, 4);
    const out = await writeContext(nodeFileSystem, root, bundle(['overview.md', '# O2\n'], CONVENTIONS), LIMITS, true, []);
    assert.deepEqual(out.removed, ['modules/old.md', 'navigation.md']);
    assert.equal(await readFile(path.join(root, '.ambicode/context/overview.md'), 'utf8'), '# O2\n');
    assert.deepEqual((await listContext(nodeFileSystem, root)).map((file) => file.path), ['conventions.md', 'overview.md']);
  });

  it('rejects a bundle with text before the first header, duplicate paths, or nothing', () => {
    assert.throws(() => parseBundle('stray\n=== overview.md\n# x\n'));
    assert.throws(() => parseBundle('=== a.md\n=== a.md\n'));
    assert.throws(() => parseBundle(''));
    assert.equal(tokensOf('abcdefghi'), 3);
  });

  it('accepts a module note whose Key files bullets carry a name, parameters and a purpose, and the spec and scout ask for that shape', async (t) => {
    const root = await sandbox(t);
    const note = '# Dates module\n## Purpose\n- date helpers\n## Key files\n- src/dates - addDays(date, n): the date n days later\n- src/dates - parse(text): a date from ISO text\n';
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/dates.md', note]), { maxTotalTokens: 200, maxFileTokens: 100, maxIndexTokens: 5000 }, false, []);
    assert.deepEqual(out.check.problems, []);
    for (const file of ['templates/context-format.md', 'agents/scout.md']) assert.match(await readFile(path.join(REPO_ROOT, file), 'utf8'), /<path> - <name>\(args\): /, file);
  });

  it('accepts notes that mirror nested directories next to the flat kebab names, with a Submodules section', async (t) => {
    const root = await sandbox(t);
    const parent = '# src/app/features module\n## Purpose\n- feature screens\n## Key files\n## Submodules\n- modules/src/app/features/Dashboard_v2.md - the dashboard\n';
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/src/app/features.md', parent], ['modules/src/app/features/Dashboard_v2.md', '# src/app/features/Dashboard_v2 module\n'], ['modules/.github/ci.md', '# .github/ci module\n'], ['modules/db.md', '# db module\n']), LIMITS, false, []);
    assert.deepEqual(out.check.problems, []);
    assert.equal(out.written.length, 4);
    assert.equal(await readFile(path.join(root, '.ambicode/context/modules/src/app/features/Dashboard_v2.md'), 'utf8'), '# src/app/features/Dashboard_v2 module\nRoot: src/app/features/Dashboard_v2\n');
    const replaced = await writeContext(nodeFileSystem, root, bundle(['overview.md', OVERVIEW], CONVENTIONS), LIMITS, true, []);
    assert.equal(replaced.removed.length, 4);
  });
});

describe('context write fills Key files from code', () => {
  const FILES = ['src/app/a.ts', 'src/app/b.ts', 'src/app/c.ts', 'src/app/sub/x.ts', 'src/app/sub/x.test.ts', 'src/plain/p.ts'];
  const SOURCES: Record<string, string> = {
    'src/app/a.ts': 'export function alphaOne() {}\nexport function alphaTwo() {}\nexport const alphaThree = 1;\nfunction hiddenHelper() {}\n',
    'src/app/b.ts': 'export class BetaClass {}\n',
    'src/app/c.ts': 'const nothing = 1;\n',
    'src/app/sub/x.ts': 'export function subExported() {}\n',
    'src/app/sub/x.test.ts': 'export function testOnlyName() {}\n',
    'src/plain/p.ts': `${Array.from({ length: 30 }, (_, i) => `export function plainName${String(i).padStart(2, '0')}() {}`).join('\n')}\n`,
  };
  const NOTE = (title: string, key = ''): string => `# ${title}\n## Purpose\n- x\n## Key files\n${key}## Depends on\n- none\n`;

  async function repo(t: { after(fn: () => unknown): void }): Promise<string> {
    const root = await sandbox(t);
    for (const [file, text] of Object.entries(SOURCES)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), text);
    }
    return root;
  }
  const noteText = (root: string, name: string): Promise<string> => readFile(path.join(root, '.ambicode/context', name), 'utf8');

  it('lists the exported names of a module\'s own files, most declarations first, excluding submodules, tests and unexported names', async (t) => {
    const root = await repo(t);
    const limits = { maxTotalTokens: 2000, maxFileTokens: 500, maxIndexTokens: 5000 };
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/src/app/overview.md', NOTE('app module')], ['modules/src/app/sub.md', NOTE('sub module')]), limits, false, FILES);
    assert.deepEqual(out.check.problems, []);
    const app = await noteText(root, 'modules/src/app/overview.md');
    assert.match(app, /## Key files\n- a\.ts - alphaOne, alphaTwo, alphaThree\n- b\.ts - BetaClass\n## Folders\n## Depends on/);
    assert.doesNotMatch(app, /subExported|testOnlyName|hiddenHelper|c\.ts/);
    assert.match(await noteText(root, 'modules/src/app/sub.md'), /## Key files\n- x\.ts - subExported\n/);
  });

  it('adds the section when the note has none, and keeps a model bullet that describes a real name', async (t) => {
    const root = await repo(t);
    const limits = { maxTotalTokens: 2000, maxFileTokens: 500, maxIndexTokens: 5000 };
    const kept = '- a.ts - alphaOne(): the first one';
    const invented = '- b.ts - Gamma(): not in the file';
    await writeContext(nodeFileSystem, root, bundle(['modules/src/app/overview.md', NOTE('app module', `${kept}\n${invented}\n`)], ['modules/src/app/sub.md', '# sub module\n## Purpose\n- x\n']), limits, false, FILES);
    const app = await noteText(root, 'modules/src/app/overview.md');
    assert.ok(app.includes(`${kept}\n`));
    assert.ok(app.includes('- b.ts - BetaClass\n'));
    assert.doesNotMatch(app, /Gamma/);
    assert.equal(await noteText(root, 'modules/src/app/sub.md'), '# sub module\nRoot: src/app/sub\n## Purpose\n- x\n## Key files\n- x.ts - subExported\n## Folders\n');
  });

  it('keeps the note within maxFileTokens, dropping the files with the fewest declarations', async (t) => {
    const root = await repo(t);
    const limits = { maxTotalTokens: 2000, maxFileTokens: 38, maxIndexTokens: 5000 };
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/src/app.md', NOTE('app module')], ['modules/src/plain.md', NOTE('plain module')]), limits, false, FILES);
    assert.deepEqual(out.check.problems, []);
    const app = await noteText(root, 'modules/src/app.md');
    assert.ok(tokensOf(app) <= 38);
    assert.match(app, /alphaOne/);
    assert.doesNotMatch(app, /BetaClass/);
    assert.ok(tokensOf(await noteText(root, 'modules/src/plain.md')) <= 38);
  });
});

describe('context write generates Depends on from file references', () => {
  const SOURCES: Record<string, string> = {
    'src/billing/invoice-calculator.ts': "import { rate } from './tax-rules-engine';\nimport { r2 } from './tax-rules-engine';\nimport { t } from './tax-rate-tables';\nimport { e } from './tax-extra-rules';\nimport { x } from '../tax/short';\nimport { y } from '../tax/shared-helpers';\nuse(invoice-calculator); child-ledger-writer;\n",
    'src/tax/tax-rate-tables.ts': 'export const t = 1;\n',
    'src/tax/tax-extra-rules.ts': 'export const e = 1;\n',
    'src/billing/child/child-ledger-writer.ts': 'use(invoice-calculator);\n',
    'src/tax/tax-rules-engine.ts': 'export const rate = 1;\n',
    'src/tax/short.ts': 'export const s = 1;\n',
    'src/tax/shared-helpers.ts': 'export const h = 1;\n',
    'src/other/shared-helpers.ts': 'export const h2 = 1;\n',
  };
  const NOTE = (title: string, tail = ''): string => `# ${title}\n## Purpose\n- x\n${tail}`;
  const limits = { maxTotalTokens: 5000, maxFileTokens: 500, maxIndexTokens: 5000 };

  async function run(t: { after(fn: () => unknown): void }, notes: [string, string][]): Promise<string> {
    const root = await sandbox(t);
    for (const [file, text] of Object.entries(SOURCES)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), text);
    }
    const out = await writeContext(nodeFileSystem, root, bundle(...notes), limits, false, Object.keys(SOURCES));
    assert.deepEqual(out.check.problems, []);
    return root;
  }
  const read = (root: string, name: string): Promise<string> => readFile(path.join(root, '.ambicode/context', name), 'utf8');
  const NOTES: [string, string][] = [
    ['modules/src/billing/overview.md', NOTE('src/billing module', '## Depends on\n- none\n## Gotchas\n- slow\n')],
    ['modules/src/billing/child.md', NOTE('src/billing/child module')],
    ['modules/src/tax.md', NOTE('src/tax module', '## Depends on\n- none\n')],
    ['modules/src/other.md', NOTE('src/other module')],
  ];

  it('lists the referenced files of the module whose file names a module mentions (at most 2 per module, most mentioned first), and leaves Gotchas as written', async (t) => {
    const root = await run(t, NOTES);
    assert.match(await read(root, 'modules/src/billing/overview.md'), /## Depends on\n- src\/tax\/tax-rules-engine\.ts, src\/tax\/tax-extra-rules\.ts\n## Gotchas\n- slow\n$/);
  });

  it('skips the module itself, its ancestors and its descendants', async (t) => {
    const root = await run(t, NOTES);
    assert.doesNotMatch(await read(root, 'modules/src/billing/child.md'), /## Depends on/);
    assert.doesNotMatch(await read(root, 'modules/src/billing/overview.md'), /^- src\/billing/m);
    assert.doesNotMatch(await read(root, 'modules/src/billing/overview.md'), /child-ledger-writer/);
  });

  it('ignores names under 8 characters and names borne by two modules; the written section stays when nothing is referenced', async (t) => {
    const root = await run(t, NOTES);
    // short.ts (5) and shared-helpers.ts (two owners) are both mentioned by billing; only tax-rules-engine counts.
    const text = await read(root, 'modules/src/billing/overview.md');
    assert.equal(text.match(/^- src\/(tax|other)\//gm)?.length, 1);
    assert.doesNotMatch(text, /short\.ts|shared-helpers|src\/other/);
    assert.match(await read(root, 'modules/src/tax.md'), /## Depends on\n- none\n$/);
  });

  it('adds the section when the note has none, and keeps it free of paths with backslashes', async (t) => {
    const root = await run(t, [['modules/src/billing/overview.md', NOTE('src/billing module')], ...NOTES.slice(1)]);
    const text = await read(root, 'modules/src/billing/overview.md');
    assert.match(text, /## Folders\n## Depends on\n- src\/tax\/tax-rules-engine\.ts, src\/tax\/tax-extra-rules\.ts\n$/);
    assert.doesNotMatch(text, /\\/);
  });
});

describe('context write Key files and maxTotalTokens', () => {
  it('successive incremental writes each fit: one note never takes the total the later notes and index still need', async (t) => {
    const root = await sandbox(t);
    // 3000 fixed + 3 notes x 400 (maxModulesFor's own sizing); maxFileTokens alone would let one note take 2500.
    const limits = { maxTotalTokens: 4200, maxFileTokens: 2500, maxIndexTokens: 5000 };
    const files = ['a', 'b', 'c'].flatMap((dir) => Array.from({ length: 150 }, (_, i) => `src/${dir}/file${String(i).padStart(3, '0')}.ts`));
    for (const file of files) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), `export function ${path.basename(file, '.ts')}Fn() {}\n`);
    }
    const note = (dir: string): [string, string] => [`modules/src/${dir}.md`, `# ${dir} module\n## Key files\n`];
    const overview: [string, string] = ['overview.md', `# o\n${'x'.repeat(9000)}\n`];
    const first = await writeContext(nodeFileSystem, root, bundle(overview, CONVENTIONS, note('a')), limits, false, files);
    assert.deepEqual(first.check.problems, []);
    for (const dir of ['b', 'c']) assert.deepEqual((await writeContext(nodeFileSystem, root, bundle(note(dir)), limits, false, files)).check.problems, [], dir);
    for (const dir of ['a', 'b', 'c']) assert.ok(tokensOf(await readFile(path.join(root, `.ambicode/context/modules/src/${dir}.md`), 'utf8')) <= 400, dir);
  });

  it('leaves component companions out of Key files: stories, mocks, tests, styles and templates', async (t) => {
    const root = await sandbox(t);
    const names = ['card.ts', 'card.stories.ts', 'card.mock.ts', 'card.mocks.ts', 'card.spec.ts', 'card.test.ts', 'card.scss', 'card.html', 'card.css'];
    const files = names.map((name) => `src/ui/${name}`);
    for (const file of files) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), `export function ${path.basename(file).replace(/\W/g, '')}Fn() {}\n`);
    }
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/src/ui.md', '# ui module\n## Key files\n']), { maxTotalTokens: 4000, maxFileTokens: 500, maxIndexTokens: 5000 }, false, files);
    assert.deepEqual(out.check.problems, []);
    const text = await readFile(path.join(root, '.ambicode/context/modules/src/ui.md'), 'utf8');
    assert.deepEqual(text.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.split(' - ')[0]), ['- card.ts']);
  });

  it('shares maxTotalTokens between notes, so the written set passes the total check', async (t) => {
    const root = await sandbox(t);
    const files = ['a', 'b', 'c'].flatMap((dir) => ['one', 'two'].map((name) => `src/${dir}/${name}.ts`));
    for (const file of files) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), `${Array.from({ length: 8 }, (_, i) => `export function ${path.basename(file, '.ts')}Name${i}() {}`).join('\n')}\n`);
    }
    const limits = { maxTotalTokens: 118, maxFileTokens: 100, maxIndexTokens: 5000 };
    const note = (dir: string): [string, string] => [`modules/src/${dir}.md`, `# ${dir} module\n## Key files\n`];
    const out = await writeContext(nodeFileSystem, root, bundle(note('a'), note('b'), note('c')), limits, false, files);
    assert.deepEqual(out.check.problems, []);
    for (const dir of ['a', 'b', 'c']) assert.equal((await readFile(path.join(root, `.ambicode/context/modules/src/${dir}.md`), 'utf8')).split('\n').filter((line) => line.startsWith('- ') && line.includes(' - ')).length, 1);
  });
});

describe('context write ownership, companion folders and Folders', () => {
  const put = async (root: string, files: Record<string, string>): Promise<void> => {
    for (const [file, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), text);
    }
  };
  const fn = (name: string): string => `export function ${name}() {}\n`;
  const read = (root: string, name: string): Promise<string> => readFile(path.join(root, '.ambicode/context', name), 'utf8');
  const limits = { maxTotalTokens: 4000, maxFileTokens: 500, maxIndexTokens: 5000 };

  it('leaves files under mock, fixture and stub folders out of Key files', async (t) => {
    const root = await sandbox(t);
    const files = ['src/ui/card.ts', 'src/ui/mocks/card.ts', 'src/ui/__mocks__/x.ts', 'src/ui/fixtures/a.ts', 'src/ui/__fixtures__/b.ts', 'src/ui/stubs/c.ts', 'src/ui/mock/d.ts', 'src/ui/stub/e.ts', 'src/ui/fixture/f.ts'];
    await put(root, Object.fromEntries(files.map((file) => [file, fn(path.basename(file, '.ts') + 'Fn')])));
    await writeContext(nodeFileSystem, root, bundle(['modules/src/ui.md', '# ui module\n## Key files\n']), limits, false, files);
    const text = await read(root, 'modules/src/ui.md');
    assert.deepEqual(text.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.split(' - ')[0]), ['- card.ts']);
    assert.doesNotMatch(text, /mock|fixture|stub/);
  });

  it('does not list a child module\'s files under a parent written before the child note exists', async (t) => {
    const root = await sandbox(t);
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/kid/d.ts', 'src/kid/e.ts', 'src/kid/f.ts'];
    await put(root, Object.fromEntries(files.map((file) => [file, fn(path.basename(file, '.ts') + 'Fn')])));
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/src/overview.md', '# src module\n## Key files\n']), limits, false, files, ['src']);
    assert.deepEqual(out.check.problems, []);
    const text = await read(root, 'modules/src/overview.md');
    assert.match(text, /- a\.ts - /);
    assert.doesNotMatch(text, /kid\//);
  });

  it('lists folded subfolders under ## Folders, right after Key files, before Submodules', async (t) => {
    const root = await sandbox(t);
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/z/deep/q.ts', 'src/z/deep/r.service.ts', 'src/y/p.ts'];
    await put(root, Object.fromEntries(files.map((file) => [file, fn(path.basename(file, '.ts').replace(/\W/g, '') + 'Fn')])));
    const note = '# src module\n## Purpose\n- x\n## Key files\n## Folders\n## Submodules\n- modules/src/kid.md - kid\n## Depends on\n- none\n';
    await writeContext(nodeFileSystem, root, bundle(['modules/src.md', note], ['modules/src/kid.md', '# kid module\n']), limits, false, files, ['src']);
    const text = await read(root, 'modules/src.md');
    assert.match(text, /## Key files\n(- .*\n)+## Folders\n- y\/ - p\n- z\/deep\/ - q, r\n## Submodules\n- src\/kid\.md - kid\n## Depends on/);
    assert.equal(text.match(/## Folders/g)!.length, 1);
  });

  it('gives a module without folded folders an empty ## Folders heading, placed before Depends on', async (t) => {
    const root = await sandbox(t);
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    await put(root, Object.fromEntries(files.map((file) => [file, fn(path.basename(file, '.ts') + 'Fn')])));
    await writeContext(nodeFileSystem, root, bundle(['modules/src.md', '# src module\n## Purpose\n- x\n## Depends on\n- none\n']), limits, false, files, ['src']);
    const text = await read(root, 'modules/src.md');
    assert.match(text, /## Purpose\n- x\n## Key files\n(- .*\n)+## Folders\n## Depends on\n- none\n$/);
  });

  it('keeps Folders bullets when the room cannot hold all Key files', async (t) => {
    const root = await sandbox(t);
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/sub/x.ts'];
    await put(root, Object.fromEntries(files.map((file) => [file, `${Array.from({ length: 6 }, (_, i) => `export function ${path.basename(file, '.ts')}Name${i}() {}`).join('\n')}\n`])));
    const note = '# src module\n## Key files\n';
    const small = { maxTotalTokens: 4000, maxFileTokens: 36, maxIndexTokens: 5000 };
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/src.md', note]), small, false, files, ['src']);
    assert.deepEqual(out.check.problems, []);
    const text = await read(root, 'modules/src.md');
    assert.match(text, /- sub\/ - x\n/);
    assert.ok(text.split('\n').filter((line) => line.startsWith('- ') && line.includes(' - ') && !line.startsWith('- sub/')).length < 3, text);
  });
});

describe('relative paths in context write and index', () => {
  const fn = (name: string): string => `export function ${name}() {}\n`;
  const limits = { maxTotalTokens: 4000, maxFileTokens: 500, maxIndexTokens: 5000 };
  const read = (root: string, name: string): Promise<string> => readFile(path.join(root, '.ambicode/context', name), 'utf8');
  async function repo(t: { after(fn: () => unknown): void }, files: string[]): Promise<string> {
    const root = await sandbox(t);
    for (const file of files) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), fn(path.basename(file).replace(/\W/g, '') + 'Fn'));
    }
    return root;
  }
  const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/z/deep/q.ts'];

  it('inserts Root under the H1 and replaces one the model wrote', async (t) => {
    const root = await repo(t, files);
    await writeContext(nodeFileSystem, root, bundle(['modules/src.md', '# src module\nRoot: wrong\n## Purpose\n- x\n'], ['modules/other.md', '# other module\n']), limits, false, files, ['src']);
    assert.match(await read(root, 'modules/src.md'), /^# src module\nRoot: src\n## Purpose\n/);
    assert.equal((await read(root, 'modules/src.md')).match(/Root:/g)!.length, 1);
    assert.equal(await read(root, 'modules/other.md'), '# other module\nRoot: other\n');
  });

  it('writes Key files and Folders relative to Root and normalises a model bullet with the full path', async (t) => {
    const root = await repo(t, files);
    const note = '# src module\n## Key files\n- src/a.ts - atsFn(): does a\n## Folders\n';
    await writeContext(nodeFileSystem, root, bundle(['modules/src.md', note]), limits, false, files, ['src']);
    const text = await read(root, 'modules/src.md');
    assert.match(text, /## Key files\n- a\.ts - atsFn\(\): does a\n- b\.ts - btsFn\n/);
    assert.match(text, /## Folders\n- z\/deep\/ - q\n/);
    assert.doesNotMatch(text, /src\/a\.ts/);
  });

  it('keeps a described Folders bullet and replaces an undescribed one', async (t) => {
    const root = await repo(t, [...files, 'src/y/p.ts']);
    const note = '# src module\n## Key files\n## Folders\n- z/deep/ - q: the deep thing\n- src/y/ - invented\n';
    await writeContext(nodeFileSystem, root, bundle(['modules/src.md', note]), limits, false, files.concat('src/y/p.ts'), ['src']);
    const text = await read(root, 'modules/src.md');
    assert.match(text, /- y\/ - p\n- z\/deep\/ - q: the deep thing\n/);
    assert.doesNotMatch(text, /invented/);
    const full = '# src module\n## Key files\n## Folders\n- src/z/deep/ - q: described with the full path\n';
    await writeContext(nodeFileSystem, root, bundle(['modules/src.md', full]), limits, false, files.concat('src/y/p.ts'), ['src']);
    assert.match(await read(root, 'modules/src.md'), /- z\/deep\/ - q: described with the full path\n/);
  });

  it('rewrites a full Submodules note path relative to the note and reports one that resolves to no note', async (t) => {
    const root = await repo(t, files);
    const parent = '# src module\n## Submodules\n- modules/src/kid.md - leaf\n- modules/src/big/overview.md - nested\n';
    const ok = await writeContext(nodeFileSystem, root, bundle(['modules/src/overview.md', parent], ['modules/src/kid.md', '# kid\n'], ['modules/src/big/overview.md', '# big\n']), limits, false, files, ['src']);
    assert.deepEqual(ok.check.problems, []);
    assert.match(await read(root, 'modules/src/overview.md'), /## Submodules\n- kid\.md - leaf\n- big\/overview\.md - nested\n/);
    // The set is final once every module of the tree has a note; a dangling link is reported only then.
    const every = buildModuleTree(files, { roots: ['src'], maxModules: 10 }).modules.map((module): [string, string] => [module.note, `# ${module.path}\n`]);
    const bad = await writeContext(nodeFileSystem, root, bundle(...every, ['modules/src/overview.md', '# src module\n## Submodules\n- modules/src/ghost.md - none\n']), limits, false, files, ['src']);
    assert.deepEqual(bad.check.problems.map((problem) => problem.kind), ['submodule-link']);
  });

  it('index folder text is relative to the folder line above it while the link stays the full note path', () => {
    const mod = (p: string, parent: string | null, children: string[]): TreeModule => ({ path: p, depth: p.split('/').length, parent, children, note: noteOf(p, children.length > 0), subtreeFiles: 9 });
    const names = [{ base: 'x', names: ['Xx'] }];
    const all = [
      { module: mod('main/features/orders-kit', null, ['main/features/orders-kit/alpha']), level: 1, files: names },
      { module: mod('main/features/orders-kit/alpha', 'main/features/orders-kit', ['main/features/orders-kit/alpha/cards']), level: 2, files: names },
      { module: mod('main/features/orders-kit/alpha/cards', 'main/features/orders-kit/alpha', []), level: 3, files: names },
    ];
    const plan = planIndex(all.map((folder) => folder.module), new Map(), 100000);
    assert.match(plan.text, /^- \[main\/features\/orders-kit\]\(modules\/main\/features\/orders-kit\/overview\.md\)$/m);
    assert.match(plan.text, /^ {2}- \[alpha\]\(modules\/main\/features\/orders-kit\/alpha\/overview\.md\)$/m);
    assert.match(plan.text, /^ {4}- \[cards\]\(modules\/main\/features\/orders-kit\/alpha\/cards\.md\)$/m);
    const fullPaths = `# Index\n${[1, 2, 3].flatMap((level) => renderLevel(all.filter((folder) => folder.level === level), level).split('\n').slice(1)).join('\n')}\n`;
    assert.ok(plan.tokens < tokensOf(fullPaths), `${plan.tokens} vs ${tokensOf(fullPaths)}`);
    assert.match(renderLevel([all[2]!], 3), /\[main\/features\/orders-kit\/alpha\/cards\]/);
  });

  const mod = (p: string, parent: string | null, children: string[]): TreeModule => ({ path: p, depth: p.split('/').length, parent, children, note: noteOf(p, children.length > 0), subtreeFiles: 9 });
  const purpose = (text: string): string => `# n\n## Purpose\n- ${text}\n- second bullet\n## Key files\n`;

  it('index lines carry the first Purpose bullet cut at 12 words, none for a missing note, and never a file line', () => {
    const parent = mod('src/a', null, ['src/a/b']);
    const leaf = mod('src/a/b', 'src/a', []);
    const plan = planIndex([parent, leaf], new Map([[parent.note, purpose('one two three four five six seven eight nine ten eleven twelve thirteen fourteen.')]]), 100000);
    assert.equal(plan.text, '# Index\n- [src/a](modules/src/a/overview.md) - one two three four five six seven eight nine ten eleven twelve\n  - [b](modules/src/a/b.md)\n');
    assert.equal(planIndex([{ ...leaf, parent: null }], new Map([[leaf.note, purpose('Short thing.')]]), 100000).text.split('\n')[1], '- [src/a/b](modules/src/a/b.md) - Short thing');
    assert.doesNotMatch(plan.text, /^ *- [^[]/m);
  });

  it('index lines append Key files names without paths: deduplicated, 8 kept then +N, a described bullet cut to its name, none without Key files', () => {
    const a = mod('src/a', null, []);
    const keyed = (bullets: string[], purposeText = 'Thing'): string => `# n\n## Purpose\n- ${purposeText}\n## Key files\n${bullets.join('\n')}\n## Folders\n`;
    const line = (note: string): string => planIndex([a], new Map([[a.note, note]]), 100000).text.split('\n')[1]!;
    assert.equal(line(keyed(['- x/a.ts - One, Two', '- b.ts - Two, Three', '- c.ts - four(arg): does it'])), '- [src/a](modules/src/a.md) - Thing | One, Two, Three, four');
    assert.equal(line(keyed(['- a.ts - n1, n2, n3, n4, n5, n6', '- b.ts - n7, n8, n9, n10'])), '- [src/a](modules/src/a.md) - Thing | n1, n2, n3, n4, n5, n6, n7, n8, +2');
    assert.equal(line(keyed([])), '- [src/a](modules/src/a.md) - Thing');
    assert.equal(line('# n\n'), '- [src/a](modules/src/a.md)');
    assert.equal(line(keyed(['- a.ts - One'], 'left | right')), '- [src/a](modules/src/a.md) - left right | One');
    assert.equal(line('# n\n## Key files\n- a.ts - One\n'), '- [src/a](modules/src/a.md) | One');
  });

  it('index.md is judged by maxIndexTokens: over a small limit it is refused, under a larger one it is accepted', () => {
    const body = `# Index\n${Array.from({ length: 40 }, (_, i) => `- [src/a](modules/a.md) - folder number ${i}`).join('\n')}\n`;
    const check = (maxIndexTokens: number): string[] =>
      checkContext(new Map([['index.md', body]]), { maxTotalTokens: 100000, maxFileTokens: 10, maxIndexTokens }, new Map([['modules/a.md', '# A\n']])).map((problem) => `${problem.kind}: ${problem.message}`);
    assert.deepEqual(check(2000), []);
    assert.match(check(100).join('\n'), /file-too-large: ~\d+ tokens > maxIndexTokens 100/);
  });

  it('planIndexOfNotes stops at the last whole level that fits maxTokens and leaves out modules without a note or under one', () => {
    const files = ['src/a/x1.ts', 'src/a/x2.ts', 'src/a/x3.ts', 'src/a/b/y1.ts', 'src/a/b/y2.ts', 'src/a/b/y3.ts'];
    const result = buildModuleTree(files, { roots: ['src'], maxModules: 20 });
    assert.equal(result.modules.length, 2);
    const notes = new Map(result.modules.map((module) => [module.note, '# n\n']));
    assert.equal(planIndexOfNotes(result.modules, notes, 5).shownLevels, 1);
    assert.equal(planIndexOfNotes(result.modules, notes, 5000).shownLevels, 2);
    const parentOnly = planIndexOfNotes(result.modules, new Map([[result.modules[0]!.note, '# n\n']]), 5000);
    assert.equal(parentOnly.folders, 1);
    assert.equal(planIndexOfNotes(result.modules, new Map([[result.modules[1]!.note, '# n\n']]), 5000).folders, 0);
  });

  it('every module note is linked from the index when the budget allows, and the cut is a whole level', () => {
    const a = mod('a', null, ['a/b']);
    const b = mod('a/b', 'a', ['a/b/c']);
    const c = mod('a/b/c', 'a/b', []);
    const notes = new Map([a, b, c].map((module) => [module.note, purpose('x')]));
    const all = planIndex([a, b, c], notes, 100000);
    for (const module of [a, b, c]) assert.ok(all.text.includes(`(${module.note})`), module.note);
    assert.equal(all.shownLevels, 3);
    const two = planIndex([a, b, c], notes, tokensOf(planIndex([a, { ...b, children: [] }], notes, 100000).text));
    assert.equal(two.shownLevels, 2);
    assert.equal(two.totalLevels, 3);
    assert.ok(!two.text.includes(c.note));
    assert.equal(planIndex([a, b, c], notes, 1).shownLevels, 1);
  });
});

describe('scout recipe and spec for nested modules', () => {
  it('the scout takes modules from `context tree` at full depth, not from a depth-2 listing, leaves Key files to `context write` (no declaration grep), and the spec names the mirrored path and Submodules', async () => {
    const scout = await readFile(path.join(REPO_ROOT, 'agents/scout.md'), 'utf8');
    const spec = await readFile(path.join(REPO_ROOT, 'templates/context-format.md'), 'utf8');
    assert.match(scout, /ambicode\.mjs" context tree --root/);
    assert.doesNotMatch(scout, /-f1-2|immediate subdirector/);
    assert.doesNotMatch(scout, /Grep over|Item names/);
    assert.match(scout, /context write --task init --root <dir>/);
    assert.match(scout, /`context write` fills them from the code, and writes `## Depends on` itself/);
    assert.match(spec, /`## Depends on` \(filled by `context write`/);
    assert.match(scout, /first call carries `overview.md`, `navigation.md`, `conventions.md` once and adds `--replace`; later calls carry module notes only and omit it/);
    assert.match(scout, /at most 15 module notes in one call/);
    assert.match(scout, /builds `index.md` itself from the notes: never write it/);
    assert.doesNotMatch(scout, /--level|--index|once per level/);
    assert.doesNotMatch(spec, /--level|--index/);
    assert.match(scout, /empty headings: `context write` fills them from the code/);
    assert.match(spec, /filled by `context write` from the code/);
    assert.match(scout, /## Submodules/);
    assert.match(scout, /documentation files/);
    assert.doesNotMatch(scout, /## features|## literals|`aka`/);
    assert.match(spec, /`- \[<dir>\]\(<note path>\)`/);
    assert.match(spec, /maxIndexTokens/);
    assert.match(spec, /modules\/<directory>\.md/);
    assert.match(spec, /## Submodules/);
    assert.doesNotMatch(spec, /kebab-case|immediate subdirectory/);
  });
});

describe('context listing of nested notes', () => {
  const file = (name: string, tokens = 100): { path: string; title: string; tokens: number } => ({ path: name, title: `${name.slice(8, -3)} module`, tokens });
  const BIG = { maxTotalTokens: 24000, maxFileTokens: 2500, maxIndexTokens: 5000 };

  it('a flat set lists as before: one line per file, no indentation, no collapse', () => {
    const text = renderListing([file('modules/a.md'), file('modules/b.md')], BIG);
    assert.equal(text, '.ambicode/context/modules/a.md  a module  ~100 tokens\n.ambicode/context/modules/b.md  b module  ~100 tokens\ntotal ~200 of 24000 tokens');
  });

  it('lists every level while at most 20 lines result, indented, in directory order', () => {
    const names = ['modules/src/overview.md', 'modules/src/a/overview.md', 'modules/src/a/x/overview.md', 'modules/src/a/x/y.md', 'modules/src/b.md', 'modules/src-old.md', 'modules/src.b.md'];
    assert.deepEqual(renderListing(names.map((name) => file(name)), BIG).split('\n'), [
      '.ambicode/context/modules/src/overview.md  src/overview module  ~100 tokens',
      '  .ambicode/context/modules/src/a/overview.md  src/a/overview module  ~100 tokens',
      '    .ambicode/context/modules/src/a/x/overview.md  src/a/x/overview module  ~100 tokens',
      '      .ambicode/context/modules/src/a/x/y.md  src/a/x/y module  ~100 tokens',
      '  .ambicode/context/modules/src/b.md  src/b module  ~100 tokens',
      '.ambicode/context/modules/src-old.md  src-old module  ~100 tokens',
      '.ambicode/context/modules/src.b.md  src.b module  ~100 tokens',
      'total ~700 of 24000 tokens',
    ]);
  });

  it('beyond 20 lines keeps the deepest level that fits and counts the rest on their ancestor', () => {
    const names = ['modules/src/overview.md'];
    for (let i = 0; i < 10; i += 1) names.push(`modules/src/m${i}/overview.md`, `modules/src/m${i}/a.md`, `modules/src/m${i}/b/overview.md`, `modules/src/m${i}/b/c.md`);
    const lines = renderListing(names.map((name) => file(name)), BIG).split('\n');
    assert.equal(lines[0], '.ambicode/context/modules/src/overview.md  src/overview module  ~100 tokens');
    assert.equal(lines[1], '  .ambicode/context/modules/src/m0/overview.md  src/m0/overview module  ~100 tokens  (+3 notes below)');
    assert.equal(lines.length, 1 + 10 + 2);
    assert.match(lines.at(-2)!, /^notes below are named in the Submodules section/);
    assert.ok(!lines.some((line) => line.includes('/a.md') || line.includes('/c.md')));
  });

  it('a note whose parent directory has no note is a top-level line, not hidden', () => {
    const text = renderListing([file('modules/deep/er/x.md')], BIG);
    assert.match(text, /^\.ambicode\/context\/modules\/deep\/er\/x\.md /);
  });
});

const many = (dir: string, count: number, ext = 'ts'): string[] => Array.from({ length: count }, (_, i) => `${dir}/f${i}.${ext}`);
const tree = (files: string[], roots: string[] = [], extra: { maxModules?: number; minFiles?: number } = {}) => buildModuleTree(files, { roots, maxModules: extra.maxModules ?? 50, ...(extra.minFiles === undefined ? {} : { minFiles: extra.minFiles }) });
const paths = (files: string[], roots: string[] = [], extra = {}): string[] => tree(files, roots, extra).modules.map((module) => module.path);

describe('buildModuleTree', () => {
  it('walks to the deepest directory: a single-child chain collapses into its last directory', () => {
    const result = tree([...many('src/main/java/com/acme/billing', 4), ...many('src/main/java/com/acme/billing/invoice/model', 4)], ['src']);
    assert.deepEqual(result.modules.map((module) => module.path), ['src/main/java/com/acme/billing', 'src/main/java/com/acme/billing/invoice/model']);
    assert.equal(result.modules[1]!.parent, 'src/main/java/com/acme/billing');
    assert.deepEqual(result.modules[0]!.children, ['src/main/java/com/acme/billing/invoice/model']);
    assert.equal(result.modules[1]!.depth, 8);
    assert.equal(result.deepestSourceDirectory, 8);
  });

  it('a directory without files of its own is a module only when it branches into two directories with sources', () => {
    const files = [...many('src/a/x', 3), ...many('src/a/y', 3), ...many('src/b/z', 3)];
    assert.deepEqual(paths(files, ['src']), ['src', 'src/a', 'src/a/x', 'src/a/y', 'src/b/z']);
  });

  it('folds a subtree under the minimum into its parent', () => {
    const files = [...many('src/app', 4), ...many('src/app/tiny', 2), ...many('src/app/big', 3)];
    const result = tree(files, ['src']);
    assert.deepEqual(result.modules.map((module) => module.path), ['src/app', 'src/app/big']);
    assert.equal(result.modules[0]!.subtreeFiles, 9);
    assert.deepEqual(paths(files, ['src'], { minFiles: 2 }), ['src/app', 'src/app/big', 'src/app/tiny']);
  });

  it('raises the minimum until the module count fits the cap, and says so when only top-level modules still exceed it', () => {
    const files = ['a', 'b', 'c', 'd'].flatMap((top, t) => [...many(top, 10), ...many(`${top}/s1`, 3 + t), ...many(`${top}/s2`, 3 + t)]);
    const wide = tree(files, [], { maxModules: 50 });
    assert.equal(wide.modules.length, 12);
    assert.equal(wide.minFiles, 3);
    const capped = tree(files, [], { maxModules: 6 });
    assert.ok(capped.modules.length <= 6);
    assert.ok(capped.minFiles > 3);
    assert.equal(capped.overCap, false);
    const impossible = tree(files, [], { maxModules: 2 });
    assert.equal(impossible.modules.length, 4);
    assert.equal(impossible.overCap, true);
  });

  it('drops tests, generated, vendored, build, lock, prose and binary files, and restricts to the roots', () => {
    const files = [
      ...many('src/core', 3),
      'src/core/core.test.ts', 'src/core/core.spec.ts', 'src/core/types.d.ts', 'src/core/api.pb.go', 'src/core/schema.min.js', 'src/core/README.md', 'src/core/logo.png',
      'src/core/gen.generated.ts', 'src/core/a_pb2.py', 'src/core/a.g.dart',
      'src/__generated__/gql.ts', 'src/tests/helper.ts', 'src/vendor/lib.ts', 'src/dist/out.js', 'package-lock.json', 'yarn.lock', 'tools/script.ts',
    ];
    const result = tree(files, ['src']);
    assert.equal(result.sourceFiles, 3);
    assert.deepEqual(result.modules.map((module) => module.path), ['src/core']);
  });

  it('keeps testdata, contest and other names that only look like tests or generated code', () => {
    assert.deepEqual(paths([...many('testdata', 3, 'rs'), ...many('a/contest', 3)]), ['a/contest', 'testdata']);
  });

  it('with no root the whole repository is searched and the repository root directory is never a module', () => {
    const files = [...many('', 2).map((file) => file.slice(1)), ...many('pkg/a', 3), ...many('pkg/b', 3)];
    assert.deepEqual(paths(files), ['pkg', 'pkg/a', 'pkg/b']);
    assert.deepEqual(paths(files, ['.']), ['pkg', 'pkg/a', 'pkg/b']);
  });

  it('is deterministic for the same files in any order', () => {
    const files = [...many('src/a', 4), ...many('src/b', 4), ...many('src/a/c', 4)];
    assert.deepEqual(tree(files, ['src']), tree([...files].reverse(), ['src']));
  });
});

describe('module notes', () => {
  it('mirror the directory and replace characters the context path rule refuses', () => {
    assert.equal(noteOf('src/app/features/dashboard'), 'modules/src/app/features/dashboard.md');
    assert.equal(noteOf('src/[id]/@slot'), 'modules/src/_id_/_slot.md');
    assert.equal(noteOf('.github/ci'), 'modules/.github/ci.md');
  });

  it('a module with submodules keeps its note inside its folder as overview.md; a leaf stays <dir>.md', () => {
    const modules = tree([...many('main', 4), ...many('main/utils', 3)]).modules;
    assert.deepEqual(modules.map((module) => module.note), ['modules/main/overview.md', 'modules/main/utils.md']);
    assert.equal(noteOf('main', true), 'modules/main/overview.md');
  });

  it('context write accepts modules/<dir>/overview.md beside a leaf note (the old parent path is also still accepted: the rule sees one file at a time)', async (t) => {
    const root = await sandbox(t);
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/main/overview.md', '# main module\n'], ['modules/main/utils.md', '# main/utils module\n']), LIMITS, false, []);
    assert.deepEqual(out.check.problems, []);
    assert.deepEqual(out.written, ['modules/main/overview.md', 'modules/main/utils.md']);
  });

  it('the cap follows maxTotalTokens: (60000 - 3000) / 400 = 142 with the defaults', () => {
    assert.equal(maxModulesFor({ maxTotalTokens: 60000, maxFileTokens: 2500, maxIndexTokens: 5000 }), 142);
    assert.equal(maxModulesFor({ maxTotalTokens: 100, maxFileTokens: 50, maxIndexTokens: 5000 }), 1);
  });

  it('renderTree prints one line per module with its note, directory, depth, subtree files and submodules', () => {
    const text = renderTree(tree([...many('src/a', 4), ...many('src/a/deep', 3)], ['src']));
    assert.deepEqual(text.split('\n').slice(1), [
      'modules/src/a/overview.md  dir src/a  depth 2  files 7  submodules: modules/src/a/deep.md',
      'modules/src/a/deep.md  dir src/a/deep  depth 3  files 3',
    ]);
  });
});

describe('level listing', () => {
  it('strips every suffix after the first dot, keeping a leading dot', () => {
    assert.equal(baseNameOf('src/a/card.component.ts'), 'card');
    assert.equal(baseNameOf('a.b.c.ts'), 'a');
    assert.equal(baseNameOf('Makefile'), 'Makefile');
    assert.equal(baseNameOf('src/.eslintrc.js'), '.eslintrc');
  });

  it('lists the folders of one level with base names unique per folder, declared names, folded subfolders keyed by path, and no companions', async (t) => {
    const root = await sandbox(t);
    const sources: Record<string, string> = {
      'src/app/card.component.ts': 'export class CardComponent {}\n',
      'src/app/card.service.ts': 'export function loadCard() {}\nexport const CARD_KEY = 1;\n',
      'src/app/card.stories.ts': 'export const Story = 1;\n',
      'src/app/card.component.spec.ts': 'export const SpecOnly = 1;\n',
      'src/app/card.component.scss': '.a {}\n',
      'src/app/util.ts': 'export function formatThing() {}\n',
      'src/app/deep/leaf/a.ts': 'export class LeafA {}\n',
      'src/app/deep/leaf/b.ts': 'export class LeafB {}\n',
      'src/app/deep/leaf/c.ts': 'export class LeafC {}\n',
      'src/app/tiny/only.ts': 'export function tinyOnly() {}\n',
    };
    for (const [file, text] of Object.entries(sources)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), text);
    }
    const files = Object.keys(sources);
    const result = buildModuleTree(files, { roots: ['src'], maxModules: 10 });
    const everything = await allFolders(nodeFileSystem, root, result, files);
    const one = everything.filter((folder) => folder.level === 1);
    assert.deepEqual(one.map((folder) => folder.module.path), ['src/app']);
    assert.deepEqual(one[0]!.files, [
      { base: 'card', names: ['CardComponent', 'loadCard', 'CARD_KEY'] },
      { base: 'tiny/only', names: ['tinyOnly'] },
      { base: 'util', names: ['formatThing'] },
    ]);
    assert.equal(renderLevel(one, 1), 'level 1: 1 folders, 3 base names\n- [src/app](modules/src/app/overview.md)\n  - card: CardComponent, loadCard, CARD_KEY\n  - tiny/only: tinyOnly\n  - util: formatThing');
    const two = everything.filter((folder) => folder.level === 2);
    assert.equal(renderLevel(two, 2), 'level 2: 1 folders, 3 base names\n  - [src/app/deep/leaf](modules/src/app/deep/leaf.md)\n    - a: LeafA\n    - b: LeafB\n    - c: LeafC');
    assert.deepEqual(everything.filter((folder) => folder.level === 3), []);
  });
});

describe('context write conventions check', () => {
  it('reports conventions-missing once overview or navigation is in the final set, and not for module notes alone', async (t) => {
    const root = await sandbox(t);
    const kinds = async (replace: boolean, ...files: [string, string][]): Promise<string[]> =>
      (await writeContext(nodeFileSystem, root, bundle(...files), LIMITS, replace, [])).check.problems.map((problem) => problem.kind);
    assert.deepEqual(await kinds(false, ['modules/a.md', '# A\n']), []);
    assert.deepEqual(await kinds(false, ['overview.md', OVERVIEW]), ['conventions-missing']);
    assert.deepEqual(await kinds(false, ['navigation.md', '# N\n']), ['conventions-missing']);
    assert.deepEqual((await listContext(nodeFileSystem, root)).map((file) => file.path), ['modules/a.md']);
    assert.deepEqual(await kinds(false, ['overview.md', OVERVIEW], CONVENTIONS), []);
    assert.deepEqual(await kinds(false, ['navigation.md', '# N\n']), []);
    assert.deepEqual(await kinds(true, ['overview.md', '# O2\n']), ['conventions-missing']);
  });
});

describe('context write builds index.md', () => {
  const sources = ['src/a/x1.ts', 'src/a/x2.ts', 'src/a/x3.ts', 'src/a/b/y1.ts', 'src/a/b/y2.ts', 'src/a/b/y3.ts'];
  const note = (name: string): string => `# ${name} module\n## Purpose\n- holds ${name}\n## Key files\n`;
  const setup = async (t: { after(fn: () => unknown): void }): Promise<string> => {
    const root = await sandbox(t);
    for (const file of sources) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), `export function ${path.basename(file, '.ts')}Fn() {}\n`);
    }
    return root;
  };
  const limits = { maxTotalTokens: 100000, maxFileTokens: 500, maxIndexTokens: 5000 };

  it('derives index.md from the written notes, replacing any index.md the bundle carries, and links only notes that exist', async (t) => {
    const root = await setup(t);
    const parent = '# a module\n## Purpose\n- holds a\n## Key files\n';
    const first = await writeContext(nodeFileSystem, root, bundle(['modules/src/a/overview.md', parent], ['index.md', '# Index\nnot a folder line\n']), limits, false, sources, ['src']);
    assert.deepEqual(first.check.problems, []);
    assert.equal(await readFile(path.join(root, '.ambicode/context/index.md'), 'utf8'), '# Index\n- [src/a](modules/src/a/overview.md) - holds a | x1Fn, x2Fn, x3Fn\n');
    const second = await writeContext(nodeFileSystem, root, bundle(['modules/src/a/b.md', note('b')]), limits, false, sources, ['src']);
    assert.deepEqual(second.check.problems, []);
    assert.match(await readFile(path.join(root, '.ambicode/context/index.md'), 'utf8'), /\n {2}- \[b\]\(modules\/src\/a\/b\.md\) - holds b \| y1Fn, y2Fn, y3Fn\n$/);
  });

  it('counts a regenerated index once in the size check, so a later write that really fits is accepted', async (t) => {
    // maxModulesFor reserves 3000 tokens for the fixed notes, so the cap must sit above that for the tree to keep both modules.
    const tight = { maxTotalTokens: 3800, maxFileTokens: 4000, maxIndexTokens: 5000 };
    const first = (filler: number): string => bundle(['overview.md', `# o\n${'x'.repeat(filler)}\n`], CONVENTIONS, ['modules/src/a/overview.md', note('a')]);
    const second = bundle(['modules/src/a/b.md', note('b')]);
    const sizeOf = async (dir: string): Promise<number> => (await listContext(nodeFileSystem, dir)).reduce((sum, file) => sum + file.tokens, 0);
    const probe = await setup(t);
    await writeContext(nodeFileSystem, probe, first(0), tight, false, sources, ['src']);
    await writeContext(nodeFileSystem, probe, second, tight, false, sources, ['src']);
    const filler = (tight.maxTotalTokens - 2 - await sizeOf(probe)) * 4;
    const root = await setup(t);
    assert.deepEqual((await writeContext(nodeFileSystem, root, first(filler), tight, false, sources, ['src'])).check.problems, []);
    const out = await writeContext(nodeFileSystem, root, second, tight, false, sources, ['src']);
    assert.deepEqual(out.check.problems, []);
    assert.ok(await sizeOf(root) <= tight.maxTotalTokens);
    assert.ok(tokensOf(await readFile(path.join(root, '.ambicode/context/index.md'), 'utf8')) > 10);
  });

  it('writes no index.md for a bundle without module notes', async (t) => {
    const root = await setup(t);
    await writeContext(nodeFileSystem, root, bundle(['overview.md', OVERVIEW], CONVENTIONS), limits, false, sources, ['src']);
    assert.deepEqual((await listContext(nodeFileSystem, root)).map((file) => file.path), ['conventions.md', 'overview.md']);
  });
});

describe('prose files in context tree', () => {
  it('lists documentation by type wherever it sits, shallowest then largest first, capped, without tests or source', async (t) => {
    const root = await sandbox(t);
    const sizes: Record<string, number> = { 'zeta.txt': 5, 'notes/misc-3.md': 900, 'a/b/c/deep.rst': 4000, 'src/app/main.ts': 50, 'src/app/main.test.md': 10, 'top.md': 30, 'big.adoc': 700 };
    for (let i = 0; i < 20; i += 1) sizes[`pile/p${String(i).padStart(2, '0')}.md`] = 1 + i;
    for (const [file, size] of Object.entries(sizes)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), 'x'.repeat(size));
    }
    const docs = await proseFiles(nodeFileSystem, root, [...Object.keys(sizes), 'gone.md']);
    assert.equal(docs.length, 15);
    assert.deepEqual(docs.slice(0, 3).map((doc) => [doc.path, doc.bytes]), [['big.adoc', 700], ['top.md', 30], ['zeta.txt', 5]]);
    assert.ok(!docs.some((doc) => /main|gone/.test(doc.path)));
    assert.equal(docs[3]!.path, 'notes/misc-3.md');
  });
});

describe('context write: order-free submodule links, index from disk, repo-relative roots', () => {
  const sources = ['src/a/x1.ts', 'src/a/x2.ts', 'src/a/x3.ts', 'src/a/b/y1.ts', 'src/a/b/y2.ts', 'src/a/b/y3.ts'];
  const limits = { maxTotalTokens: 100000, maxFileTokens: 500, maxIndexTokens: 5000 };
  const note = (name: string, submodules = ''): string => `# ${name} module\n## Purpose\n- holds ${name}\n## Key files\n${submodules}`;
  const parent = (target: string): string => note('a', `## Submodules\n- ${target} - b\n`);
  const kinds = (out: { check: { problems: { kind: string }[] } }): string[] => out.check.problems.map((problem) => problem.kind);
  const setup = async (t: { after(fn: () => unknown): void }): Promise<string> => {
    const root = await sandbox(t);
    for (const file of sources) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), `export function ${path.basename(file, '.ts')}Fn() {}\n`);
    }
    return root;
  };
  const write = (root: string, ...files: [string, string][]) => writeContext(nodeFileSystem, root, bundle(...files), limits, false, sources, ['src']);

  it('a parent may name a child the run writes later; a dangling link is reported once the set is final', async (t) => {
    const root = await setup(t);
    assert.deepEqual(kinds(await write(root, ['modules/src/a/overview.md', parent('b.md')])), []);
    assert.deepEqual(kinds(await write(root, ['modules/src/a/b.md', note('b')])), []);
    const dangling = await setup(t);
    assert.deepEqual(kinds(await write(dangling, ['modules/src/a/overview.md', parent('zz.md')], ['modules/src/a/b.md', note('b')])), ['submodule-link']);
    assert.deepEqual(await listContext(nodeFileSystem, dangling), []);
  });

  it('never writes an index without folders, and rebuilds it from every note on disk at the end of each write', async (t) => {
    const root = await setup(t);
    await write(root, ['modules/src/a/b.md', note('b')]);
    assert.deepEqual((await listContext(nodeFileSystem, root)).map((file) => file.path), ['modules/src/a/b.md']);
    await write(root, ['modules/src/a/overview.md', note('a')]);
    const index = await readFile(path.join(root, '.ambicode/context/index.md'), 'utf8');
    assert.equal(index.split('\n').filter((line) => line.includes('](modules/')).length, 2);
    await writeContext(nodeFileSystem, root, bundle(['conventions.md', '# C\n']), limits, false, sources, ['src']);
    assert.equal(await readFile(path.join(root, '.ambicode/context/index.md'), 'utf8'), index);
  });

  it('repoRelativeRoots turns an absolute root inside the repository into a relative one and refuses one outside', () => {
    const repo = path.resolve('/tmp/some-repo');
    assert.deepEqual(repoRelativeRoots(repo, [path.join(repo, 'src'), 'lib/', './app']), ['src', 'lib', 'app']);
    assert.throws(() => repoRelativeRoots(repo, [path.resolve('/tmp/elsewhere/src')]), /outside the repository/);
    assert.throws(() => repoRelativeRoots(repo, ['../x']), /outside the repository/);
  });
});
