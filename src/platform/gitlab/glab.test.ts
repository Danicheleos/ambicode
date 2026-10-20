import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { comment, fetchMr, parseMrUrl } from './glab.ts';

const URL_MR = 'https://git.example.org/team/sub/app/-/merge_requests/12';
const REFS = { base_sha: 'b'.repeat(40), start_sha: 's'.repeat(40), head_sha: 'h'.repeat(40) };
const MR_JSON = JSON.stringify({ title: 'T', description: 'D', diff_refs: REFS });
const DIFF = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n';

describe('parseMrUrl', () => {
  it('reads host, nested project path and iid from a self-hosted URL', () => {
    assert.deepEqual(parseMrUrl(URL_MR), { scheme: 'https', host: 'git.example.org', port: null, project: 'team/sub/app', iid: '12' });
    assert.deepEqual(parseMrUrl('https://gitlab.com/g/p/-/merge_requests/7/diffs'), { scheme: 'https', host: 'gitlab.com', port: null, project: 'g/p', iid: '7' });
    assert.deepEqual(parseMrUrl('http://git.corp:8443/g/p/-/merge_requests/3'), { scheme: 'http', host: 'git.corp', port: '8443', project: 'g/p', iid: '3' });
  });
  it('refuses anything that is not a merge-request URL', () => {
    assert.throws(() => parseMrUrl('https://gitlab.com/g/p/-/issues/7'), { code: 'mr-fetch-failed' });
  });
});

describe('glab adapter', () => {
  it('fetchMr reads the raw diff and the MR record with args arrays', async () => {
    const runner = new FakeProcessRunner().stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stubArgv(['glab', 'api'], { stdout: MR_JSON });
    const mr = await fetchMr(runner, '/repo', URL_MR);
    assert.deepEqual(mr, { diff: DIFF, refs: REFS, title: 'T', description: 'D' });
    assert.deepEqual(runner.argvs(), [
      ['glab', 'mr', 'diff', '12', '-R', 'https://git.example.org/team/sub/app', '--raw'],
      ['glab', 'api', '--hostname', 'git.example.org', 'projects/team%2Fsub%2Fapp/merge_requests/12'],
    ]);
  });

  it('a non-zero exit is mr-fetch-failed carrying glab stderr', async () => {
    const runner = new FakeProcessRunner().stubArgv(['glab'], { exitCode: 1, stderr: '  401 Unauthorized\n' });
    await assert.rejects(fetchMr(runner, '/repo', URL_MR), (error: { code: string; message: string }) => error.code === 'mr-fetch-failed' && error.message === 'glab mr failed: 401 Unauthorized');
  });

  it('comment posts one discussion with a text position', async () => {
    const runner = new FakeProcessRunner().stubArgv(['glab'], { stdout: '{}' });
    await comment(runner, '/repo', URL_MR, REFS, { oldPath: 'src/a.ts', newPath: 'src/a.ts', oldLine: null, newLine: 5 }, 'Use "x".');
    const [argv] = runner.argvs();
    assert.deepEqual(argv!.slice(0, 7), ['glab', 'api', '--hostname', 'git.example.org', '-X', 'POST', 'projects/team%2Fsub%2Fapp/merge_requests/12/discussions']);
    assert.ok(argv!.includes('body=Use "x".'));
    const position = JSON.parse(argv![argv!.indexOf('-F') + 1]!.replace(/^position=/, ''));
    assert.deepEqual(position, { position_type: 'text', ...REFS, old_path: 'src/a.ts', new_path: 'src/a.ts', new_line: 5 });
  });

  it('comment on a removed line of a deleted file sends the old side only', async () => {
    const runner = new FakeProcessRunner().stubArgv(['glab'], { stdout: '{}' });
    await comment(runner, '/repo', URL_MR, REFS, { oldPath: 'gone.ts', newPath: null, oldLine: 3, newLine: null }, 'b');
    const [argv] = runner.argvs();
    assert.deepEqual(JSON.parse(argv![argv!.indexOf('-F') + 1]!.replace(/^position=/, '')), { position_type: 'text', ...REFS, old_path: 'gone.ts', new_path: 'gone.ts', old_line: 3 });
  });

  it('comment on a renamed file and an unchanged line sends both paths and both lines', async () => {
    const runner = new FakeProcessRunner().stubArgv(['glab'], { stdout: '{}' });
    await comment(runner, '/repo', URL_MR, REFS, { oldPath: 'a.ts', newPath: 'b.ts', oldLine: 4, newLine: 6 }, 'b');
    const [argv] = runner.argvs();
    assert.deepEqual(JSON.parse(argv![argv!.indexOf('-F') + 1]!.replace(/^position=/, '')), { position_type: 'text', ...REFS, old_path: 'a.ts', new_path: 'b.ts', old_line: 4, new_line: 6 });
  });

  it('a host with a port reaches glab as a bare hostname plus the documented api-host and protocol variables', async () => {
    const runner = new FakeProcessRunner().stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stubArgv(['glab', 'api'], { stdout: MR_JSON });
    await fetchMr(runner, '/repo', 'http://git.corp:8443/g/p/-/merge_requests/3');
    assert.deepEqual(runner.argvs(), [
      ['glab', 'mr', 'diff', '3', '-R', 'http://git.corp:8443/g/p', '--raw'],
      ['glab', 'api', '--hostname', 'git.corp', 'projects/g%2Fp/merge_requests/3'],
    ]);
    assert.deepEqual(runner.calls[1]!.env, { kind: 'inherited', overrides: { GITLAB_API_HOST: 'git.corp:8443', GLAB_API_PROTOCOL: 'http' } });
    assert.deepEqual(runner.calls[0]!.env, { kind: 'inherited' });
  });

  it('a failed post is mr-publish-failed', async () => {
    const runner = new FakeProcessRunner().stubArgv(['glab'], { exitCode: 1, stderr: '400 line_code invalid' });
    await assert.rejects(comment(runner, '/repo', URL_MR, REFS, { oldPath: 'a', newPath: 'a', oldLine: null, newLine: 1 }, 'b'), { code: 'mr-publish-failed' });
  });
});
