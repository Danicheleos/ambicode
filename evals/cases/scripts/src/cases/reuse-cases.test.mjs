import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('reuse-cases generation', () => {
  const script = fileURLToPath(new URL('./reuse-cases.mjs', import.meta.url));
  const base = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  const put = (file, text) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };

  it('05-S3: each case gets the base scaffold of the version it chose, and a relative --benchmarks is refused', () => {
    const bench = mkdtempSync(path.join(tmpdir(), 'reuse-bench-'));
    try {
      const modules = { 'models/A.ts': 'A', 'lib/B.ts': 'B', 'util/C.ts': 'C', 'util/D.ts': 'D' };
      for (const [file, name] of Object.entries(modules)) put(path.join(bench, 'BE/src', file), `export const ${name} = 1;\n`);
      const patch = ['diff --git a/src/api/R.ts b/src/api/R.ts', '--- a/src/api/R.ts', '+++ b/src/api/R.ts', '@@ -1 +1,5 @@']
        .concat(Object.keys(modules).map((file) => `+import { ${modules[file]} } from "../${file.replace('.ts', '.js')}";`)).join('\n');
      const version = path.join(bench, 'BE/reviews/T1/7-deadbeef');
      put(path.join(version, 'change.patch'), patch);
      put(path.join(version, 'version.json'), JSON.stringify({ base, head: 'f'.repeat(40), root: 'src', touched: [], absentAtBase: [] }));
      put(path.join(bench, 'BE/assets/T1.md'), `## build:context prompt\n${'Add reporting for scoring. '.repeat(20)}\n## TRUE RELATED CODE\n- src/api/R.ts\n`);
      const result = spawnSync(process.execPath, [script, '--side', 'BE', '--benchmarks', bench], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const out = path.join(bench, 'reuse-cases');
      const cases = readdirSync(out).filter((name) => name.includes('-reuse-'));
      assert.deepEqual(cases.sort(), ['be-reuse-t1', 'be-reuse-t1-forced']);
      for (const name of cases) {
        const file = path.join(out, name, 'scaffold.sh');
        const body = readFileSync(file, 'utf8');
        assert.ok(body.includes(`archive '${base}' -- 'src'`), body);
        assert.doesNotMatch(body, /cp -R/);
        assert.ok(body.includes(`SIDE="$(cd "$(dirname "$0")"/'../../BE' && pwd)"`), 'SIDE is relative to the case under --benchmarks');
        assert.ok(statSync(file).mode & 0o100, 'executable');
      }
      const relative = spawnSync(process.execPath, [script, '--benchmarks', 'rel/dir'], { encoding: 'utf8' });
      assert.notEqual(relative.status, 0);
      assert.match(relative.stderr, /absolute/);
    } finally {
      rmSync(bench, { recursive: true, force: true });
    }
  });
});
