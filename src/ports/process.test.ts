import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { CombinedCapture, NodeProcessRunner, decodeCompleteUtf8, windowsCommandExists } from './node-process-runner.ts';
import type { ProcessOutcome } from './process.ts';

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
    // Ten characters, twenty bytes. A ten-unit ceiling would retain all of them.
    const outcome = await node('process.stdout.write("é".repeat(10))', 10);
    assert.equal(Buffer.byteLength(outcome.stdout, 'utf8'), 10);
    assert.equal(outcome.stdout, 'é'.repeat(5));
    assert.equal(outcome.truncated, true);
  });

  it('never returns a broken character created by truncation alone', async () => {
    // The ceiling falls in the middle of the third two-byte character.
    const outcome = await node('process.stdout.write("é".repeat(10))', 5);
    assert.equal(outcome.stdout, 'éé');
    assert.ok(!outcome.stdout.includes('�'));
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

  /**
   * `kind` is what tells "the tool is not installed" apart from "the tool ran
   * and failed", and D06 turns only the first into a notice and a skipped
   * result. Every case below asserts the same thing on Linux, Windows and
   * macOS: on Windows the missing-command case used to arrive as a plain
   * `exited` with code 1, so an uninstalled linter was reported to the user as
   * a failing lint check (R1 defect 2).
   */
  describe('a command that never starts is spawn-failed on every platform', () => {
    async function attempt(argv: readonly string[], cwd = process.cwd()): Promise<ProcessOutcome> {
      return await runner.run({ argv, cwd, timeoutMs: 10_000, maxOutputBytes: 1024, env: { kind: 'inherited' } });
    }

    it('a command that is not installed', async () => {
      const outcome = await attempt(['ambicode-no-such-executable']);
      assert.equal(outcome.kind, 'spawn-failed');
      assert.match(outcome.failure ?? '', /ENOENT/);
      // Never an exit code: an uninstalled tool did not run, so it cannot have
      // "failed" — the distinction the whole check exists to preserve.
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
      // A directory is the one "exists but is not runnable" case that behaves
      // the same way everywhere: POSIX rejects it with EACCES at exec time,
      // and on Windows it resolves to something that is not a file. A
      // permission-denied *file* has no Windows equivalent — executability
      // there is decided by extension, not by a mode bit.
      const outcome = await attempt([os.tmpdir()]);
      assert.equal(outcome.kind, 'spawn-failed');
      assert.equal(outcome.exitCode, null);
      assert.notEqual(outcome.failure, null);
    });

    it('still reports a command that did run and failed as exited, not spawn-failed', async () => {
      // The other half of the distinction: exit 1 is the most common "ran and
      // found problems" code, and on Windows it is byte-for-byte what cmd.exe
      // returns for a command it could not find. This must stay `exited`.
      const outcome = await attempt([process.execPath, '-e', 'process.exit(1)']);
      assert.equal(outcome.kind, 'exited');
      assert.equal(outcome.exitCode, 1);
      assert.equal(outcome.failure, null);
    });

    it('resolves a command that is installed, rather than rejecting it', async () => {
      // The pre-flight resolution must not turn a real tool into a false
      // "not installed": the interpreter running this test is found by
      // absolute path, and `node` by a bare name through PATH.
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

  it('retains chunks in arrival order and cuts on a byte boundary', () => {
    const capture = new CombinedCapture(5);
    capture.push('stdout', Buffer.from('ab'));
    capture.push('stderr', Buffer.from('XY'));
    capture.push('stdout', Buffer.from('cdef'));
    const decoded = capture.decode();
    assert.equal(decoded.stdout, 'abc');
    assert.equal(decoded.stderr, 'XY');
    assert.equal(decoded.truncated, true);
  });

  it('decodes only whole UTF-8 sequences', () => {
    const four = Buffer.from('😀'); // one four-byte sequence
    assert.equal(decodeCompleteUtf8(four), '😀');
    assert.equal(decodeCompleteUtf8(four.subarray(0, 3)), '');
    assert.equal(decodeCompleteUtf8(Buffer.concat([Buffer.from('ok'), four.subarray(0, 2)])), 'ok');
  });
});

/**
 * The Windows pre-flight resolution in isolation (R1 defect 2). It takes its
 * environment and cwd as arguments and separates both `PATH` and `PATHEXT`
 * with `;` exactly as Windows does, so these run and mean the same thing on
 * every platform in the matrix — the behavior they pin down is only *used* on
 * Windows, but it is not only *checked* there.
 */
describe('U29 Windows command resolution', () => {
  let directory = '';

  before(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'ambicode-resolve-'));
    await writeFile(path.join(directory, 'linter.EXE'), '');
    await writeFile(path.join(directory, 'plain'), '');
    await mkdir(path.join(directory, 'a-directory'));
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const env = (overrides: Record<string, string> = {}): Record<string, string> => ({
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    ...overrides,
  });

  it('finds a bare name through PATH by appending a PATHEXT extension', () => {
    assert.equal(windowsCommandExists('linter', env({ PATH: directory }), os.tmpdir()), true);
  });

  it('finds a bare name whose file has no extension at all', () => {
    // Wider than Execa on purpose: a resolution this function refuses is one
    // Execa could not have made either, so it may never be the narrower of
    // the two.
    assert.equal(windowsCommandExists('plain', env({ PATH: directory }), os.tmpdir()), true);
  });

  it('reports a name that is on no PATH entry as missing', () => {
    assert.equal(windowsCommandExists('linter', env({ PATH: os.tmpdir() }), os.tmpdir()), false);
  });

  it('searches the current directory ahead of PATH', () => {
    assert.equal(windowsCommandExists('linter', env({ PATH: '' }), directory), true);
  });

  it('resolves a command carrying a path separator instead of searching PATH', () => {
    assert.equal(windowsCommandExists(path.join(directory, 'linter.EXE'), env(), os.tmpdir()), true);
    // On PATH, but given as a path relative to a cwd it is not under.
    assert.equal(windowsCommandExists('./linter', env({ PATH: directory }), os.tmpdir()), false);
  });

  it('never resolves a directory to a command', () => {
    assert.equal(windowsCommandExists('a-directory', env({ PATH: directory }), os.tmpdir()), false);
  });

  it('skips an empty PATH entry rather than reading it as the current directory', () => {
    // `directory` holds `linter.EXE`; reaching it through an empty entry would
    // mean an attacker-planted file in the cwd wins a PATH lookup.
    assert.equal(windowsCommandExists('linter', env({ PATH: ';;' }), os.tmpdir()), false);
  });

  it('unquotes a quoted PATH entry, as Windows allows', () => {
    assert.equal(windowsCommandExists('linter', env({ PATH: `"${directory}"` }), os.tmpdir()), true);
  });

  it('reads PATH and PATHEXT case-insensitively, as Windows names them', () => {
    // A child can be handed `Path` rather than `PATH`.
    assert.equal(windowsCommandExists('linter', { Path: directory, PathExt: '.EXE' }, os.tmpdir()), true);
  });

  it('falls back to the default PATHEXT when the environment sets an empty one', () => {
    assert.equal(windowsCommandExists('linter', { PATH: directory, PATHEXT: '' }, os.tmpdir()), true);
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

  // An explicit timeout: without the fix this test does not fail, it hangs, and
  // a gate that hangs is worse than one that goes red.
  it('returns promptly when the command leaves a running grandchild (F1)', { timeout: 30_000 }, async (t) => {
    if (process.platform !== 'win32') {
      t.skip('Unix kills the process group already; this is the Windows shim case');
      return;
    }

    // Measured before this fix: a vitest.cmd shim whose node child held a timer
    // ran 30,076ms against a 5s ceiling, and an unbounded one never returned at
    // all — `ambicode bundle` was still waiting 18 minutes later, because the
    // grandchild kept the inherited stdout and stderr pipes open.
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
    // Whatever the command managed to say is still evidence.
    assert.match(outcome.stdout, /started/);
  });
});
