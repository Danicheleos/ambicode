import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs } from '../cli/args.ts';
import { RELATES_OPTIONS, runRelates } from '../cli/commands/search.ts';
import { openWorkspace } from '../composition/root.ts';
import { routeFixture, type RouteFixture } from '../testing/route-fixture.ts';
import { fakeIndex } from '../testing/fake-index.ts';
import { indexDepsOf } from './index/codeindex.ts';
import { relates, renderRelates, type RelatesResult } from './relates.ts';
import { SEARCH_LIMIT_BYTES } from './refs.ts';

const PROFILE = { stamp: { commit: '', files: 0 }, sources: ['ts'], companions: [], catalogs: [], featureKinds: [], exportOnly: true };
const project = (root = '.') => ({ id: 'app', root, ecosystem: 'typescript' as const, commands: {}, profile: PROFILE }) as never;

async function repo(files: Record<string, string>): Promise<RouteFixture> {
  const fx = await routeFixture({ routes: {} });
  const base = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`src/other/unrelated-${index}.ts`, `export const value${index} = ${index};\n`]));
  for (const [file, content] of Object.entries({ ...base, ...files })) await fx.repo.write(file, content);
  await fx.repo.commitAll('files');
  return fx;
}
const depsOf = async (fx: RouteFixture) => {
  const workspace = await openWorkspace(fx.runtime);
  return indexDepsOf(fx.runtime, workspace.git, workspace.repositoryRoot, workspace.config);
};
const FILES = {
  'src/cart/discount.ts': 'export function applyDiscount() {} // discount rules\n',
  'src/billing/invoice.ts': 'import { applyDiscount } from "../cart/discount";\n',
};
const bad = (error: Error & { code?: string; field?: string }) => error.code === 'bad-argument' && error.field === 'path';

describe('05-R relates', () => {
  it('05-R2: an index answer gives imports and importers with via index', async () => {
    const fx = await repo(FILES);
    try {
      const index = fakeIndex({ relates: { imports: ['src/cart/money.ts'], importers: ['src/billing/invoice.ts'] } });
      const result = await relates(await depsOf(fx), project(), 'src/cart/discount.ts', { index });
      assert.deepEqual([result.via, result.imports, result.importers, result.index.state, result.limitations], ['index', ['src/cart/money.ts'], ['src/billing/invoice.ts'], 'fresh', []]);
    } finally {
      await fx.dispose();
    }
  });

  it('05-R2: without an index the basename is grepped, the file itself is left out, imports are null', async () => {
    const fx = await repo(FILES);
    try {
      const result = await relates(await depsOf(fx), project(), 'src/cart/discount.ts');
      assert.deepEqual([result.via, result.imports, result.importers, result.index.state], ['grep-basename', null, ['src/billing/invoice.ts'], 'none']);
      assert.ok(result.limitations.includes('imports need an index'));
      const failing = await relates(await depsOf(fx), project(), 'src/cart/discount.ts', { index: fakeIndex({ state: 'building' }) });
      assert.deepEqual([failing.via, failing.index.state], ['grep-basename', 'building']);
    } finally {
      await fx.dispose();
    }
  });

  it('05-R1: a missing file, a directory, a path outside the repository or the project is bad-argument on path; a path relative to the working directory works', async () => {
    const fx = await repo(FILES);
    try {
      const deps = await depsOf(fx);
      for (const value of ['src/cart/missing.ts', 'src/cart', '../outside.ts', '']) await assert.rejects(relates(deps, project(), value), bad, value);
      await assert.rejects(relates(deps, project('src/cart'), 'src/billing/invoice.ts'), bad);
      const inside = await relates({ ...deps, runtime: { ...deps.runtime, cwd: `${fx.repo.root}/src/cart` } }, project(), 'discount.ts');
      assert.equal(inside.path, 'src/cart/discount.ts');
    } finally {
      await fx.dispose();
    }
  });

  it('05-R3: text is cut to 4,096 bytes with the rest behind --show; the full text keeps every importer', () => {
    const importers = Array.from({ length: 300 }, (_, index) => `src/features/area-${index}/consumer-${index}.ts`);
    const result: RelatesResult = { path: 'src/a.ts', via: 'index', imports: [], importers, index: { tool: 'codeindex', state: 'fresh', fresh: true, builtMs: 1, reason: null, drift: 0 }, limitations: [] };
    const rendered = renderRelates(result);
    assert.ok(rendered.truncated && Buffer.byteLength(rendered.text) <= SEARCH_LIMIT_BYTES);
    assert.match(rendered.text, /\d+ more lines: relates src\/a\.ts --show$/);
    assert.ok(rendered.full.includes(importers.at(-1)!));
  });

  it('05-R3: runRelates records a search entry, --show writes the full result, --json data is the RelatesResult', async () => {
    const fx = await repo(FILES);
    try {
      const output = await runRelates(fx.runtime, parseArgs('relates', ['src/cart/discount.ts', '--task', 'T1', '--show'], RELATES_OPTIONS));
      assert.ok(output.file !== undefined && (await readFile(output.file, 'utf8')).includes('src/billing/invoice.ts'));
      assert.deepEqual(Object.keys(output.data as object).sort(), ['importers', 'imports', 'index', 'limitations', 'path', 'via']);
      const entry = (await fx.kinds('T1', 'search'))[0]!;
      assert.deepEqual([entry['command'], entry['names'], entry['hits'], entry['bytes']], ['relates', ['src/cart/discount.ts'], 1, output.bytes]);
    } finally {
      await fx.dispose();
    }
  });

  it('05-R3: --show keeps the console within 4,096 bytes and writes the full result to the step file', async () => {
    const users = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`src/features/long-feature-folder-name-${index}/discount-consumer-implementation-${index}.ts`, 'import { applyDiscount } from "../../cart/discount";\n']));
    const fx = await repo({ ...FILES, ...users, ...Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`src/more/unrelated-${index}.ts`, `export const more${index} = ${index};\n`])) });
    try {
      const output = await runRelates(fx.runtime, parseArgs('relates', ['src/cart/discount.ts', '--task', 'T1', '--show'], RELATES_OPTIONS));
      assert.ok(output.bytes <= SEARCH_LIMIT_BYTES, String(output.bytes));
      assert.ok((await readFile(output.file!, 'utf8')).length > SEARCH_LIMIT_BYTES);
    } finally {
      await fx.dispose();
    }
  });

  it('05-L1: a basename matching more than 60% of the files is dropped and listed; limitations are always present', async () => {
    const files: Record<string, string> = { 'src/common.ts': 'export const x = 1;\n', ...Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`src/use/u${index}.ts`, 'import common\n'])) };
    const fx = await routeFixture({ routes: {} });
    try {
      for (const [file, content] of Object.entries(files)) await fx.repo.write(file, content);
      await fx.repo.commitAll('files');
      const result = await relates(await depsOf(fx), project(), 'src/common.ts');
      assert.deepEqual(result.importers, []);
      assert.match(result.limitations[0]!, /^"common" matched 8 of \d+ files; ignored$/);
      const indexed = await relates(await depsOf(fx), project(), 'src/common.ts', { index: fakeIndex({ relates: { imports: null, importers: ['src/use/u0.ts'] } }) });
      assert.deepEqual([indexed.via, indexed.importers], ['index', []]);
      assert.match(indexed.limitations[0]!, /^"common" matched 8 of \d+ files; ignored$/);
    } finally {
      await fx.dispose();
    }
  });

  it('05-L2: the text always has an index line', async () => {
    const fx = await repo(FILES);
    try {
      const none = await relates(await depsOf(fx), project(), 'src/cart/discount.ts');
      assert.match(renderRelates(none).text, /^index: none$/m);
    } finally {
      await fx.dispose();
    }
  });
});
