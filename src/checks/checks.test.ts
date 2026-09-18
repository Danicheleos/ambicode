import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '../contracts/config.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import { DEFAULTS } from '../config/defaults.ts';
import { FakeProcessRunner } from '../testing/fake-process-runner.ts';
import type { Clock } from '../ports/clock.ts';
import { runChecks, type RunChecksOptions } from './run.ts';
import { selectLintFiles, type ChangedPath } from './select.ts';

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

async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-checks-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function baseOptions(overrides: Partial<RunChecksOptions> & { project: ProjectConfig; reviewDirectory: string }): RunChecksOptions {
  return {
    config: config(),
    policy: policy([['lint', 'run'], ['unit', 'run']]),
    changed: [],
    repositoryRoot: overrides.reviewDirectory,
    runner: new FakeProcessRunner(),
    clock,
    approvals: new Set<string>(),
    enumerationRevision: 'HEAD',
    ...overrides,
  };
}

test('U10 lint selects only matching changed files that still exist', () => {
  const selection = selectLintFiles({
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

  const approved = await runChecks({ ...options, runner, approvals: new Set(['unit']) });
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
  assert.equal(failed?.outputRef, 'checks/lint.txt');

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
