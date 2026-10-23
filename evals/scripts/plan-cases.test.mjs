// $0 checks of the plan cases: every file a sample names resolves in the fixture (line numbers too), each pattern accepts its
// sample and a clean plan, each `mustNot` pattern catches its bad sample, and the rendered graders carry the specs' patterns.
// No model runs here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { parse } from 'yaml';
import { fixtureByName } from '../../fixtures/definitions.mjs';
import { materialize } from '../../fixtures/materialize.mjs';
import { CASES, caseDir, render } from './cases.mjs';
import { PLAN_SPECS, goodPlan } from './plan-cases.mjs';

const FILES = render();
const planCases = CASES.filter((c) => c.name.startsWith('plan-'));
const frontmatter = (text) => parse(text.split('---')[1]);
const graderOf = (name, grader) => frontmatter(FILES.get(`${caseDir('cases', name)}/graders/${grader}.md`));
const ANCHOR = /([\w.-]+(?:\/[\w.-]+)+\.[A-Za-z]{1,4})(?::(\d+))?/g;

const repos = new Map();
before(async () => {
  for (const fixture of new Set(PLAN_SPECS.map((spec) => spec.fixture))) {
    const dir = mkdtempSync(path.join(tmpdir(), 'plan-cases-'));
    await materialize(fixtureByName(fixture), dir);
    const tracked = execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8' }).split('\n').filter(Boolean);
    repos.set(fixture, { dir, tracked });
  }
});

/** The tracked files `name` can mean: the path itself or a path ending in it (a sample may leave out the leading folders). */
const resolve = (repo, name) => repo.tracked.filter((file) => file === name || file.endsWith(`/${name}`));
const lineCount = (repo, file) => readFileSync(path.join(repo.dir, file), 'utf8').split('\n').length - 1;

describe('plan cases', () => {
  it('are fifteen: at most two per stack fixture, five on ts-app-medium, small and huge ones among the stacks', () => {
    assert.equal(planCases.length, 15);
    const stacks = PLAN_SPECS.filter((spec) => spec.size !== 'narrow');
    assert.equal(stacks.length, 10);
    for (const fixture of new Set(stacks.map((spec) => spec.fixture))) assert.equal(stacks.filter((spec) => spec.fixture === fixture).length, 2, fixture);
    assert.equal(stacks.filter((spec) => spec.size === 'small').length, 5);
    assert.equal(stacks.filter((spec) => spec.size === 'huge').length, 5);
    assert.deepEqual([...new Set(PLAN_SPECS.filter((spec) => spec.size === 'narrow').map((spec) => spec.fixture))], ['ts-app-medium']);
    assert.equal(PLAN_SPECS.filter((spec) => spec.size === 'narrow').length, 5);
    for (const spec of PLAN_SPECS.filter((s) => s.size === 'huge')) assert.ok(spec.limits.max_turns > 30, `${spec.name} gets more turns than the suite default`);
  });

  it('only the draft case leaves the gate unanswered, and only it has no bare arm', () => {
    for (const c of planCases) {
      const draft = c.name === 'plan-app-draft';
      assert.equal(c.prompt.includes('--answer plan-accept=Accept'), !draft, c.name);
      assert.equal(c.bare === null, draft, c.name);
    }
  });

  for (const spec of PLAN_SPECS) {
    describe(spec.name, () => {
      it('names only files that exist in the fixture, at lines that exist', () => {
        const repo = repos.get(spec.fixture);
        const samples = [...spec.must.map(([, , sample]) => sample), ...spec.mustNot.flatMap(([, , bad, ok]) => [bad, ok ?? ''])];
        let checked = 0;
        for (const sample of samples) {
          const placeholder = /new:|absent|regenerate/.test(sample);
          for (const [, name, line] of sample.matchAll(ANCHOR)) {
            if (name.startsWith('.')) continue; // a relative import in a sample is code, not a repository path
            const found = resolve(repo, name);
            if (found.length === 0) {
              assert.ok(placeholder, `${spec.name}: ${name} is not in ${spec.fixture} (${sample})`);
              continue;
            }
            checked += 1;
            if (line !== undefined) assert.ok(Number(line) <= lineCount(repo, found[0]), `${name}:${line} is past the end of ${found[0]}`);
          }
        }
        assert.ok(checked >= spec.must.length - 3, `${spec.name}: samples cite real files`);
      });

      it('each pattern accepts its sample and a clean plan; each mustNot pattern catches its bad sample and spares its ok one', () => {
        const plan = goodPlan(spec);
        const names = [...spec.must, ...spec.mustNot].map(([name]) => name);
        assert.equal(new Set(names).size, names.length, 'check names are unique');
        for (const [name, pattern, sample] of spec.must) {
          assert.match(sample, new RegExp(pattern), name);
          assert.doesNotMatch('', new RegExp(pattern), `${name} passes an empty plan`);
          assert.match(plan, new RegExp(pattern), name);
        }
        for (const [name, pattern, bad, ok] of spec.mustNot) {
          assert.match(bad, new RegExp(pattern), `${name} misses its bad sample`);
          if (ok !== undefined) assert.doesNotMatch(ok, new RegExp(pattern), `${name} flags its ok sample`);
          assert.doesNotMatch(plan, new RegExp(pattern), `${name} flags a clean plan`);
        }
      });

      it('renders each check as a regex grader on the plan file, and in both arms as a shared one on the final message', () => {
        const c = planCases.find((entry) => entry.name === spec.name);
        const slug = /--task (\S+)/.exec(c.prompt)[1];
        assert.equal(slug, spec.slug);
        if (spec.draft) return; // its draft file has a timestamped name, so it has no content graders
        for (const [name, pattern] of [...spec.must, ...spec.mustNot]) {
          const own = graderOf(spec.name, name);
          assert.equal(own.type, 'regex');
          assert.equal(own.pattern, pattern);
          assert.ok(own.target.path.endsWith(`/tasks/${slug}/plan.md`), name);
          if (c.bare === null) continue;
          const bare = frontmatter(FILES.get(`${caseDir('bare', spec.name)}/graders/${name}.md`));
          assert.equal(bare.pattern, pattern);
          assert.equal(bare.target, 'last_message');
        }
      });
    });
  }

  it('an accepted plan is graded on the route finishing, anchors that resolve and the plan file; the draft on the gate and no promotion', () => {
    for (const c of planCases) {
      const names = c.graders.map((g) => g.name);
      assert.ok(names.includes('anchors-valid'), c.name);
      if (c.name === 'plan-app-draft') {
        assert.ok(names.includes('accept-gate-printed') && names.includes('not-promoted') && !names.includes('route-done'));
        assert.ok(names.includes('plan-draft-saved'));
        const lastMessage = c.graders.filter((g) => g.name === 'draft-stated' || g.name === 'not-called-accepted');
        assert.equal(lastMessage.length, 2);
        assert.ok(lastMessage.every((g) => g.text.includes('target: last_message')));
      } else assert.ok(names.includes('route-done') && names.includes('plan-written') && names.includes('five-fields'), c.name);
    }
  });

  it('the anchor and boundary graders accept a clean run and refuse a bad one', () => {
    const c = planCases[0];
    const anchors = new RegExp(frontmatter(c.graders.find((g) => g.name === 'anchors-valid').text).pattern);
    const entry = (summary) => `{"id":"w1","kind":"worker","worker":"plan-check","outcome":"ran","summary":${summary}}`;
    assert.match(entry('{"failed":false,"anchorsBad":0}'), anchors);
    assert.doesNotMatch(entry('{"failed":true,"anchorsBad":2,"anchors":["x.ts:9 missing-file"]}'), anchors);
    assert.doesNotMatch(entry('{"failed":true,"anchorsBad":0,"uncoded":["a row"]}'), anchors);
    const checks = new RegExp(frontmatter(c.graders.find((g) => g.name === 'no-checks-run').text).input_match);
    for (const command of ['npm test', 'cd repo && npx jest', 'uv run pytest', 'go test ./...', './gradlew test', 'cargo clippy --all-targets']) assert.match(JSON.stringify({ command }), checks, command);
    for (const command of ['git ls-files', 'node "/x/scripts/ambicode.mjs" route next', 'grep -rn test src']) assert.doesNotMatch(JSON.stringify({ command }), checks, command);
    const write = new RegExp(frontmatter(c.graders.find((g) => g.name === 'no-write-source').text).input_match);
    assert.match(JSON.stringify({ file_path: '/w/repo/src/contexts/lending/domain/fees/late.ts' }), write);
    assert.match(JSON.stringify({ file_path: '/w/repo/internal/httpapi/parcels.go' }), write);
    assert.doesNotMatch(JSON.stringify({ file_path: '/w/repo/.ambicode/tasks/plan-ts-grace/steps/plan-body.md' }), write);
  });

  it('the iteration grader counts Goal headings', () => {
    const c = planCases.find((entry) => entry.name === 'plan-ts-reserve');
    const iterations = new RegExp(frontmatter(c.graders.find((g) => g.name === '3-iterations').text).pattern);
    assert.match('Goal a\nGoal b\nGoal c', iterations);
    assert.doesNotMatch('Goal a\nGoal b', iterations);
  });
});
