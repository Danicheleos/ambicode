import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeProcessRunner } from './node-process-runner.ts';

const request = (script: string, timeoutMs = 10_000) => ({ argv: [process.execPath, '-e', script], cwd: process.cwd(), timeoutMs, maxOutputBytes: 4096, env: { kind: 'inherited' as const }, detached: true });

describe('a detached start', () => {
  it('returns at the first stdout line while the child keeps running, then lets go of it', async () => {
    const started = Date.now();
    const outcome = await new NodeProcessRunner().run(request("console.log('first'); setTimeout(() => {}, 1500)"));
    assert.deepEqual([outcome.kind, outcome.exitCode, outcome.stdout], ['exited', 0, 'first']);
    assert.ok(Date.now() - started < 1400, 'did not wait for the child to exit');
  });

  it('reports a child that exits before printing, and kills one that never prints', async () => {
    const failed = await new NodeProcessRunner().run(request("console.error('boom'); process.exit(3)"));
    assert.deepEqual([failed.kind, failed.exitCode, failed.stderr.trim()], ['exited', 3, 'boom']);
    const silent = await new NodeProcessRunner().run(request('setTimeout(() => {}, 30000)', 300));
    assert.equal(silent.kind, 'timed-out');
  });
});
