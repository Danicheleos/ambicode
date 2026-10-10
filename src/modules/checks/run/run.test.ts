import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResolvedPolicy } from '#types/modules/policy';
import type { ProjectConfig } from '#types/modules/config';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { runOne, shellArgv, shellQuote } from './run.ts';
import { commandFor } from './check-command.ts';

const project = { id: 'web', root: 'apps/web', paths: [], ecosystem: { languages: [], frameworks: [], packageManager: null }, include: [], exclude: [], rules: [], packs: [], policyFiles: [], commands: {}, checks: {} } as ProjectConfig;
const clock = { now: () => new Date(0), elapsed: () => 0 };

const policy = (action: 'run' | 'propose' | 'forbid', reason?: string): ResolvedPolicy => ({
  activity: 'task', projectId: 'web', packs: [], rules: [], prompts: [], diagnostics: [],
  commandDecisions: [{ command: 'unit', action, sources: [{ packId: 't', packReference: 't', action, ...(reason === undefined ? {} : { reason }) }] }],
});

const run = (runner: FakeProcessRunner, command = 'jest', resolved: ResolvedPolicy = policy('run')) =>
  runOne({ runner, clock, repositoryRoot: '/repo', project, policy: resolved, commandId: 'unit', key: 'web/unit', command, timeoutSeconds: 60 });

describe('runOne', () => {
  it('hands the whole command string to the shell, in the project root, under the timeout', async () => {
    const runner = new FakeProcessRunner();
    await run(runner, 'pnpm vitest run && echo done');
    assert.deepEqual(runner.argvs(), [shellArgv('pnpm vitest run && echo done')]);
    assert.equal(runner.calls[0]!.cwd, '/repo/apps/web');
    assert.equal(runner.calls[0]!.timeoutMs, 60_000);
  });

  it('keeps passed, failed, timed-out and error distinct', async () => {
    const outcome = async (stub: Parameters<FakeProcessRunner['stub']>[1]) => run(new FakeProcessRunner().stub(() => true, stub));
    assert.equal((await outcome({ exitCode: 0 })).status, 'passed');
    const failed = await outcome({ exitCode: 1, stdout: 'problem' });
    assert.deepEqual([failed.status, failed.exitCode], ['failed', 1]);
    assert.match(failed.output, /--- stdout ---\nproblem/);
    const timedOut = await outcome({ kind: 'timed-out', stdout: ' Tests  1 failed | 14 passed (15)\n' });
    assert.deepEqual([timedOut.status, timedOut.exitCode], ['timed-out', null]);
    const broken = await outcome({ kind: 'spawn-failed', failure: 'EACCES permission denied' });
    assert.deepEqual([broken.status, broken.exitCode], ['error', null]);
    assert.match(broken.detail ?? '', /could not be started/);
  });
});

describe('runOne authorization', () => {
  it('never reaches the process runner for a forbidden command, and names the reason', async () => {
    const runner = new FakeProcessRunner();
    const result = await run(runner, 'jest', policy('forbid', 'Tests are owned by CI here.'));
    assert.equal(result.status, 'skipped');
    assert.match(result.detail ?? '', /owned by CI here/);
    assert.deepEqual(runner.argvs(), []);
  });

  it('runs a proposed command, because the caller consented under the key', async () => {
    const runner = new FakeProcessRunner();
    assert.equal((await run(runner, 'jest', policy('propose'))).status, 'passed');
    assert.equal(runner.calls.length, 1);
  });
});

describe('commandFor', () => {
  it('substitutes {file} with each file quoted, so a name with a space or $ stays one argument', () => {
    assert.equal(commandFor('jest {file}', ['src/a b.ts', "src/it's.ts"]), `jest ${shellQuote('src/a b.ts')} ${shellQuote("src/it's.ts")}`);
    assert.equal(commandFor('jest', []), 'jest');
  });
});
