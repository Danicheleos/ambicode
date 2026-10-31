import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeFixture, type RouteFixture } from '#testing/fixtures/route-fixture';
import { parseArgs } from '#util/args';
import { MAP_OPTIONS, mapCommand } from '#cli/commands/search/search';
import { rankTerms, buildMap, resolveLayers, fitMapText, MAP_LEGEND, MAP_FLOOR_CHARS, MAP_LIMIT_BYTES } from './map.ts';


const project = { id: 'app', root: '.', paths: [], ecosystem: { languages: ['typescript'], frameworks: [], packageManager: null }, include: [], exclude: [], commands: {}, packs: [], checks: {}, policyFiles: [] } as never;
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
  it('fitMapText drops the lowest-ranked rows, keeps the JSON valid and the lines after it, and refuses below the floor', () => {
    const rows = Array.from({ length: 60 }, (_, index) => [`src/a${index}/f.ts`, 9 - index / 10, ['contains "x"']]);
    const text = `layers: shortlist (default)\n${JSON.stringify({ candidates: rows, limitations: ['kept note'] })}\nInvestigation: notes/x.md. Read it first.`;
    const fit = fitMapText(text, 1500)!;
    assert.ok(fit.text.length <= 1500 && fit.cut > 0, `${fit.text.length}`);
    const lines = fit.text.split('\n');
    const doc = JSON.parse(lines[1]!) as { candidates: unknown[]; limitations: string[] };
    assert.deepEqual(doc.candidates, rows.slice(0, 60 - fit.cut));
    assert.deepEqual(doc.limitations, ['kept note', `${fit.cut} more lower-ranked candidate(s) cut to fit the delivery`]);
    assert.equal(lines[2], 'Investigation: notes/x.md. Read it first.');
    assert.deepEqual(fitMapText(text, text.length), { text, cut: 0 });
    assert.equal(fitMapText(text, MAP_FLOOR_CHARS - 1), null);
  });

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

  it('a term matches whole words and identifier parts in file content, not the middle of other words', async () => {
    const fx = await repo({
      'src/notes/list.ts': '// the EST list is shown first\nexport const shown = 1;\n',
      'src/panels/panel.ts': 'export class EstWizardPanel {}\n',
      'src/inside/inside.ts': 'export const request = destroy(nested(TestBed));\n',
    });
    try {
      const found = await map(fx, ['shortlist'], ['EST']);
      const paths = found.candidates.map((candidate) => candidate.path).filter((path) => /^src\/(notes|panels|inside)\//.test(path));
      assert.deepEqual(paths.sort(), ['src/notes/list.ts', 'src/panels/panel.ts'], found.candidates.map((candidate) => candidate.path).join(','));
    } finally {
      await fx.dispose();
    }
  });

  it('a name harvested from a top file does not score against the file it came from', async () => {
    const fx = await repo({
      'src/billing/quote-engine.ts': 'export function priceQuote() { return 1; }\n',
      'src/legacy/compute-total.ts': '// old quote helper, unused\nexport function computeTotal() { return 0; }\n',
    });
    try {
      const found = await map(fx, PROMPT, ['quote']);
      assert.ok(found.terms.pass2.includes('computeTotal'), found.terms.pass2.join(','));
      assert.equal(found.candidates[0]!.path, 'src/billing/quote-engine.ts', found.candidates.map((candidate) => `${candidate.path}:${candidate.score}`).join(','));
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
      assert.ok(twice.text.startsWith(`${MAP_LEGEND}\n{"candidates"`));
      assert.doesNotMatch(twice.text.slice(MAP_LEGEND.length), /"terms"|"pass1"|"symbols"|"collides"|declarations/, 'debug fields stay in the ledger and the result, not in the text');
      assert.deepEqual(Object.keys(twice.entry).sort(), ['bytes', 'candidates', 'layers', 'layersSource', 'limitations', 'mode', 'paths', 'terms']);
      assert.deepEqual(twice.entry['paths'], twice.candidates.map((candidate) => candidate.path), 'the ledger keeps the ranked paths a later policy stage scopes rules to');
    } finally {
      await fx.dispose();
    }
  });

  it('flags a harvested name declared in two files, and the grep layer finds the known symbols', async () => {
    const fx = await repo();
    try {
      assert.deepEqual((await map(fx, PROMPT, ['cart'])).collisions, ['applyDiscount']);
      const context = await buildMap(fx.runtime, { project, mode: 'context', layers: ['grep', 'harvest'], paths: ['src/cart/cart.service.ts', 'src/cart/discount.ts'], symbols: ['applyDiscount'] });
      assert.equal(context.layers[0]!.hits, 2);
      assert.deepEqual(context.collisions, ['applyDiscount']);
      const prompt = await map(fx, PROMPT, ['cart']);
      assert.ok(Object.values(prompt.symbols).flat().some((symbol) => symbol.collides), 'the structured symbols stay on the result');
      assert.doesNotMatch(prompt.text, /collides|symbols/);
      assert.doesNotMatch(context.text, /collides|symbols/);
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

  it('cuts candidates from the bottom to MAP_LIMIT_BYTES and counts them in the ledger limitations', async () => {
    const wide = Object.fromEntries([
      ...Array.from({ length: 80 }, (_, index) => [`src/pad/p${index}.ts`, `export const pad${index} = 1;\n`]),
      ...Array.from({ length: 60 }, (_, index) => [`src/hits/a-deliberately-long-directory-name-for-the-needleword-fixture-${index}/long-named-file.ts`, `export const hit${index} = "needleword";\n`]),
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

  it('lists one file per folder and says how many it folded; a rarer term outranks a broad one', async () => {
    const fx = await repo({ 'src/cart/discount.spec.ts': 'it("x", () => {});\n' });
    try {
      const found = await map(fx, ['shortlist'], ['discount', 'export']);
      assert.equal(found.candidates.filter((candidate) => candidate.path.startsWith('src/cart/')).length, 1);
      assert.ok(found.limitations.some((note) => /more file\(s\) in folders already listed/.test(note)));
      const seeded = await buildMap(fx.runtime, { project, mode: 'context', layers: ['shortlist'], terms: ['discount'], paths: ['src/cart/cart.service.ts'] });
      assert.ok(seeded.candidates.some((candidate) => candidate.path === 'src/cart/cart.service.ts'), 'a path the caller named is never folded');
      const rare = await map(fx, ['shortlist'], ['checkout', 'unrelated']);
      assert.equal(rare.candidates[0]!.path, 'src/cart/checkout.ts');
    } finally {
      await fx.dispose();
    }
  });

  it('a term that matches no file gives its slot to the next one', async () => {
    const fx = await repo();
    try {
      const dead = Array.from({ length: 12 }, (_, index) => `\`deadTerm${String.fromCharCode(97 + index)}Name\``).join(' ');
      const found = await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist'], request: `${dead} \`settleInvoice\`` });
      assert.deepEqual(found.terms.pass1, ['settleInvoice']);
      assert.match(found.limitations.join('\n'), /no file matches the terms "deadTermaName".*"deadTermlName"/);
      assert.ok(found.candidates.some((candidate) => candidate.path === 'src/cart/checkout.ts'));
    } finally {
      await fx.dispose();
    }
  });

  it('never lists a test file: a spec named after the term moves its row to the source file of the same stem in its folder', async () => {
    const fx = await repo({ 'src/cart/discount.test.ts': 'import { applyDiscount } from "./discount";\n', 'tests/discount.test.ts': 'import { applyDiscount } from "../src/cart/discount";\n', 'tests/unrelated.test.ts': 'it("works", () => {});\n' });
    try {
      const paths = (await map(fx, ['shortlist'], ['discount'])).candidates.map((candidate) => candidate.path);
      assert.ok(paths.includes('src/cart/discount.ts'), paths.join(','));
      assert.ok(!paths.some((path) => path.startsWith('tests/') || path.endsWith('.test.ts')), paths.join(','));
    } finally {
      await fx.dispose();
    }
  });

  it('keeps spec and config rows on their own file when the request is about them, and moves them otherwise', async () => {
    const fx = await repo({ 'tests/discount.test.ts': 'import { applyDiscount } from "../src/cart/discount";\n', 'src/settings/discount.config.ts': 'export default { rate: 1 };\n' });
    try {
      const listed = async (request: string): Promise<string[]> => (await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist'], terms: ['discount'], request })).candidates.map((candidate) => candidate.path);
      assert.deepEqual(await listed('Why is the discount wrong?'), ['src/cart/discount.ts']);
      assert.deepEqual(await listed('Why is the discount build target wrong?'), ['src/cart/discount.ts'], 'build output directories are not companions');
      assert.ok((await listed('Which tests cover the discount?')).includes('tests/discount.test.ts'));
      assert.ok((await listed('Where is the discount config read?')).includes('src/settings/discount.config.ts'));
    } finally {
      await fx.dispose();
    }
  });

  it('renders only the limitations the model can act on; the ledger entry keeps all of them', async () => {
    const fx = await repo({ 'src/cart/discount.spec.ts': 'it("x", () => {});\n', 'src/assets/i18n.json': '{ "label": "ZebraCrossing" }\n' });
    try {
      const found = await map(fx, ['shortlist', 'retrieve'], ['discount', 'export', 'ZebraCrossing', 'qqNoSuchWord']);
      const shown = JSON.parse(found.text.split('\n').find((line) => line.startsWith('{"candidates"'))!) as { limitations?: string[] };
      assert.ok(found.limitations.some((note) => /more file\(s\) in folders already listed/.test(note)));
      assert.ok(found.limitations.some((note) => /^search index built now, \d+ ms$/.test(note)));
      assert.equal(shown.limitations?.length, 3, shown.limitations?.join('|'));
      assert.match(shown.limitations![0]!, /^"export" matched \d+ of \d+ files; ignored$/);
      assert.match(shown.limitations![1]!, /^no file matches the term "qqNoSuchWord"/);
      assert.equal(shown.limitations![2], '"ZebraCrossing" is in no code file, only in src/assets/i18n.json');
      assert.deepEqual(found.entry['limitations'], found.limitations);
    } finally {
      await fx.dispose();
    }
  });

  it('refuses an unknown layer, and the default list names its source', async () => {
    const fx = await repo();
    try {
      await assert.rejects(map(fx, ['shortlist', 'index.find'], ['cart']), (error: Error & { code?: string }) => error.code === 'search-layer-unknown' && /index\.find/.test(error.message));
      assert.deepEqual(resolveLayers('prompt'), { layers: ['shortlist', 'retrieve', 'harvest', 'shortlist'], source: 'default' });
    } finally {
      await fx.dispose();
    }
  });
});

describe('map --request', () => {
  it('derives the terms from free text', async () => {
    const fx = await repo();
    try {
      const out = await mapCommand.run(fx.runtime, parseArgs('map', ['--request', 'Why is the discount wrong?'], MAP_OPTIONS));
      assert.ok((out.data as { terms: { pass1: string[] } }).terms.pass1.includes('discount'));
      assert.match(out.text, /discount\.ts/);
    } finally {
      await fx.dispose();
    }
  });
});

describe('map term extraction', () => {
  it('a quoted word loses the punctuation that follows it and does not take a second slot', () => {
    const terms = rankTerms([{ title: '', content: 'The badge reads “Draft.” then “Final,” and later “Draft,” again; the cell shows “Pending (late)”.' }]);
    assert.deepEqual(terms.filter((term) => /^Draft/.test(term)), ['Draft']);
    assert.ok(terms.includes('Final'), terms.join('|'));
    assert.ok(terms.every((term) => !/[.,;:*]$/.test(term)), terms.join('|'));
    assert.ok(terms.includes('Pending late'), terms.join('|'));
  });

  it('a single-quoted label with trailing markup is a phrase; an apostrophe is not a quote', () => {
    const terms = rankTerms([{ title: '', content: "The field 'Unit Price*' and 'Unit Price\\*' are required. The user's cart and the team's plan stay." }]);
    assert.deepEqual(terms.filter((term) => /^Unit /.test(term)), ['Unit Price']);
    assert.ok(!terms.some((term) => /s cart and the team/.test(term)), terms.join('|'));
  });

  it('adjacent capitalised words are a phrase unless the first only starts the sentence', () => {
    const terms = rankTerms([{ title: '', content: 'Open the Order Summary page. The Cart is empty. Then Order Summary opens.' }]);
    assert.ok(terms.includes('Order Summary'), terms.join('|'));
    assert.ok(!terms.some((term) => /^The /.test(term)), terms.join('|'));
  });

  it('lists source files only: a spec, a mock and a config file that name the term outrank nothing and are never listed', async () => {
    const fx = await repo({
      'src/loyalty/loyalty.service.ts': 'export const earnPoints = 1;\n',
      'src/loyalty/loyalty.service.spec.ts': 'import { earnPoints } from "./loyalty.service";\nit("loyalty", () => earnPoints);\n',
      'src/loyalty/loyalty.mock.ts': 'export const loyaltyMock = { earnPoints: 1 };\n',
      'src/loyalty/__mocks__/loyalty-data.ts': 'export const loyaltyData = 1;\n',
      'loyalty.config.ts': 'export default { loyalty: true };\n',
    });
    try {
      const found = await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist'], request: 'Change how `earnPoints` awards loyalty points' });
      const listed = found.pool.map((candidate) => candidate.path);
      assert.deepEqual(listed.filter((file) => /loyalty/.test(file)), ['src/loyalty/loyalty.service.ts'], listed.join(','));
    } finally {
      await fx.dispose();
    }
  });

  it('lists only the rows near the top score: one file that stands out alone is the whole list, and the omission is reported', async () => {
    const fx = await repo({
      'src/alpha/beta.ts': 'export const marker = 1;\n',
      ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`src/mention${index}/note.ts`, `// alpha ${index}\nexport const v${index} = ${index};\n`])),
    });
    try {
      const found = await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist'], terms: ['alpha', 'beta'] });
      assert.deepEqual(found.candidates.map((candidate) => candidate.path), ['src/alpha/beta.ts'], found.candidates.map((candidate) => `${candidate.path}:${candidate.score}`).join(','));
      assert.ok(found.pool.length > 1);
      assert.match(found.limitations.join('|'), /\d+ candidate\(s\) scored under \d+% of the top row are not listed/);
    } finally {
      await fx.dispose();
    }
  });

  it('a phrase finds files and folders by its hyphenated and joined spellings, and is not dead for lacking its exact spelling', async () => {
    const fx = await repo({
      'src/unit-price/form.ts': 'export const form = 1;\n',
      'src/shared/TotalAmount.ts': 'export const t = 1;\n',
    });
    try {
      const found = await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist'], request: "Fix 'Unit Price*' and the “Total Amount” field." });
      const paths = found.candidates.map((candidate) => candidate.path);
      assert.ok(paths.includes('src/unit-price/form.ts'), paths.join(','));
      assert.ok(paths.includes('src/shared/TotalAmount.ts'), paths.join(','));
      assert.deepEqual(found.terms.pass1.slice(0, 2).sort(), ['Total Amount', 'Unit Price']);
      assert.ok(!found.limitations.some((note) => /no file matches.*"(Unit Price|Total Amount)"/.test(note)), found.limitations.join('|'));
    } finally {
      await fx.dispose();
    }
  });

  it('a parenthesised fragment of one or two characters inside a quoted label leaves no junk term', () => {
    const terms = rankTerms([{ title: '', content: 'The tag reads “AI (overridden)” and the short form is “ai(o)” in the table.' }]);
    assert.ok(terms.includes('AI overridden'), terms.join('|'));
    assert.ok(!terms.some((term) => /^ai o$/i.test(term)), terms.join('|'));
  });

  it('an all-caps token of three to six letters is an identifier, and a function word in capitals is not', () => {
    const request = 'Rename ORD in `settleInvoice`, `apply_discount` and `cart/total`. It MUST NOT break THE flow AND SHOULD stay.';
    const terms = rankTerms([{ title: '', content: request }]);
    assert.ok(terms.includes('ORD'), terms.join('|'));
    assert.ok(!terms.some((term) => /^(?:MUST|NOT|THE|AND|SHOULD)$/.test(term)), terms.join('|'));
  });

  it('plain words stay out of the search even when most identifiers are dead', async () => {
    // The opposite was measured and dropped: letting plain words in when half the identifiers were dead put 33 more target
    // folders in the pool but cost .038 F1 and .060 top8 F1 on one 10-case bench; the printed list is what the reader gets.
    const fx = await repo({ 'src/refund/dialog.ts': 'export const dialog = 1;\n' });
    try {
      const keys = ['aa.bb_cc', 'aa.bb_dd', 'aa.bb_ee', 'aa.bb_ff', 'aa.bb_gg', 'aa.bb_hh', 'aa.bb_ii', 'aa.bb_jj', 'aa.bb_kk', 'aa.bb_ll'].map((key) => `\`${key}\``).join(', ');
      const found = await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist'], request: `Rework \`settleInvoice\` and the keys ${keys} for the refund dialog.` });
      assert.deepEqual(found.terms.pass1, ['settleInvoice']);
      assert.ok(!found.candidates.some((candidate) => candidate.path === 'src/refund/dialog.ts'), found.candidates.map((candidate) => candidate.path).join(','));
    } finally {
      await fx.dispose();
    }
  });

  it('plain words stay out of the search while most identifiers are live', async () => {
    const fx = await repo({ 'src/refund/dialog.ts': 'export const dialog = 1;\n' });
    try {
      const found = await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist'], request: 'Rework `settleInvoice`, `applyDiscount` and `DISCOUNT_RATE` for the refund dialog.' });
      assert.ok(!found.terms.pass1.includes('refund'), found.terms.pass1.join('|'));
    } finally {
      await fx.dispose();
    }
  });

  it('a phrase and a single word find a folder spelled with another inflection', async () => {
    const fx = await repo({ 'src/upload-complete/handler.ts': 'export const h = 1;\n', 'src/indicator/badge.ts': 'export const b = 1;\n' });
    try {
      const phrase = await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist'], request: 'Show the Upload Completed toast; see `settleInvoice`, `apply_discount`, `cart/total`.' });
      assert.ok(phrase.candidates.some((candidate) => candidate.path === 'src/upload-complete/handler.ts'), phrase.candidates.map((candidate) => candidate.path).join(','));
      assert.ok(!phrase.limitations.some((note) => /no file matches.*"Upload Completed"/.test(note)), phrase.limitations.join('|'));
      const word = await map(fx, ['shortlist'], ['indicators']);
      assert.ok(word.candidates.some((candidate) => candidate.path === 'src/indicator/badge.ts'), word.candidates.map((candidate) => candidate.path).join(','));
    } finally {
      await fx.dispose();
    }
  });

  it('an inflected form is tried only when the exact spelling hits no path', async () => {
    const fx = await repo({ 'src/indicators/badge.ts': 'export const b = 1;\n', 'src/indicator/other.ts': 'export const o = 1;\n' });
    try {
      const found = await map(fx, ['shortlist'], ['indicators']);
      const paths = found.candidates.map((candidate) => candidate.path);
      assert.ok(paths.includes('src/indicators/badge.ts'), paths.join(','));
      assert.ok(!paths.includes('src/indicator/other.ts'), paths.join(','));
    } finally {
      await fx.dispose();
    }
  });

  it('a ticket prefix whose number was left out is not a term; a numbered one never was, and a hyphenated all-caps name stays', () => {
    const terms = rankTerms([{ title: '', content: 'ORD-INV- silent saving of `FormBackup`; see ORD-INV-7 and the X-API-KEY header.' }]);
    assert.ok(!terms.some((term) => /^ORD-INV/.test(term)), terms.join('|'));
    assert.ok(terms.includes('FormBackup') && terms.includes('X-API-KEY'), terms.join('|'));
  });
});

describe('map retrieve layer', () => {
  const RETRIEVE = ['shortlist', 'retrieve'];

  it('reaches a folder through the catalog label its code quotes, says why, and counts the retrieved folders in the ledger entry', async () => {
    const fx = await repo({
      'src/locales/en.json': JSON.stringify({ orders: { status: { badge: 'Shipment status' } } }),
      'src/screens/zq7/panel.ts': "export const badgeKey = 'orders.status.badge';\n",
      'src/notes/outbound.ts': '// Shipment rules live elsewhere\nexport const outbound = 1;\n',
    });
    try {
      const found = await buildMap(fx.runtime, { project, mode: 'prompt', layers: RETRIEVE, request: 'The "Shipment" badge shows the wrong state; see `settleInvoice` and `applyDiscount`.' });
      const panel = found.pool.find((candidate) => candidate.path === 'src/screens/zq7/panel.ts');
      assert.ok(panel !== undefined, found.pool.map((candidate) => candidate.path).join(','));
      assert.match(panel.reasons.join('|'), /retrieved: label "Shipment status"/);
      assert.ok(found.limitations.some((note) => /^search index built now, \d+ ms$/.test(note)), found.limitations.join('|'));
      assert.ok(typeof found.entry['retrieved'] === 'number' && found.entry['retrieved'] > 0, JSON.stringify(found.entry));
    } finally {
      await fx.dispose();
    }
  });

  it('a module\'s words alone retrieve nothing: a folder under the matched module needs a hit of its own', async () => {
    const fx = await repo({
      'src/billing/core.ts': 'export const core = 1;\n',
      'src/billing/rates.ts': 'export const rates = 1;\n',
      'src/billing/totals.ts': 'export const totals = 1;\n',
      'src/billing/export/pdf.ts': 'export const pdf = 1;\n',
      'src/billing/import/csv.ts': 'export const csv = 1;\n',
    });
    try {
      const found = await buildMap(fx.runtime, { project, mode: 'prompt', layers: RETRIEVE, terms: ['billing', 'pdf'] });
      const retrieved = found.pool.filter((candidate) => candidate.reasons.some((reason) => reason.startsWith('retrieved:'))).map((candidate) => candidate.path);
      assert.ok(retrieved.includes('src/billing/export/pdf.ts'), retrieved.join(','));
      assert.ok(!retrieved.includes('src/billing/import/csv.ts'), retrieved.join(','));
      assert.ok(found.pool.some((candidate) => candidate.path === 'src/billing/import/csv.ts'), 'the shortlist still lists it by its directory');
    } finally {
      await fx.dispose();
    }
  });
});

describe('map neighbours', () => {
  it('a folder with a hit of its own that imports a top row is lifted above an equal folder nothing ties to the request', async () => {
    const fx = await repo({
      'src/lens/prism/index.ts': 'export const refract = 1;\n',
      'src/lens/viewer/index.ts': "import { refract } from '../prism/index';\nexport const view = refract;\n",
      'src/lens/gallery/index.ts': 'export const gallery = 1;\n',
    });
    try {
      const found = await buildMap(fx.runtime, { project, mode: 'prompt', layers: ['shortlist', 'retrieve'], terms: ['prism', 'viewer', 'gallery'] });
      const row = (name: string) => found.pool.find((candidate) => candidate.path === `src/lens/${name}/index.ts`)!;
      assert.match(row('viewer').reasons.join('|'), /neighbour of src\/lens\/prism/);
      assert.ok(!row('gallery').reasons.join('|').includes('neighbour of'), row('gallery').reasons.join('|'));
      assert.ok(row('viewer').score > row('gallery').score, `${row('viewer').score} ${row('gallery').score}`);
    } finally {
      await fx.dispose();
    }
  });
});

describe('map in-pool ranking', () => {
  it('a file behind two different request terms ranks above every file behind one, whatever the one scored', async () => {
    const fx = await repo({
      'src/rock/solo.ts': 'export const s = "quartzite gabbro";\n',
      'src/basalt/a.ts': 'export const a = 1;\n',
      'src/basalt/b.ts': 'export const b = 1;\n',
      'src/basalt/c.ts': 'export const c = 1;\n',
      'src/misc/basalt.ts': 'export const m = 1;\n',
    });
    try {
      const found = await map(fx, ['shortlist'], ['quartzite', 'gabbro', 'basalt']);
      const paths = found.pool.map((candidate) => candidate.path);
      assert.equal(paths[0], 'src/rock/solo.ts', paths.join(','));
      const score = (path: string) => found.pool.find((candidate) => candidate.path === path)!.score;
      assert.ok(score('src/misc/basalt.ts') > 0 && score('src/rock/solo.ts') > score('src/misc/basalt.ts'));
      assert.deepEqual(paths.slice(1).sort(), ['src/basalt/a.ts', 'src/basalt/b.ts', 'src/basalt/c.ts', 'src/misc/basalt.ts']);
    } finally {
      await fx.dispose();
    }
  });

  it('with one request term every row stays behind it and the scores are untouched', async () => {
    const fx = await repo();
    try {
      const found = await map(fx, ['shortlist'], ['discount']);
      assert.equal(found.pool[0]!.path, 'src/cart/discount.ts');
      assert.ok(found.pool[0]!.score > 5, `${found.pool[0]!.score}`);
    } finally {
      await fx.dispose();
    }
  });
});
