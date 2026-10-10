import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CommandSpec, ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { runOne } from './run.ts';

const policy = (action: 'run' | 'propose' | 'forbid', reason?: string): ResolvedPolicy => ({
  activity: 'task', projectId: 'web', packs: [], rules: [], prompts: [], diagnostics: [],
  commandDecisions: [{ command: 'unit', action, sources: [{ packId: 't', packReference: 't', action, ...(reason === undefined ? {} : { reason }) }] }],
});
const project = { id: 'web', root: '.', ecosystem: 'typescript', packs: [], policyFiles: [], commands: {}, checks: {} } as ProjectConfig;
const clock = { now: () => new Date(0), elapsed: () => 0 };

const run = (runner: FakeProcessRunner, command: CommandSpec | null | undefined, extra: { policy?: ResolvedPolicy; files?: string[] } = {}) =>
  runOne({ runner, clock, repositoryRoot: '/repo', project, policy: extra.policy ?? policy('run'), commandId: 'unit', key: 'web/unit', command, files: extra.files ?? ['src/a.spec.ts'], timeoutSeconds: 60 });

describe('runOne', () => {
  it('passes each file to the command as its own argument, unquoted', async () => {
    const runner = new FakeProcessRunner();
    await run(runner, { argv: ['jest', '--', '{files}'] }, { files: ['src/with space.ts', 'src/--option-like.ts'] });
    assert.deepEqual(runner.argvs(), [['jest', '--', 'src/with space.ts', 'src/--option-like.ts']]);
  });

  it('keeps passed, failed, timed-out, skipped and error distinct', async () => {
    const outcome = async (stub: Parameters<FakeProcessRunner['stub']>[1]) => run(new FakeProcessRunner().stub(() => true, stub), { argv: ['jest', '{files}'] });
    assert.equal((await outcome({ exitCode: 0 })).status, 'passed');
    const failed = await outcome({ exitCode: 1, stdout: 'problem' });
    assert.deepEqual([failed.status, failed.exitCode], ['failed', 1]);
    assert.match(failed.output, /--- stdout ---\nproblem/);
    const timedOut = await outcome({ kind: 'timed-out', stdout: ' Tests  1 failed | 14 passed (15)\n' });
    assert.deepEqual([timedOut.status, timedOut.exitCode], ['timed-out', null]);
    const missing = await outcome({ kind: 'spawn-failed', failure: 'spawn jest ENOENT' });
    assert.equal(missing.status, 'skipped');
    assert.match(missing.detail ?? '', /was not found/);
    assert.equal((await outcome({ kind: 'spawn-failed', failure: 'EACCES permission denied' })).status, 'error');
  });

  it('never reaches the process runner for a forbidden command, and names the reason', async () => {
    const runner = new FakeProcessRunner();
    const result = await run(runner, { argv: ['jest'] }, { policy: policy('forbid', 'Tests are owned by CI here.') });
    assert.equal(result.status, 'skipped');
    assert.match(result.detail ?? '', /owned by CI here/);
    assert.deepEqual(runner.argvs(), []);
  });

  it('runs a proposed command, because the caller consented under the key', async () => {
    const runner = new FakeProcessRunner();
    assert.equal((await run(runner, { argv: ['jest'] }, { policy: policy('propose') })).status, 'passed');
    assert.equal(runner.calls.length, 1);
  });

  it('an undeclared command and a null command are distinct skipped outcomes', async () => {
    const runner = new FakeProcessRunner();
    assert.match((await run(runner, undefined)).detail ?? '', /does not declare/);
    assert.match((await run(runner, null)).detail ?? '', /configured as null/);
    assert.deepEqual(runner.argvs(), []);
  });
});
