import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { createHash } from 'node:crypto';
import { capturedFiles } from '#modules/review/snapshot/target';
import { comment, externalIssueLinks, fetchMr, mrLineUrl, parseMrUrl } from './glab.ts';

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

describe('externalIssueLinks', () => {
  it('reads the external_issue anchors of the rendered title and description, without the query string, once each', () => {
    const anchor = (href: string) => `<a href="${href}" data-reference-type="external_issue" data-external-issue="ABC-101" class="gfm">ABC-101</a>`;
    const html = `<p>${anchor('https://x.atlassian.net/browse/ABC-101?atlOrigin=abc&amp;x=1')}: wizard</p>\n<p>${anchor('https://x.atlassian.net/browse/ABC-101?atlOrigin=zzz')} <a href="https://example.com/p" class="gfm">plain</a> <a data-reference-type="external_issue" href="https://x.atlassian.net/browse/VS-7">VS-7</a></p>`;
    assert.deepEqual(externalIssueLinks(html), ['https://x.atlassian.net/browse/ABC-101', 'https://x.atlassian.net/browse/VS-7']);
    assert.deepEqual(externalIssueLinks('<p>VS-1 <a href="https://example.com/a">x</a></p>'), []);
  });
});

describe('glab adapter', () => {
  it('fetchMr reads the raw diff and the MR record with args arrays', async () => {
    const runner = new FakeProcessRunner().stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stubArgv(['glab', 'api'], { stdout: MR_JSON });
    const mr = await fetchMr(runner, '/repo', URL_MR);
    assert.deepEqual(mr, { diff: DIFF, refs: REFS, title: 'T', description: 'D', links: [] });
    assert.deepEqual(runner.argvs(), [
      ['glab', 'mr', 'diff', '12', '-R', 'https://git.example.org/team/sub/app', '--raw'],
      ['glab', 'api', '--hostname', 'git.example.org', 'projects/team%2Fsub%2Fapp/merge_requests/12?render_html=true'],
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
      ['glab', 'api', '--hostname', 'git.corp', 'projects/g%2Fp/merge_requests/3?render_html=true'],
    ]);
    assert.deepEqual(runner.calls[1]!.env, { kind: 'inherited', overrides: { GITLAB_API_HOST: 'git.corp:8443', GLAB_API_PROTOCOL: 'http' } });
    assert.deepEqual(runner.calls[0]!.env, { kind: 'inherited' });
  });

  it('a failed post is mr-publish-failed', async () => {
    const runner = new FakeProcessRunner().stubArgv(['glab'], { exitCode: 1, stderr: '400 line_code invalid' });
    await assert.rejects(comment(runner, '/repo', URL_MR, REFS, { oldPath: 'a', newPath: 'a', oldLine: null, newLine: 1 }, 'b'), { code: 'mr-publish-failed' });
  });
});

describe('mrLineUrl', () => {
  const sha1 = (text: string): string => createHash('sha1').update(text).digest('hex');
  const patch = 'diff --git a/src/o.ts b/src/o.ts\n--- a/src/o.ts\n+++ b/src/o.ts\n@@ -10,3 +10,3 @@\n ctx\n-gone\n+new\n tail\n'
    + 'diff --git a/n.ts b/n.ts\nnew file mode 100644\n--- /dev/null\n+++ b/n.ts\n@@ -0,0 +1,2 @@\n+a\n+b\n';
  const [edited, created] = capturedFiles(patch);
  const url = 'https://git.example.org:8443/team/sub/app/-/merge_requests/12';

  it('builds GitLab line codes <sha1(path)>_<old>_<new>: context has both, removed carries the new counter, added the old counter', () => {
    const at = (file: typeof edited, side: 'old' | 'new', line: number) => mrLineUrl(url, file!, side, line);
    const base = `https://git.example.org:8443/team/sub/app/-/merge_requests/12/diffs#${sha1('src/o.ts')}`;
    assert.equal(at(edited, 'new', 10), `${base}_10_10`);
    assert.equal(at(edited, 'old', 11), `${base}_11_11`);
    assert.equal(at(edited, 'new', 11), `${base}_12_11`);
    assert.equal(at(edited, 'new', 12), `${base}_12_12`);
    assert.equal(at(created, 'new', 2), `https://git.example.org:8443/team/sub/app/-/merge_requests/12/diffs#${sha1('n.ts')}_0_2`);
  });

  it('falls back to the file when the diff lacks the line, and to null for a URL that is no merge request', () => {
    assert.equal(mrLineUrl(url, edited!, 'new', 99), `${url}/diffs#${sha1('src/o.ts')}`);
    assert.equal(mrLineUrl('https://example.org/x', edited!, 'new', 10), null);
  });
});
