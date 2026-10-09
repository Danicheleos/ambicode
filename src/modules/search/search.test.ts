import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { parseArgs } from '#util/args';
import { runMap, runRefs, MAP_OPTIONS, REFS_OPTIONS } from '#cli/commands/search/search';
import { openRepository } from '#platform/git/open';
import { routeFixture, type RouteFixture } from '#testing/fixtures/route-fixture';
import { excludeWorkingDirs } from '#modules/evidence/task/task-dir';
import { harvest } from './harvest.ts';
import { buildMap } from './map.ts';
import { refs, REFS_LIMIT_BYTES } from './refs.ts';
import { pathsCitedIn, symbolsCitedIn } from './text/seed.ts';

const project = { id: 'app', root: '.', ecosystem: 'typescript', commands: {}, packs: [], checks: {}, policyFiles: [] } as never;

async function repo(extra: Record<string, string> = {}): Promise<RouteFixture> {
  const fx = await routeFixture({ routes: {} });
  const files: Record<string, string> = {
    'src/cart/cart.service.ts': 'export class CartService {\n  addItem(sku: string) { return applyDiscount(sku); }\n}\nexport function applyDiscount(sku: string) { return sku; }\n',
    'src/cart/discount.ts': 'export function applyDiscount(sku: string, rate: number) { return sku + rate; }\nexport const DISCOUNT_RATE = 0.1; export function bundleRate() { return 1; }\n',
    'src/billing/invoice.ts': 'import { applyDiscount } from "../../cart/discount";\nexport class InvoiceService { total() { return applyDiscount("a", 1); } }\nfunction hidden() { return 1; }\n',
    ...Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`src/other/unrelated-${index}.ts`, `export const value${index} = ${index};\n`])),
    ...extra,
  };
  for (const [file, content] of Object.entries(files)) await fx.repo.write(file, content);
  await fx.repo.commitAll('files');
  return fx;
}

describe('git word search and harvest', () => {
  it('grepWords matches whole words, case-sensitively, in any of the words', async () => {
    const fx = await repo();
    try {
      const { git } = await openRepository(fx.runtime);
      assert.deepEqual((await git.grepWords(['applyDiscount'])).sort(), ['src/billing/invoice.ts', 'src/cart/cart.service.ts', 'src/cart/discount.ts']);
      assert.deepEqual(await git.grepWords(['apply']), []);
      assert.deepEqual(await git.grepWords([]), []);
    } finally {
      await fx.dispose();
    }
  });

  it('harvest keeps a file with exports to its exports, drops short and common names, and counts declaring files', async () => {
    const fx = await repo({ 'src/cart/many.ts': 'export function alpha() {} export function beta() {}\nexport const get = 1;\nexport const ab = 2;\n', 'tools/py.py': 'def compute_tax(order):\n    return order\n' });
    try {
      const found = await harvest(fx.runtime.fs, fx.repo.root, ['src/cart/cart.service.ts', 'src/cart/discount.ts', 'src/billing/invoice.ts', 'src/cart/many.ts', 'tools/py.py']);
      const names = found.map((declaration) => declaration.name);
      assert.ok(['alpha', 'beta', 'bundleRate', 'DISCOUNT_RATE', 'CartService', 'InvoiceService', 'compute_tax'].every((name) => names.includes(name)), names.join(','));
      assert.ok(!names.includes('hidden') && !names.includes('get') && !names.includes('ab'));
      assert.ok(found.filter((declaration) => declaration.name === 'applyDiscount').every((declaration) => declaration.declarations === 2));
      assert.equal(found.find((declaration) => declaration.name === 'CartService')?.kind, 'class');
    } finally {
      await fx.dispose();
    }
  });
});

describe('refs', () => {
  it('lists lines per name and flags a name declared in several files', async () => {
    const fx = await repo();
    try {
      const result = await refs(fx.runtime, ['applyDiscount', 'CartService'], { project });
      assert.deepEqual(result.names.map((row) => [row.name, row.hits > 0, row.collides]), [['applyDiscount', true, true], ['CartService', true, false]]);
      assert.match(result.text, /applyDiscount: \d+ hits in 3 files; declarations: 2; collides: declared in src\/cart\/cart\.service\.ts, src\/cart\/discount\.ts/);
      const declared = await refs(fx.runtime, ['CartService'], { project, declarations: true });
      assert.match(declared.text, /class src\/cart\/cart\.service\.ts:1/);
      assert.equal(declared.hits, 0);
    } finally {
      await fx.dispose();
    }
  });

  it('prints at most 4,096 bytes and records a search entry; a name in most files is dropped and listed', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `export const marker = ${index}; // applyMarker ${'y'.repeat(60)}`).join('\n');
    const fx = await repo({ 'src/big/markers.ts': `${lines}\n`, ...Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`src/w${index}.ts`, 'export const common = UniversalService;\n'])) });
    try {
      const run = (argv: string[]) => runRefs(fx.runtime, parseArgs('refs', argv, REFS_OPTIONS));
      const bounded = await run(['applyMarker', '--task', 'T1']);
      assert.ok(bounded.bytes <= REFS_LIMIT_BYTES, `${bounded.bytes}`);
      assert.match(bounded.text, /\d+ more lines; name fewer words/);
      assert.deepEqual((await fx.kinds('T1', 'search')).map((entry) => [entry['command'], entry['names'], entry['hits']]), [['refs', ['applyMarker'], 200]]);
      const broad = await run(['UniversalService', 'CartService', '--json']);
      assert.deepEqual((broad.data as { names: { name: string }[] }).names.map((row) => row.name), ['CartService']);
      assert.match(broad.text, /limitations:\n {2}"UniversalService" matched 80 of \d+ files; ignored$/);
    } finally {
      await fx.dispose();
    }
  });
});

describe('map command', () => {
  it('appends a map entry with the slim fields, prints the layer list first, and refuses --layers whatever its value', async () => {
    const fx = await repo();
    try {
      const output = await runMap(fx.runtime, parseArgs('map', ['--task', 'T2', '--term', 'cart'], MAP_OPTIONS));
      assert.match(output.text, /^layers: shortlist → harvest → shortlist \(default\)/);
      const entry = (await fx.kinds('T2', 'map'))[0]!;
      assert.deepEqual([entry['mode'], entry['layersSource'], entry['index']], ['prompt', 'default', undefined]);
      await assert.rejects(runMap(fx.runtime, parseArgs('map', ['--term', 'cart', '--layers', 'grep'], MAP_OPTIONS)), (error: Error & { code?: string }) => error.code === 'search-layers-not-for-model');
      await assert.rejects(runMap(fx.runtime, parseArgs('map', ['--layers', ''], MAP_OPTIONS)), (error: Error & { code?: string }) => error.code === 'search-layers-not-for-model');
    } finally {
      await fx.dispose();
    }
  });

  it('keeps AMBICODE working files out of the agent searches, once, and in a linked worktree writes the shared exclude', async () => {
    const fx = await repo();
    try {
      await excludeWorkingDirs(fx.runtime, fx.repo.root);
      await excludeWorkingDirs(fx.runtime, fx.repo.root);
      const exclude = await readFile(`${fx.repo.root}/.git/info/exclude`, 'utf8');
      assert.equal(exclude.split('\n').filter((line) => line === '.ambicode/task/').length, 1);
      await fx.repo.write('.ambicode/task/t/ledger.jsonl', 'applyDiscount\n');
      const map = await buildMap(fx.runtime, { project, mode: 'context', layers: ['grep'], symbols: ['applyDiscount'] });
      assert.ok(map.candidates.every((candidate) => !candidate.path.startsWith('.ambicode/')), map.candidates.map((c) => c.path).join(','));
      const linked = `${fx.repo.root}-linked`;
      execFileSync('git', ['-C', fx.repo.root, 'worktree', 'add', '-q', linked]);
      const { git } = await openRepository({ ...fx.runtime, cwd: linked });
      const common = await git.gitCommonDir();
      assert.equal(await realpath(common), await realpath(`${fx.repo.root}/.git`));
      execFileSync('git', ['-C', fx.repo.root, 'worktree', 'remove', '--force', linked]);
    } finally {
      await fx.dispose();
    }
  });
});

describe('seed extraction', () => {
  it('pathsCitedIn keeps tracked paths with or without a line; symbolsCitedIn keeps code-shaped names', () => {
    const files = ['src/cart/cart.service.ts', 'src/other.ts'];
    assert.deepEqual(pathsCitedIn('See src/cart/cart.service.ts:12-20, then ./src/other.ts. Also docs/missing.md.', files), ['src/cart/cart.service.ts', 'src/other.ts']);
    assert.deepEqual(symbolsCitedIn('Change `applyDiscount()` and CartService.addItem_now; AC-ORD-01 plain words'), ['applyDiscount', 'CartService', 'addItem_now']);
  });
});
