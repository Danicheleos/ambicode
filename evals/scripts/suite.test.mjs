// Static checks over the suite: every case is well-formed, and both trees match cases.mjs, before a paid run finds out.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FIXTURES } from '../../fixtures/definitions.mjs';
import { CASES, EVALS, caseDir, render } from './cases.mjs';

const ROOT = path.dirname(EVALS);
const SKILLS = readdirSync(path.join(ROOT, 'skills')).filter((name) => !name.startsWith('.'));
const FILES = render();

function onDisk(tree) {
  const out = [];
  const walk = (relative) => {
    for (const name of readdirSync(path.join(EVALS, relative))) {
      const child = `${relative}/${name}`;
      // navigator/ is rendered from NDA assets by navigator-cases.mjs, gitignored, and absent on most machines.
      if (name === 'results' || name === 'navigator' || name === 'init-large' || name.startsWith('.')) continue;
      if (statSync(path.join(EVALS, child)).isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk(tree);
  return out.sort();
}

describe('skill coverage suite', () => {
  it('every case sits in <tree>/<suite>/<name>, and its scaffold finds the repository from there', () => {
    const c = CASES[0];
    assert.equal(caseDir('cases', 'review-ts-boundary'), 'cases/review/review-ts-boundary');
    for (const file of FILES.keys()) assert.match(file, /^(cases|bare)\/[a-z]+\/[a-z0-9-]+\//, file);
    const deep = path.join(mkdtempSync(path.join(tmpdir(), 'suite-depth-')), ...caseDir('cases', c.name).split('/'));
    mkdirSync(deep, { recursive: true });
        const expr = /\$\(cd "\$\(dirname "\$0"\)[^"]*" && pwd\)/.exec(FILES.get(`${caseDir('cases', c.name)}/scaffold.sh`))[0];
    const root = execFileSync('sh', ['-c', `echo ${expr}`, path.join(deep, 'scaffold.sh')], { encoding: 'utf8' }).trim();
    assert.equal(root, path.resolve(deep, '../../../..'));
  });

  it('evals/cases and evals/bare are exactly what cases.mjs renders (run node evals/scripts/cases.mjs after editing it)', () => {
    const disk = [...onDisk('cases'), ...onDisk('bare')].sort();
    assert.deepEqual(disk, [...FILES.keys()].sort());
    for (const file of disk) assert.equal(readFileSync(path.join(EVALS, file), 'utf8'), FILES.get(file), file);
  });

  // Their old cases were removed; delete the skill from this list when its new cases land.
  const WITHOUT_CASES = [];
  it('covers every skill with at least one case, except those awaiting new cases, and only skills that exist', () => {
    assert.deepEqual([...new Set(CASES.map((c) => c.name.split('-')[0]))].sort(), SKILLS.filter((s) => !WITHOUT_CASES.includes(s)).sort());
    for (const skill of WITHOUT_CASES) assert.ok(SKILLS.includes(skill), `${skill} is a skill`);
  });

  for (const c of CASES) {
    const skill = c.name.split('-')[0];
    it(`${c.name}: the prompt types the skill with a fixed --task slug, graders read literal paths, the fixture exists`, () => {
      assert.ok(c.prompt.startsWith(`/ambicode:${skill}`));
      const slug = /--task (\S+)/.exec(c.prompt)?.[1] ?? null;
      if (skill !== 'init') assert.ok(slug !== null, 'a route case fixes its task slug so graders can name the ledger');
      assert.ok(c.graders.length >= 4, 'at least four graders');
      assert.equal(new Set(c.graders.map((g) => g.name)).size, c.graders.length, 'grader names are unique');
      for (const grader of c.graders) {
        const file = /path: (\S+)/.exec(grader.text)?.[1];
        if (file === undefined) continue;
        // file_exists takes a glob over the created files (claude 2.1.303 documents `path: <glob>`); a `{ source: file, path }` target is one literal file.
        if (!grader.text.includes('type: file_exists')) assert.doesNotMatch(file, /[*?{]/, `${grader.name}: the harness resolves no globs`);
        if (file.includes('/tasks/') || file.includes('/reviews/')) assert.ok(file.includes(`/${slug}/`), `${grader.name}: ledger path uses the prompt's slug`);
      }
      assert.ok(FIXTURES.some((entry) => entry.name === c.fixture), `${c.fixture} is a fixture`);
    });

    if (c.bare === null) continue;
    it(`${c.name}: the bare arm asks the same thing with nothing of the plugin in prompt, graders or scaffold`, () => {
      assert.doesNotMatch(c.bare, /ambicode|--task|--answer|--headless/i);
      const shared = c.graders.filter((g) => g.shared);
      assert.ok(shared.length >= 2, 'at least two shared graders');
      for (const grader of shared) assert.doesNotMatch(grader.bare.text, /\.ambicode|ambicode:|Evidence/, `${grader.name} reads only what a bare run can produce`);
      // A case that sets `bareFlags` (the review cases) holds both arms to one scaffold; every other bare arm has no config.
      if (c.bareFlags === undefined) assert.doesNotMatch(FILES.get(`${caseDir('bare', c.name)}/scaffold.sh`), /--ambicode-init/);
      else assert.equal(FILES.get(`${caseDir('bare', c.name)}/scaffold.sh`), FILES.get(`${caseDir('cases', c.name)}/scaffold.sh`));
    });
  }
});
