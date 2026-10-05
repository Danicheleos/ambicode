import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { analyse, exportedSymbols, pickHard, writeImpactCase } from './impact-cases.mjs';

const write = (dir, file, text) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
};

describe('impact-cases', () => {
  let dir;
  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'impact-'));
    write(dir, 'util/risk.ts', 'export function riskOf(x: number): number { return x; }\nexport const helper = (y: number) => y;\nfunction hidden() {}\n');
    for (const user of ['a', 'b', 'c']) write(dir, `app/${user}.ts`, `import { riskOf } from "../util/risk";\nexport const v${user} = riskOf(1);\n`);
    write(dir, 'app/aliased.ts', 'import { riskOf as r } from "../util/risk";\nexport const w = r(2);\n');
    write(dir, 'app/note.ts', '// riskOf is documented elsewhere\nexport const text = "riskOf";\n');
    write(dir, 'app/a.spec.ts', 'import { riskOf } from "../util/risk";\nriskOf(0);\n');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('lists exported functions, classes, enums and arrow consts, and nothing else', () => {
    const names = exportedSymbols('x.ts', 'export function f() {}\nexport class C {}\nexport enum E { A }\nexport const g = () => 1;\nexport const n = 1;\nfunction hidden() {}\nexport interface I {}\n').map((s) => s.name);
    assert.deepEqual(names, ['f', 'C', 'E', 'g']);
  });

  it('takes the language service\'s references as the truth, and names what a name search gets wrong', () => {
    const [risk] = analyse(dir, 'src').filter((s) => s.name === 'riskOf');
    assert.deepEqual(risk.truth, ['src/app/a.ts', 'src/app/aliased.ts', 'src/app/b.ts', 'src/app/c.ts']);
    assert.deepEqual(risk.lookalikes, ['src/app/note.ts']);
    assert.equal(risk.hidden, 0, 'an aliased import still names the symbol where it imports it');
    assert.ok(!risk.truth.includes('src/app/a.spec.ts'), 'tests are not users that matter');
  });

  it('keeps symbols a name search gets wrong, one per folder, and drops a name declared twice', () => {
    const found = [
      { name: 'A', file: 'src/x/y/a.ts', truth: [], lookalikes: ['l'], hidden: 0 },
      { name: 'B', file: 'src/x/y/b.ts', truth: [], lookalikes: ['l', 'm'], hidden: 0 },
      { name: 'C', file: 'src/z/c.ts', truth: [], lookalikes: [], hidden: 0 },
      { name: 'D', file: 'src/q/d.ts', truth: [], lookalikes: ['l'], hidden: 0 },
      { name: 'D', file: 'src/r/d.ts', truth: [], lookalikes: ['l'], hidden: 0 },
    ];
    assert.deepEqual(pickHard(found, 5).map((s) => s.name), ['B']);
    assert.deepEqual(pickHard([...found.slice(0, 1), { name: 'E', file: 'src/e/e.ts', truth: [], lookalikes: ['l'], hidden: 0 }], 5).map((s) => s.name), ['A', 'E']);
  });

  it('writes a case whose prompt names the symbol and whose grader lists only its users', () => {
    const out = path.join(dir, 'cases');
    const [risk] = analyse(dir, 'src').filter((s) => s.name === 'riskOf');
    const name = writeImpactCase(out, 'BE', risk);
    assert.equal(name, 'be-impact-riskof');
    const grader = readFileSync(path.join(out, name, 'graders', 'names-a-true-file.md'), 'utf8');
    assert.match(grader, /use `riskOf`/);
    assert.match(grader, /`src\/app\/aliased\.ts`/);
    assert.doesNotMatch(grader, /note\.ts|a\.spec\.ts|util\/risk/);
    assert.match(readFileSync(path.join(out, name, 'prompt.md'), 'utf8'), /change the signature of `riskOf`/);
    const truth = JSON.parse(readFileSync(path.join(out, name, 'truth.json'), 'utf8'));
    assert.deepEqual([truth.kind, truth.root], ['impact', 'src']);
    assert.ok(!existsSync(path.join(out, name, 'graders', 'helper-ran.md')), 'there is no prepare shortlist to credit');
  });
});
