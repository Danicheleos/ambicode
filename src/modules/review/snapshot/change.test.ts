import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { parseConfig } from '#modules/config/load';

// Limits left null in config: nothing refuses or voids.
const NO_LIMITS = parseConfig(CONFIG.replace('maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288', 'maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null')).skills.review;
import { TempRepo } from '#testing/fixtures/temp-repo';
import { pathExclusionReason } from '#util/path-classes';
import { enforceReviewInputLimits, measureInput, partitionChange } from './change.ts';
import { resolveWorkingTarget } from './target.ts';
import { nodeFileSystem } from '#platform/ports/filesystem';

test('input above a configured limit blocks the review with measured counts', () => {
  const files = Array.from({ length: 3 }, (_unused, index) => ({
    oldPath: `src/${index}.ts`,
    newPath: `src/${index}.ts`,
    changeKind: 'modified' as const,
    binary: false,
    addedLines: 40,
    removedLines: 10,
    hunks: [],
    patchSection: `diff --git a/src/${index}.ts b/src/${index}.ts\n`,
  }));
  const measured = measureInput(files, 'x'.repeat(100));

  assert.deepEqual(measured, {
    changedFiles: 3,
    changedLines: 150,
    patchBytes: 100,
    requirementBytes: 0,
    contextBytes: 100,
  });
  assert.doesNotThrow(() => enforceReviewInputLimits(measured, NO_LIMITS));

  try {
    enforceReviewInputLimits(measured, { ...NO_LIMITS, maxChangedLines: 100, maxChangedFiles: 2 });
    assert.fail('expected a refusal');
  } catch (error) {
    const typed = error as Error & { code: string; details: string[] };
    assert.equal(typed.code, 'input-too-large');
    assert.ok(typed.details.some((detail) => detail.includes('changed files: 3, limit 2')));
    assert.ok(typed.details.some((detail) => detail.includes('changed lines: 150, limit 100')));
    assert.ok(typed.details.some((detail) => detail.includes('Split the change')));
  }
});

test('excluded content leaves the patch', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/app.ts', 'export const value = 1;\n');
  await repo.commitAll('init');
  await repo.write('src/app.ts', 'export const value = 2;\n');
  await repo.write('.env', 'API_TOKEN=super-secret-value\n');
  await repo.write('node_modules/left-pad/index.js', 'module.exports = 1;\n');

  const resolution = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const reviewable = partitionChange(resolution.files);

  assert.doesNotMatch(reviewable.patch, /super-secret-value/);
  assert.doesNotMatch(reviewable.patch, /left-pad/);
  assert.match(reviewable.patch, /export const value = 2/);

  assert.deepEqual(reviewable.files.map((file) => file.newPath), ['src/app.ts']);
  assert.ok(reviewable.excluded.some((entry) => entry.path === '.env'));
  assert.ok(reviewable.excluded.some((entry) => entry.path.includes('node_modules')));

  assert.deepEqual(reviewable.files.map((file) => file.newPath), ['src/app.ts']);
});

test('a path the operator excludes leaves the review instead of blocking it', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/app.ts', 'export const value = 0;\n');
  await repo.commitAll('init');
  await repo.write('src/app.ts', 'export const value = 1;\n');
  await repo.write('assets/i18n/cs.json', `{"a":"${'x'.repeat(300_000)}"}\n`);

  const resolution = await resolveWorkingTarget({ fs: nodeFileSystem, git: repo.git, repositoryRoot: repo.root });
  const reviewable = partitionChange(resolution.files, { exclude: ['assets/i18n/**'] });

  assert.deepEqual(reviewable.files.map((file) => file.newPath), ['src/app.ts']);
  assert.doesNotMatch(reviewable.patch, /i18n/, 'an excluded path leaves the patch too');
  const excluded = reviewable.excluded.find((entry) => entry.path === 'assets/i18n/cs.json');
  assert.ok(excluded, 'the exclusion is reported, not silent');
  assert.match(excluded.reason, /pattern/i);

  const measured = measureInput(reviewable.files, reviewable.patch);
  assert.equal(measured.changedFiles, 1);
  assert.doesNotThrow(() => enforceReviewInputLimits(measured, NO_LIMITS, reviewable.files));
});

test('test files are told apart from product code by unambiguous markers only', () => {
  const tests = [
    'main/components/assessment-form.component.spec.ts',
    'src/orders.test.tsx',
    'internal/server_test.go',
    'lib/parser_spec.rb',
    'api/tests/test_orders.py',
    'api/conftest.py',
    'web/__tests__/checkout.ts',
    'web/__mocks__/stripe.ts',
    'e2e/login.ts',
    'cypress/support/commands.ts',
    'web/checkout.cy.ts',
    'server/src/test/java/OrdersTest.java',
    'lib/spec/helper.rb',
  ];
  for (const candidate of tests) {
    assert.equal(
      pathExclusionReason(candidate, { excludeTests: true }),
      'test-file',
      `${candidate} should read as a test file`,
    );
  }

  const code = [
    'main/components/assessment-form.component.ts',
    'src/testing/fake-process-runner.ts',
    'src/util/contest.ts',
    'fixtures/materialize.mjs',
    'api/testdata/orders.json',
    'src/latest.ts',
    'docs/testing.md',
  ];
  for (const candidate of code) {
    assert.equal(
      pathExclusionReason(candidate, { excludeTests: true }),
      null,
      `${candidate} is product code and must stay in the review`,
    );
  }

  assert.equal(pathExclusionReason('src/orders.spec.ts'), null);
});


test('measureInput adds requirement bytes to the model input and nothing else', () => {
  const measured = measureInput([], 'x'.repeat(10), { requirementBytes: 5 });
  assert.equal(measured.contextBytes, 15);
});
