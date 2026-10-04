import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addedImports, exportedNames, resolveModule, reusedSymbols } from './reuse-cases.mjs';

const PATCH = [
  'diff --git a/src/api/Report.ts b/src/api/Report.ts',
  '--- a/src/api/Report.ts',
  '+++ b/src/api/Report.ts',
  '@@ -1,3 +1,5 @@',
  ' import { old } from "../x.js";',
  '+import { Scoring, type ScoreType, Helper as H } from "../models/Scoring.js";',
  '+import { Fresh } from "../models/Fresh.js";',
  '+import axios from "axios";',
  'diff --git a/src/api/Report.spec.ts b/src/api/Report.spec.ts',
  '+import { OnlyInTest } from "../models/Scoring.js";',
].join('\n');

describe('reuse-cases', () => {
  it('lists the names a patch adds as imports, per file, and ignores default imports', () => {
    assert.deepEqual(addedImports(PATCH), [
      { file: 'src/api/Report.ts', spec: '../models/Scoring.js', names: ['Scoring', 'ScoreType', 'Helper'] },
      { file: 'src/api/Report.ts', spec: '../models/Fresh.js', names: ['Fresh'] },
      { file: 'src/api/Report.spec.ts', spec: '../models/Scoring.js', names: ['OnlyInTest'] },
    ]);
  });

  it('reads exports of every kind', () => {
    assert.deepEqual(exportedNames('export const A = 1, B = 2;\nexport interface I {}\nexport type T = 1;\nexport enum E {}\nexport function f() {}\nexport class C {}\nexport { X as Y };\nconst hidden = 1;\n'), ['A', 'B', 'I', 'T', 'E', 'f', 'C', 'Y']);
  });

  it('resolves relative and code-root imports to snapshot files, and packages to nothing', () => {
    const exists = (p) => ['src/models/Scoring.ts', 'main/state/org/index.ts'].includes(p);
    assert.equal(resolveModule('src/api/Report.ts', '../models/Scoring.js', 'src', exists), 'src/models/Scoring.ts');
    assert.equal(resolveModule('main/x/y.ts', 'state/org', 'main', exists), 'main/state/org/index.ts');
    assert.equal(resolveModule('src/a.ts', 'axios', 'src', exists), null);
  });

  it('keeps names the change imported from modules that existed before it, and not those from new files or tests', () => {
    const files = { 'src/models/Scoring.ts': 'export class Scoring {}\nexport type ScoreType = 1;\n', 'src/models/Fresh.ts': 'export const Fresh = 1;\n' };
    const found = reusedSymbols(PATCH, { root: 'src', absent: new Set(['src/models/Fresh.ts']), read: (p) => files[p], exists: (p) => p in files });
    assert.deepEqual([...found], [['Scoring', 'src/models/Scoring.ts'], ['ScoreType', 'src/models/Scoring.ts']]);
  });
});
