import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from '#util/args';
import { READ_OPTIONS, runRead } from '#cli/commands/search/search';
import { openRepository } from '#platform/git/open';
import { routeFixture, type RouteFixture } from '#testing/fixtures/route-fixture';
import { buildReport } from '#modules/evidence/report/report';
import { parseReadOperand, readMany, READ_MAX_BUDGET_BYTES, READ_OUTLINE_LINES, READ_ROUTE_SOFT_BYTES, type ReadDeps } from './read-many.ts';

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

  it('accepts a span as a-b, a:b or a,b; a drive letter followed by a span still parses the span only', () => {
    for (const form of ['src/a.ts:12-40', 'src/a.ts:12:40', 'src/a.ts:12,40']) {
      assert.deepEqual(parseReadOperand(form), { value: form, path: 'src/a.ts', start: 12, end: 40 }, form);
    }
    assert.deepEqual(parseReadOperand('src/a.ts:40:12'), { value: 'src/a.ts:40:12', path: 'src/a.ts', start: 40, end: 40 });
    assert.deepEqual(parseReadOperand('C:\\r\\a.ts:3:5'), { value: 'C:\\r\\a.ts:3:5', path: 'C:\\r\\a.ts', start: 3, end: 5 });
  });

  it('strips a leading ./, the repository directory name or the shell directory name, in that order; still not found and still ambiguous stay errors', async () => {
    const fx = await repo();
    try {
      const root = await realpath(fx.repo.root);
      const name = path.basename(root);
      const result = await readMany(await deps(fx, path.join(root, 'src', 'cart')), [
        './src/a/index.ts',
        `${name}/src/b/index.ts`,
        'cart/discount.ts:1-1',
        `${name}/nope.ts`,
        'index.ts',
        'src/cart/discount.ts',
      ]);
      assert.deepEqual(result.files.map((file) => [file.path, file.error, file.stripped]), [
        ['src/a/index.ts', null, undefined],
        ['src/b/index.ts', null, `${name}/`],
        ['src/cart/discount.ts', null, 'cart/'],
        [null, 'not found', undefined],
        [null, 'ambiguous: src/a/index.ts, src/b/index.ts', undefined],
        ['src/cart/discount.ts', null, undefined],
      ]);
      assert.match(result.text, /^== src\/a\/index\.ts \(lines 1-1 of 1\) ==/);
    } finally {
      await fx.dispose();
    }
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
      const result = await readMany(await deps(fx), ['src/big/one.ts', 'src/cart/discount.ts', 'src/big/two.ts', 'src/big/one.ts'], { budget });
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

const declared = (count: number): string => Array.from({ length: count }, (_, index) => `export function fn${index + 1}() {\n  return ${index + 1};\n}\n`).join('');

describe('read: outline, dedupe, cumulative counter', () => {
  it('outlines a whole file over the threshold; --full, a span, a short file and a file without declarations serve bodies', async () => {
    const fx = await repo();
    try {
      await fx.repo.write('src/long/api.ts', `${declared(200)}import { alpha, beta } from './x';\n`);
      await fx.repo.write('src/long/notes.txt', numbered(600, 10));
      await fx.repo.commitAll('long');
      const outline = await readMany(await deps(fx), ['src/long/api.ts', 'src/cart/discount.ts']);
      assert.equal(outline.files[0]!.outline, true);
      assert.ok(outline.files[0]!.lines === null);
      assert.match(outline.text, /== src\/long\/api\.ts \(outline: 200 declarations, 601 lines\) ==\nfn1  1-3\nfn2  4-6\n/);
      assert.match(outline.text, /fn200  598-601\nwhole body: ambicode read --full src\/long\/api\.ts/);
      assert.match(outline.text, /2\texport function rate/, 'a short file is still a body');
      assert.ok(601 > READ_OUTLINE_LINES);
      assert.doesNotMatch(outline.text, /alpha|beta/, 'an import line is not a declaration');
      const full = await readMany(await deps(fx), ['src/long/api.ts'], { full: true });
      assert.equal(full.files[0]!.outline, undefined);
      assert.match(full.text, /^== src\/long\/api\.ts \(lines 1-\d+ of 601\) ==\n1\texport function fn1/);
      const span = await readMany(await deps(fx), ['src/long/api.ts:1-6']);
      assert.deepEqual(span.files[0]!.lines, { from: 1, to: 6, total: 601 });
      const none = await readMany(await deps(fx), ['src/long/notes.txt']);
      assert.equal(none.files[0]!.outline, undefined, 'nothing harvested: the body, as before');
      assert.match(none.text, /^== src\/long\/notes\.txt \(lines 1-/);
    } finally {
      await fx.dispose();
    }
  });

  it('outlines the larger files of a batch that would not fit the budget, and leaves a fitting batch whole', async () => {
    const fx = await repo();
    try {
      for (const name of ['a', 'b', 'c']) await fx.repo.write(`src/batch/${name}.ts`, declared(60));
      await fx.repo.commitAll('batch');
      const operands = ['a', 'b', 'c'].map((name) => `src/batch/${name}.ts`);
      const fits = await readMany(await deps(fx), operands);
      assert.deepEqual(fits.files.map((file) => file.outline), [undefined, undefined, undefined]);
      const tight = await readMany(await deps(fx), operands, { budget: 6000 });
      assert.ok(tight.files.some((file) => file.outline === true));
      assert.equal(tight.truncated, 0);
      assert.ok(tight.bytes <= 6000);
    } finally {
      await fx.dispose();
    }
  });

  it('does not re-serve covered spans; serves the uncovered part of a partial overlap; --again bypasses', async () => {
    const fx = await repo();
    try {
      const served = [{ path: 'src/big/one.ts', from: 1, to: 50, receipt: 'L7' }];
      const exact = await readMany(await deps(fx), ['src/big/one.ts:10-40'], { served });
      assert.equal(exact.text, '== src/big/one.ts (lines 10-40): served earlier (receipt L7); add --again to re-read ==');
      assert.deepEqual([exact.files[0]!.deduped, exact.files[0]!.lines], [{ receipt: 'L7' }, null]);
      const partial = await readMany(await deps(fx), ['src/big/one.ts:30-60'], { served });
      assert.deepEqual(partial.files[0]!.lines, { from: 51, to: 60, total: 400 });
      assert.match(partial.text, /^== src\/big\/one\.ts \(lines 51-60 of 400; the rest of 30-60 served earlier, receipt L7, --again re-reads\) ==\n51\t/);
      const again = await readMany(await deps(fx), ['src/big/one.ts:10-40'], { served, again: true });
      assert.deepEqual(again.files[0]!.lines, { from: 10, to: 40, total: 400 });
      const other = await readMany(await deps(fx), ['src/big/two.ts:10-40'], { served });
      assert.deepEqual(other.files[0]!.lines, { from: 10, to: 40, total: 400 });
    } finally {
      await fx.dispose();
    }
  });

  it('in a route, the receipt carries servedTotal and the next read of the same span is deduped; the soft cap records one limit, still serves, and the report lists it', async () => {
    const route = 'skill: investigate\nversion: 3\nbudget: { modelSteps: 8 }\nexits: [done, blocked, human, inconclusive, superseded, budget]\nrevisable: []\nsteps:\n  - id: finish\n    actor: model\n    instruction: "Finish."\n';
    const fx = await routeFixture({ routes: { investigate: route } });
    try {
      for (const [file, content] of Object.entries({ 'src/big/one.ts': numbered(400), 'src/big/two.ts': numbered(400), 'src/big/three.ts': numbered(400) })) await fx.repo.write(file, content);
      await fx.repo.commitAll('files');
      await fx.engine.start({ skill: 'investigate', text: 'x', requirements: [], task: 'T1', cwd: fx.repo.root, session: 'aaaaaaaa-1111-4111-8111-111111111111', channel: 'hook' });
      const read = (...operands: string[]) => runRead(fx.runtime, parseArgs('read', [...operands, '--task', 'T1', '--budget', String(READ_MAX_BUDGET_BYTES)], READ_OPTIONS));
      const first = await read('src/big/one.ts:1-300');
      const second = await read('src/big/one.ts:1-300');
      assert.match(second.text, /served earlier \(receipt /);
      const receipts = await fx.kinds('T1', 'search');
      assert.deepEqual(receipts.map((entry) => entry['servedTotal']), [first.bytes, first.bytes + second.bytes]);
      assert.equal((await fx.kinds('T1', 'limit')).length, 0, 'under the cap nothing is recorded');
      let total = first.bytes + second.bytes;
      let last = second;
      while (total <= READ_ROUTE_SOFT_BYTES) {
        last = await read('src/big/two.ts', 'src/big/three.ts', '--again');
        total += last.bytes;
      }
      assert.match(last.text, new RegExp(`past the soft cap of ${READ_ROUTE_SOFT_BYTES}; served anyway and recorded as a read-bytes limit`));
      assert.ok(last.bytes > 0, 'still served');
      const again = await read('src/big/one.ts:1-50', '--again');
      assert.doesNotMatch(again.text, /recorded as a read-bytes limit/, 'noted again, recorded once');
      assert.match(again.text, /past the soft cap/);
      const limits = await fx.kinds('T1', 'limit');
      assert.equal(limits.length, 1);
      assert.deepEqual([limits[0]!['which'], limits[0]!['cap'], limits[0]!['route'] !== undefined], ['read-bytes', READ_ROUTE_SOFT_BYTES, true]);
      assert.ok(Number(limits[0]!['bytes']) > READ_ROUTE_SOFT_BYTES);
      const report = buildReport(await fx.ledger('T1'));
      assert.match(report.notVerified, new RegExp(`read-bytes limit: ${limits[0]!['bytes']} B read in the route, soft cap ${READ_ROUTE_SOFT_BYTES}`));
    } finally {
      await fx.dispose();
    }
  });
});
