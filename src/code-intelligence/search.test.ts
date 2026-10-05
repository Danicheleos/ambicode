import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { parseArgs } from '../cli/args.ts';
import { MAP_OPTIONS, REFS_OPTIONS, FIND_OPTIONS, runFind, runMap, runRefs } from '../cli/commands/search.ts';
import { openRepository } from '../composition/root.ts';
import { routeFixture, type RouteFixture } from '../testing/route-fixture.ts';
import { harvest } from './harvest.ts';
import { buildMap, cleanRequestText, featureOf, sequenceFiles, FEATURE_LIMIT_BYTES, leadsText, LEADS_LIMIT_BYTES, MAP_LIMIT_BYTES, rankTerms, resolveLayers } from './map.ts';
import { excludeWorkingDirs } from '../task/task-dir.ts';
import { find, refs, SEARCH_LIMIT_BYTES } from './refs.ts';
import { SearchConfig } from '../contracts/config.ts';
import { ECOSYSTEMS } from '../config/ecosystems.ts';
import { isPathReason } from './locate.ts';
import { execFileSync } from 'node:child_process';

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
const realpathOf = (file: string): Promise<string> => realpath(file);
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
      assert.deepEqual(mapped.slice(0, 3), ['applyDiscount', 'CartService.addItem', 'cart.empty']);
      assert.ok(mapped.length > 3, '03b-M13: a key is not a code term, so two identifiers still take prose');
      const unmapped = await rankTerms(sources, { runtime: fx.runtime, root: fx.repo.root, project: project(fx), files: [] });
      assert.deepEqual(unmapped.slice(0, 3), ['applyDiscount', 'CartService.addItem', 'Your cart is empty']);
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

  it('03b-M8: a ticket id gives the parts some path spells, and abbreviations are not terms', async () => {
    const fx = await repo();
    try {
      const files = await (await openRepository(fx.runtime)).git.listFiles(null);
      const sources = [{ title: '', content: 'Story XX-CART-12 and ZZ-QUUX-3: `CartService.addItem` and `applyDiscount`, e.g. on checkout.' }];
      const terms = await rankTerms(sources, { runtime: fx.runtime, root: fx.repo.root, project: project(fx), files });
      assert.ok(terms.includes('cart'), terms.join(','));
      for (const gone of ['XX-CART-12', 'ZZ-QUUX-3', 'quux', 'e.g']) assert.ok(!terms.includes(gone), `${gone} in ${terms.join(',')}`);
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M9: names are harvested from files placed by their path, not from a content-only sibling', async () => {
    const fx = await repo({ 'src/sibling/sibling.ts': 'export function cartSiblingHelper() { return "cart"; }\nexport const SiblingOnly = 1;\n' });
    try {
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [], mode: 'prompt', layers: ['shortlist', 'harvest', 'shortlist'], layersSource: 'default', terms: ['cart'] });
      assert.ok(!map.terms.pass2.includes('SiblingOnly'), map.terms.pass2.join(','));
      assert.ok(map.terms.pass2.includes('CartService'), map.terms.pass2.join(','));
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M10/03b-M16: the leads name the feature directory and its tests and shared-kind files named like the leads', () => {
    const lead = (file: string) => ({ path: file, score: 5, reasons: ['sits under a directory matching "cart"'] });
    const ordered = [lead('src/app/cart/dto/cart.dto.ts'), lead('src/app/cart/cart.service.ts'), { path: 'src/other/x.ts', score: 1, reasons: ['contains "cart"'] }];
    const files = ['src/app/cart/dto/cart.dto.ts', 'src/app/cart/cart.service.ts', 'src/app/cart/cart.service.spec.ts', 'src/app/cart/mocks/cart.mocks.ts', 'src/app/cart/cart.router.ts', 'src/app/cart/cart.schema.ts', 'src/app/cart/discount.ts', 'src/app/billing/cart.ts', 'src/app/cart/.ambicode/task/t/cart.md'];
    const feature = featureOf(ordered, files, ECOSYSTEMS.typescript.sharedKinds);
    assert.deepEqual(featureOf(ordered, files)?.paths, ['src/app/cart/cart.service.spec.ts'], 'no shared kinds: tests only');
    assert.deepEqual(feature, { root: 'src/app/cart', paths: ['src/app/cart/cart.service.spec.ts', 'src/app/cart/mocks/cart.mocks.ts'] });
    const text = leadsText({ terms: { pass1: ['cart'], pass2: ['cart'] }, candidates: ordered, collisions: ['Dup'], feature });
    assert.match(text, /^Same feature \(src\/app\/cart\/\): cart\.service\.spec\.ts, mocks\/cart\.mocks\.ts$/m);
    assert.match(text.split('\n').at(-1)!, /Declared more than once/);
    assert.equal(featureOf([lead('src/a/one.ts'), { path: 'src/a/two.ts', score: 4, reasons: ['contains "x"'] }], ['src/a/one.ts', 'src/a/one.spec.ts']), null, 'one lead placed by path is not a feature');
    const many = { root: 'src/app/cart', paths: Array.from({ length: 12 }, (_, i) => `src/app/cart/${'n'.repeat(40)}-${i}.ts`) };
    const line = leadsText({ terms: { pass1: [], pass2: [] }, candidates: [], collisions: [], feature: many }).split('\n').at(-1)!;
    assert.ok(Buffer.byteLength(line) <= FEATURE_LIMIT_BYTES && line.endsWith(', …'), line);
  });

  it('03b-M19: directories whose names mostly start with a number or date are sequence files; mixed ones are not', () => {
    const migrations = ['2025-03-17_a1_add.py', '2025-03-24_b2_drop.py', '0003_x.py', '0004_y.py', 'V5__z.sql'].map((name) => `src/migrations/${name}`);
    const files = [...migrations, 'src/migrations/env.py', 'src/routers/issues.py', ...['100-a.ts', '200-b.ts', 'c.ts', 'd.ts', 'e.ts'].map((name) => `src/mixed/${name}`)];
    assert.deepEqual([...sequenceFiles(files)].sort(), [...migrations, 'src/migrations/env.py'].sort());
  });

  it('03b-M19: sequence files rank last and give no harvested names', async () => {
    const migrations = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`src/migrations/2025-0${n}-01_order_m${n}.ts`, 'export function upgradeOrder() {}\n']));
    const fx = await repo({ ...migrations, 'src/orders/order.ts': 'export function shipOrder() {}\n' });
    try {
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [], mode: 'prompt', layers: ['shortlist', 'harvest', 'shortlist'], layersSource: 'default', terms: ['order'] });
      assert.equal(map.candidates[0]?.path, 'src/orders/order.ts');
      assert.ok(map.terms.pass2.includes('shipOrder') && !map.terms.pass2.includes('upgradeOrder'), JSON.stringify(map.terms));
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M18: in code split by layer, a term word naming files in three top folders lists them one folder at a time', () => {
    const files = ['issue', 'round', 'user'].flatMap((name) => [`src/routers/${name}s.py`, `src/adapters/${name}.py`, `src/domain/${name}_policy.py`, `tests/${name}s/test_get_${name}.py`]).concat('src/domain/__init__.py');
    const ordered = [{ path: 'src/routers/issues.py', score: 3, reasons: ['contains "resolved"'] }];
    const feature = featureOf(ordered, files, [], ['resolved_at', 'IssueFactory']);
    assert.deepEqual(feature, { root: '', name: 'issue', paths: ['src/adapters/issue.py', 'src/domain/issue_policy.py', 'tests/issues/test_get_issue.py'] });
    assert.match(leadsText({ terms: { pass1: ['resolved_at'], pass2: [] }, candidates: ordered, collisions: [], feature }), /^Same feature "issue": src\/adapters\/issue\.py, src\/domain\/issue_policy\.py, tests\/issues\/test_get_issue\.py$/m);
    const tests = ['a_list', 'b_close', 'set_admin'].map((name) => `tests/issues/test_issue_${name}.py`);
    const ranked = featureOf(ordered, [...files, ...tests, 'tests/rounds/test_round_issue.py'], [], ['resolved_at', 'IssueFactory'], ['issue', 'admins']);
    assert.equal(ranked?.paths[0], 'tests/issues/test_issue_set_admin.py', 'a file named by another request word first');
    assert.equal(ranked?.paths.at(-1), 'tests/rounds/test_round_issue.py', 'a file not about the word last');
    const byFeature = ['issue', 'round', 'user'].flatMap((name) => [`src/${name}/${name}.ts`, `src/${name}/${name}.spec.ts`]).concat('src/a/issue-x.ts', 'src/b/issue-y.ts', 'src/a/round-x.ts', 'src/b/user-y.ts');
    assert.equal(featureOf([{ path: 'src/issue/issue.ts', score: 3, reasons: ['contains "x"'] }], byFeature, [], ['issue']), null, 'code split by feature: no named line');
  });

  it('03b-M12: a prompt-mode lead carries the line of a declaration named like a term, else of the first line holding one', async () => {
    const fx = await repo({ 'src/cart/notes.ts': '// header\nconst x = 1;\nconsole.log("cart total");\n' });
    try {
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [], mode: 'prompt', layers: ['shortlist', 'harvest', 'shortlist'], layersSource: 'default', terms: ['cart'] });
      const text = leadsText(map);
      assert.match(text, /^\d+\. src\/cart\/cart\.service\.ts:1 — /m);
      assert.match(text, /^\d+\. src\/cart\/notes\.ts:3 — /m);
      const context = await buildMap({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [], mode: 'context', layers: ['shortlist'], layersSource: 'default', terms: ['cart'] });
      assert.ok(context.candidates.every((candidate) => candidate.line === undefined), 'context maps carry no lines');
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M13: catalogs at any depth, English first; a quoted string in any case and a spelled phrase in its own case give keys', async () => {
    const others = Object.fromEntries(['a', 'b', 'c', 'd', 'de'].map((name) => [`main/assets/i18n/${name}.json`, JSON.stringify({ x: { y: 'Andere Spalte' } })]));
    const fx = await repo({ ...others, 'main/assets/i18n/en.json': JSON.stringify({ table: { score: 'Score type', empty: 'No rows found' } }) });
    try {
      const files = await (await openRepository(fx.runtime)).git.listFiles(null);
      const options = { runtime: fx.runtime, root: fx.repo.root, project: project(fx), files };
      const terms = await rankTerms([{ title: '', content: 'Sort the Score type column of `CartService` and show "no rows found"' }], options);
      assert.ok(terms.includes('table.score') && terms.includes('table.empty'), terms.join(','));
      const lower = await rankTerms([{ title: '', content: 'Sort the score type column of `CartService`' }], options);
      assert.ok(!lower.includes('table.score'), lower.join(','));
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M14: a filtered template lifts its same-stem source', async () => {
    const fx = await repo({ 'src/ui/banner.component.html': '<p>{{ checkoutBannerText }}</p>\n', 'src/ui/banner.component.ts': 'export class BannerComponent {}\n' });
    try {
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [], mode: 'context', layers: ['shortlist'], layersSource: 'default', terms: ['checkoutBannerText'] });
      const banner = map.candidates.find((candidate) => candidate.path === 'src/ui/banner.component.ts');
      assert.ok(banner !== undefined && banner.reasons.some((reason) => reason.startsWith('its template contains')), JSON.stringify(map.candidates));
      assert.ok(map.candidates.every((candidate) => !candidate.path.endsWith('.html')));
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M15: a term spelled by three unrelated directories gives no path reason and no feature', async () => {
    const fx = await repo({ 'src/a/employee/one.ts': 'export const a = 1;\n', 'src/b/employee/two.ts': 'export const b = 1;\n', 'src/c/employee/three.ts': 'export const c = 1;\n', 'src/c/employee/three.spec.ts': 'test\n' });
    try {
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [], mode: 'prompt', layers: ['shortlist'], layersSource: 'default', terms: ['employee'] });
      const placed = map.candidates.filter((candidate) => candidate.path.includes('/employee/'));
      assert.equal(placed.length, 3);
      assert.ok(placed.every((candidate) => candidate.reasons.every((reason) => !isPathReason(reason)) && /one of 3 broad directories/.test(candidate.reasons[0]!)), JSON.stringify(placed));
      assert.equal(map.feature, null);
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M20: a route term that names no file is matched by its plain segments, not its version or parameter', async () => {
    const fx = await repo({ 'src/app.ts': 'route("orders/v1/{order_id}");\n', 'src/routers/orders.ts': 'export const r = 1;\n', 'src/v1/x.ts': 'export const v = 1;\n' });
    try {
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [], mode: 'prompt', layers: ['shortlist'], layersSource: 'default', terms: ['orders/v1/{order_id}'] });
      const router = map.candidates.find((candidate) => candidate.path === 'src/routers/orders.ts');
      assert.equal(router?.reasons[0], 'filename matched "orders", a segment of "orders/v1/{order_id}"');
      assert.ok(!map.candidates.some((candidate) => candidate.path === 'src/v1/x.ts'));
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M17: in a linked worktree the exclude lands in the shared git directory and the index is the worktree one', async () => {
    const fx = await repo();
    try {
      const linked = `${fx.repo.root}-linked`;
      execFileSync('git', ['-C', fx.repo.root, 'worktree', 'add', '-q', linked]);
      const { git } = await openRepository({ ...fx.runtime, cwd: linked });
      const common = await git.gitCommonDir();
      assert.equal(await realpathOf(common), await realpathOf(`${fx.repo.root}/.git`));
      assert.notEqual(await realpathOf(await git.gitDir()), await realpathOf(common));
      await excludeWorkingDirs(fx.runtime, linked);
      assert.match(await readFile(`${common}/info/exclude`, 'utf8'), /^\.ambicode\/task\/$/m);
      execFileSync('git', ['-C', fx.repo.root, 'worktree', 'remove', '--force', linked]);
    } finally {
      await fx.dispose();
    }
  });

  it('03b-M11: route start keeps AMBICODE working files out of the agent searches, once', async () => {
    const fx = await repo();
    try {
      await excludeWorkingDirs(fx.runtime, fx.repo.root);
      await excludeWorkingDirs(fx.runtime, fx.repo.root);
      const exclude = await readFile(`${fx.repo.root}/.git/info/exclude`, 'utf8');
      assert.equal(exclude.split('\n').filter((line) => line === '.ambicode/task/').length, 1);
      await fx.repo.write('.ambicode/task/t/ledger.jsonl', 'applyDiscount\n');
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), paths: [], symbols: [], mode: 'context', layers: ['grep'], layersSource: 'route', terms: ['applyDiscount'] });
      assert.ok(map.candidates.every((candidate) => !candidate.path.startsWith('.ambicode/')), map.candidates.map((c) => c.path).join(','));
    } finally {
      await fx.dispose();
    }
  });
});
