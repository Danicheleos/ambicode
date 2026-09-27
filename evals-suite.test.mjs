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
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fixtureByName } from './fixtures/definitions.mjs';
import { materialize } from './fixtures/materialize.mjs';

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
