import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { proseFiles, repoRelativeRoots, baseNameOf, buildModuleTree, allFolders, maxModulesFor, renderLevel, renderTree } from './context.ts';

async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ambicode-context-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

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

describe('module cap and tree text', () => {
  it('the cap follows maxTotalTokens: (60000 - 3000) / 400 = 142 with the defaults', () => {
    assert.equal(maxModulesFor({ maxTotalTokens: 60000 }), 142);
    assert.equal(maxModulesFor({ maxTotalTokens: 100 }), 1);
  });

  it('renderTree prints one line per module with its directory, depth, subtree files and submodule directories, and no note path', () => {
    const text = renderTree(tree([...many('src/a', 4), ...many('src/a/deep', 3)], ['src']));
    assert.deepEqual(text.split('\n').slice(1), [
      'dir src/a  depth 2  files 7  submodules: src/a/deep',
      'dir src/a/deep  depth 3  files 3',
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
    assert.equal(renderLevel(one, 1), 'level 1: 1 folders, 3 base names\n- src/app\n  - card: CardComponent, loadCard, CARD_KEY\n  - tiny/only: tinyOnly\n  - util: formatThing');
    const two = everything.filter((folder) => folder.level === 2);
    assert.equal(renderLevel(two, 2), 'level 2: 1 folders, 3 base names\n  - src/app/deep/leaf\n    - a: LeafA\n    - b: LeafB\n    - c: LeafC');
    assert.deepEqual(everything.filter((folder) => folder.level === 3), []);
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

describe('repo-relative roots', () => {
  it('repoRelativeRoots turns an absolute root inside the repository into a relative one and refuses one outside', () => {
    const repo = path.resolve('/tmp/some-repo');
    assert.deepEqual(repoRelativeRoots(repo, [path.join(repo, 'src'), 'lib/', './app']), ['src', 'lib', 'app']);
    assert.throws(() => repoRelativeRoots(repo, [path.resolve('/tmp/elsewhere/src')]), /outside the repository/);
    assert.throws(() => repoRelativeRoots(repo, ['../x']), /outside the repository/);
  });
});
