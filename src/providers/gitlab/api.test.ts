import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { FakeProcessRunner } from '../../testing/fake-process-runner.ts';
import { GitLabApi } from './api.ts';

/**
 * Delivery certainty (doc 03 P1.7 correction A). `GitLabApi.request` is the one
 * place that turns a process outcome into a structured `certainty`, and
 * `classifyWriteFailure` (publish.test.ts) trusts that field rather than
 * matching on `message` text. These tests prove every branch sets the field
 * that doc 03 requires, not a string a human diagnostic happens to contain.
 */

const SCHEMA = z.object({ ok: z.boolean() });

function api(runner: FakeProcessRunner): GitLabApi {
  return new GitLabApi({ runner, host: 'gitlab.example.com', cwd: '/work' });
}

describe('P1.7 correction A: GitLab write delivery certainty', () => {
  it('is before-send only when the process never started', async () => {
    const runner = new FakeProcessRunner();
    runner.stub(() => true, { kind: 'spawn-failed', failure: 'ENOENT' });
    const result = await api(runner).request({ path: 'x', method: 'POST', body: {} }, SCHEMA);
    assert.equal(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert.equal(result.certainty, 'before-send');
  });

  it('is uncertain for a nonzero exit after the process started', async () => {
    const runner = new FakeProcessRunner();
    runner.stub(() => true, { exitCode: 1, stderr: '{"message":"Bad Request"}' });
    const result = await api(runner).request({ path: 'x', method: 'POST', body: {} }, SCHEMA);
    assert.equal(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    // The message is diagnostic prose; it must not be classified by matching
    // it, and it deliberately still contains a plausible-looking "exit code"
    // phrase.
    assert.match(result.message, /failed with exit code/);
    assert.equal(result.certainty, 'uncertain');
  });

  it('is uncertain for a timeout', async () => {
    const runner = new FakeProcessRunner();
    runner.stub(() => true, { kind: 'timed-out' });
    const result = await api(runner).request({ path: 'x', method: 'POST', body: {} }, SCHEMA);
    assert.equal(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert.equal(result.certainty, 'uncertain');
  });

  it('is uncertain for a truncated response', async () => {
    const runner = new FakeProcessRunner();
    runner.stub(() => true, { truncated: true, stdout: '{"ok":true' });
    const result = await api(runner).request({ path: 'x', method: 'POST', body: {} }, SCHEMA);
    assert.equal(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert.equal(result.certainty, 'uncertain');
  });

  it('is uncertain for a response that is not JSON', async () => {
    const runner = new FakeProcessRunner();
    runner.stub(() => true, { stdout: 'not json' });
    const result = await api(runner).request({ path: 'x', method: 'POST', body: {} }, SCHEMA);
    assert.equal(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert.equal(result.certainty, 'uncertain');
  });

  it('is uncertain for a response that fails schema validation', async () => {
    const runner = new FakeProcessRunner();
    runner.stub(() => true, { stdout: '{"ok":"not-a-boolean"}' });
    const result = await api(runner).request({ path: 'x', method: 'POST', body: {} }, SCHEMA);
    assert.equal(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert.equal(result.certainty, 'uncertain');
  });

  it('a paginated collect propagates the certainty of the page that failed', async () => {
    const runner = new FakeProcessRunner();
    runner.stub(() => true, { kind: 'spawn-failed', failure: 'ENOENT' });
    const result = await api(runner).collect({ path: 'x' }, SCHEMA);
    assert.equal(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    assert.equal(result.certainty, 'before-send');
  });
});
