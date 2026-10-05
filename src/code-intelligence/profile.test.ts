import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeFixture, type RouteFixture } from '../testing/route-fixture.ts';
import { openRepository } from '../composition/root.ts';
import { buildProfile, readCatalog } from './profile.ts';

async function repo(files: Record<string, string>): Promise<RouteFixture> {
  const fx = await routeFixture({ routes: {} });
  for (const [file, content] of Object.entries(files)) await fx.repo.write(file, content);
  await fx.repo.commitAll('files');
  return fx;
}
const many = (count: number, make: (index: number) => [string, string]): Record<string, string> => Object.fromEntries(Array.from({ length: count }, (_, index) => make(index)));
const spaced = (count: number): string => JSON.stringify(Object.fromEntries(Array.from({ length: count }, (_, index) => [`key${index}`, `Save item ${index}`])));

describe('03c profile', () => {
  it('03c-P2/03c-P6/03c-P7: sources are extensions that declare; export lines decide exportOnly; the stamp is HEAD and the file count', async () => {
    const fx = await repo({ ...many(6, (i) => [`src/a/m${i}.ts`, `export function f${i}() {}\nexport class C${i} {\n  run() {}\n}\n`]), ...many(6, (i) => [`notes/n${i}.txt`, 'plain words only\n']) });
    try {
      const profile = await buildProfile(fx.runtime, { root: '.' });
      assert.deepEqual(profile.sources, ['ts']);
      assert.equal(profile.exportOnly, true, 'indented members do not count');
      const { git } = await openRepository(fx.runtime);
      assert.equal(profile.stamp.commit, await git.revParse('HEAD'));
      assert.equal(profile.stamp.files, (await git.listFiles(null)).length);
    } finally {
      await fx.dispose();
    }
  });

  it('03c-P6: top-level declarations without export leave exportOnly false', async () => {
    const fx = await repo(many(6, (i) => [`pkg/m${i}.py`, `def f${i}():\n    pass\n\nclass C${i}:\n    def run(self):\n        pass\n`]));
    try {
      const profile = await buildProfile(fx.runtime, { root: '.' });
      assert.deepEqual(profile.sources, ['py']);
      assert.equal(profile.exportOnly, false);
    } finally {
      await fx.dispose();
    }
  });

  it('03c-P3: a non-source extension mostly paired with a same-name source file is a companion; a rarely paired one is not', async () => {
    const paired = many(20, (i) => [`src/c${i}/x${i}.component.ts`, `export class X${i} {}\n`]);
    const markup = many(20, (i) => [`src/c${i}/x${i}.component.html`, '<p></p>\n']);
    const loose = many(25, (i) => [`src/c${i}/y${i}.scss`, 'a {}\n']);
    const fx = await repo({ ...paired, ...markup, ...loose, ...many(5, (i) => [`src/c${i}/y${i}.ts`, 'export const y = 1;\n']) });
    try {
      assert.deepEqual((await buildProfile(fx.runtime, { root: '.' })).companions, [['html', 'ts']]);
    } finally {
      await fx.dispose();
    }
  });

  it('03c-P4: a key → phrase file is a catalog and speaks for its folder; a data file is not', async () => {
    const fx = await repo({
      ...many(5, (i) => [`src/m${i}.ts`, 'export const a = 1;\n']),
      'src/i18n/en.json': spaced(20),
      'src/i18n/ja.json': JSON.stringify(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, `保存${i}`]))),
      'src/data/codes.json': JSON.stringify(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, `CODE_${i}`]))),
      'src/strings.properties': Array.from({ length: 20 }, (_, i) => `title.${i} = Open the file ${i}`).join('\n'),
    });
    try {
      assert.deepEqual((await buildProfile(fx.runtime, { root: '.' })).catalogs, ['src/i18n/*.json', 'src/strings.properties']);
      assert.deepEqual(readCatalog('msgid "a.b"\nmsgstr "Open it"\n', 'po'), { 'a.b': 'Open it' });
    } finally {
      await fx.dispose();
    }
  });

  it('03c-P5: a kind that changes with its same-name sibling in recent history is a feature kind; a short history gives the data-only names present', async () => {
    const files = { ...many(12, (i) => [`src/f${i % 4}/x${i}.service.ts`, `export class S${i} {}\n`]), ...many(12, (i) => [`src/f${i % 4}/x${i}.mocks.ts`, `export const m${i} = 1;\n`]), ...many(12, (i) => [`src/g${i % 3}/z${i}.helper.ts`, `export const h${i} = 1;\n`]) };
    const fx = await repo(files);
    try {
      assert.deepEqual((await buildProfile(fx.runtime, { root: '.' })).featureKinds, ['mocks'], 'a short history falls back to the data-only names present');
      for (let round = 0; round < 50; round += 1) {
        const i = round % 12;
        await fx.repo.write(`src/f${i % 4}/x${i}.service.ts`, `export class S${i} { v = ${round}; }\n`);
        await fx.repo.write(`src/f${i % 4}/x${i}.mocks.ts`, `export const m${i} = ${round};\n`);
        await fx.repo.write(`src/g${round % 3}/z${round % 12}.helper.ts`, `export const h = ${round};\n`);
        await fx.repo.commitAll(`round ${round}`);
      }
      assert.deepEqual((await buildProfile(fx.runtime, { root: '.' })).featureKinds, ['mocks', 'service']);
    } finally {
      await fx.dispose();
    }
  });
});
