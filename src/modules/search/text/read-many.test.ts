import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from '#util/args';
import { READ_OPTIONS, runRead } from '#cli/commands/search/search';
import { openRepository } from '#platform/git/open';
import { routeFixture, type RouteFixture } from '#testing/fixtures/route-fixture';
import { parseReadOperand, readMany, READ_MAX_BUDGET_BYTES, type ReadDeps } from './read-many.ts';

const numbered = (count: number, width = 40): string => Array.from({ length: count }, (_, index) => `line ${index + 1} ${'x'.repeat(width)}`).join('\n') + '\n';

async function repo(): Promise<RouteFixture> {
  const fx = await routeFixture({ routes: {} });
  const files: Record<string, string> = {
    'src/cart/cart.service.ts': 'export class CartService {}\n',
    'src/cart/discount.ts': 'export const RATE = 0.1;\nexport function rate() { return RATE; }\n',
    'src/a/index.ts': 'export const a = 1;\n',
    'src/b/index.ts': 'export const b = 2;\n',
    'src/big/one.ts': numbered(400),
    'src/big/two.ts': numbered(400),
  };
  for (const [file, content] of Object.entries(files)) await fx.repo.write(file, content);
  await fx.repo.commitAll('files');
  return fx;
}

async function deps(fx: RouteFixture, cwd?: string): Promise<ReadDeps> {
  const { git, repositoryRoot } = await openRepository(fx.runtime);
  return { fs: fx.runtime.fs, git, repositoryRoot, cwd: cwd ?? repositoryRoot };
}

describe('read: several files in one call', () => {
  it('parses a path, a start line and a span; a drive letter is not a span', () => {
    assert.deepEqual(parseReadOperand('src/a.ts'), { value: 'src/a.ts', path: 'src/a.ts', start: null, end: null });
    assert.deepEqual(parseReadOperand('src/a.ts:12'), { value: 'src/a.ts:12', path: 'src/a.ts', start: 12, end: null });
    assert.deepEqual(parseReadOperand('src/a.ts:12-40'), { value: 'src/a.ts:12-40', path: 'src/a.ts', start: 12, end: 40 });
    assert.deepEqual(parseReadOperand('src/a.ts:40-12'), { value: 'src/a.ts:40-12', path: 'src/a.ts', start: 40, end: 40 });
    assert.equal(parseReadOperand('C:\\repo\\a.ts').start, null);
  });

  it('serves every file whole, numbered under its own header, when they fit', async () => {
    const fx = await repo();
    try {
      const result = await readMany(await deps(fx), ['src/cart/cart.service.ts', 'src/cart/discount.ts:2']);
      assert.equal(result.text, [
        '== src/cart/cart.service.ts (lines 1-1 of 1) ==',
        '1\texport class CartService {}',
        '== src/cart/discount.ts (lines 2-2 of 2) ==',
        '2\texport function rate() { return RATE; }',
      ].join('\n'));
      assert.equal(result.truncated, 0);
      assert.equal(result.bytes, Buffer.byteLength(result.text));
    } finally {
      await fx.dispose();
    }
  });

  it('resolves from the shell directory, then the root, then a unique tracked suffix; names what it could not read', async () => {
    const fx = await repo();
    const outside = await mkdtemp(path.join(tmpdir(), 'read-outside-'));
    try {
      await writeFile(path.join(outside, 'secret.ts'), 'nope\n');
      await fx.repo.write('assets/logo.bin', 'PNG\0\0data');
      const fromSub = await readMany(await deps(fx, path.join(await realpath(fx.repo.root), 'src', 'cart')), ['discount.ts:1-1', 'src/a/index.ts', 'cart/cart.service.ts']);
      assert.deepEqual(fromSub.files.map((file) => [file.path, file.error]), [['src/cart/discount.ts', null], ['src/a/index.ts', null], ['src/cart/cart.service.ts', null]]);
      const refused = await readMany(await deps(fx), ['index.ts', 'nope.ts', path.join(outside, 'secret.ts'), '../x.ts', '.git/HEAD', 'src/cart', 'assets/logo.bin', 'src/a/index.ts:9']);
      assert.deepEqual(refused.files.map((file) => file.error), [
        'ambiguous: src/a/index.ts, src/b/index.ts',
        'not found',
        'outside the repository; not read',
        'not found',
        'inside .git; not read',
        'not a file; name the files inside it',
        'binary; not shown',
        'has 1 lines; nothing at 9',
      ]);
      assert.doesNotMatch(refused.text, /nope\n|PNG/);
    } finally {
      await rm(outside, { recursive: true, force: true });
      await fx.dispose();
    }
  });

  it('shares the budget: a small file stays whole, large ones are cut at a line and name the span to read next', async () => {
    const fx = await repo();
    try {
      const budget = 6000;
      const result = await readMany(await deps(fx), ['src/big/one.ts', 'src/cart/discount.ts', 'src/big/two.ts', 'src/big/one.ts'], budget);
      assert.ok(result.bytes <= budget, `${result.bytes} > ${budget}`);
      assert.equal(result.files.length, 3, 'the repeated operand is served once');
      assert.equal(result.truncated, 2);
      assert.match(result.text, /2\texport function rate\(\) \{ return RATE; \}/);
      const [one, , two] = result.files;
      assert.ok(one!.truncated && two!.truncated && one!.lines!.to > 40, JSON.stringify(one!.lines));
      assert.ok(Math.abs(one!.lines!.to - two!.lines!.to) <= 1, 'the two large files get equal shares');
      assert.match(result.text, new RegExp(`… cut by the ${budget}-byte budget at line ${one!.lines!.to + 1}: read src/big/one\\.ts:${one!.lines!.to + 1}-400 for the rest`));
    } finally {
      await fx.dispose();
    }
  });

  it('records one search entry with the spans served; refuses a budget above what a Bash result keeps', async () => {
    const fx = await repo();
    try {
      const output = await runRead(fx.runtime, parseArgs('read', ['src/cart/discount.ts', 'src/big/one.ts', 'nope.ts', '--task', 'T1', '--budget', '3000'], READ_OPTIONS));
      assert.equal(output.command, 'read');
      const [entry] = await fx.kinds('T1', 'search');
      assert.deepEqual([entry!['command'], entry!['hits'], entry!['truncated'], entry!['bytes']], ['read', 2, 1, output.bytes]);
      assert.equal((entry!['names'] as string[])[0], 'src/cart/discount.ts:1-2');
      await assert.rejects(runRead(fx.runtime, parseArgs('read', ['src/a/index.ts', '--budget', String(READ_MAX_BUDGET_BYTES + 1)], READ_OPTIONS)), /--budget takes a whole number/);
      await assert.rejects(runRead(fx.runtime, parseArgs('read', [], READ_OPTIONS)), /needs at least one path/);
    } finally {
      await fx.dispose();
    }
  });
});
