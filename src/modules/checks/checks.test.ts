import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import { DEFAULTS } from '#types/defaults';
import { Git } from '#platform/git/git';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { runChecks, type RunChecksOptions } from './run/run.ts';
import { selectLintFiles } from './selection/select.ts';
import { nodeFileSystem } from '#platform/ports/filesystem';
import type { ChangedPath } from '#types/modules/checks';
import type { Clock, ProcessRunner } from '#types/platform/ports';

const clock: Clock = { now: () => new Date('2026-09-18T00:00:00Z'), elapsed: () => 0 };

function config(): AmbicodeConfig {
  return {
    schemaVersion: 1,
    baseline: 'origin/main',
    review: { ...DEFAULTS.review },
    checks: { ...DEFAULTS.checks },
    requirements: { mcpServer: null, acceptanceField: null },
    search: {},
    guard: { askOutsideMap: false },
    projects: [],
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

/** A real repository, because runChecks fingerprints the index and porcelain status around every command. */
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
    maxSelectedTestFiles: 20,
  });

  assert.deepEqual(selection.files.map((file) => file.path), ['src/a.ts']);
  assert.ok(selection.limitations.some((line) => line.includes('gone.ts')));
});

test('U10 many deleted files are one limitation with a count, not one line each', () => {
  const paths = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ oldPath: `src/${name}.ts`, changeKind: 'deleted' as const }));
  const selection = selectLintFiles({
    fs: nodeFileSystem,
    project: { id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [], commands: {}, checks: {} },
    check: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] },
    changed: changed(paths),
    repositoryRoot: '/repo',
    maxSelectedTestFiles: 20,
  });
  assert.equal(selection.limitations.length, 1);
  assert.match(selection.limitations[0]!, /^5 files were deleted, so they were not checked: src\/a\.ts, src\/b\.ts, src\/c\.ts and 2 more\.$/);
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

test('a generic lint adapter runs the configured command and reads its exit code as the verdict', async (t) => {
  const directory = await sandbox(t);
  for (const [exitCode, status] of [[0, 'passed'], [2, 'failed']] as const) {
    const runner = new FakeProcessRunner().stubArgv(['./node_modules/.bin/prettier'], { exitCode });
    const { results } = await runChecks(
      baseOptions({
        reviewDirectory: directory,
        runner,
        project: {
          id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
          commands: { lint: { argv: ['./node_modules/.bin/prettier', '--check', '--', '{files}'] } },
          checks: { lint: { command: 'lint', adapter: 'generic', include: ['**/*.scss'] } },
        },
        changed: changed([{ newPath: 'src/app.scss' }]),
      }),
    );
    assert.deepEqual(runner.argvs(), [['./node_modules/.bin/prettier', '--check', '--', 'src/app.scss']]);
    assert.equal(results[0]?.status, status);
    assert.equal(results[0]?.exitCode, exitCode);
  }
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

test('U15 a check killed at the timeout stays timed-out even when its output reads like a finished run', async (t) => {
  const directory = await sandbox(t);
  const vitestSummary = [
    ' ✓ src/a.spec.ts (14 tests) 1203ms',
    ' ✗ src/b.spec.ts (1 test | 1 failed) 88ms',
    '',
    ' Test Files  1 failed | 1 passed (2)',
    '      Tests  1 failed | 14 passed (15)',
    '   Start at  17:26:41',
    '   Duration  60.85s (transform 3.40s, setup 0ms, collect 12.11s, tests 1.29s, environment 79.26s)',
    '',
  ].join('\n');

  const run = async (stdout: string) => {
    const runner = new FakeProcessRunner()
      .stubArgv(['vitest', 'run'], { kind: 'timed-out', stdout });
    const { results } = await runChecks(
      baseOptions({
        reviewDirectory: directory,
        runner,
        project: {
          id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [],
          commands: { unit: { argv: ['vitest', 'run', '{files}'] } },
          checks: { unit: { command: 'unit', adapter: 'vitest', selector: { kind: 'mapping', mappings: [{ source: ['lib/**'], tests: ['src/**/*.spec.ts'] }] } } },
        },
        changed: changed([{ newPath: 'src/a.spec.ts' }]),
      }),
    );
    return results[0];
  };

  const recovered = await run(vitestSummary);
  assert.equal(recovered?.status, 'timed-out', 'no exit code was produced, so the output is not read as a verdict');
  assert.equal(recovered?.exitCode, null, 'no exit code was ever produced, and none is invented');

  const partial = await run(' ✓ src/a.spec.ts (14 tests) 1203ms\n');
  assert.equal(partial?.status, 'timed-out');

  assert.deepEqual(
    [...new Set(recovered?.limitations)],
    recovered?.limitations,
    'a limitation stated twice reads as two separate problems',
  );
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

test('U15 a command that rewrites a reviewed file is reported, not reverted', async (t) => {
  const directory = await sandbox(t);
  await mkdir(path.join(directory, 'src'), { recursive: true });
  const watched = path.join(directory, 'src', 'a.ts');
  await writeFile(watched, 'const x=1\n', 'utf8');

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

