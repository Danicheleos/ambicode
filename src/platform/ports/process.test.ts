import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { NodeProcessRunner } from './node-process-runner.ts';
import type { ProcessOutcome } from '#types/platform/ports';

const runner = new NodeProcessRunner();

async function node(script: string, maxOutputBytes = 1024, timeoutMs = 10_000): Promise<ProcessOutcome> {
  return await runner.run({
    argv: [process.execPath, '-e', script],
    cwd: process.cwd(),
    timeoutMs,
    maxOutputBytes,
    env: { kind: 'inherited' },
  });
}

describe('U29 process runner', () => {
  it('counts the ceiling in bytes, not in UTF-16 code units', async () => {
    const outcome = await node('process.stdout.write("é".repeat(10))', 10);
    assert.equal(Buffer.byteLength(outcome.stdout, 'utf8'), 10);
    assert.equal(outcome.stdout, 'é'.repeat(5));
    assert.equal(outcome.truncated, true);
  });

  it('keeps a multibyte character that arrives split across two chunks', async () => {
    const outcome = await node(
      'const b = Buffer.from("héllo");' +
        'process.stdout.write(b.subarray(0, 2));' +
        'setTimeout(() => process.stdout.write(b.subarray(2)), 20);',
      1024,
    );
    assert.equal(outcome.stdout, 'héllo');
    assert.equal(outcome.truncated, false);
  });

  it('applies one combined ceiling across stdout and stderr', async () => {
    const outcome = await node('process.stderr.write("abc"); process.stdout.write("defgh")', 4);
    assert.equal(
      Buffer.byteLength(outcome.stdout, 'utf8') + Buffer.byteLength(outcome.stderr, 'utf8'),
      4,
    );
    assert.equal(outcome.truncated, true);
  });

  it('keeps exit, timeout and spawn failure distinct', async () => {
    const exited = await node('process.stdout.write("x"); process.exit(3)');
    assert.equal(exited.kind, 'exited');
    assert.equal(exited.exitCode, 3);
    assert.equal(exited.stdout, 'x');
    assert.equal(exited.failure, null);

    const timedOut = await node('setTimeout(() => {}, 30000)', 1024, 300);
    assert.equal(timedOut.kind, 'timed-out');
    assert.equal(timedOut.exitCode, null);

    const spawnFailed = await runner.run({
      argv: ['ambicode-no-such-executable'],
      cwd: process.cwd(),
      timeoutMs: 5_000,
      maxOutputBytes: 1024,
      env: { kind: 'inherited' },
    });
    assert.equal(spawnFailed.kind, 'spawn-failed');
    assert.match(spawnFailed.failure ?? '', /ENOENT/);
  });

  describe('a command that never starts is spawn-failed on every platform', () => {
    async function attempt(argv: readonly string[], cwd = process.cwd()): Promise<ProcessOutcome> {
      return await runner.run({ argv, cwd, timeoutMs: 10_000, maxOutputBytes: 1024, env: { kind: 'inherited' } });
    }

    it('a command that is not installed', async () => {
      const outcome = await attempt(['ambicode-no-such-executable']);
      assert.equal(outcome.kind, 'spawn-failed');
      assert.match(outcome.failure ?? '', /ENOENT/);
      assert.equal(outcome.exitCode, null);
    });

    it('a command given as a path that does not exist', async () => {
      const missing = path.join(os.tmpdir(), 'ambicode-no-such-directory', 'linter.exe');
      const outcome = await attempt([missing]);
      assert.equal(outcome.kind, 'spawn-failed');
      assert.equal(outcome.exitCode, null);
      assert.notEqual(outcome.failure, null);
    });

    it('a cwd that does not exist', async () => {
      const outcome = await attempt([process.execPath, '-e', ''], path.join(os.tmpdir(), 'ambicode-no-such-cwd'));
      assert.equal(outcome.kind, 'spawn-failed');
      assert.equal(outcome.exitCode, null);
      assert.notEqual(outcome.failure, null);
    });

    it('a path that exists but cannot be executed', async () => {
      // A directory is the one "exists but not runnable" case that behaves alike everywhere: Windows
      // decides executability by extension, not by a mode bit.
      const outcome = await attempt([os.tmpdir()]);
      assert.equal(outcome.kind, 'spawn-failed');
      assert.equal(outcome.exitCode, null);
      assert.notEqual(outcome.failure, null);
    });

    it('still reports a command that did run and failed as exited, not spawn-failed', async () => {
      // On Windows exit 1 is byte-for-byte what cmd.exe returns for an unknown command; it must stay `exited`.
      const outcome = await attempt([process.execPath, '-e', 'process.exit(1)']);
      assert.equal(outcome.kind, 'exited');
      assert.equal(outcome.exitCode, 1);
      assert.equal(outcome.failure, null);
    });

    it('resolves a command that is installed, rather than rejecting it', async () => {
      assert.equal((await attempt([process.execPath, '-e', 'process.exit(0)'])).kind, 'exited');
      assert.equal((await attempt(['node', '-e', 'process.exit(0)'])).kind, 'exited');
    });
  });

  it('reports truncation separately from the exit status', async () => {
    const outcome = await node('process.stdout.write("0123456789"); process.exit(0)', 4);
    assert.equal(outcome.kind, 'exited');
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.stdout, '0123');
    assert.equal(outcome.truncated, true);
  });

  it('writes stdin and reads the answer back', async () => {
    const outcome = await runner.run({
      argv: [process.execPath, '-e', 'process.stdin.pipe(process.stdout)'],
      cwd: process.cwd(),
      timeoutMs: 10_000,
      maxOutputBytes: 1024,
      env: { kind: 'inherited' },
      stdin: 'a requirement URL, over stdin',
    });
    assert.equal(outcome.stdout, 'a requirement URL, over stdin');
  });

  it('merges narrow overrides onto the injected base environment', async () => {
    const scoped = new NodeProcessRunner({ AMBICODE_BASE: 'base' });
    const outcome = await scoped.run({
      argv: [process.execPath, '-e', 'process.stdout.write(`${process.env.AMBICODE_BASE}:${process.env.LC_ALL}`)'],
      cwd: process.cwd(),
      timeoutMs: 10_000,
      maxOutputBytes: 1024,
      env: { kind: 'inherited', overrides: { LC_ALL: 'C' } },
    });
    assert.equal(outcome.stdout, 'base:C');
  });
});

describe('U29 a timeout kills the whole process tree', () => {
  let directory = '';
  before(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'ambicode-tree-'));
  });
  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns promptly when the command leaves a running grandchild (F1)', { timeout: 30_000 }, async (t) => {
    if (process.platform !== 'win32') {
      t.skip('Unix kills the process group already; this is the Windows shim case');
      return;
    }

    const child = path.join(directory, 'child.mjs');
    await writeFile(child, 'console.log("started"); setInterval(() => {}, 1000);', 'utf8');
    const shim = path.join(directory, 'wrapper.cmd');
    await writeFile(shim, `@echo off\r\nnode "${child}"\r\n`, 'utf8');

    const started = performance.now();
    const outcome = await runner.run({
      argv: [shim],
      cwd: directory,
      timeoutMs: 1_000,
      maxOutputBytes: 1024,
      env: { kind: 'inherited' },
    });
    const elapsed = performance.now() - started;

    assert.equal(outcome.kind, 'timed-out');
    assert.equal(outcome.exitCode, null);
    assert.ok(
      elapsed < 15_000,
      `waited ${Math.round(elapsed)}ms for a 1,000ms timeout; the grandchild is still holding it open`,
    );
    assert.match(outcome.stdout, /started/);
  });

  describe('a command that exits and leaves a grandchild holding the pipes', () => {
    async function launcher(request: { timeoutMs: number }): Promise<{
      outcome: ProcessOutcome;
      elapsed: number;
    }> {
      const child = path.join(directory, 'lingering.mjs');
      await writeFile(child, 'setTimeout(() => {}, 2500);', 'utf8');
      // `start /b` and `&` both return before the child does, and both hand it
      // the parent's stdio.
      const argv =
        process.platform === 'win32'
          ? ['cmd', '/c', 'start', '', '/b', process.execPath, child]
          : ['sh', '-c', `"${process.execPath}" "${child}" &`];
      const started = performance.now();
      const outcome = await runner.run({
        argv,
        // Not `directory`: the grandchild outlives the test and a Windows
        // process holds its cwd, which would make `after`'s rm fail with EBUSY.
        cwd: os.tmpdir(),
        maxOutputBytes: 1024,
        env: { kind: 'inherited' },
        ...request,
      });
      return { outcome, elapsed: performance.now() - started };
    }

    it('reaches the deadline when output is captured (the defect)', { timeout: 30_000 }, async () => {
      const { outcome } = await launcher({ timeoutMs: 1_000 });
      assert.equal(outcome.kind, 'timed-out');
    });
  });
});
