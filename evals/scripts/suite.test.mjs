// Static checks over evals/cases: every case is well-formed before a paid run finds out.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from '../../fixtures/definitions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CASES = path.join(ROOT, 'evals', 'cases');
const SKILLS = readdirSync(path.join(ROOT, 'skills')).filter((name) => !name.startsWith('.'));
const caseDirs = readdirSync(CASES).filter((name) => statSync(path.join(CASES, name)).isDirectory() && name !== 'results');
const read = (...parts) => readFileSync(path.join(CASES, ...parts), 'utf8');
const front = (text) => Object.fromEntries([...text.split('\n---')[0].matchAll(/^(\w+):\s*(.*)$/gm)].map((m) => [m[1], m[2]]));

describe('skill coverage suite', () => {
  it('covers every skill with at least one case, and only skills that exist', () => {
    const covered = new Set(caseDirs.map((name) => name.split('-')[0]));
    assert.deepEqual([...covered].sort(), [...SKILLS].sort());
  });

  for (const name of caseDirs) {
    const skill = name.split('-')[0];
    it(`${name}: case.yaml names it, the prompt types the skill with a fixed --task slug, graders read literal paths, the scaffold names a real fixture`, () => {
      assert.match(read(name, 'case.yaml'), new RegExp(`schema_version: "1.1"\\nname: ${name}\\n`));
      const prompt = read(name, 'prompt.md');
      const meta = front(prompt.replace(/^---\n/, ''));
      assert.equal(meta.name, name);
      assert.equal(meta.runs, '1', 'one run by default; --runs raises it');
      assert.ok(Number(meta.max_turns) > 0 && Number(meta.timeout_seconds) > 0);
      const body = prompt.split('\n---\n')[1].trim();
      assert.ok(body.startsWith(`/ambicode:${skill}`), `prompt types /ambicode:${skill}`);
      const slug = /--task (\S+)/.exec(body)?.[1] ?? null;
      if (skill !== 'init') assert.ok(slug !== null, 'a route case fixes its task slug so graders can name the ledger');
      const graders = readdirSync(path.join(CASES, name, 'graders'));
      assert.ok(graders.length >= 4, 'at least four graders');
      for (const grader of graders) {
        const text = read(name, 'graders', grader);
        const file = /path: (\S+)/.exec(text)?.[1];
        if (file === undefined) continue;
        assert.doesNotMatch(file, /[*?{]/, `${grader}: the harness resolves no globs`);
        if (file.includes('/tasks/') || file.includes('/reviews/')) assert.ok(file.includes(`/${slug}/`), `${grader}: ledger path uses the prompt's slug`);
      }
      const scaffold = read(name, 'scaffold.sh');
      const fixture = /materialize\.mjs"? (\S+)/.exec(scaffold)?.[1];
      assert.ok(FIXTURES.some((entry) => entry.name === fixture), `${fixture} is a fixture`);
      assert.match(scaffold, /\$\(dirname "\$0"\)\/\.\.\/\.\.\/\.\./, 'the scaffold reaches the repository root from evals/cases/<case>');
    });
  }
});
