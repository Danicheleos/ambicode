import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs } from '../cli/args.ts';
import { MAP_OPTIONS, REFS_OPTIONS, FIND_OPTIONS, runFind, runMap, runRefs } from '../cli/commands/search.ts';
import { openRepository } from '../composition/root.ts';
import { routeFixture, type RouteFixture } from '../testing/route-fixture.ts';
import { harvest } from './harvest.ts';
import { buildMap, cleanRequestText, leadsText, LEADS_LIMIT_BYTES, MAP_LIMIT_BYTES, rankTerms, resolveLayers } from './map.ts';
import { find, refs, SEARCH_LIMIT_BYTES } from './refs.ts';
import { SearchConfig } from '../contracts/config.ts';

async function repo(extra: Record<string, string> = {}): Promise<RouteFixture> {
  const fx = await routeFixture({ routes: {} });
  const files: Record<string, string> = {
    'src/cart/cart.service.ts': 'export class CartService {\n  addItem(sku: string) { return applyDiscount(sku); }\n}\nexport function applyDiscount(sku: string) { return sku; }\n',
    'src/cart/discount.ts': 'export function applyDiscount(sku: string, rate: number) { return sku + rate; }\nexport const DISCOUNT_RATE = 0.1; export function bundleRate() { return 1; }\n',
    'src/billing/invoice.ts': 'import { applyDiscount } from "../cart/discount";\nexport class InvoiceService { total() { return applyDiscount("a", 1); } }\nfunction hidden() { return 1; }\n',
    ...Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`src/other/unrelated-${index}.ts`, `export const value${index} = ${index};\n`])),
    ...extra,
  };
  for (const [file, content] of Object.entries(files)) await fx.repo.write(file, content);
  await fx.repo.commitAll('files');
  return fx;
}
const project = (fx: RouteFixture) => ({ id: 'app', root: '.', ecosystem: 'typescript' as const, commands: {} }) as never;

describe('03-M1 grepWords', () => {
  it('matches whole words, case-sensitively, in any of the words', async () => {
    const fx = await repo();
    try {
      const { git } = await openRepository(fx.runtime);
      assert.deepEqual((await git.grepWords(['applyDiscount'])).sort(), ['src/billing/invoice.ts', 'src/cart/cart.service.ts', 'src/cart/discount.ts']);
      assert.deepEqual(await git.grepWords(['apply']), []);
      assert.deepEqual(await git.grepWords(['applydiscount']), []);
      assert.deepEqual((await git.grepWords(['CartService', 'bundleRate'])).sort(), ['src/cart/cart.service.ts', 'src/cart/discount.ts']);
      assert.deepEqual(await git.grepWords([]), []);
    } finally {
      await fx.dispose();
    }
  });
});

describe('03-M2 harvest', () => {
  it('takes every match on every line, filters TypeScript to exports, drops short and common names, and counts declaring files', async () => {
    const fx = await repo({ 'src/cart/many.ts': 'export function alpha() {} export function beta() {}\nexport const get = 1;\nexport const ab = 2;\n' });
    try {
      const found = await harvest(fx.runtime.fs, fx.repo.root, ['src/cart/cart.service.ts', 'src/cart/discount.ts', 'src/billing/invoice.ts', 'src/cart/many.ts'], 'typescript');
      const names = found.map((declaration) => declaration.name);
      assert.ok(['alpha', 'beta', 'bundleRate', 'DISCOUNT_RATE', 'CartService', 'InvoiceService'].every((name) => names.includes(name)), names.join(','));
      assert.ok(!names.includes('hidden'), 'not exported');
      assert.ok(!names.includes('get') && !names.includes('ab'), 'common and short names are dropped');
      const discount = found.filter((declaration) => declaration.name === 'applyDiscount');
      assert.equal(discount.length, 2);
      assert.ok(discount.every((declaration) => declaration.declarations === 2));
      assert.deepEqual(found.find((declaration) => declaration.name === 'CartService')?.kind, 'class');
      assert.equal(found.find((declaration) => declaration.name === 'bundleRate')?.line, 2);
    } finally {
      await fx.dispose();
    }
  });
});

describe('03-M3 buildMap layers', () => {
  const base = (fx: RouteFixture) => ({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [] });

  it('prompt: shortlist → harvest → shortlist, a record per layer, pass 2 terms from the harvest, the layer list first', async () => {
    const fx = await repo();
    try {
      const map = await buildMap({ ...base(fx), mode: 'prompt', layers: ['shortlist', 'harvest', 'shortlist'], layersSource: 'default', terms: ['cart'] });
      assert.deepEqual(map.layers.map((layer) => layer.name), ['shortlist', 'harvest', 'shortlist']);
      assert.ok(map.layers.every((layer) => Number.isFinite(layer.ms) && layer.hits >= 0));
      assert.equal(map.text.split('\n')[0], 'layers: shortlist → harvest → shortlist (default); index: none');
      assert.ok(map.terms.pass2.includes('applyDiscount') || map.terms.pass2.includes('CartService'), map.terms.pass2.join(','));
      assert.ok(map.candidates.some((candidate) => candidate.path === 'src/cart/discount.ts'), 'pass 2 reaches the discount module from a harvested name');
      assert.equal(map.entry['candidates'], map.candidates.length + map.omitted);
    } finally {
      await fx.dispose();
    }
  });

  it('context: grep on known names, harvest on the known paths and grep hits', async () => {
    const fx = await repo();
    try {
      const map = await buildMap({ ...base(fx), mode: 'context', layers: ['grep', 'harvest'], layersSource: 'config', terms: [], paths: ['src/cart/cart.service.ts'], symbols: ['applyDiscount'] });
      assert.deepEqual(map.layers.map((layer) => layer.name), ['grep', 'harvest']);
      assert.equal(map.layers[0]!.hits, 3);
      assert.ok(map.candidates.find((candidate) => candidate.path === 'src/cart/cart.service.ts')!.score >= 10);
      assert.ok(map.collisions.includes('applyDiscount'));
      assert.match(map.text, /"collides":\["applyDiscount"\]/);
    } finally {
      await fx.dispose();
    }
  });

  it('history records hits 0 with its limitation; the index layers are skipped with "index none"; an unknown layer is refused before anything runs', async () => {
    const fx = await repo();
    try {
      const map = await buildMap({ ...base(fx), mode: 'prompt', layers: ['shortlist', 'history', 'index.find', 'index.relates'], layersSource: 'route', terms: ['cart'] });
      assert.deepEqual(map.layers.map((layer) => [layer.name, layer.hits === 0 && layer.name === 'history' ? 0 : -1]).filter(([name]) => name === 'history'), [['history', 0]]);
      assert.ok(map.limitations.includes('history runs inside shortlist.'));
      assert.ok(map.limitations.includes('index none: index.find skipped.') && map.limitations.includes('index none: index.relates skipped.'));
      assert.ok(!map.layers.some((layer) => layer.name.startsWith('index')));
      await assert.rejects(buildMap({ ...base(fx), mode: 'prompt', layers: ['shortlist', 'nonsense'], layersSource: 'config', terms: ['cart'] }), (error: Error & { code?: string; details?: string[] }) => error.code === 'search-layer-unknown' && /Known layers/.test(error.details?.join(' ') ?? ''));
    } finally {
      await fx.dispose();
    }
  });

  it('resolveLayers prints the default list and says where it came from', () => {
    assert.deepEqual(resolveLayers(SearchConfig.parse({}), 'prompt'), { layers: ['shortlist', 'harvest', 'shortlist'], source: 'default' });
    assert.deepEqual(resolveLayers(SearchConfig.parse({ layers: { context: ['grep'] } }), 'context'), { layers: ['grep'], source: 'config' });
  });
});

describe('03-M4 term ranking', () => {
  it('identifiers first; prose words only when fewer than 3 identifiers; hyphenated compounds split', async () => {
    const fx = await repo();
    try {
      const options = { runtime: fx.runtime, root: fx.repo.root, project: project(fx), files: [] };
      const many = await rankTerms([{ title: 'Discount', content: 'Change `applyDiscount` and CartService.addItem and discount_rate; the customer wants this faster.' }], options);
      assert.deepEqual(many.slice(0, 3), ['applyDiscount', 'CartService.addItem', 'discount_rate'].filter((term) => many.includes(term)).slice(0, 3));
      assert.ok(!many.includes('customer') && !many.includes('faster'));
      const few = await rankTerms([{ title: '', content: 'The long-running customer export is slow for retailers' }], options);
      assert.ok(few.includes('retailers') || few.includes('export'));
      assert.ok(few.some((term) => term === 'running' || term === 'long-running'));
    } finally {
      await fx.dispose();
    }
  });

  it('quoted UI strings map to i18n keys when catalogs exist, else stay as strings', async () => {
    const fx = await repo({ 'assets/i18n/en.json': JSON.stringify({ cart: { empty: 'Your cart is empty' } }) });
    try {
      const files = ['assets/i18n/en.json'];
      const sources = [{ title: '', content: 'Show "Your cart is empty" and `applyDiscount` near `CartService.addItem`' }];
      const mapped = await rankTerms(sources, { runtime: fx.runtime, root: fx.repo.root, project: project(fx), files });
      assert.deepEqual(mapped, ['applyDiscount', 'CartService.addItem', 'cart.empty']);
      const unmapped = await rankTerms(sources, { runtime: fx.runtime, root: fx.repo.root, project: project(fx), files: [] });
      assert.deepEqual(unmapped, ['applyDiscount', 'CartService.addItem', 'Your cart is empty']);
    } finally {
      await fx.dispose();
    }
  });
});

describe('03-M5 map output bound', () => {
  it('cuts candidates from the bottom to 6,144 bytes and says how many were omitted', async () => {
    const fx = await repo();
    try {
      const paths = Array.from({ length: 120 }, (_, index) => `src/wide/feature-handler-${index}-${'x'.repeat(40)}.ts`);
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), mode: 'context', layers: [], layersSource: 'config', terms: [], paths, symbols: [] });
      assert.ok(map.bytes <= MAP_LIMIT_BYTES, `${map.bytes}`);
      assert.ok(map.omitted > 0);
      assert.match(map.text, new RegExp(`"omitted":${map.omitted}`));
    } finally {
      await fx.dispose();
    }
  });
});

describe('03-M6 refs and find', () => {
  it('refs lists lines per name and flags a name declared in several files', async () => {
    const fx = await repo();
    try {
      const result = await refs(fx.runtime, ['applyDiscount', 'CartService'], { project: project(fx), show: false });
      assert.deepEqual(result.names.map((row) => [row.name, row.hits > 0, row.collides]), [['applyDiscount', true, true], ['CartService', true, false]]);
      assert.match(result.text, /applyDiscount: \d+ hits in 3 files; collides: declared in src\/cart\/cart\.service\.ts, src\/cart\/discount\.ts/);
    } finally {
      await fx.dispose();
    }
  });

  it('find lists declarations, filters by kind, and says when there is none', async () => {
    const fx = await repo();
    try {
      assert.equal((await find(fx.runtime, 'applyDiscount', { project: project(fx), kind: null })).length, 2);
      assert.equal((await find(fx.runtime, 'CartService', { project: project(fx), kind: 'function' })).length, 0);
      assert.equal((await find(fx.runtime, 'CartService', { project: project(fx), kind: 'class' })).length, 1);
    } finally {
      await fx.dispose();
    }
  });

  it('prints at most 4,096 bytes; --show writes the whole result to steps/; --task records a search entry', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => `export const marker = ${index}; // applyMarker ${'y'.repeat(60)}`).join('\n');
    const fx = await repo({ 'src/big/markers.ts': `${lines}\n` });
    try {
      const run = (argv: string[]) => parseArgs('refs', argv, REFS_OPTIONS);
      const bounded = await runRefs(fx.runtime, run(['applyMarker', '--task', 'T1']));
      assert.ok(bounded.bytes <= SEARCH_LIMIT_BYTES, `${bounded.bytes}`);
      assert.match(bounded.text, /\d+ more lines: refs applyMarker --show/);
      const shown = await runRefs(fx.runtime, run(['applyMarker', '--task', 'T1', '--show']));
      assert.ok(shown.file !== undefined && (await readFile(shown.file, 'utf8')).split('\n').length > 200);
      const entries = await fx.kinds('T1', 'search');
      assert.deepEqual(entries.map((entry) => [entry['command'], entry['names'], entry['hits']]), [['refs', ['applyMarker'], 200], ['refs', ['applyMarker'], 200]]);
      const found = await runFind(fx.runtime, parseArgs('find', ['CartService', '--task', 'T1'], FIND_OPTIONS));
      assert.match(found.text, /class src\/cart\/cart\.service\.ts:1/);
      assert.equal((await fx.kinds('T1', 'search')).at(-1)!['command'], 'find');
    } finally {
      await fx.dispose();
    }
  });

  it('03-T7/03-M6: map --task appends a map entry; --layers is refused whatever its value', async () => {
    const fx = await repo();
    try {
      const output = await runMap(fx.runtime, parseArgs('map', ['--task', 'T2', '--term', 'cart'], MAP_OPTIONS));
      assert.match(output.text, /^layers: shortlist → harvest → shortlist \(default\)/);
      const entry = (await fx.kinds('T2', 'map'))[0]!;
      assert.deepEqual([entry['mode'], entry['layersSource'], entry['index']], ['prompt', 'default', 'none']);
      await assert.rejects(runMap(fx.runtime, parseArgs('map', ['--term', 'cart', '--layers', 'grep'], MAP_OPTIONS)), (error: Error & { code?: string }) => error.code === 'search-layers-not-for-model');
      await assert.rejects(runMap(fx.runtime, parseArgs('map', ['--layers', ''], MAP_OPTIONS)), (error: Error & { code?: string }) => error.code === 'search-layers-not-for-model');
    } finally {
      await fx.dispose();
    }
  });
});

describe('03b-M map terms and leads', () => {
  it('03b-M1: URLs, hosts, UUIDs, attributes and markup are removed before terms are mined', () => {
    const cleaned = cleanRequestText('See ![](blob:https://media.example.net/?type=file&localId=1&__fileName=x) and <ticket>CartService</ticket> id 6f949af5-24c7-4a51-9168-a71720c604a6 on cdn.example.com, __contextId too');
    for (const gone of ['https', 'localId', '__fileName', '<ticket>', '6f949af5', 'cdn.example.com', '__contextId']) assert.ok(!cleaned.includes(gone), gone);
    assert.match(cleaned, /CartService/);
  });

  it('03b-M1/03b-M2: quoted boilerplate and request words are not terms; the names in the request are', async () => {
    const fx = await repo();
    try {
      const sources = [{ title: '', content: 'In the repository at `repo/`, which files would the `CartService` change touch? End with a `## Files` section; run `cd repo` first. Answer the question; do not edit anything.' }];
      const terms = await rankTerms(sources, { runtime: fx.runtime, root: fx.repo.root, project: project(fx), files: [] });
      assert.ok(terms.includes('CartService'), terms.join(','));
      for (const word of ['repo/', 'repo', '## Files', 'cd repo', 'files', 'repository', 'change', 'touch', 'section', 'anything', 'question']) assert.ok(!terms.includes(word), `${word} in ${terms.join(',')}`);
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M3/03b-M6: a full first pass still lets harvested names into pass 2, and the entry records the candidate paths', async () => {
    const fx = await repo();
    try {
      const terms = ['cart', 'one1', 'two2', 'three3', 'four4', 'five5', 'six6', 'seven7', 'eight8', 'nine9', 'ten10', 'eleven11'];
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [], mode: 'prompt', layers: ['shortlist', 'harvest', 'shortlist'], layersSource: 'default', terms });
      assert.deepEqual(map.terms.pass2.slice(0, 6), terms.slice(0, 6));
      assert.ok(map.terms.pass2.some((term) => !terms.includes(term)), map.terms.pass2.join(','));
      assert.equal(map.terms.pass2.length, 12);
      const paths = map.entry['candidatePaths'] as string[];
      assert.ok(Array.isArray(paths) && paths.length <= 20 && paths.includes('src/cart/cart.service.ts'));
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M4: the route payload is the terms and at most 8 leads with their first reason, within its byte limit', () => {
    const candidates = Array.from({ length: 30 }, (_, index) => ({ path: `src/features/area-${index}/${'deep/'.repeat(6)}file-${index}.ts`, score: 30 - index, reasons: [`contains "Term${index}" ${'x'.repeat(200)}`, 'second'] }));
    const text = leadsText({ terms: { pass1: ['Term1', 'Term2'], pass2: ['Term1', 'Term2', 'Harvested'] }, candidates, collisions: ['Dup'] });
    const lines = text.split('\n');
    assert.equal(lines[0], 'Leads from the terms Term1, Term2; then Harvested:');
    assert.ok(lines.filter((line) => /^\d+\. /.test(line)).length <= 8);
    assert.doesNotMatch(text, /second/);
    assert.match(lines.at(-1)!, /Declared more than once: Dup\./);
    assert.ok(Buffer.byteLength(text) <= LEADS_LIMIT_BYTES);
  });
});
