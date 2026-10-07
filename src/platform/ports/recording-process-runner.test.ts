import assert from 'node:assert/strict';
import test from 'node:test';
import { RecordingProcessRunner, taggedRunner } from './recording-process-runner.ts';
import type { ProcessOutcome, ProcessRequest } from '#types/platform/ports';

const outcome = (over: Partial<ProcessOutcome> = {}): ProcessOutcome => ({ kind: 'exited', exitCode: 0, stdout: 'ab', stderr: 'c', truncated: false, durationMs: 7, failure: null, ...over });
const request = (over: Partial<ProcessRequest> = {}): ProcessRequest => ({ argv: ['npm', 'test'], cwd: '.', timeoutMs: 1, maxOutputBytes: 1, env: { kind: 'inherited' }, ...over });

test('records only runs that name a purpose, redacted and sized', async () => {
  const runner = new RecordingProcessRunner({ run: async () => outcome({ exitCode: 1 }) });
  await runner.run(request());
  await runner.run(request({ argv: ['x', '--token', 'sekret'], purpose: 'check' }));
  assert.equal(runner.records.length, 1);
  assert.deepEqual(runner.records[0], { argv: ['x --token [redacted]'], type: 'check', exit: 1, ms: 7, outBytes: 3 });
});

test('a tagged runner adds a purpose without replacing one', async () => {
  const runner = new RecordingProcessRunner({ run: async () => outcome() });
  await taggedRunner(runner, 'baseline').run(request());
  await taggedRunner(runner, 'baseline').run(request({ purpose: 'index' }));
  assert.deepEqual(runner.records.map((record) => record.type), ['baseline', 'index']);
});
