import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSearchIndex } from './search-index.ts';
import { conventionEvidence, styleOf } from './convention-evidence.ts';

// A fixture with counts fixed by construction: 3 groups under src/; 6 `*.service.ts` (3 in catalog, 3 of 4 in lending), one camelCase
// file, lending importing catalog (two files, one folder pair) and shared (one pair); catalog and shared import nothing.
const SOURCES: Record<string, string> = {
  'src/catalog/item.service.ts': 'export class ItemService {}\n',
  'src/catalog/add-item.service.ts': 'export class AddItemService {}\n',
  'src/catalog/search.service.ts': 'export function searchItems() {}\nexport const MAX_RESULTS = 5;\n',
  'src/lending/borrow.service.ts': "import { ItemService } from '../catalog/item.service';\nexport class BorrowService {}\n",
  'src/lending/return.service.ts': "import { ItemService } from '../catalog/item.service';\nexport class ReturnService {}\n",
  'src/lending/loan.service.ts': "import { ids } from '../shared/ids';\nexport class LoanService {}\n",
  'src/lending/legacyHelper.ts': 'export function legacy_thing() {}\n',
  'src/shared/ids.ts': 'export const ids = 1;\n',
  'src/shared/time-source.ts': 'export function nowUtc() {}\n',
  'src/shared/result-type.ts': 'export type ResultType = 1;\n',
};
const FILES = Object.keys(SOURCES);
const OPTIONS = { roots: [] as string[], maxModules: 50 };
const evidence = async (): Promise<string> => {
  const { rows } = await buildSearchIndex(FILES, async (file) => SOURCES[file] ?? null, OPTIONS);
  return conventionEvidence(rows, FILES, OPTIONS);
};

describe('convention evidence', () => {
  it('counts name styles, suffixes and where they live, from the fixture\'s known numbers', async () => {
    const text = await evidence();
    assert.match(text, /^source files 10 in 3 folders; groups are the level 2 modules$/m);
    // Hand count: add-item, time-source, result-type are kebab; item, search, borrow, return, loan, ids are one lowercase word (neither kebab nor snake); legacyHelper is camel.
    assert.match(text, /file name styles .*: kebab 3, camel 1\n {2}against the majority style, e\.g\. src\/lending\/legacyHelper\.ts/);
    assert.match(text, /^ {2}\*\.service\.ts 6: src\/catalog 3\/3, src\/lending 3\/4; e\.g\. src\/catalog\/add-item\.service\.ts$/m);
    assert.doesNotMatch(text, /\*\.ts \d/, 'a plain .ts name has no suffix');
  });

  it('counts the declared-name casing', async () => {
    assert.match(await evidence(), /^declared names \(the first \d+ the index keeps per folder\): .*snake 1, Pascal 6, camel 2, UPPER 1$/m);
  });

  it('counts import directions between groups: lending -> catalog 1, catalog -> lending 0; shared imports nothing', async () => {
    const text = await evidence();
    assert.match(text, /^ {2}src\/catalog -> src\/lending 0, src\/lending -> src\/catalog 1$/m);
    assert.match(text, /^ {2}src\/lending -> src\/shared 1, src\/shared -> src\/lending 0$/m);
    assert.match(text, /import nothing of the other groups: src\/catalog, src\/shared$/m);
  });

  it('classifies identifiers', () => {
    assert.deepEqual(['add-item', 'add_item', 'AddItem', 'addItem', 'ADD_ITEM', 'item', 'Add-Item'].map(styleOf), ['kebab', 'snake', 'Pascal', 'camel', 'UPPER', null, 'other']);
  });
});
