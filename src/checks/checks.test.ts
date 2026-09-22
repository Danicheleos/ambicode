import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '../contracts/config.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { Git } from '../git/git.ts';
import { NodeProcessRunner } from '../ports/node-process-runner.ts';
import { FakeProcessRunner } from '../testing/fake-process-runner.ts';
import type { Clock } from '../ports/clock.ts';
import type { ProcessRunner } from '../ports/process.ts';
import { runChecks, type RunChecksOptions } from './run.ts';
import { selectLintFiles, type ChangedPath } from './select.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';

const clock: Clock = { now: () => new Date('2026-09-18T00:00:00Z'), elapsed: () => 0 };

function config(): AmbicodeConfig {
  return {
    schemaVersion: 1,
    baseline: 'origin/main',
    review: { ...DEFAULTS.review },
    checks: { ...DEFAULTS.checks },
    page: { ...DEFAULTS.page },
    requirements: { mcpServer: null },
    projects: [],
    remoteChecks: { image: null },
    authoring: { ...DEFAULTS.authoring },
  };
}

function policy(decisions: Array<[string, 'run' | 'propose' | 'forbid', string?]>): ResolvedPolicy {
  return {
    activity: 'review',
    projectId: 'web',
    packs: [],
    rules: [],
    prompts: [],
    commandDecisions: decisions.map(([command, action, reason]) => ({
      command,
      action,
      sources: [{ packId: 'test', packReference: 'test', action, ...(reason === undefined ? {} : { reason }) }],
    })),
    diagnostics: [],
  };
}

function changed(paths: Array<Partial<ChangedPath> & { newPath?: string | null; oldPath?: string | null }>): ChangedPath[] {
  return paths.map((entry) => ({
    newPath: entry.newPath ?? null,
    oldPath: entry.oldPath ?? null,
    changeKind: entry.changeKind ?? 'modified',
  }));
}

/**
 * A real repository, because runChecks fingerprints the index and porcelain
 * status around every command; a fake would only restate what the fingerprint
 * code already assumes.
 */
async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-checks-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runner = new NodeProcessRunner();
  await runner.run({
    argv: ['git', 'init', '-q', '--initial-branch=main', '.'],
    cwd: directory,
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
  });
  return directory;
}

function gitFor(directory: string): Git {
  return new Git({ runner: new NodeProcessRunner(), repositoryRoot: directory });
}

function baseOptions(overrides: Partial<RunChecksOptions> & { project: ProjectConfig; reviewDirectory: string }): RunChecksOptions {
  return {
    fs: nodeFileSystem,
    config: config(),
    policy: policy([['lint', 'run'], ['unit', 'run']]),
    changed: [],
    repositoryRoot: overrides.reviewDirectory,
    runner: new FakeProcessRunner(),
    clock,
    approvals: new Set<string>(),
    declines: new Set<string>(),
    enumerationRevision: 'HEAD',
    git: gitFor(overrides.reviewDirectory),
    watchedPaths: [],
    revisionNote: null,
    ...overrides,
  };
}

test('U10 lint selects only matching changed files that still exist', () => {
  const selection = selectLintFiles({
    fs: nodeFileSystem,
    project: {
      id: 'web', root: 'apps/web', ecosystem: 'typescript', packs: [], policyFiles: [],
      commands: {}, checks: {},
    },
    check: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] },
    changed: changed([
      { newPath: 'apps/web/src/a.ts' },
      { newPath: 'apps/web/src/readme.md' },
      { oldPath: 'apps/web/src/gone.ts', changeKind: 'deleted' },
      { newPath: 'services/api/src/b.ts' },
    ]),
    repositoryRoot: '/repo',
    runner: new FakeProcessRunner(),
    enumerationRevision: null,
    maxSelectedTestFiles: 20,
    timeoutMs: 1000,
    commandArgv: ['eslint'],
    authorize: () => ({ kind: 'allowed' }),
  });

  assert.deepEqual(selection.files.map((file) => file.path), ['src/a.ts']);
  assert.ok(selection.limitations.some((line) => line.includes('gone.ts')));
});

test('U10 an empty lint selection never invokes the command', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();
  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: {
        id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
        commands: { lint: { argv: ['eslint', '--', '{files}'] } },
        checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] } },
      },
      changed: changed([{ newPath: 'README.md' }]),
    }),
  );

  assert.equal(results[0]?.status, 'skipped');
  assert.deepEqual(runner.argvs(), []);
});

test('U14 filenames reach the command as separate arguments, unquoted and unmangled', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();
  await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: {
        id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
        commands: { lint: { argv: ['./node_modules/.bin/eslint', '--', '{files}'] } },
        checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] } },
      },
      changed: changed([{ newPath: 'src/with space.ts' }, { newPath: 'src/--option-like.ts' }]),
    }),
  );

  assert.deepEqual(runner.argvs(), [
    ['./node_modules/.bin/eslint', '--', 'src/--option-like.ts', 'src/with space.ts'],
  ]);
});

test('U14 a forbidden command never reaches the process runner', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();
  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      policy: policy([['lint', 'forbid', 'Linting is owned by CI here.']]),
      project: {
        id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
        commands: { lint: { argv: ['eslint', '{files}'] } },
        checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] } },
      },
      changed: changed([{ newPath: 'src/a.ts' }]),
    }),
  );

  assert.equal(results[0]?.status, 'skipped');
  assert.ok(results[0]?.limitations[0]?.includes('Linting is owned by CI here.'));
  assert.deepEqual(runner.argvs(), []);
});

test('U11/U13 a source-only change selects its unchanged mapped test', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'tests', 'orders'), { recursive: true });
  await writeFile(path.join(directory, 'tests', 'orders', 'test_create.py'), '', 'utf8');
  await writeFile(path.join(directory, 'tests', 'orders', 'test_cancel.py'), '', 'utf8');

  const runner = new FakeProcessRunner();
  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: {
        id: 'api', root: '.', ecosystem: 'python', packs: [], policyFiles: [],
        commands: { unit: { argv: ['pytest', '--', '{files}'] } },
        checks: {
          unit: {
            command: 'unit',
            adapter: 'pytest',
            selector: {
              kind: 'mapping',
              mappings: [{ source: ['src/orders/**/*.py'], tests: ['tests/orders/test_*.py'] }],
            },
          },
        },
      },
      changed: changed([{ newPath: 'src/orders/create.py' }]),
    }),
  );

  assert.equal(results[0]?.status, 'passed');
  assert.deepEqual(
    results[0]?.selected.map((file) => file.path),
    ['tests/orders/test_cancel.py', 'tests/orders/test_create.py'],
  );
  assert.deepEqual(runner.argvs(), [
    ['pytest', '--', 'tests/orders/test_cancel.py', 'tests/orders/test_create.py'],
  ]);
});

test('U13 a changed test file selects itself and a deleted source still maps to its tests', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'tests', 'orders'), { recursive: true });
  await writeFile(path.join(directory, 'tests', 'orders', 'test_create.py'), '', 'utf8');

  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      project: {
        id: 'api', root: '.', ecosystem: 'python', packs: [], policyFiles: [],
        commands: { unit: { argv: ['pytest', '{files}'] } },
        checks: {
          unit: {
            command: 'unit',
            adapter: 'pytest',
            selector: {
              kind: 'mapping',
              mappings: [{ source: ['src/orders/**/*.py'], tests: ['tests/orders/test_*.py'] }],
            },
          },
        },
      },
      changed: changed([
        { newPath: 'tests/orders/test_create.py' },
        { oldPath: 'src/orders/legacy.py', changeKind: 'deleted' },
      ]),
    }),
  );

  assert.deepEqual(results[0]?.selected.map((file) => file.path), ['tests/orders/test_create.py']);
  assert.ok(results[0]?.selected[0]?.reason.includes('this test file changed'));
  assert.ok(results[0]?.selected[0]?.reason.includes('mapped from changed source src/orders/legacy.py'));
});

test('U12/U13 an unmapped change is a gap that waits for authorization, not an empty pass', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'tests', 'orders'), { recursive: true });
  await writeFile(path.join(directory, 'tests', 'orders', 'test_create.py'), '', 'utf8');

  const runner = new FakeProcessRunner();
  const options = baseOptions({
    reviewDirectory: directory,
    runner,
    project: {
      id: 'api', root: '.', ecosystem: 'python', packs: [], policyFiles: [],
      commands: { unit: { argv: ['pytest', '{files}'] } },
      checks: {
        unit: {
          command: 'unit',
          adapter: 'pytest',
          selector: {
            kind: 'mapping',
            mappings: [{ source: ['src/orders/**/*.py'], tests: ['tests/orders/test_*.py'] }],
          },
        },
      },
    },
    changed: changed([{ newPath: 'src/orders/create.py' }, { newPath: 'src/billing/invoice.py' }]),
  });

  const unattended = await runChecks(options);
  assert.equal(unattended.results[0]?.status, 'skipped');
  assert.equal(unattended.results[0]?.selectionComplete, false);
  assert.equal(unattended.pendingApprovals.length, 1);
  assert.ok(unattended.pendingApprovals[0]?.reason.includes('could not establish'));
  assert.deepEqual(runner.argvs(), [], 'nothing runs before a human authorizes it');

  // Keyed by project, so this token cannot reach another project's "unit".
  assert.equal(unattended.pendingApprovals[0]?.approvalKey, 'api/unit');
  const approved = await runChecks({ ...options, runner, approvals: new Set(['api/unit']) });
  assert.equal(approved.results[0]?.status, 'passed');
  assert.equal(runner.argvs().length, 1);
});

test('U12 a selection above the configured limit waits for authorization', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'tests'), { recursive: true });
  for (let index = 0; index < 5; index += 1) {
    await writeFile(path.join(directory, 'tests', `test_${index}.py`), '', 'utf8');
  }

  const runner = new FakeProcessRunner();
  const { results, pendingApprovals } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: {
        id: 'api', root: '.', ecosystem: 'python', packs: [], policyFiles: [],
        commands: { unit: { argv: ['pytest', '{files}'] } },
        checks: {
          unit: {
            command: 'unit',
            adapter: 'pytest',
            selector: { kind: 'mapping', maxFiles: 2, mappings: [{ source: ['src/**'], tests: ['tests/test_*.py'] }] },
          },
        },
      },
      changed: changed([{ newPath: 'src/a.py' }]),
    }),
  );

  assert.equal(results[0]?.status, 'skipped');
  assert.ok(pendingApprovals[0]?.reason.includes('above the configured limit of 2'));
  assert.deepEqual(runner.argvs(), []);
});

test('U12 a proposed command is authorized per run, not once for the project', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();
  const project: ProjectConfig = {
    id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
    commands: { e2e: { argv: ['playwright', 'test', '{files}'] } },
    checks: {
      e2e: {
        command: 'e2e',
        adapter: 'playwright',
        selector: { kind: 'mapping', mappings: [{ source: ['src/**'], tests: ['e2e/*.spec.ts'] }] },
      },
    },
  };
  await mkdir(path.join(directory, 'e2e'), { recursive: true });
  await writeFile(path.join(directory, 'e2e', 'checkout.spec.ts'), '', 'utf8');

  const options = baseOptions({
    reviewDirectory: directory,
    runner,
    project,
    policy: policy([['e2e', 'propose', 'Needs a running environment.']]),
    changed: changed([{ newPath: 'src/a.ts' }]),
  });

  const first = await runChecks(options);
  assert.equal(first.results[0]?.status, 'skipped');
  assert.ok(first.pendingApprovals[0]?.reason.includes('propose'));
  assert.deepEqual(first.pendingApprovals[0]?.proposedArgv, ['playwright', 'test', 'e2e/checkout.spec.ts']);
  assert.deepEqual(runner.argvs(), []);
});

test('U11 the jest adapter enumerates affected tests from the changed files', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();
  runner.stubArgv(['./node_modules/.bin/jest', '--listTests'], {
    stdout: `${path.join(directory, 'tests/math.test.js')}\n`,
  });

  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: {
        id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
        commands: { unit: { argv: ['./node_modules/.bin/jest', '--runTestsByPath', '{files}'] } },
        checks: { unit: { command: 'unit', adapter: 'jest', selector: { kind: 'related' } } },
      },
      changed: changed([{ newPath: 'src/math.js' }]),
    }),
  );

  assert.deepEqual(runner.argvs(), [
    ['./node_modules/.bin/jest', '--listTests', '--findRelatedTests', 'src/math.js'],
    ['./node_modules/.bin/jest', '--runTestsByPath', 'tests/math.test.js'],
  ]);
  assert.equal(results[0]?.status, 'passed');
  assert.equal(results[0]?.selectionComplete, true);
});

test('U11 the vitest adapter enumerates from the reviewed revision and records the limitation', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();
  runner.stubArgv(['./node_modules/.bin/vitest', 'list'], { stdout: 'tests/math.test.js\n' });

  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      enumerationRevision: 'abc1234',
      project: {
        id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
        commands: { unit: { argv: ['./node_modules/.bin/vitest', 'run', '{files}'] } },
        checks: { unit: { command: 'unit', adapter: 'vitest', selector: { kind: 'related' } } },
      },
      changed: changed([{ newPath: 'src/math.js' }]),
    }),
  );

  assert.deepEqual(runner.argvs()[0], [
    './node_modules/.bin/vitest', 'list', '--filesOnly', '--changed', 'abc1234',
  ]);
  assert.ok(results[0]?.limitations.some((line) => line.includes('not from the pinned snapshot')));
});

test('U12 a wrapped runner cannot be enumerated and therefore waits for authorization', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();
  const { results, pendingApprovals } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: {
        id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
        // `npm run test` is not jest, so appending --listTests would be meaningless.
        commands: { unit: { argv: ['npm', 'run', 'test', '--', '{files}'] } },
        checks: { unit: { command: 'unit', adapter: 'jest', selector: { kind: 'related' } } },
      },
      changed: changed([{ newPath: 'src/math.js' }]),
    }),
  );

  assert.equal(results[0]?.status, 'skipped');
  assert.equal(pendingApprovals.length, 0, 'with nothing selected there is no bounded run to authorize');
  assert.ok(results[0]?.limitations.some((line) => line.includes('does not invoke jest directly')));
  assert.deepEqual(runner.argvs(), []);
});

test('U15 passed, failed, timed-out, skipped and error stay distinct', async (t) => {
  const directory = await sandbox(t);

  const run = async (outcome: Parameters<FakeProcessRunner['stub']>[1]) => {
    const runner = new FakeProcessRunner().stub(() => true, outcome);
    const { results } = await runChecks(
      baseOptions({
        reviewDirectory: directory,
        runner,
        project: {
          id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
          commands: { lint: { argv: ['eslint', '{files}'] } },
          checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] } },
        },
        changed: changed([{ newPath: 'src/a.ts' }]),
      }),
    );
    return results[0];
  };

  assert.equal((await run({ exitCode: 0 }))?.status, 'passed');

  const failed = await run({ exitCode: 1, stdout: 'problem' });
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.exitCode, 1);
  assert.equal(failed?.outputRef, 'checks/web/lint.txt');

  assert.equal((await run({ kind: 'timed-out' }))?.status, 'timed-out');

  const missing = await run({ kind: 'spawn-failed', failure: 'spawn eslint ENOENT' });
  assert.equal(missing?.status, 'skipped');
  assert.ok(missing?.limitations[0]?.includes('was not found'));

  const broken = await run({ kind: 'spawn-failed', failure: 'EACCES permission denied' });
  assert.equal(broken?.status, 'error');
});

test('U01/U15 a null command and a null check are distinct skipped outcomes', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();
  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: {
        id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
        commands: { lint: null, unit: null },
        checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] }, e2e: null },
      },
      changed: changed([{ newPath: 'src/a.ts' }]),
    }),
  );

  const lint = results.find((result) => result.checkId === 'lint');
  const e2e = results.find((result) => result.checkId === 'e2e');
  assert.equal(lint?.status, 'skipped');
  assert.ok(lint?.limitations[0]?.includes('configured as null'));
  assert.equal(e2e?.status, 'skipped');
  assert.ok(e2e?.limitations[0]?.includes('intentionally unavailable'));
  assert.deepEqual(runner.argvs(), []);
});

function selectorProject(): ProjectConfig {
  return {
    id: 'web',
    root: '.',
    ecosystem: 'typescript',
    packs: [],
    policyFiles: [],
    commands: {
      unit: { argv: ['jest', '--', '{files}'] },
      'select-tests': { argv: ['./scripts/affected.sh', '{files}'] },
    },
    checks: {
      unit: {
        command: 'unit',
        adapter: 'jest',
        selector: { kind: 'command', command: 'select-tests' },
      },
    },
  };
}

test('U14 a forbidden selector command never runs, and neither does the check it feeds', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner().stub(() => true, { stdout: '["tests/a.test.ts"]' });

  const { results, pendingApprovals } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: selectorProject(),
      policy: policy([
        ['unit', 'run'],
        ['select-tests', 'forbid', 'selection scripts are not approved for this repository'],
      ]),
      changed: changed([{ newPath: 'src/a.ts' }]),
    }),
  );

  assert.deepEqual(runner.argvs(), [], 'neither the selector nor the check reaches the process runner');
  assert.equal(results[0]?.status, 'skipped');
  assert.equal(results[0]?.selectionComplete, false);
  assert.deepEqual(pendingApprovals, [], 'a forbidden command is not offered for approval');
  assert.ok(results[0]?.limitations.some((line) => line.includes('select-tests')));
  assert.ok(
    results[0]?.limitations.some((line) => line.includes('selection scripts are not approved')),
    'the refusal names the reason the pack gave',
  );
});

test('U14 a selector command no pack declares is refused, not silently run', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner().stub(() => true, { stdout: '["tests/a.test.ts"]' });

  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: selectorProject(),
      // "unit" may run; nothing says anything about the selector script.
      policy: policy([['unit', 'run']]),
      changed: changed([{ newPath: 'src/a.ts' }]),
    }),
  );

  assert.deepEqual(runner.argvs(), []);
  assert.equal(results[0]?.status, 'skipped');
  assert.ok(results[0]?.limitations.some((line) => line.includes('not declared by any enabled pack')));
});

test('U14 a proposed selector needs its own approval, separate from the check', async (t) => {
  const directory = await sandbox(t);
  const options = baseOptions({
    reviewDirectory: directory,
    runner: new FakeProcessRunner(),
    project: selectorProject(),
    policy: policy([['unit', 'run'], ['select-tests', 'propose']]),
    changed: changed([{ newPath: 'src/a.ts' }]),
  });

  const unattended = await runChecks({ ...options, runner: new FakeProcessRunner() });
  assert.equal(unattended.pendingApprovals.length, 1);
  assert.equal(unattended.pendingApprovals[0]?.approvalKey, 'web/unit:selector');
  assert.deepEqual(unattended.pendingApprovals[0]?.proposedArgv, ['./scripts/affected.sh', 'src/a.ts']);

  // Approving the check itself is not approval for the script that decides
  // what the check will run.
  const checkApproved = new FakeProcessRunner();
  const wrongKey = await runChecks({ ...options, runner: checkApproved, approvals: new Set(['web/unit']) });
  assert.deepEqual(checkApproved.argvs(), []);
  assert.equal(wrongKey.results[0]?.status, 'skipped');

  const selectorApproved = new FakeProcessRunner().stub(
    (argv) => argv[0] === './scripts/affected.sh',
    { stdout: '["tests/a.test.ts"]' },
  );
  const granted = await runChecks({
    ...options,
    runner: selectorApproved,
    approvals: new Set(['web/unit:selector']),
  });
  assert.equal(granted.results[0]?.status, 'passed');
  assert.deepEqual(selectorApproved.argvs(), [
    ['./scripts/affected.sh', 'src/a.ts'],
    ['jest', '--', 'tests/a.test.ts'],
  ]);
});

function jestProject(): ProjectConfig {
  return {
    id: 'web',
    root: '.',
    ecosystem: 'typescript',
    packs: [],
    policyFiles: [],
    commands: { unit: { argv: ['./node_modules/.bin/jest', '--runTestsByPath', '{files}'] } },
    checks: { unit: { command: 'unit', adapter: 'jest', selector: { kind: 'related' } } },
  };
}

test('U13 a deleted source is an unknown impact, not a proven empty selection', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();

  const { results, pendingApprovals } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: jestProject(),
      changed: changed([{ oldPath: 'src/math.js', changeKind: 'deleted' }]),
    }),
  );

  // Observed on jest 30.5.2: --findRelatedTests on a deleted path exits 0 and
  // prints nothing, so asking it would look exactly like "nothing is affected".
  assert.deepEqual(runner.argvs(), []);
  assert.equal(results[0]?.status, 'skipped');
  assert.equal(results[0]?.selectionComplete, false, 'a deletion never proves zero impact');
  assert.ok(
    !results[0]?.limitations.some((line) => line.includes('No file in this change is in scope')),
    'the gap is not reported as an in-scope check with nothing to do',
  );
  assert.ok(results[0]?.limitations.some((line) => line.includes('src/math.js')));
  assert.ok(results[0]?.limitations.some((line) => line.includes('gap in verification')));
  assert.deepEqual(pendingApprovals, [], 'an empty selection is never widened into a suite run');
});

test('U13 a rename asks about the surviving path and still reports the old name as uncertain', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner();
  runner.stubArgv(['./node_modules/.bin/jest', '--listTests'], { stdout: 'tests/math.test.js\n' });

  const options = baseOptions({
    reviewDirectory: directory,
    runner,
    project: jestProject(),
    changed: changed([
      { oldPath: 'src/math.js', newPath: 'src/maths.js', changeKind: 'renamed' },
      { newPath: 'src/other.js', oldPath: 'src/other.js' },
    ]),
  });

  const { results, pendingApprovals } = await runChecks(options);

  assert.deepEqual(
    runner.argvs(),
    [['./node_modules/.bin/jest', '--listTests', '--findRelatedTests', 'src/maths.js', 'src/other.js']],
    'only surviving paths are put to the runner, and the check itself waits',
  );
  assert.equal(results[0]?.selectionComplete, false);
  assert.ok(results[0]?.limitations.some((line) => line.includes('src/math.js')));
  assert.equal(pendingApprovals.length, 1, 'an uncertain selection is authorized per run');

  const approved = new FakeProcessRunner().stubArgv(['./node_modules/.bin/jest', '--listTests'], {
    stdout: 'tests/math.test.js\n',
  });
  const granted = await runChecks({ ...options, runner: approved, approvals: new Set(['web/unit']) });
  assert.equal(granted.results[0]?.status, 'passed');
  assert.equal(granted.results[0]?.selectionComplete, false, 'authorizing the run does not make it complete');
});

test('U13 an ordinary modification is still a complete selection', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner().stubArgv(['./node_modules/.bin/jest', '--listTests'], {
    stdout: 'tests/math.test.js\n',
  });

  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner,
      project: jestProject(),
      changed: changed([{ newPath: 'src/math.js', oldPath: 'src/math.js' }]),
    }),
  );

  assert.equal(results[0]?.status, 'passed');
  assert.equal(results[0]?.selectionComplete, true);
});

test('U15 a command that rewrites a reviewed file is reported, not reverted', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'src'), { recursive: true });
  const watched = path.join(directory, 'src', 'a.ts');
  await writeFile(watched, 'const x=1\n', 'utf8');

  // A formatter-style command: it really does rewrite the file it was given.
  const rewriting: ProcessRunner = {
    async run(request) {
      await writeFile(watched, 'const x = 1;\n', 'utf8');
      return { kind: 'exited', exitCode: 0, stdout: '', stderr: '', truncated: false, durationMs: 1, failure: null };
    },
  };

  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner: rewriting,
      watchedPaths: ['src/a.ts'],
      project: {
        id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
        commands: { lint: { argv: ['formatter', '--', '{files}'] } },
        checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] } },
      },
      changed: changed([{ newPath: 'src/a.ts', oldPath: 'src/a.ts' }]),
    }),
  );

  assert.equal(results[0]?.status, 'passed');
  assert.ok(results[0]?.mutations.some((line) => line.includes('src/a.ts was rewritten')));
  assert.ok(results[0]?.mutations.some((line) => line.includes('does not undo it')));
  assert.ok(results[0]?.limitations.some((line) => line.includes('no longer exactly what was reviewed')));

  // Reported, never reverted: the developer's file keeps the command's output.
  assert.equal(await readFile(watched, 'utf8'), 'const x = 1;\n');
});

test('U15 a command that changes nothing reports no mutations', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'src'), { recursive: true });
  await writeFile(path.join(directory, 'src', 'a.ts'), 'const x = 1;\n', 'utf8');

  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner: new FakeProcessRunner(),
      watchedPaths: ['src/a.ts'],
      revisionNote: 'Checks ran in the checkout, which also holds uncommitted changes outside this review.',
      project: {
        id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
        commands: { lint: { argv: ['eslint', '--', '{files}'] } },
        checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] } },
      },
      changed: changed([{ newPath: 'src/a.ts', oldPath: 'src/a.ts' }]),
    }),
  );

  assert.equal(results[0]?.status, 'passed');
  assert.deepEqual(results[0]?.mutations, []);
  assert.ok(
    results[0]?.limitations.some((line) => line.includes('uncommitted changes outside this review')),
    'what the checks observed is stated on the result itself',
  );
});

test('U14 a rename reaches the selector script under both of its names', async (t) => {
  const directory = await sandbox(t);
  const runner = new FakeProcessRunner().stub(
    (argv) => argv[0] === './scripts/affected.sh',
    { stdout: '["tests/a.test.ts"]' },
  );

  const options = baseOptions({
    reviewDirectory: directory,
    runner,
    project: selectorProject(),
    policy: policy([['unit', 'run'], ['select-tests', 'run']]),
    changed: changed([
      { oldPath: 'src/old-name.ts', newPath: 'src/new-name.ts', changeKind: 'renamed' },
      { oldPath: 'src/gone.ts', changeKind: 'deleted' },
      { oldPath: 'src/same.ts', newPath: 'src/same.ts' },
    ]),
  });

  const { results, pendingApprovals } = await runChecks(options);

  // The pre-image is the half of a rename that can break a test: only the
  // project's own script can find what imported the vanished name, and it
  // cannot do that if it is never told the name.
  assert.deepEqual(runner.argvs()[0], [
    './scripts/affected.sh',
    'src/new-name.ts',
    'src/old-name.ts',
    'src/gone.ts',
    'src/same.ts',
  ]);
  assert.equal(results[0]?.status, 'passed');
  assert.deepEqual(pendingApprovals, []);

  // What a human is asked to authorize is exactly what would run.
  const proposed = await runChecks({
    ...options,
    runner: new FakeProcessRunner(),
    policy: policy([['unit', 'run'], ['select-tests', 'propose']]),
  });
  assert.deepEqual(proposed.pendingApprovals[0]?.proposedArgv, runner.argvs()[0]);
});

test('U15 a selector script that rewrites a reviewed file is reported too', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'src'), { recursive: true });
  const watched = path.join(directory, 'src', 'a.ts');
  await writeFile(watched, 'const x=1\n', 'utf8');

  // The script that decides what to run is project code like any other, and it
  // executes before the check command. A fingerprint taken only around the
  // command would never see this.
  const mutatingSelector: ProcessRunner = {
    async run(request) {
      if (request.argv[0] === './scripts/affected.sh') {
        await writeFile(watched, 'const x = 1; // rewritten by the selector\n', 'utf8');
        return { kind: 'exited', exitCode: 0, stdout: '["tests/a.test.ts"]', stderr: '', truncated: false, durationMs: 1, failure: null };
      }
      return { kind: 'exited', exitCode: 0, stdout: '', stderr: '', truncated: false, durationMs: 1, failure: null };
    },
  };

  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner: mutatingSelector,
      watchedPaths: ['src/a.ts'],
      project: selectorProject(),
      policy: policy([['unit', 'run'], ['select-tests', 'run']]),
      changed: changed([{ newPath: 'src/a.ts', oldPath: 'src/a.ts' }]),
    }),
  );

  assert.equal(results[0]?.status, 'passed');
  assert.ok(
    results[0]?.mutations.some((line) => line.includes('src/a.ts was rewritten while the selector for check "unit" ran')),
    'the mutation names the selector, not the check command that ran afterwards',
  );
  assert.ok(results[0]?.mutations.some((line) => line.includes('does not undo it')));
  assert.equal(
    results[0]?.mutations.filter((line) => line.includes('does not undo it')).length,
    1,
    'the disclaimer is stated once per result, not once per process',
  );
  assert.ok(results[0]?.limitations.some((line) => line.includes('no longer exactly what was reviewed')));
  assert.equal(await readFile(watched, 'utf8'), 'const x = 1; // rewritten by the selector\n');
});

test('U15 a selector that mutates and then selects nothing still reports the mutation', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'src'), { recursive: true });
  const watched = path.join(directory, 'src', 'a.ts');
  await writeFile(watched, 'const x=1\n', 'utf8');

  const mutatingSelector: ProcessRunner = {
    async run() {
      await writeFile(watched, 'const x = 1;\n', 'utf8');
      return { kind: 'exited', exitCode: 0, stdout: '[]', stderr: '', truncated: false, durationMs: 1, failure: null };
    },
  };

  const { results } = await runChecks(
    baseOptions({
      reviewDirectory: directory,
      runner: mutatingSelector,
      watchedPaths: ['src/a.ts'],
      project: selectorProject(),
      policy: policy([['unit', 'run'], ['select-tests', 'run']]),
      changed: changed([{ newPath: 'src/a.ts', oldPath: 'src/a.ts' }]),
    }),
  );

  // The check never ran, so there is no command to blame — and that is exactly
  // the case where a fingerprint tied to the command would report nothing.
  assert.equal(results[0]?.status, 'skipped');
  assert.ok(results[0]?.mutations.some((line) => line.includes('src/a.ts was rewritten')));
  assert.ok(results[0]?.limitations.some((line) => line.includes('no longer exactly what was reviewed')));
});

test('U12 one project\'s approval does not authorize another project\'s check of the same name', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'apps', 'web'), { recursive: true });
  await mkdir(path.join(directory, 'services', 'api'), { recursive: true });

  const lintProject = (id: string, root: string): ProjectConfig => ({
    id, root, ecosystem: 'typescript', packs: [], policyFiles: [],
    commands: { lint: { argv: [`${id}-linter`, '{files}'] } },
    checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] } },
  });

  const run = async (project: ProjectConfig, file: string, approvals: Set<string>) => {
    const runner = new FakeProcessRunner();
    const outcome = await runChecks(
      baseOptions({
        reviewDirectory: directory,
        runner,
        project,
        policy: policy([['lint', 'propose']]),
        changed: changed([{ newPath: file }]),
        approvals,
      }),
    );
    return { runner, ...outcome };
  };

  const web = await run(lintProject('web', 'apps/web'), 'apps/web/a.ts', new Set());
  assert.equal(web.pendingApprovals[0]?.approvalKey, 'web/lint');

  // The token names one project. Handing it to the other must not run anything.
  const api = await run(lintProject('api', 'services/api'), 'services/api/b.ts', new Set(['web/lint']));
  assert.deepEqual(api.runner.argvs(), []);
  assert.equal(api.results[0]?.status, 'skipped');
  assert.equal(api.pendingApprovals[0]?.approvalKey, 'api/lint');

  const authorized = await run(lintProject('api', 'services/api'), 'services/api/b.ts', new Set(['api/lint']));
  assert.deepEqual(authorized.runner.argvs(), [['api-linter', 'b.ts']]);
});

test('U15 two projects with a check of the same name keep separate evidence files', async (t) => {
  const directory = await sandbox(t);
  const outputs: string[] = [];

  for (const id of ['web', 'api']) {
    const runner = new FakeProcessRunner().stub(() => true, { stdout: `${id} output`, exitCode: 1 });
    const { results } = await runChecks(
      baseOptions({
        reviewDirectory: directory,
        runner,
        project: {
          id, root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
          commands: { lint: { argv: ['linter', '{files}'] } },
          checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] } },
        },
        changed: changed([{ newPath: 'a.ts' }]),
      }),
    );
    outputs.push(results[0]?.outputRef ?? '');
  }

  assert.deepEqual(outputs, ['checks/web/lint.txt', 'checks/api/lint.txt']);
  assert.match(await readFile(path.join(directory, 'checks', 'web', 'lint.txt'), 'utf8'), /web output/);
  assert.match(await readFile(path.join(directory, 'checks', 'api', 'lint.txt'), 'utf8'), /api output/);
});
