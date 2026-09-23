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

describe('a request carrying a body declares its media type', () => {
  it('sends Content-Type: application/json with --input (publish 415)', () => {
    // Measured against glab 1.119.0 and gitlab.com: `glab api --input -` sets
    // no Content-Type of its own, and GitLab answers
    //   HTTP 415 {"error":"The provided content-type '' is not supported."}
    // before it looks at the merge request at all. Every publish failed this
    // way, reported only as "failed with exit code 1". With the header the
    // same request reaches GitLab and is answered on its merits.
    const argv = new GitLabApi({
      runner: new FakeProcessRunner(),
      host: 'gitlab.example.com',
      cwd: '/work',
    }).argvFor({ path: 'projects/1/merge_requests/2/discussions', method: 'POST', body: { body: 'x' } });

    const at = argv.indexOf('--header');
    assert.notEqual(at, -1, `no --header in ${JSON.stringify(argv)}`);
    assert.equal(argv[at + 1], 'Content-Type: application/json');
    assert.ok(argv.includes('--input'), 'the body still goes over stdin');
  });

  it('does not declare a media type when there is no body', () => {
    const argv = new GitLabApi({
      runner: new FakeProcessRunner(),
      host: 'gitlab.example.com',
      cwd: '/work',
    }).argvFor({ path: 'projects/1/merge_requests/2/discussions' });
    assert.ok(!argv.includes('--header'), `a GET must not claim a body: ${JSON.stringify(argv)}`);
  });
});

describe('a failed request carries its diagnostic where the operator will see it', () => {
  it('puts glab stderr in the message, not only in the details', async () => {
    const runner = new FakeProcessRunner();
    runner.stub(() => true, { exitCode: 1, stderr: 'glab: HTTP 415\n' });
    const result = await api(runner).request({ path: 'x', method: 'POST', body: {} }, SCHEMA);
    assert.equal(result.kind, 'failed');
    if (result.kind !== 'failed') return;
    // A publication outcome records `message` and drops `details`, so a
    // diagnostic that lives only in `details` is a diagnostic nobody reads.
    assert.match(result.message, /HTTP 415/);
  });
});
