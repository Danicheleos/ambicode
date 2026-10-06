import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'scripts', 'ambicode.mjs');

const BEFORE_WORK_MARKER = 'DISTINCTIVE-BEFORE-WORK-c1f9a3';
const BEFORE_CHECKS_MARKER = 'DISTINCTIVE-BEFORE-CHECKS-7b2e40';
const BEFORE_REPORT_MARKER = 'DISTINCTIVE-BEFORE-REPORT-9d6a11';
const BEFORE_REVIEW_MARKER = 'DISTINCTIVE-BEFORE-REVIEW-4e0c88';

/**
 * Tells a missing bundle (ENOENT) apart from a stat that failed transiently (EBUSY, EPERM,
 * EMFILE under many concurrent test files), which is retried.
 */
async function assertBundleBuilt(candidate) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return (await stat(candidate)).size;
    } catch (error) {
      if (error.code === 'ENOENT') {
        assert.fail(`${candidate} does not exist; run "npm run build" first.`);
      }
      if (attempt >= 4) {
        assert.fail(`${candidate} could not be checked after 5 attempts (${error.code}).`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'x', GIT_AUTHOR_EMAIL: 'x@x.com', GIT_COMMITTER_NAME: 'x', GIT_COMMITTER_EMAIL: 'x@x.com' } });
}

async function makeFixtureRepo() {
  const repo = await mkdtemp(path.join(tmpdir(), 'ambicode-prepare-artifact-'));
  git(['init', '-q'], repo);
  await writeFile(path.join(repo, 'package.json'), '{"name":"app","version":"1.0.0"}\n');
  await mkdir(path.join(repo, 'src'), { recursive: true });
  await writeFile(path.join(repo, 'src', 'app.ts'), 'export const a = 1;\n');
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'initial'], repo);

  await mkdir(path.join(repo, '.ambicode', 'policies'), { recursive: true });
  await writeFile(
    path.join(repo, '.ambicode', 'config.yaml'),
    [
      'schemaVersion: 1',
      'baseline: ""',
      'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }',
      'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
      'page: { idleTimeoutSeconds: 1800 }',
      'requirements: { mcpServer: null }',
      'projects:',
      '  - id: app',
      '    root: .',
      '    ecosystem: typescript',
      '    packs: []',
      '    policyFiles: [".ambicode/policies/distinctive.yaml"]',
      '    commands: { lint: null, unit: null, e2e: null }',
      '    checks: { lint: null, unit: null, e2e: null }',
      'remoteChecks: { image: null }',
      '',
    ].join('\n'),
  );
  await writeFile(
    path.join(repo, '.ambicode', 'policies', 'before-work.md'),
    `# Before work\n\n${BEFORE_WORK_MARKER}\n`,
  );
  await writeFile(
    path.join(repo, '.ambicode', 'policies', 'before-checks.md'),
    `# Before checks\n\n${BEFORE_CHECKS_MARKER}\n`,
  );
  await writeFile(
    path.join(repo, '.ambicode', 'policies', 'before-report.md'),
    `# Before report\n\n${BEFORE_REPORT_MARKER}\n`,
  );
  await writeFile(
    path.join(repo, '.ambicode', 'policies', 'before-review.md'),
    `# Before review\n\n${BEFORE_REVIEW_MARKER}\n`,
  );
  await writeFile(
    path.join(repo, '.ambicode', 'policies', 'distinctive.yaml'),
    [
      'schemaVersion: 1',
      'id: distinctive-fixture',
      'authority: team',
      'appliesTo: ["**/*"]',
      'activities: [task, plan, investigate]',
      'source: { location: "built-artifact regression fixture" }',
      'rules: []',
      'prompts:',
      '  - stage: before-work',
      '    file: "./before-work.md"',
      '  - stage: before-checks',
      '    file: "./before-checks.md"',
      '  - stage: before-report',
      '    file: "./before-report.md"',
      '  - stage: before-review',
      '    file: "./before-review.md"',
      'commandPolicy: []',
      '',
    ].join('\n'),
  );
  return repo;
}

function runPrepare(repo, activity) {
  return execFileSync('node', [BUNDLE, 'prepare', '--activity', activity, '--json'], {
    cwd: repo,
    encoding: 'utf8',
  });
}

describe('built-artifact regression: ambicode prepare --json (P2.4 correction A2)', () => {
  it('requires the bundle to have been built (npm run build) before this test runs', async () => {
    assert.ok((await assertBundleBuilt(BUNDLE)) > 0, `${BUNDLE} is empty`);
  });

  it('delivers applicable prompt text and never a stage this activity does not receive', async () => {
    const repo = await makeFixtureRepo();
    try {
      const taskStdout = runPrepare(repo, 'task');
      const taskOutput = JSON.parse(taskStdout);
      assert.ok(taskStdout.includes(BEFORE_WORK_MARKER), 'task prepare must include before-work text');
      assert.ok(taskStdout.includes(BEFORE_CHECKS_MARKER), 'task prepare must include before-checks text');
      assert.ok(taskStdout.includes(BEFORE_REPORT_MARKER), 'task prepare must include before-report text');
      assert.ok(!taskStdout.includes(BEFORE_REVIEW_MARKER), 'task prepare must never include before-review text');
      assert.equal(taskOutput.activity, 'task');

      const planStdout = runPrepare(repo, 'plan');
      assert.ok(planStdout.includes(BEFORE_WORK_MARKER), 'plan prepare must include before-work text');
      assert.ok(planStdout.includes(BEFORE_REPORT_MARKER), 'plan prepare must include before-report text');
      assert.ok(!planStdout.includes(BEFORE_CHECKS_MARKER), 'plan prepare must NOT include before-checks text (filtered stage)');
      assert.ok(!planStdout.includes(BEFORE_REVIEW_MARKER), 'plan prepare must never include before-review text');
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('reports a measured byte count equal to the real stdout it printed', async () => {
    const repo = await makeFixtureRepo();
    try {
      const stdout = runPrepare(repo, 'task');
      const parsed = JSON.parse(stdout);
      assert.equal(Buffer.byteLength(stdout, 'utf8'), parsed.contextBudget.measuredBytes);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
