import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRuntime } from '#composition/root';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { Git } from '#platform/git/git';
import { buildSearchIndex, searchIndexFor, SEARCH_INDEX_FILE, type FolderRow } from './search-index.ts';

const FILES: Record<string, string> = {
  'src/locales/en.json': JSON.stringify({ orders: { refund: { title: 'Return shipment', confirm: 'Confirm return' } }, save: 'Save' }),
  'src/locales/fr.json': JSON.stringify({ orders: { refund: { title: 'Retour', confirm: 'Confirmer le retour', extra: 'Une longue phrase pour être le plus grand fichier' } } }),
  'src/orders/refund-panel/refund-panel.view.ts': "import { RefundPolicyRules } from '../policy/policy-rules';\nexport class RefundPanelView { title = 'orders.refund.title'; }\n",
  'src/orders/refund-panel/refund-panel.view.html': '<div>{{ "orders.refund.confirm" | t }}</div><x-amount-display></x-amount-display>\n',
  'src/orders/refund-panel/refund-panel.view.spec.ts': "export const onlyInTest = 'orders.refund.title';\n",
  'src/orders/policy/policy-rules.ts': 'export class RefundPolicyRules {}\nexport function applyRefundPolicy() {}\n',
  'src/shared/amount-display/amount-display.widget.ts': 'export class AmountDisplayWidget {}\n',
  'src/shared/amount-display/amount-display.stories.ts': 'export const story = 1;\n',
  'src/reports/summary.ts': 'import { AmountDisplayWidget } from "@app/shared";\nexport const summaryOfRefunds = new AmountDisplayWidget();\n',
  '.ambicode/context/tool.mjs': 'export const notTheRepository = 1;\n',
  'README.md': '# readme\n',
};

const rowsOf = async (files: Record<string, string> = FILES): Promise<Map<string, FolderRow>> => {
  const { rows } = await buildSearchIndex(Object.keys(files), async (file) => files[file] ?? null, { roots: [], maxModules: 50 });
  return new Map(rows.map((row) => [row.path, row]));
};

describe('search index (machine layer)', () => {
  it('has one row per source folder with stemmed path words, own file names and declared names; tests, stories and the tool directory are not rows', async () => {
    const rows = await rowsOf();
    assert.deepEqual([...rows.keys()], ['src/orders/policy', 'src/orders/refund-panel', 'src/reports', 'src/shared/amount-display']);
    const panel = rows.get('src/orders/refund-panel')!;
    assert.deepEqual(panel.words, ['src', 'order', 'refund', 'panel']);
    assert.deepEqual(panel.files, ['refund-panel.view.ts']);
    assert.deepEqual(panel.names, ['RefundPanelView']);
    assert.equal(panel.depth, 3);
    assert.deepEqual(rows.get('src/shared/amount-display')!.files, ['amount-display.widget.ts']);
  });

  it('gives a folder the default-language label of each dotted catalog key its source or markup quotes, not a key only its tests quote', async () => {
    const rows = await rowsOf();
    const panel = rows.get('src/orders/refund-panel')!;
    assert.deepEqual(panel.keys.sort(), ['orders.refund.confirm', 'orders.refund.title']);
    assert.deepEqual(panel.labels.sort(), ['Confirm return', 'Return shipment'], 'en.json, though fr.json is the larger file');
    assert.deepEqual(rows.get('src/orders/policy')!.labels, []);
    const withoutEnglish = await rowsOf(Object.fromEntries(Object.entries(FILES).filter(([file]) => file !== 'src/locales/en.json')));
    assert.ok(withoutEnglish.get('src/orders/refund-panel')!.labels.includes('Retour'), 'without an en* catalog the largest one is the default');
  });

  it('links folders by relative imports, by a name one folder owns and by a custom element tag ending with a base name; usedBy is the inverse', async () => {
    const rows = await rowsOf();
    assert.deepEqual(rows.get('src/orders/refund-panel')!.uses.sort(), ['src/orders/policy', 'src/shared/amount-display']);
    assert.deepEqual(rows.get('src/reports')!.uses, ['src/shared/amount-display'], 'AmountDisplayWidget is declared in one folder only');
    assert.deepEqual(rows.get('src/shared/amount-display')!.usedBy.sort(), ['src/orders/refund-panel', 'src/reports']);
    assert.deepEqual(rows.get('src/orders/policy')!.usedBy, ['src/orders/refund-panel']);
  });
});

describe('search index freshness', () => {
  const setUp = async (withTool: boolean) => {
    const repo = await TempRepo.create();
    for (const [file, text] of Object.entries(FILES)) if (!file.startsWith('.ambicode/')) await repo.write(file, text);
    if (withTool) await repo.write('.ambicode/config.yaml', 'version: 4\n');
    await repo.commitAll('base');
    const runtime = await createRuntime({ cwd: repo.root });
    const deps = { fs: runtime.fs, clock: runtime.clock, git: new Git({ runner: runtime.runner, repositoryRoot: repo.root }), root: repo.root };
    return { repo, runtime, deps };
  };
  const options = { roots: [], maxModules: 50 };
  const meta = async (runtime: { fs: { readText(file: string): Promise<string> } }, root: string) => JSON.parse((await runtime.fs.readText(path.join(root, SEARCH_INDEX_FILE))).split('\n')[0]!) as { head: string; buildMs: number; folders: number };

  it('builds an absent index when the repository has an AMBICODE directory and says so; without one it only says the index is absent', async () => {
    const { repo, runtime, deps } = await setUp(true);
    try {
      const found = await searchIndexFor(deps, options);
      assert.match(found.limitation ?? '', /^search index built now, \d+ ms$/);
      assert.equal(found.rows?.length, 4);
      assert.equal((await meta(runtime, repo.root)).folders, 4);
      assert.deepEqual(await searchIndexFor(deps, options), { rows: found.rows, limitation: null }, 'the second call reads the file it wrote');
    } finally {
      await repo.dispose();
    }
    const bare = await setUp(false);
    try {
      assert.deepEqual(await searchIndexFor(bare.deps, options), { rows: null, limitation: 'search index absent: run context index' });
      assert.equal(await bare.runtime.fs.exists(path.join(bare.repo.root, SEARCH_INDEX_FILE)), false);
    } finally {
      await bare.repo.dispose();
    }
  });

  it('rebuilds an index made at another HEAD when its build was quick, and keeps a slow one with a limitation naming both shas', async () => {
    const { repo, runtime, deps } = await setUp(true);
    try {
      await searchIndexFor(deps, options);
      const head = (await meta(runtime, repo.root)).head;
      const file = path.join(repo.root, SEARCH_INDEX_FILE);
      const rows = (await runtime.fs.readText(file)).split('\n').slice(1).join('\n');
      const stale = (buildMs: number) => runtime.fs.writeText(file, `${JSON.stringify({ kind: 'meta', head: 'abc123', roots: [], folders: 4, files: 5, builtAt: '', buildMs, version: 1 })}\n${rows}`);
      await stale(6000);
      assert.equal((await searchIndexFor(deps, options)).limitation, `search index built at abc123, HEAD is ${head}`);
      await stale(10);
      assert.equal((await searchIndexFor(deps, options)).limitation, null);
      assert.equal((await meta(runtime, repo.root)).head, head, 'rebuilt at HEAD');
    } finally {
      await repo.dispose();
    }
  });
});
