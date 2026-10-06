import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { parseArgs } from '#cli/args';
import { runFind, runMap, runRefs, MAP_OPTIONS, REFS_OPTIONS, FIND_OPTIONS } from '#cli/commands/search/search';
import { openRepository } from '#composition/root';
import { routeFixture, type RouteFixture } from '#testing/fixtures/route-fixture';
import { countDeclarations, declarationCensus, harvest } from './declarations/harvest.ts';
import { fakeIndex } from '#testing/fakes/fake-index';
import { buildMap, cleanRequestText, featureOf, sequenceFiles, FEATURE_LIMIT_BYTES, leadsText, LEADS_LIMIT_BYTES, MAP_LIMIT_BYTES, rankTerms, resolveLayers } from './text/map.ts';
import { excludeWorkingDirs } from '#modules/evidence/task/task-dir';
import { find, refs, renderFind, SEARCH_LIMIT_BYTES } from './declarations/refs.ts';
import { SearchConfig } from '#types/modules/config';
import { isPathReason, shortlistRules } from './text/locate.ts';
import { TEST_EXCLUDES } from '#types/defaults';
import { sourceGlob } from './declarations/profile.ts';
import { execFileSync } from 'node:child_process';
import { GENERIC_PROFILE, SCORE_FILENAME } from '#types/modules/search';

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
const realpathOf = (file: string): Promise<string> => realpath(file);
// The facts a TS/Angular repository's profile measures; search reads them only through the profile (03c-S1).
const TS_PROFILE = {
  stamp: { commit: '', files: 0 },
  sources: ['ts', 'tsx', 'js'],
  companions: [['html', 'ts'], ['scss', 'ts']] as [string, string][],
  catalogs: ['**/assets/i18n/*.json', '**/i18n/*.json', '**/locales/**/*.json'],
  featureKinds: ['mocks', 'mock', 'types', 'type', 'constants', 'fixtures'],
  exportOnly: true,
};
const project = (fx: RouteFixture, profile: object | null = TS_PROFILE) => ({ id: 'app', root: '.', ecosystem: 'typescript' as const, commands: {}, ...(profile === null ? {} : { profile }) }) as never;

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
      const found = await harvest(fx.runtime.fs, fx.repo.root, ['src/cart/cart.service.ts', 'src/cart/discount.ts', 'src/billing/invoice.ts', 'src/cart/many.ts'], true);
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
      assert.ok(map.limitations.includes('index.find skipped — index: none') && map.limitations.includes('index.relates skipped — index: none'));
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
      assert.match(result.text, /applyDiscount: \d+ hits in 3 files; declarations: 2; collides: declared in src\/cart\/cart\.service\.ts, src\/cart\/discount\.ts/);
    } finally {
      await fx.dispose();
    }
  });

  it('find lists declarations, filters by kind, and says when there is none', async () => {
    const fx = await repo();
    try {
      assert.equal((await find(fx.runtime, 'applyDiscount', { project: project(fx), kind: null })).declarations.length, 2);
      assert.equal((await find(fx.runtime, 'CartService', { project: project(fx), kind: 'function' })).declarations.length, 0);
      assert.equal((await find(fx.runtime, 'CartService', { project: project(fx), kind: 'class' })).declarations.length, 1);
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
    const feature = featureOf(ordered, files, TS_PROFILE.featureKinds);
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

  it('03c-S2…S7: catalogs, companions, the export rule and the shortlist come from the profile; without one, generic behaviour', async () => {
    const fx = await repo({ 'main/assets/i18n/en.json': JSON.stringify({ table: { score: 'Score type' } }), 'src/ui/banner.component.html': '<p>{{ checkoutBannerText }}</p>\n', 'src/ui/banner.component.ts': 'export class BannerComponent {}\n' });
    try {
      const files = await (await openRepository(fx.runtime)).git.listFiles(null);
      const bare = project(fx, null);
      const terms = await rankTerms([{ title: '', content: 'Sort the Score type column of `CartService`' }], { runtime: fx.runtime, root: fx.repo.root, project: bare, files });
      assert.ok(!terms.includes('table.score'), `03c-S2/S7: no catalogs without a profile: ${terms.join(',')}`);
      const map = await buildMap({ runtime: fx.runtime, project: bare, paths: [], symbols: [], mode: 'context', layers: ['shortlist'], layersSource: 'default', terms: ['checkoutBannerText'] });
      assert.ok(!map.candidates.some((candidate) => candidate.reasons.some((reason) => reason.startsWith('its template'))), '03c-S3/S7: no companions without a profile');
      const all = await harvest(fx.runtime.fs, fx.repo.root, ['src/billing/invoice.ts'], false);
      assert.ok(all.some((declaration) => declaration.name === 'hidden'), '03c-S5: exportOnly false keeps unexported declarations');
      assert.deepEqual(shortlistRules({ ...(project(fx, { ...GENERIC_PROFILE, stamp: { commit: '', files: 0 }, sources: ['py'] }) as object) } as never), { include: ['**/*.py'], exclude: [...TEST_EXCLUDES] }, '03c-S6');
      assert.deepEqual(shortlistRules(bare).include, [sourceGlob(GENERIC_PROFILE.sources)], '03c-S6/S7');
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

const PROMPT_LAYERS = ['shortlist', 'harvest', 'shortlist'];
const mapWith = (fx: RouteFixture, layers: string[], index: ReturnType<typeof fakeIndex>, extra: { mode?: 'prompt' | 'context'; paths?: string[]; terms?: string[] } = {}) =>
  buildMap({ runtime: fx.runtime, project: project(fx), mode: extra.mode ?? 'prompt', layers, layersSource: 'config', terms: extra.terms ?? ['cart'], paths: extra.paths ?? [], symbols: [], index });
const rule = (text: string, pattern: RegExp): void => assert.match(text, pattern);

describe('05-M index layers in map', () => {
  it('05-M1: index layers run only when listed', async () => {
    const fx = await repo();
    try {
      const index = fakeIndex({ byName: { CartService: ['src/other/unrelated-1.ts'] } });
      const map = await mapWith(fx, PROMPT_LAYERS, index);
      assert.deepEqual(index.calls, []);
      assert.ok(!map.layers.some((layer) => layer.name.startsWith('index')) && !map.limitations.some((line) => line.startsWith('index')));
    } finally {
      await fx.dispose();
    }
  });

  it('05-M2: index.find adds a reason and one SCORE_FILENAME per distinct name; a new path enters; sorted; hits are distinct paths', async () => {
    const fx = await repo();
    try {
      const before = await mapWith(fx, PROMPT_LAYERS, fakeIndex());
      const index = fakeIndex({ byName: { CartService: ['src/other/unrelated-1.ts', 'src/cart/discount.ts'], applyDiscount: ['src/other/unrelated-1.ts'] } });
      const map = await mapWith(fx, [...PROMPT_LAYERS, 'index.find'], index);
      assert.ok(index.calls.includes('find CartService') && index.calls.includes('find applyDiscount'), index.calls.join(','));
      const added = map.candidates.find((candidate) => candidate.path === 'src/other/unrelated-1.ts')!;
      assert.equal(added.score, 2 * SCORE_FILENAME);
      assert.deepEqual([...added.reasons].sort(), ['index.find CartService', 'index.find applyDiscount']);
      const discount = map.candidates.find((candidate) => candidate.path === 'src/cart/discount.ts')!;
      assert.equal(discount.score, before.candidates.find((candidate) => candidate.path === 'src/cart/discount.ts')!.score + SCORE_FILENAME);
      assert.deepEqual(map.layers.at(-1)!.name, 'index.find');
      assert.equal(map.layers.at(-1)!.hits, 2);
      for (let i = 1; i < map.candidates.length; i++) {
        const [a, b] = [map.candidates[i - 1]!, map.candidates[i]!];
        assert.ok(a.score > b.score || (a.score === b.score && a.path < b.path), `${a.path} before ${b.path}`);
      }
    } finally {
      await fx.dispose();
    }
  });

  it('05-M2: index.relates queries each known path and scores its importers', async () => {
    const fx = await repo();
    try {
      const index = fakeIndex({ byPath: { 'src/cart/cart.service.ts': ['src/billing/invoice.ts', 'src/other/unrelated-2.ts'] } });
      const map = await mapWith(fx, ['grep', 'index.relates'], index, { mode: 'context', terms: [], paths: ['src/cart/cart.service.ts'] });
      assert.deepEqual(index.calls, ['relates src/cart/cart.service.ts']);
      const added = map.candidates.find((candidate) => candidate.path === 'src/other/unrelated-2.ts')!;
      assert.deepEqual([added.score, added.reasons], [SCORE_FILENAME, ['index.relates src/cart/cart.service.ts']]);
      assert.equal(map.layers.at(-1)!.hits, 2);
    } finally {
      await fx.dispose();
    }
  });

  it('05-M2: a candidate that already has two reasons keeps its index reason', async () => {
    const fx = await repo();
    try {
      const index = fakeIndex({ byPath: { 'src/cart/discount.ts': ['src/billing/invoice.ts'] } });
      const map = await mapWith(fx, ['grep', 'index.relates'], index, { mode: 'context', terms: ['applyDiscount'], paths: ['src/cart/discount.ts', 'src/billing/invoice.ts'] });
      const invoice = map.candidates.find((candidate) => candidate.path === 'src/billing/invoice.ts')!;
      assert.deepEqual(invoice.reasons, ['named by the caller', 'contains the word "applyDiscount"', 'index.relates src/cart/discount.ts']);
      assert.match(map.text, /index\.relates src\/cart\/discount\.ts/);
    } finally {
      await fx.dispose();
    }
  });

  it('05-M3: a listed layer whose adapter does not answer is skipped with the state in the limitation', async () => {
    const fx = await repo();
    try {
      for (const [state, line] of [['building', 'index: building'], ['absent', 'index: absent'], ['error', 'index: error (boom)']] as const) {
        const index = fakeIndex({ state });
        const map = await mapWith(fx, [...PROMPT_LAYERS, 'index.find', 'index.relates'], index);
        assert.ok(map.limitations.includes(`index.find skipped — ${line}`) && map.limitations.includes(`index.relates skipped — ${line}`), map.limitations.join('|'));
        assert.ok(!map.layers.some((layer) => layer.name.startsWith('index')));
        assert.deepEqual(index.calls, []);
      }
    } finally {
      await fx.dispose();
    }
  });

  it('05-M4: the text has the index line and the ledger index field follows the tool', async () => {
    const fx = await repo();
    try {
      const none = await buildMap({ runtime: fx.runtime, project: project(fx), mode: 'prompt', layers: PROMPT_LAYERS, layersSource: 'config', terms: ['cart'], paths: [], symbols: [] });
      assert.match(none.text.split('\n')[0]!, /; index: none$/);
      assert.equal(none.entry['index'], 'none');
      const fresh = await mapWith(fx, PROMPT_LAYERS, fakeIndex());
      assert.match(fresh.text.split('\n')[0]!, /; index: codeindex fresh \(built in 120 ms\)$/);
      assert.deepEqual(fresh.entry['index'], { tool: 'codeindex', state: 'fresh', fresh: true, builtMs: 120 });
      const stale = await mapWith(fx, PROMPT_LAYERS, fakeIndex({ state: 'stale' }));
      assert.deepEqual(stale.entry['index'], { tool: 'codeindex', state: 'stale', fresh: false, builtMs: 120 });
    } finally {
      await fx.dispose();
    }
  });
});

describe('05-C collision census', () => {
  it('05-C1: every match of every line counts, one file counts once, exportOnly filters, no patterns is null', () => {
    const texts = new Map([
      ['a.ts', 'export function foo(a: string): void;\nexport function foo(a: number): void;\nexport function foo() {}\n'],
      ['b.ts', 'export function foo() {}\nfunction hidden() {}\n'],
      ['c.ts', 'export function beta() {} export function gamma() {}\n'],
    ]);
    const names = ['foo', 'beta', 'gamma', 'hidden', 'absent'];
    const census = (options: { exportOnly: boolean; patterns?: RegExp[] }) => Object.fromEntries([...countDeclarations(texts, names, options)].map(([name, row]) => [name, [row.declarations, row.files]]));
    assert.deepEqual(census({ exportOnly: true }), { foo: [2, ['a.ts', 'b.ts']], beta: [1, ['c.ts']], gamma: [1, ['c.ts']], hidden: [0, []], absent: [0, []] });
    assert.deepEqual(census({ exportOnly: false })['hidden'], [1, ['b.ts']]);
    assert.deepEqual(census({ exportOnly: true, patterns: [] })['foo'], [null, []]);
  });

  it('05-C3/05-C1: a name declared in two files collides though the map harvest saw one; overloads in one file do not', async () => {
    const fx = await repo({
      'src/zeta/alphafile.ts': 'export function sharedName() {}\n',
      'src/zeta/deep/other.ts': 'export function sharedName() {}\n',
      'src/ov/over.ts': 'export function overloaded(a: string): void;\nexport function overloaded(a: number): void;\nexport function overloaded(a: any) {}\n',
    });
    try {
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), mode: 'prompt', layers: PROMPT_LAYERS, layersSource: 'config', terms: ['alphafile'], paths: [], symbols: [] });
      assert.ok(!map.collisions.includes('sharedName'), 'the harvest saw one file');
      const result = await refs(fx.runtime, ['sharedName', 'overloaded'], { project: project(fx), show: false });
      assert.deepEqual(result.names.map((row) => [row.name, row.declarations, row.collides]), [['sharedName', 2, true], ['overloaded', 1, false]]);
      rule(result.text, /sharedName: \d+ hits in 2 files; declarations: 2; collides: declared in src\/zeta\/alphafile\.ts, src\/zeta\/deep\/other\.ts/);
      assert.doesNotMatch(result.text, /^index:/m);
    } finally {
      await fx.dispose();
    }
  });

  it('05-C2: a file over 262,144 bytes is not read, and one limitation counts it', async () => {
    const fx = await repo({ 'src/big/huge.ts': `export function bigName() {}\n// ${'x'.repeat(270_000)}\n`, 'src/big/small.ts': 'export function bigName() {}\n' });
    try {
      const { git } = await openRepository(fx.runtime);
      const { census, limitations } = await declarationCensus(git, fx.runtime.fs, project(fx), ['bigName']);
      assert.deepEqual(census.get('bigName'), { declarations: 1, files: ['src/big/small.ts'] });
      assert.deepEqual(limitations, ['1 file(s) over 262144 bytes not read for declarations']);
    } finally {
      await fx.dispose();
    }
  });

  it('05-C4: no declaration patterns gives null, the limitation, and the grep result', async () => {
    const fx = await repo();
    try {
      const noSources = project(fx, { ...TS_PROFILE, sources: [] });
      const result = await refs(fx.runtime, ['applyDiscount'], { project: noSources, show: false });
      assert.deepEqual([result.names[0]!.declarations, result.names[0]!.collides], [null, null]);
      assert.ok(result.limitations.some((line) => line.startsWith('no declaration patterns')), result.limitations.join('|'));
      assert.ok(result.hits > 0 && result.text.includes('src/billing/invoice.ts:'));
      const { git } = await openRepository(fx.runtime);
      const census = await declarationCensus(git, fx.runtime.fs, noSources, ['applyDiscount']);
      assert.equal(census.census.get('applyDiscount')!.declarations, null);
    } finally {
      await fx.dispose();
    }
  });
});

describe('05-F find through the adapter', () => {
  it('05-F1: an index answer is printed via index; a failed one falls back to harvest and prints the index line', async () => {
    const fx = await repo();
    try {
      const answering = fakeIndex({ byName: { applyDiscount: ['src/cart/discount.ts', 'src/billing/invoice.ts'] } });
      const viaIndex = await find(fx.runtime, 'applyDiscount', { project: project(fx), kind: null, index: answering });
      assert.deepEqual([viaIndex.via, viaIndex.declarations.map((row) => row.path), viaIndex.collides], ['index', ['src/cart/discount.ts', 'src/billing/invoice.ts'], true]);
      const indexed = renderFind(viaIndex).text;
      rule(indexed, /^via: index \(codeindex fresh\)$/m);
      for (const state of ['error', 'building'] as const) {
        const fallback = await find(fx.runtime, 'applyDiscount', { project: project(fx), kind: null, index: fakeIndex({ state }) });
        assert.equal(fallback.via, 'harvest');
        assert.equal(fallback.declarations.length, 2);
        const text = renderFind(fallback).text;
        rule(text, /^via: harvest$/m);
        rule(text, state === 'error' ? /^index: error \(boom\)$/m : /^index: building$/m);
      }
    } finally {
      await fx.dispose();
    }
  });

  it('05-F2/05-L2: with the none adapter find prints via harvest and index: none', async () => {
    const fx = await repo();
    try {
      const result = await find(fx.runtime, 'CartService', { project: project(fx), kind: 'class' });
      const text = renderFind(result).text;
      assert.deepEqual([result.via, result.declarations.length], ['harvest', 1]);
      rule(text, /^index: none$/m);
      assert.ok(Buffer.byteLength(text) <= SEARCH_LIMIT_BYTES);
    } finally {
      await fx.dispose();
    }
  });
});

describe('05-L breadth and limitations', () => {
  it('05-L1: refs and find drop a name matching more than 60% of the files and list it; every result has limitations', async () => {
    const fx = await routeFixture({ routes: {} });
    try {
      for (let index = 0; index < 8; index++) await fx.repo.write(`src/w${index}.ts`, 'export const common = UniversalService;\n');
      await fx.repo.write('src/solo.ts', 'export const soloName = 1;\n');
      await fx.repo.commitAll('files');
      const listed = /^"common" matched 8 of \d+ files; ignored$/;
      const result = await refs(fx.runtime, ['common', 'soloName'], { project: project(fx), show: false });
      assert.deepEqual(result.names.map((row) => row.name), ['soloName']);
      assert.ok(result.limitations.some((line) => listed.test(line)));
      rule(result.text, /limitations:\n {2}"common" matched 8 of \d+ files; ignored$/);
      const found = await find(fx.runtime, 'common', { project: project(fx), kind: null });
      assert.deepEqual(found.declarations, []);
      assert.ok(found.limitations.some((line) => listed.test(line)));
      const clean = await find(fx.runtime, 'soloName', { project: project(fx), kind: null });
      assert.ok(Array.isArray(clean.limitations) && clean.limitations.length === 0);
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), mode: 'prompt', layers: PROMPT_LAYERS, layersSource: 'config', terms: ['soloName'], paths: [], symbols: [] });
      assert.ok(Array.isArray(map.limitations));
      const context = await buildMap({ runtime: fx.runtime, project: project(fx), mode: 'context', layers: ['grep'], layersSource: 'config', terms: ['UniversalService', 'soloName'], paths: [], symbols: [] });
      assert.deepEqual(context.candidates.map((candidate) => candidate.path), ['src/solo.ts']);
      assert.ok(context.limitations.some((line) => /^"UniversalService" matched 8 of \d+ files; ignored$/.test(line)));
      const json = await runRefs(fx.runtime, parseArgs('refs', ['common', '--json'], REFS_OPTIONS));
      assert.ok((json.data as { limitations: string[] }).limitations.some((line) => listed.test(line)));
      const plain = await runRefs(fx.runtime, parseArgs('refs', ['soloName', '--json'], REFS_OPTIONS));
      assert.deepEqual((plain.data as { limitations: string[] }).limitations, []);
    } finally {
      await fx.dispose();
    }
  });

  it('05-L2: map prints the index line with the none adapter', async () => {
    const fx = await repo();
    try {
      const map = await buildMap({ runtime: fx.runtime, project: project(fx), mode: 'context', layers: ['grep'], layersSource: 'config', terms: ['applyDiscount'], paths: [], symbols: [] });
      assert.match(map.text.split('\n')[0]!, /index: none$/);
    } finally {
      await fx.dispose();
    }
  });
});
