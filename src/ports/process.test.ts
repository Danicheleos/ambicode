import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CombinedCapture, NodeProcessRunner, decodeCompleteUtf8 } from './node-process-runner.ts';
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
