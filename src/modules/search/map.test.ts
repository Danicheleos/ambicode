import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeFixture, type RouteFixture } from '#testing/fixtures/route-fixture';
import { buildMap, resolveLayers, MAP_LIMIT_BYTES } from './map.ts';
import { rankTerms } from './terms.ts';
import { SearchConfig } from '#types/modules/config';

const project = { id: 'app', root: '.', ecosystem: 'typescript', commands: {}, packs: [], checks: {}, policyFiles: [] } as never;
const PROMPT = ['shortlist', 'harvest', 'shortlist'];

async function repo(extra: Record<string, string> = {}): Promise<RouteFixture> {
  const fx = await routeFixture({ routes: {} });
  const files: Record<string, string> = {
    'src/cart/cart.service.ts': 'export class CartService {\n  addItem(sku: string) { return applyDiscount(sku); }\n}\nexport function applyDiscount(sku: string) { return sku; }\n',
    'src/cart/discount.ts': 'export function applyDiscount(sku: string, rate: number) { return sku + rate; }\nexport const DISCOUNT_RATE = 0.1;\n',
    'src/cart/checkout.ts': 'export function settleInvoice() { return 1; }\n',
    'src/billing/ledger.ts': 'import { settleInvoice } from "@app/payments";\nexport const total = settleInvoice();\n',
    ...Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`src/other/unrelated-${index}.ts`, `export const value${index} = ${index};\n`])),
    ...extra,
  };
  for (const [file, content] of Object.entries(files)) await fx.repo.write(file, content);
  await fx.repo.commitAll('files');
  return fx;
}
const map = (fx: RouteFixture, layers: string[], terms: string[], extra: object = {}) => buildMap(fx.runtime, { project, mode: 'prompt', layers, terms, ...extra });

describe('map', () => {
  it('ranks the file a term names by path above files that only mention it, and takes identifiers from a request before prose', async () => {
    const fx = await repo();
    try {
      const found = await map(fx, ['shortlist'], ['discount']);
      assert.equal(found.candidates[0]!.path, 'src/cart/discount.ts');
      assert.match(found.candidates[0]!.reasons[0]!, /^filename matched "discount"/);
      assert.deepEqual(rankTerms([{ title: '', content: 'Fix `applyDiscount` so the rounding is right for every customer in the cart' }]).slice(0, 1), ['applyDiscount']);
      const derived = await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist'], request: 'Why does `applyDiscount` return a wrong rate?' });
      assert.equal(derived.terms.pass1[0], 'applyDiscount');
    } finally {
      await fx.dispose();
    }
  });

  it('pass 2 adds a file reachable only through a name harvested from the first pass', async () => {
    const fx = await repo();
    try {
      const once = await map(fx, ['shortlist'], ['checkout']);
      assert.ok(!once.candidates.some((candidate) => candidate.path === 'src/billing/ledger.ts'));
      const twice = await map(fx, PROMPT, ['checkout']);
      assert.deepEqual(twice.layers.map((layer) => layer.name), PROMPT);
      assert.ok(twice.terms.pass2.includes('settleInvoice'), twice.terms.pass2.join(','));
      assert.ok(twice.candidates.some((candidate) => candidate.path === 'src/billing/ledger.ts'));
      assert.match(twice.text.split('\n')[0]!, /^layers: shortlist → harvest → shortlist \(default\)$/);
      assert.deepEqual(Object.keys(twice.entry).sort(), ['bytes', 'candidates', 'layers', 'layersSource', 'limitations', 'mode', 'terms']);
    } finally {
      await fx.dispose();
    }
  });

  it('flags a harvested name declared in two files, and the grep layer finds the known symbols', async () => {
    const fx = await repo();
    try {
      assert.deepEqual((await map(fx, PROMPT, ['cart'])).collisions, ['applyDiscount']);
      const context = await buildMap(fx.runtime, { project, mode: 'context', layers: ['grep', 'harvest'], paths: ['src/cart/cart.service.ts'], symbols: ['applyDiscount'] });
      assert.equal(context.layers[0]!.hits, 2);
      assert.deepEqual(context.collisions, ['applyDiscount']);
      assert.match(context.text, /"collides":\["applyDiscount"\]/);
      assert.ok(context.candidates.find((candidate) => candidate.path === 'src/cart/discount.ts')!.spans!.length > 0);
    } finally {
      await fx.dispose();
    }
  });

  it('drops a term that matches most of the project and says so', async () => {
    const fx = await repo();
    try {
      const found = await map(fx, ['shortlist'], ['export', 'CartService']);
      assert.ok(found.limitations.some((line) => /^"export" matched \d+ of \d+ files; ignored$/.test(line)), found.limitations.join('|'));
      assert.equal(found.candidates[0]!.path, 'src/cart/cart.service.ts');
    } finally {
      await fx.dispose();
    }
  });

  it('cuts candidates from the bottom to 6,144 bytes and counts them in the limitations', async () => {
    const wide = Object.fromEntries([
      ...Array.from({ length: 80 }, (_, index) => [`src/pad/p${index}.ts`, `export const pad${index} = 1;\n`]),
      ...Array.from({ length: 60 }, (_, index) => [`src/hits/a-deliberately-long-directory-name-for-the-needleword-fixture/long-named-file-${index}.ts`, `export const hit${index} = "needleword";\n`]),
    ]);
    const fx = await repo(wide);
    try {
      const found = await map(fx, ['shortlist'], ['needleword']);
      assert.ok(found.bytes <= MAP_LIMIT_BYTES && Buffer.byteLength(found.text) === found.bytes, `${found.bytes}`);
      assert.ok(found.omitted > 0 && found.candidates.length + found.omitted === 60);
      assert.ok(found.limitations.includes(`${found.omitted} lower-ranked candidate(s) cut to fit ${MAP_LIMIT_BYTES} bytes`));
      assert.equal(found.entry['candidates'], 60);
    } finally {
      await fx.dispose();
    }
  });

  it('refuses an unknown layer, and a configured list keeps its own name for the source', async () => {
    const fx = await repo();
    try {
      await assert.rejects(map(fx, ['shortlist', 'index.find'], ['cart']), (error: Error & { code?: string }) => error.code === 'search-layer-unknown' && /index\.find/.test(error.message));
      assert.deepEqual(resolveLayers(SearchConfig.parse({}), 'prompt'), { layers: PROMPT, source: 'default' });
      assert.deepEqual(resolveLayers(SearchConfig.parse({ layers: { context: ['grep'] } }), 'context'), { layers: ['grep'], source: 'config' });
    } finally {
      await fx.dispose();
    }
  });
});
