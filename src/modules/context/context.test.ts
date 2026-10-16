import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { REPO_ROOT } from '#testing/paths';
import { buildModuleTree, listContext, maxModulesFor, noteOf, parseBundle, renderListing, renderTree, tokensOf, writeContext } from './context.ts';

const LIMITS = { maxTotalTokens: 200, maxFileTokens: 50 };
const bundle = (...files: [string, string][]): string => files.map(([name, body]) => `=== ${name}\n${body}`).join('\n');
const OVERVIEW = '# Overview of x\n## Purpose\n- a tool\n';

async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ambicode-context-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

describe('context write', () => {
  it('writes accepted kinds and lists them', async (t) => {
    const root = await sandbox(t);
    const out = await writeContext(nodeFileSystem, root, bundle(['overview.md', OVERVIEW], ['modules/search-map.md', '# Search map module\n']), LIMITS, false);
    assert.deepEqual(out.written, ['modules/search-map.md', 'overview.md']);
    assert.deepEqual(out.check.problems, []);
    const files = await listContext(nodeFileSystem, root);
    assert.deepEqual(files.map((file) => [file.path, file.title]), [['modules/search-map.md', 'Search map module'], ['overview.md', 'Overview of x']]);
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
      const out = await writeContext(nodeFileSystem, root, bundle(...files), LIMITS, false);
      assert.ok(out.check.problems.some((problem) => problem.kind === kind), kind);
      assert.deepEqual(out.written, []);
    }
    const four = bundle(...['overview.md', 'navigation.md', 'conventions.md', 'modules/a.md', 'modules/b.md'].map((name, i): [string, string] => [name, `# T${i}\n${'y'.repeat(180)}\n`]));
    const out = await writeContext(nodeFileSystem, root, four, { maxTotalTokens: 200, maxFileTokens: 50 }, false);
    assert.ok(out.check.problems.some((problem) => problem.kind === 'total-too-large'));
    assert.deepEqual(await listContext(nodeFileSystem, root), []);
  });

  it('refuses duplicate H2 in a file and duplicate H1 across files, also against files already on disk', async (t) => {
    const root = await sandbox(t);
    const dup2 = await writeContext(nodeFileSystem, root, bundle(['overview.md', '# o\n## Purpose\n## Purpose\n']), LIMITS, false);
    assert.equal(dup2.check.problems[0]?.kind, 'duplicate-h2');
    const dup1 = await writeContext(nodeFileSystem, root, bundle(['overview.md', '# Same\n'], ['navigation.md', '# Same\n']), LIMITS, false);
    assert.equal(dup1.check.problems[0]?.kind, 'duplicate-h1');
    await writeContext(nodeFileSystem, root, bundle(['overview.md', '# Same\n']), LIMITS, false);
    const later = await writeContext(nodeFileSystem, root, bundle(['conventions.md', '# Same\n']), LIMITS, false);
    assert.equal(later.check.problems[0]?.kind, 'duplicate-h1');
  });

  it('--replace removes files not in the bundle; without it they stay', async (t) => {
    const root = await sandbox(t);
    await writeContext(nodeFileSystem, root, bundle(['overview.md', '# O\n'], ['modules/old.md', '# Old\n']), LIMITS, false);
    await writeContext(nodeFileSystem, root, bundle(['navigation.md', '# N\n']), LIMITS, false);
    assert.equal((await listContext(nodeFileSystem, root)).length, 3);
    const out = await writeContext(nodeFileSystem, root, bundle(['overview.md', '# O2\n']), LIMITS, true);
    assert.deepEqual(out.removed, ['modules/old.md', 'navigation.md']);
    assert.equal(await readFile(path.join(root, '.ambicode/context/overview.md'), 'utf8'), '# O2\n');
    assert.deepEqual((await listContext(nodeFileSystem, root)).map((file) => file.path), ['overview.md']);
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
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/dates.md', note]), { maxTotalTokens: 200, maxFileTokens: 100 }, false);
    assert.deepEqual(out.check.problems, []);
    for (const file of ['templates/context-format.md', 'agents/scout.md']) assert.match(await readFile(path.join(REPO_ROOT, file), 'utf8'), /<path> - <name>\(args\): /, file);
  });

  it('accepts notes that mirror nested directories next to the flat kebab names, with a Submodules section', async (t) => {
    const root = await sandbox(t);
    const parent = '# src/app/features module\n## Purpose\n- feature screens\n## Key files\n## Submodules\n- modules/src/app/features/Dashboard_v2.md - the dashboard\n';
    const out = await writeContext(nodeFileSystem, root, bundle(['modules/src/app/features.md', parent], ['modules/src/app/features/Dashboard_v2.md', '# src/app/features/Dashboard_v2 module\n'], ['modules/.github/ci.md', '# .github/ci module\n'], ['modules/db.md', '# db module\n']), LIMITS, false);
    assert.deepEqual(out.check.problems, []);
    assert.equal(out.written.length, 4);
    assert.equal(await readFile(path.join(root, '.ambicode/context/modules/src/app/features/Dashboard_v2.md'), 'utf8'), '# src/app/features/Dashboard_v2 module\n');
    const replaced = await writeContext(nodeFileSystem, root, bundle(['overview.md', OVERVIEW]), LIMITS, true);
    assert.equal(replaced.removed.length, 4);
  });
});

describe('scout recipe and spec for nested modules', () => {
  it('the scout takes modules from `context tree` at full depth, not from a depth-2 listing, greps only its module directories, and the spec names the mirrored path and Submodules', async () => {
    const scout = await readFile(path.join(REPO_ROOT, 'agents/scout.md'), 'utf8');
    const spec = await readFile(path.join(REPO_ROOT, 'templates/context-format.md'), 'utf8');
    assert.match(scout, /ambicode\.mjs" context tree --root/);
    assert.doesNotMatch(scout, /-f1-2|immediate subdirector/);
    assert.match(scout, /ONE Grep over the module directories from the tree/);
    assert.match(scout, /## Submodules/);
    assert.match(spec, /modules\/<directory>\.md/);
    assert.match(spec, /## Submodules/);
    assert.doesNotMatch(spec, /kebab-case|immediate subdirectory/);
  });
});

describe('context listing of nested notes', () => {
  const file = (name: string, tokens = 100): { path: string; title: string; tokens: number } => ({ path: name, title: `${name.slice(8, -3)} module`, tokens });
  const BIG = { maxTotalTokens: 24000, maxFileTokens: 2500 };

  it('a flat set lists as before: one line per file, no indentation, no collapse', () => {
    const text = renderListing([file('modules/a.md'), file('modules/b.md')], BIG);
    assert.equal(text, 'modules/a.md  a module  ~100 tokens\nmodules/b.md  b module  ~100 tokens\ntotal ~200 of 24000 tokens');
  });

  it('lists every level while at most 20 lines result, indented, in directory order', () => {
    const names = ['modules/src.md', 'modules/src/a.md', 'modules/src/a/x.md', 'modules/src/a/x/y.md', 'modules/src/b.md', 'modules/src-old.md', 'modules/src.b.md'];
    assert.deepEqual(renderListing(names.map((name) => file(name)), BIG).split('\n'), [
      'modules/src.md  src module  ~100 tokens',
      '  modules/src/a.md  src/a module  ~100 tokens',
      '    modules/src/a/x.md  src/a/x module  ~100 tokens',
      '      modules/src/a/x/y.md  src/a/x/y module  ~100 tokens',
      '  modules/src/b.md  src/b module  ~100 tokens',
      'modules/src-old.md  src-old module  ~100 tokens',
      'modules/src.b.md  src.b module  ~100 tokens',
      'total ~700 of 24000 tokens',
    ]);
  });

  it('beyond 20 lines keeps the deepest level that fits and counts the rest on their ancestor', () => {
    const names = ['modules/src.md'];
    for (let i = 0; i < 10; i += 1) names.push(`modules/src/m${i}.md`, `modules/src/m${i}/a.md`, `modules/src/m${i}/b.md`, `modules/src/m${i}/b/c.md`);
    const lines = renderListing(names.map((name) => file(name)), BIG).split('\n');
    assert.equal(lines[0], 'modules/src.md  src module  ~100 tokens');
    assert.equal(lines[1], '  modules/src/m0.md  src/m0 module  ~100 tokens  (+3 notes below)');
    assert.equal(lines.length, 1 + 10 + 2);
    assert.match(lines.at(-2)!, /^notes below are named in the Submodules section/);
    assert.ok(!lines.some((line) => line.includes('/a.md') || line.includes('/c.md')));
  });

  it('a note whose parent directory has no note is a top-level line, not hidden', () => {
    const text = renderListing([file('modules/deep/er/x.md')], BIG);
    assert.match(text, /^modules\/deep\/er\/x\.md /);
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

  it('the cap follows maxTotalTokens: (60000 - 3000) / 400 = 142 with the defaults', () => {
    assert.equal(maxModulesFor({ maxTotalTokens: 60000, maxFileTokens: 2500 }), 142);
    assert.equal(maxModulesFor({ maxTotalTokens: 100, maxFileTokens: 50 }), 1);
  });

  it('renderTree prints one line per module with its note, directory, depth, subtree files and submodules', () => {
    const text = renderTree(tree([...many('src/a', 4), ...many('src/a/deep', 3)], ['src']));
    assert.deepEqual(text.split('\n').slice(1), [
      'modules/src/a.md  dir src/a  depth 2  files 7  submodules: modules/src/a/deep.md',
      'modules/src/a/deep.md  dir src/a/deep  depth 3  files 3',
    ]);
  });
});
