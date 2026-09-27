// Guards the claims the `claude plugin eval` suite (`evals/`) makes about its
// fixtures. Nothing checked them before: `correctness-ts` shipped a ground
// truth saying the existing test "still passes" under the fixture's change,
// while replaying the fixture showed `page([1,2,3,4],0,2)` returning `[1]`
// against an expected `[1,2]` — the test failed, and the case was a second
// regression case rather than the uncovered boundary it is filed under.
//
// The fixture's own test runs under a two-matcher `test`/`expect` shim rather
// than jest: fixtures install nothing (`fixtures/materialize.mjs`), and a
// fixture's test is two lines of `toEqual`, not a jest feature matrix.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { fixtureByName } from './fixtures/definitions.mjs';
import { materialize } from './fixtures/materialize.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EVALS = path.join(ROOT, 'evals');

/** Every case directory, with each grader's frontmatter parsed. */
async function loadCases() {
  const cases = [];
  for (const entry of await readdir(EVALS, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'results') continue;
    const graderDirectory = path.join(EVALS, entry.name, 'graders');
    const graders = [];
    for (const name of (await readdir(graderDirectory)).filter((file) => file.endsWith('.md')).sort()) {
      const source = await readFile(path.join(graderDirectory, name), 'utf8');
      const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(source);
      assert.ok(match, `${entry.name}/graders/${name} has no frontmatter`);
      graders.push({ name, ...parseYaml(match[1]), body: source.slice(match[0].length) });
    }
    cases.push({ name: entry.name, graders });
  }
  assert.ok(cases.length > 0, 'no eval case found');
  return cases;
}

/** Every ambicode subcommand a skill tells the model to run through the bundle. */
async function skillSubcommands() {
  const subcommands = new Set();
  for (const file of await readdir(path.join(ROOT, 'skills'), { recursive: true })) {
    if (!file.endsWith('.md')) continue;
    const source = await readFile(path.join(ROOT, 'skills', file), 'utf8');
    for (const match of source.matchAll(/ambicode\.mjs" ([a-z-]+)/g)) subcommands.add(match[1]);
  }
  assert.ok(subcommands.has('review'), 'the skills no longer call ambicode.mjs review');
  return [...subcommands];
}

/**
 * Runs a CommonJS jest-style test source and returns each test's outcome. It is
 * evaluated in this realm with `new Function` rather than `node:vm`: arrays
 * built by the module under test and by the test's literals must share one
 * `Array.prototype`, or `deepStrictEqual` fails on identical contents.
 */
function runJestStyle(source, require) {
  const cases = [];
  const test = (name, body) => cases.push({ name, body });
  const expect = (actual) => ({
    toBe: (expected) => assert.strictEqual(actual, expected),
    toEqual: (expected) => assert.deepStrictEqual(actual, expected),
  });
  new Function('require', 'test', 'expect', source)(require, test, expect);
  return cases.map(({ name, body }) => {
    try {
      body();
      return { name, passed: true };
    } catch (error) {
      return { name, passed: false, error: error.message };
    }
  });
}

describe('correctness-ts: ts-off-by-one is a boundary the existing test does not cover', () => {
  let scratch;
  let repo;

  before(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-evals-'));
    repo = path.join(scratch, 'repo');
    await materialize(fixtureByName('ts-off-by-one'), repo);
  });

  after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('keeps the existing test passing under the uncommitted change', async () => {
    const testFile = path.join(repo, 'tests', 'page.test.js');
    const outcomes = runJestStyle(await readFile(testFile, 'utf8'), createRequire(testFile));
    assert.ok(outcomes.length > 0, 'the fixture test declares no test');
    assert.deepEqual(
      outcomes.filter((outcome) => !outcome.passed),
      [],
      'the ground truth says the existing test still passes under the defect',
    );
  });

  it('also passes the existing test on the committed code, so it is a genuine pre-existing test', async () => {
    const testFile = path.join(repo, 'tests', 'page.test.js');
    const committed = execFileSync('git', ['show', 'HEAD:src/page.js'], { cwd: repo, encoding: 'utf8' });
    const module = { exports: {} };
    new Function('module', committed)(module);
    const committedRequire = (specifier) => {
      assert.equal(specifier, '../src/page', 'the fixture test requires something else');
      return module.exports;
    };
    const outcomes = runJestStyle(await readFile(testFile, 'utf8'), committedRequire);
    assert.ok(outcomes.length > 0);
    assert.deepEqual(outcomes.filter((outcome) => !outcome.passed), []);
  });

  it('still carries the defect the case is graded on: a full page loses its last item', () => {
    const { page } = createRequire(path.join(repo, 'package.json'))('./src/page.js');
    assert.deepEqual(page([1, 2, 3, 4], 0, 2), [1]);
  });
});

// `tool_used.input_match` is a regex over the tool call's JSON-encoded input
// (https://code.claude.com/docs/en/plugin-evals). The skills prescribe
// `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" review`, whose JSON form
// carries `ambicode.mjs\\" review`: `'ambicode review'` matched only a bare
// `ambicode` on PATH, and `'ambicode.mjs" locate'` matched nothing at all, so
// three indicators reported "helper did not run" for every run where it did.
describe('eval graders: Bash indicators match the command the skills prescribe', () => {
  const roots = ['${CLAUDE_PLUGIN_ROOT}', '/Users/someone/.claude/plugins/cache/ambicode/ambicode/0.3.1'];

  it('every Bash tool_used pattern matches both the bundled and the bare form of the subcommand it names', async () => {
    const subcommands = await skillSubcommands();
    const failures = [];
    for (const evalCase of await loadCases()) {
      for (const grader of evalCase.graders) {
        if (grader.type !== 'tool_used' || grader.tool !== 'Bash') continue;
        const where = `${evalCase.name}/graders/${grader.name} (${grader.input_match})`;
        const pattern = new RegExp(grader.input_match);
        const named = subcommands.filter((sub) => pattern.test(JSON.stringify({ command: `ambicode ${sub}` })));
        if (named.length === 0) {
          failures.push(`${where}: matches no bare \`ambicode <subcommand>\` a skill uses`);
          continue;
        }
        for (const sub of named) {
          for (const root of roots) {
            const command = `node "${root}/scripts/ambicode.mjs" ${sub} --json`;
            if (!pattern.test(JSON.stringify({ command }))) failures.push(`${where}: misses ${command}`);
          }
        }
      }
    }
    assert.deepEqual(failures, []);
  });
});

// In a two-arm run the harness drops `arm: with-only` graders and `tool_used`
// on `Skill`; when that drops every grader, it scores all of them instead
// (https://code.claude.com/docs/en/plugin-evals). `p2-plan-path-scoped-policy`
// had only such graders, so its W/OUT arm was capped by a `plugin-fired` it
// can never pass. `p2-investigate-frozen-requirement` scored only
// `no-source-edit`, a weight-1 hygiene check both arms pass alike, so nothing
// graded whether its answer was right. Every other case's outcome grader
// carries weight 3; the hygiene graders carry 1.
describe('eval graders: every case scores its outcome in both arms', () => {
  it('has a grader that survives two-arm exclusion and outweighs the hygiene graders', async () => {
    const failures = [];
    for (const evalCase of await loadCases()) {
      const outcome = evalCase.graders.filter(
        (grader) =>
          grader.arm !== 'with-only' &&
          !(grader.type === 'tool_used' && grader.tool === 'Skill') &&
          (grader.weight ?? 1) > 1,
      );
      if (outcome.length === 0) failures.push(evalCase.name);
    }
    assert.deepEqual(failures, []);
  });
});
