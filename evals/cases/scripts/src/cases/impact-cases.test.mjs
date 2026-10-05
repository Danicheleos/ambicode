import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { INVESTIGATE_COMMAND, pluginPrompt } from '../harness/prompt-transport.mjs';
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
    write(dir, 'legacy/risk.ts', 'export function riskOf(x: string): string { return x; }\n');
    write(dir, 'util/solo.ts', 'export function soloOf(): number { return 1; }\n');
    for (const user of ['p', 'q', 'r']) write(dir, `app/${user}.ts`, `import { soloOf } from "../util/solo";\nexport const s${user} = soloOf();\n`);
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
    assert.deepEqual([...risk.lookalikes].sort(), ['src/app/note.ts', 'src/legacy/risk.ts']);
    assert.equal(risk.hidden, 0, 'an aliased import still names the symbol where it imports it');
    assert.ok(!risk.truth.includes('src/app/a.spec.ts'), 'tests are not users that matter');
  });

  it('05-K1: the collision filter keeps a name declared in two files and drops a unique one', () => {
    const names = analyse(dir, 'src').map((s) => s.name);
    assert.ok(names.includes('riskOf'));
    assert.ok(!names.includes('soloOf'), 'soloOf has three users but one declaration');
    assert.equal(analyse(dir, 'src').find((s) => s.name === 'riskOf').declarations, 2);
  });

  it('05-K1: one case per name, the declaration with most lookalikes plus hidden, then one per folder', () => {
    const found = [
      { name: 'A', file: 'src/x/y/a.ts', truth: [], lookalikes: ['l'], hidden: 0 },
      { name: 'A', file: 'src/x/z/a.ts', truth: [], lookalikes: ['l', 'm'], hidden: 0 },
      { name: 'B', file: 'src/x/y/b.ts', truth: [], lookalikes: ['l'], hidden: 0 },
      { name: 'T', file: 'src/t/b.ts', truth: [], lookalikes: ['l'], hidden: 0 },
      { name: 'T', file: 'src/t/a.ts', truth: [], lookalikes: ['l'], hidden: 0 },
      { name: 'C', file: 'src/q/c.ts', truth: [], lookalikes: [], hidden: 0 },
    ];
    const chosen = pickHard(found, 5);
    assert.deepEqual(chosen.map((s) => [s.name, s.file]), [['A', 'src/x/z/a.ts'], ['B', 'src/x/y/b.ts'], ['T', 'src/t/a.ts']]);
    assert.equal(pickHard(found, 1).length, 1);
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

  it('05-K2: prompt.with.md is the naked prompt with the investigate command typed in, and truth carries declarations', () => {
    const out = path.join(dir, 'cases-k2');
    const risk = analyse(dir, 'src').find((s) => s.name === 'riskOf');
    const name = writeImpactCase(out, 'BE', risk);
    const naked = readFileSync(path.join(out, name, 'prompt.md'), 'utf8');
    assert.equal(readFileSync(path.join(out, name, 'prompt.with.md'), 'utf8'), pluginPrompt(naked, INVESTIGATE_COMMAND));
    assert.equal(readFileSync(path.join(out, name, 'prompt.naked.md'), 'utf8'), naked);
    assert.equal(JSON.parse(readFileSync(path.join(out, name, 'truth.json'), 'utf8')).declarations, 2);
  });
});

describe('impact-cases CLI', () => {
  const script = fileURLToPath(new URL('./impact-cases.mjs', import.meta.url));
  let bench;
  before(() => {
    bench = mkdtempSync(path.join(tmpdir(), 'impact-bench-'));
    const src = path.join(bench, 'BE', 'src');
    write(src, 'util/risk.ts', 'export function riskOf(x: number): number { return x; }\n');
    write(src, 'legacy/risk.ts', 'export function riskOf(x: string): string { return x; }\n');
    for (const user of ['a', 'b', 'c']) write(src, `app/${user}.ts`, `import { riskOf } from "../util/risk";\nexport const v${user} = riskOf(1);\n`);
    write(src, 'app/note.ts', '// riskOf lives elsewhere\n');
  });
  after(() => rmSync(bench, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, [script, '--side', 'BE', ...args], { encoding: 'utf8' });

  it('05-K3 and 05-K4: reads and writes under --benchmarks and prints the case counts and the estimate', () => {
    const result = run('--benchmarks', bench);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(path.join(bench, 'impact-cases')), ['be-impact-riskof']);
    assert.match(readFileSync(path.join(bench, 'impact-cases', 'be-impact-riskof', 'scaffold.sh'), 'utf8'), /SIDE="\$\(cd "\$\(dirname "\$0"\)\/\.\.\/\.\.\/BE" && pwd\)"/);
    assert.match(result.stdout, /^BE: 1 cases$/m);
    assert.match(result.stdout, /^estimate: 1 cases × 3 runs × 2 arms × \$0\.18\/run ≈ \$1\.08 \(estimate, not an authorization\)$/m);
  });

  it('05-K3: a relative --benchmarks is refused', () => {
    const result = run('--benchmarks', 'relative/dir');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /absolute/);
  });

  it('05-K5: no .ts file under src/, tests included, imports typescript', () => {
    const srcDir = fileURLToPath(new URL('../../../../../src', import.meta.url));
    const offenders = [];
    const visit = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (entry.name.endsWith('.ts') && /(from\s+|import\s*\(\s*|require\(\s*)['"]typescript['"]/.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(srcDir, file));
      }
    };
    visit(srcDir);
    assert.deepEqual(offenders, []);
  });
});
