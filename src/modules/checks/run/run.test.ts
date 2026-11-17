import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import type { ProjectConfig } from '#types/modules/config';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { runOne, shellArgv, shellQuote } from './run.ts';
import { commandFor } from './check-command.ts';

const project = { id: 'web', root: 'apps/web', paths: [], ecosystem: { languages: [], frameworks: [], packageManager: null }, include: [], exclude: [], ignored: [], packs: [], policyFiles: [], commands: {}, checks: {} } as ProjectConfig;
const clock = { now: () => new Date(0), elapsed: () => 0 };

const run = (runner: FakeProcessRunner, command = 'jest') =>
  runOne({ runner, clock, repositoryRoot: '/repo', project, command, timeoutSeconds: 60 });

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

  it('keeps the verdict line at the end of a 300 KB output', async () => {
    const command = `node -e "process.stdout.write('x'.repeat(300000) + '\\nVERDICT-TAIL 3 failed')"`;
    const result = await runOne({ runner: new NodeProcessRunner(), clock, repositoryRoot: tmpdir(), project: { ...project, root: '.' }, command, timeoutSeconds: 60 });
    assert.deepEqual([result.status, result.exitCode], ['passed', 0]);
    assert.match(result.output, /VERDICT-TAIL 3 failed/);
  });
});

describe('shell quoting per platform', () => {
  it('on POSIX the shell is `sh -c` with the command unwrapped and files in single quotes', (t) => {
    if (process.platform === 'win32') return t.skip('the Windows form is covered by the next test');
    assert.deepEqual(shellArgv('jest a && b'), ['sh', '-c', 'jest a && b']);
    assert.equal(shellQuote("src/it's.ts"), `'src/it'\\''s.ts'`);
  });

  it('on Windows a quoted file reaches the program as the bare name, with no extra quotes', async (t) => {
    if (process.platform !== 'win32') return t.skip('Windows cmd only');
    const command = `node -e "console.log(JSON.stringify(process.argv.slice(1)))" ${shellQuote('src/a b.ts')}`;
    const result = await runOne({ runner: new NodeProcessRunner(), clock, repositoryRoot: tmpdir(), project: { ...project, root: '.' }, command, timeoutSeconds: 60 });
    assert.equal(result.status, 'passed');
    assert.match(result.output, /--- stdout ---\n\["src\/a b\.ts"\]\r?\n/);
  });
});

describe('commandFor', () => {
  it('substitutes {file} with each file quoted, so a name with a space or $ stays one argument', () => {
    assert.equal(commandFor('jest {file}', ['src/a b.ts', "src/it's.ts"]), `jest ${shellQuote('src/a b.ts')} ${shellQuote("src/it's.ts")}`);
    assert.equal(commandFor('jest', []), 'jest');
  });
});
