import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DEFAULTS } from '../config/defaults.ts';
import type { AmbicodeConfig, ProjectConfig } from '../contracts/config.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import { systemClock } from '../ports/clock.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';
import { FakeProcessRunner } from '../testing/fake-process-runner.ts';
import { runRemoteChecks } from './remote.ts';
import type { ChangedPath } from './select.ts';

/**
 * Merge request code is untrusted, so the question these tests answer is not
 * "does the check pass" but "what did AMBICODE start, and where". A missing
 * isolated environment must produce skipped results with reasons and no local
 * execution of any kind.
 */

const PINNED = 'registry.example.com/ambicode/ci@sha256:' + 'a'.repeat(64);

const project: ProjectConfig = {
  id: 'web',
  root: '.',
  ecosystem: 'typescript',
  packs: [],
  policyFiles: [],
  commands: { lint: { argv: ['./node_modules/.bin/eslint', '--', '{files}'] } },
  checks: { lint: { command: 'lint', adapter: 'eslint', include: ['**/*.ts'] } },
};

/** Policy that allows a command, so a skip can only come from the isolation. */
function allowing(...commands: string[]): ResolvedPolicy {
  return {
    activity: 'review',
    projectId: 'web',
    packs: [],
    rules: [],
    prompts: [],
    commandDecisions: commands.map((command) => ({ command, action: 'run', sources: [] })),
    diagnostics: [],
  };
}

const policy = allowing('lint');

const changed: ChangedPath[] = [{ newPath: 'src/orders.ts', oldPath: 'src/orders.ts', changeKind: 'modified' }];

function configWith(image: string | null): AmbicodeConfig {
  return {
    schemaVersion: 1,
    baseline: '',
    review: { ...DEFAULTS.review },
    checks: { ...DEFAULTS.checks },
    page: { ...DEFAULTS.page },
    requirements: { mcpServer: null },
    projects: [project],
    remoteChecks: { image },
  };
}

async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-remote-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await nodeFileSystem.mkdirp(path.join(directory, 'files', 'src'));
  await nodeFileSystem.writeText(path.join(directory, 'files', 'src', 'orders.ts'), 'export const a = 1;\n');
  return directory;
}

async function run(
  t: { after(fn: () => unknown): void },
  runner: FakeProcessRunner,
  image: string | null,
) {
  const directory = await sandbox(t);
  return await runRemoteChecks({
    fs: nodeFileSystem,
    config: configWith(image),
    runner,
    clock: systemClock,
    projects: [{ project, policy, changed }],
    snapshotFilesDirectory: path.join(directory, 'files'),
    reviewDirectory: directory,
    approvals: new Set(),
  });
}

describe('U18 remote executable checks', () => {
  it('skips with an exact reason when no image is configured, and runs nothing', async (t) => {
    const runner = new FakeProcessRunner();
    const outcome = await run(t, runner, null);

    assert.deepEqual(runner.argvs(), []);
    const [result] = outcome.results;
    assert.ok(result);
    assert.equal(result.status, 'skipped');
    assert.match(result.limitations.join('\n'), /`remoteChecks\.image` is null/);
    assert.match(outcome.notes.join('\n'), /none was run locally instead/);
  });

  it('refuses an image that is not pinned by digest', async (t) => {
    const runner = new FakeProcessRunner();
    const outcome = await run(t, runner, 'registry.example.com/ambicode/ci:latest');

    assert.deepEqual(runner.argvs(), []);
    assert.match(outcome.results[0]?.limitations.join('\n') ?? '', /not pinned by digest/);
    assert.match(outcome.results[0]?.limitations.join('\n') ?? '', /a tag can be moved/);
  });

  it('skips when the container runtime is not installed, without falling back locally', async (t) => {
    const runner = new FakeProcessRunner().stub(() => true, {
      kind: 'spawn-failed',
      failure: 'spawn docker ENOENT',
    });
    const outcome = await run(t, runner, PINNED);

    const [result] = outcome.results;
    assert.ok(result);
    assert.equal(result.status, 'skipped');
    assert.match(result.limitations.join('\n'), /container runtime "docker" could not be started/);
    assert.match(
      result.limitations.join('\n'),
      /not executed in the developer checkout under any circumstances/,
    );
    // Only the image probe was attempted; the configured linter never ran.
    assert.deepEqual(runner.argvs().map((argv) => argv.slice(0, 3)), [['docker', 'image', 'inspect']]);
    assert.ok(!runner.argvs().some((argv) => argv.join(' ').includes('eslint')));
  });

  it('skips when the pinned image is absent, and does not pull it', async (t) => {
    const runner = new FakeProcessRunner().stubArgv(['docker', 'image', 'inspect'], {
      exitCode: 1,
      stderr: 'Error: No such image',
    });
    const outcome = await run(t, runner, PINNED);

    assert.match(outcome.results[0]?.limitations.join('\n') ?? '', /does not pull or build images/);
    assert.ok(!runner.argvs().some((argv) => argv[1] === 'pull' || argv[1] === 'build'));
  });

  it('runs the command in a locked-down disposable container and never mounts the source', async (t) => {
    const runner = new FakeProcessRunner()
      .stubArgv(['docker', 'image', 'inspect'], { stdout: 'sha256:abc\n' })
      .stubArgv(['docker', 'create'], { stdout: 'container-1\n' })
      .stubArgv(['docker', 'cp'], {})
      .stubArgv(['docker', 'start'], { exitCode: 0, stdout: 'no problems' })
      .stubArgv(['docker', 'diff'], { stdout: `C /ambicode/work/src/orders.ts\n` })
      .stubArgv(['docker', 'rm'], {});

    const outcome = await run(t, runner, PINNED);
    const [result] = outcome.results;
    assert.ok(result);
    assert.equal(result.status, 'passed');
    assert.deepEqual(result.selected.map((file) => file.path), ['src/orders.ts']);

    const create = runner.argvs().find((argv) => argv[1] === 'create');
    assert.ok(create);
    const valueAfter = (flag: string): string | undefined => create[create.indexOf(flag) + 1];
    assert.equal(valueAfter('--network'), 'none');
    assert.equal(valueAfter('--user'), '65534:65534');
    assert.equal(valueAfter('--cap-drop'), 'ALL');
    assert.equal(valueAfter('--security-opt'), 'no-new-privileges');
    // Bounded CPU, memory, processes and time.
    assert.ok(create.includes('--pids-limit'));
    assert.ok(create.includes('--memory'));
    assert.ok(create.includes('--cpus'));
    assert.ok(
      runner.calls.some((call) => call.argv[1] === 'start' && call.timeoutMs > 0),
      'the run itself is time-bounded',
    );

    // No bind mount at all: not the source, not the host home, not a socket.
    assert.ok(!create.some((value) => value === '-v' || value === '--volume' || value === '--mount'));
    assert.ok(!create.some((value) => value.includes('docker.sock')));
    const home = process.env.HOME;
    if (home !== undefined) assert.ok(!create.some((value) => value.includes(home)));
    assert.ok(!create.includes('--privileged'));

    // The snapshot arrives by copy into container-local storage.
    const copy = runner.argvs().find((argv) => argv[1] === 'cp');
    assert.ok(copy);
    assert.match(copy[2] ?? '', /\/files\/\.$/);
    assert.equal(copy[3], 'container-1:/ambicode/work');

    // Writes inside that workspace are reported and then thrown away.
    assert.match(result.mutations.join('\n'), /inside the disposable container workspace/);
    assert.match(result.limitations.join('\n'), /discarded and are not part of the reviewed revision/);
    assert.ok(runner.argvs().some((argv) => argv[1] === 'rm' && argv.includes('--force')));
  });

  it('removes the container even when the command times out', async (t) => {
    const runner = new FakeProcessRunner()
      .stubArgv(['docker', 'image', 'inspect'], { stdout: 'sha256:abc\n' })
      .stubArgv(['docker', 'create'], { stdout: 'container-2\n' })
      .stubArgv(['docker', 'cp'], {})
      .stubArgv(['docker', 'start'], { kind: 'timed-out' })
      .stubArgv(['docker', 'diff'], { exitCode: 1 })
      .stubArgv(['docker', 'rm'], {});

    const outcome = await run(t, runner, PINNED);
    assert.equal(outcome.results[0]?.status, 'timed-out');
    assert.ok(runner.argvs().some((argv) => argv[1] === 'rm' && argv.includes('container-2')));
  });

  it('refuses a selector that would execute merge request code to choose tests', async (t) => {
    const runner = new FakeProcessRunner().stubArgv(['docker', 'image', 'inspect'], { stdout: 'sha256:abc\n' });
    const directory = await sandbox(t);
    const withRelated: ProjectConfig = {
      ...project,
      commands: { ...project.commands, unit: { argv: ['./node_modules/.bin/vitest', 'run', '{files}'] } },
      checks: { unit: { command: 'unit', adapter: 'vitest', selector: { kind: 'related' } } },
    };

    const outcome = await runRemoteChecks({
      fs: nodeFileSystem,
      config: { ...configWith(PINNED), projects: [withRelated] },
      runner,
      clock: systemClock,
      projects: [
        {
          project: withRelated,
          policy: allowing('unit'),
          changed,
        },
      ],
      snapshotFilesDirectory: path.join(directory, 'files'),
      reviewDirectory: directory,
      approvals: new Set(),
    });

    const [result] = outcome.results;
    assert.ok(result);
    assert.equal(result.status, 'skipped');
    assert.equal(result.selectionComplete, false);
    assert.match(result.limitations.join('\n'), /by executing project code, which AMBICODE will not do/);
    assert.ok(!runner.argvs().some((argv) => argv.join(' ').includes('vitest')));
  });
});
