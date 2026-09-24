import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_SNAPSHOT_FILE_BYTES } from '../config/defaults.ts';
import type { RemoteTarget } from '../contracts/provider.ts';
import { revisionMatches } from '../contracts/provider.ts';
import { parseHunks, type DiffFile } from '../git/diff.ts';
import { PAGE_SIZE } from './gitlab/api.ts';
import { GitLabProvider } from './gitlab/provider.ts';
import { parseMergeRequestUrl } from './gitlab/url.ts';
import { positionForLocation, toGitLabPositionFields } from './position.ts';
import { FakeProcessRunner } from '../testing/fake-process-runner.ts';

/**
 * U18. Every response is a fake `glab api` answer, so the whole adapter is
 * covered without a GitLab sandbox: what is verified here is the argument
 * vectors AMBICODE builds and the decisions it takes from a response.
 */

const URL_BASE = 'https://gitlab.example.com/group/sub/project/-/merge_requests/42';

describe('U18 merge request URL parsing', () => {
  it('accepts a self-hosted host with a nested namespace', () => {
    const parsed = parseMergeRequestUrl(URL_BASE);
    assert.equal(parsed.kind, 'ok');
    if (parsed.kind !== 'ok') return;
    assert.equal(parsed.ref.host, 'gitlab.example.com');
    assert.equal(parsed.ref.projectPath, 'group/sub/project');
    assert.equal(parsed.ref.mergeRequestIid, 42);
  });

  it('preserves an explicit port', () => {
    const parsed = parseMergeRequestUrl('https://gitlab.example.com:8443/g/p/-/merge_requests/7');
    assert.equal(parsed.kind === 'ok' ? parsed.ref.host : null, 'gitlab.example.com:8443');
  });

  it('decodes a percent-encoded namespace segment', () => {
    const parsed = parseMergeRequestUrl('https://gl.example.com/my%20group/pro%2Bject/-/merge_requests/3');
    assert.equal(parsed.kind === 'ok' ? parsed.ref.projectPath : null, 'my group/pro+ject');
  });

  it('accepts a view suffix without changing identity', () => {
    const parsed = parseMergeRequestUrl(`${URL_BASE}/diffs?commit_id=abc#note_1`);
    assert.equal(parsed.kind === 'ok' ? parsed.ref.mergeRequestIid : null, 42);
    assert.equal(
      parsed.kind === 'ok' ? parsed.ref.canonicalUrl : null,
      'https://gitlab.example.com/group/sub/project/-/merge_requests/42',
    );
  });

  it('refuses the URLs that are not a merge request, or not unambiguously one', () => {
    const cases: [string, RegExp][] = [
      ['', /No merge request URL/],
      ['not a url', /is not a URL/],
      ['git@gitlab.example.com:group/project.git', /is not a URL/],
      ['ssh://gitlab.example.com/g/p/-/merge_requests/1', /not a supported scheme/],
      ['https://user:token@gitlab.example.com/g/p/-/merge_requests/1', /carries credentials/],
      ['https://gitlab.example.com/g/p/-/issues/4', /is not a merge request URL/],
      ['https://gitlab.example.com/g/p/-/merge_requests', /no merge request number/],
      ['https://gitlab.example.com/g/p/-/merge_requests/0', /is not a merge request number/],
      ['https://gitlab.example.com/g/p/-/merge_requests/007', /is not a merge request number/],
      ['https://gitlab.example.com/g/p/-/merge_requests/1x', /is not a merge request number/],
      ['https://gitlab.example.com/g/p/-/merge_requests/1/notes/9', /points inside a merge request/],
      ['https://gitlab.example.com/project/-/merge_requests/1', /namespace and a project/],
      // The URL parser folds "%2e%2e" into a traversal step and removes the
      // segment before it, leaving no namespace at all.
      ['https://gitlab.example.com/g/%2e%2e/-/merge_requests/1', /namespace and a project/],
      ['https://gitlab.example.com/g/-/-/merge_requests/1', /GitLab reserves/],
      ['https://gitlab.example.com/g/a%2Fb/-/merge_requests/1', /encoded separator/],
    ];
    for (const [url, pattern] of cases) {
      const parsed = parseMergeRequestUrl(url);
      assert.equal(parsed.kind, 'invalid', `expected ${url} to be refused`);
      if (parsed.kind !== 'invalid') continue;
      assert.match(parsed.reason, pattern, url);
    }
  });

  it('refuses an invalid URL without starting a process', async () => {
    const runner = new FakeProcessRunner();
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.resolveTarget({ url: 'https://gitlab.example.com/g/p/-/issues/4' });

    assert.equal(outcome.kind, 'failed');
    assert.deepEqual(runner.argvs(), []);
  });
});

/** The shapes GitLab returns, reduced to what the adapter reads. */
function project(id = 91, path = 'group/sub/project') {
  return { id, path_with_namespace: path };
}

function mergeRequest(overrides: Record<string, unknown> = {}) {
  return {
    iid: 42,
    project_id: 91,
    source_project_id: 91,
    target_project_id: 91,
    web_url: URL_BASE,
    state: 'opened',
    title: 'Sum the amounts',
    sha: 'cccccccccccccccccccccccccccccccccccccccc',
    diff_refs: { base_sha: 'aaaaaaa', start_sha: 'bbbbbbb', head_sha: 'ccccccc' },
    ...overrides,
  };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    head_commit_sha: 'cccccccccccccccccccccccccccccccccccccccc',
    base_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    start_commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    created_at: '2026-09-19T10:00:00Z',
    state: 'collected',
    ...overrides,
  };
}

const MODIFIED_DIFF = [
  '@@ -1,3 +1,3 @@',
  ' export function total(amounts) {',
  '-  return amounts.length;',
  '+  return amounts.reduce((a, b) => a + b, 0);',
  ' }',
  '',
].join('\n');

function versionDetail(diffs: unknown[], overrides: Record<string, unknown> = {}) {
  return { ...version(), diffs, ...overrides };
}

/** A runner stubbed with the standard resolve conversation. */
function resolvingRunner(overrides: { versions?: unknown[]; mr?: unknown } = {}): FakeProcessRunner {
  const runner = new FakeProcessRunner();
  runner.stub(
    (argv) => argv.at(-1) === 'projects/group%2Fsub%2Fproject',
    { stdout: JSON.stringify(project()) },
  );
  runner.stub(
    (argv) => /merge_requests\/42$/.test(argv.at(-1) ?? ''),
    { stdout: JSON.stringify(overrides.mr ?? mergeRequest()) },
  );
  runner.stub(
    (argv) => (argv.at(-1) ?? '').includes('/versions?'),
    { stdout: JSON.stringify(overrides.versions ?? [version()]) },
  );
  return runner;
}

describe('U18 resolving and pinning a merge request', () => {
  it('names the host explicitly on every request and encodes the project path', async () => {
    const runner = resolvingRunner();
    const provider = new GitLabProvider({ runner, cwd: '/work/some-other-checkout' });
    const outcome = await provider.resolveTarget({ url: URL_BASE });

    assert.equal(outcome.kind, 'ok');
    for (const argv of runner.argvs()) {
      assert.equal(argv[0], 'glab');
      assert.equal(argv[1], 'api');
      // The host comes from the URL, never from the checkout glab runs in.
      assert.equal(argv[argv.indexOf('--hostname') + 1], 'gitlab.example.com');
      assert.ok(!argv.some((value) => value.includes('some-other-checkout')));
    }
    assert.ok(runner.argvs().some((argv) => argv.at(-1) === 'projects/group%2Fsub%2Fproject'));
  });

  it('pins version, base, start and head from the diff version, not the local HEAD', async () => {
    const provider = new GitLabProvider({ runner: resolvingRunner(), cwd: '/work' });
    const outcome = await provider.resolveTarget({ url: URL_BASE });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;

    assert.equal(outcome.value.versionId, 5);
    assert.equal(outcome.value.baseSha, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(outcome.value.startSha, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(outcome.value.headSha, 'cccccccccccccccccccccccccccccccccccccccc');
    assert.equal(outcome.value.projectId, '91');
    assert.equal(outcome.value.host, 'gitlab.example.com');
  });

  it('records the fork as the source project for a fork merge request', async () => {
    const runner = resolvingRunner({ mr: mergeRequest({ source_project_id: 404 }) });
    runner.stub((argv) => argv.at(-1) === 'projects/404', {
      stdout: JSON.stringify(project(404, 'contributor/project')),
    });
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.resolveTarget({ url: URL_BASE });

    assert.equal(outcome.kind === 'ok' ? outcome.value.sourceProjectId : null, '404');
    assert.equal(outcome.kind === 'ok' ? outcome.value.sourceProjectPath : null, 'contributor/project');
  });

  it('asks for the merge request and its versions at the same time, once the project is known', async () => {
    // Built by hand: stubs match in registration order, so resolvingRunner's
    // own answers would shadow the two below.
    const runner = new FakeProcessRunner();
    runner.stub((argv) => argv.at(-1) === 'projects/group%2Fsub%2Fproject', { stdout: JSON.stringify(project()) });
    let inFlight = 0;
    let peak = 0;
    const overlapping = (payload: unknown) => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // One turn of the event loop: long enough for a request issued alongside
      // to start, with no clock involved.
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return { stdout: JSON.stringify(payload) };
    };
    runner.stubEffect((argv) => /merge_requests\/42$/.test(argv.at(-1) ?? ''), overlapping(mergeRequest()));
    runner.stubEffect((argv) => (argv.at(-1) ?? '').includes('/versions?'), overlapping([version()]));
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.resolveTarget({ url: URL_BASE });
    assert.equal(outcome.kind, 'ok');
    assert.equal(peak, 2, 'the two requests ran one after the other');
    assert.equal(runner.argvs()[0]?.at(-1), 'projects/group%2Fsub%2Fproject', 'the project comes first');
  });

  it('issues nothing else when the project cannot be read', async () => {
    const runner = new FakeProcessRunner();
    runner.stub((argv) => argv.at(-1) === 'projects/group%2Fsub%2Fproject', {
      exitCode: 1,
      stderr: 'glab: 404 Project Not Found',
    });
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.resolveTarget({ url: URL_BASE });
    assert.equal(outcome.kind, 'failed');
    assert.equal(runner.calls.length, 1);
  });

  it('reports the merge request failure, not the versions, when the merge request cannot be read', async () => {
    const runner = new FakeProcessRunner();
    runner.stub((argv) => argv.at(-1) === 'projects/group%2Fsub%2Fproject', { stdout: JSON.stringify(project()) });
    runner.stub((argv) => /merge_requests\/42$/.test(argv.at(-1) ?? ''), {
      exitCode: 1,
      stderr: 'glab: 404 Merge Request Not Found',
    });
    runner.stub((argv) => (argv.at(-1) ?? '').includes('/versions?'), { stdout: JSON.stringify([version()]) });
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.resolveTarget({ url: URL_BASE });
    assert.equal(outcome.kind, 'failed');
    if (outcome.kind !== 'failed') return;
    assert.match(outcome.message, /404 Merge Request Not Found/);
  });

  it('refuses rather than guessing when no diff version has been collected', async () => {
    const provider = new GitLabProvider({ runner: resolvingRunner({ versions: [] }), cwd: '/work' });
    const outcome = await provider.resolveTarget({ url: URL_BASE });
    assert.equal(outcome.kind, 'failed');
    if (outcome.kind !== 'failed') return;
    assert.match(outcome.details.join('\n'), /does not fall back to the local HEAD/);
  });
});

describe('U18 pagination', () => {
  /** `count` discussions spread over full pages plus a short final one. */
  function pagedRunner(pages: unknown[][]): FakeProcessRunner {
    const runner = new FakeProcessRunner();
    pages.forEach((page, index) => {
      runner.stub(
        // `page` is the last query parameter, so an exact tail match keeps
        // page 1's stub from also answering pages 10 and 11.
        (argv) => (argv.at(-1) ?? '').endsWith(`page=${index + 1}`) && (argv.at(-1) ?? '').includes('discussions'),
        { stdout: JSON.stringify(page) },
      );
    });
    return runner;
  }

  const target: RemoteTarget = {
    provider: 'gitlab',
    host: 'gitlab.example.com',
    projectId: '91',
    projectPath: 'group/sub/project',
    sourceProjectId: '91',
    sourceProjectPath: 'group/sub/project',
    mergeRequestIid: 42,
    webUrl: URL_BASE,
    versionId: 5,
    baseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    startSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    headSha: 'cccccccccccccccccccccccccccccccccccccccc',
  };

  /** The merge request plus its version list, which the revision check reads. */
  function revisionRunner(options: { mr: unknown; versions: unknown[] }): FakeProcessRunner {
    const runner = new FakeProcessRunner();
    runner.stub((argv) => /merge_requests\/42$/.test(argv.at(-1) ?? ''), {
      stdout: JSON.stringify(options.mr),
    });
    runner.stub((argv) => (argv.at(-1) ?? '').includes('/versions?'), {
      stdout: JSON.stringify(options.versions),
    });
    return runner;
  }

  function discussion(id: string, body: string, resolved: boolean | null = null) {
    return {
      id,
      individual_note: false,
      notes: [
        {
          id: `${id}-1`,
          body,
          author: { username: 'reviewer', name: 'A Reviewer' },
          created_at: '2026-09-18T09:00:00Z',
          updated_at: '2026-09-18T09:00:00Z',
          system: false,
          resolvable: resolved !== null,
          resolved,
          position: {
            base_sha: 'aaaaaaa',
            start_sha: 'bbbbbbb',
            head_sha: 'ccccccc',
            old_path: 'src/orders.ts',
            new_path: 'src/orders.ts',
            old_line: null,
            new_line: 2,
          },
        },
      ],
    };
  }

  it('reads past the first page and stops on a short one', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_unused, index) => discussion(`d${index}`, 'first page'));
    const runner = pagedRunner([full, [discussion('tail', 'second page')]]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.listDiscussions({ target, maxDiscussions: 500 });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.discussions.length, PAGE_SIZE + 1);
    assert.equal(runner.calls.length, 2);
  });

  it('treats an empty final page as the end of the collection', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_unused, index) => discussion(`d${index}`, 'x'));
    const runner = pagedRunner([full, []]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.listDiscussions({ target, maxDiscussions: 500 });
    assert.equal(outcome.kind === 'ok' ? outcome.value.discussions.length : -1, PAGE_SIZE);
    assert.equal(runner.calls.length, 2);
  });

  it('fails the whole listing when a later page fails, rather than returning a prefix', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_unused, index) => discussion(`d${index}`, 'x'));
    const runner = pagedRunner([full]);
    runner.stub((argv) => (argv.at(-1) ?? '').endsWith('page=2'), {
      exitCode: 1,
      stderr: 'HTTP 502',
    });
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.listDiscussions({ target, maxDiscussions: 500 });
    assert.equal(outcome.kind, 'failed');
    if (outcome.kind !== 'failed') return;
    assert.match(outcome.message, /page 2/);
    assert.match(outcome.details.join('\n'), /partial listing is not returned as a complete one/);
  });

  it('rejects malformed page data instead of using it', async () => {
    const runner = pagedRunner([[{ id: 12, notes: 'not an array' }]]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.listDiscussions({ target, maxDiscussions: 500 });
    assert.equal(outcome.kind, 'failed');
    if (outcome.kind !== 'failed') return;
    assert.match(outcome.details.join('\n'), /will not work from a response it could not validate/);
  });

  it('rejects truncated process output before parsing it', async () => {
    const runner = new FakeProcessRunner().stub(() => true, {
      stdout: '[{"id":"a","notes":[',
      truncated: true,
    });
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.listDiscussions({ target, maxDiscussions: 500 });
    assert.equal(outcome.kind, 'failed');
    if (outcome.kind !== 'failed') return;
    assert.match(outcome.message, /more output than AMBICODE reads/);
  });

  it('reports a capped discussion list as an omission rather than hiding it', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_unused, index) => discussion(`d${index}`, 'x'));
    const runner = pagedRunner([full, full, []]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.listDiscussions({ target, maxDiscussions: 120 });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.discussions.length, 120);
    assert.match(outcome.value.omissions.join('\n'), /Older threads exist and were not shown/);
  });

  it('keeps the identity later reconciliation needs, and does not call a resolved thread proof', async () => {
    const runner = pagedRunner([[discussion('abc', 'This still throws on an empty list.', true)]]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.listDiscussions({ target, maxDiscussions: 10 });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    const [thread] = outcome.value.discussions;
    assert.ok(thread);
    assert.equal(thread.id, 'abc');
    assert.equal(thread.resolved, true);
    const [note] = thread.notes;
    assert.ok(note);
    assert.equal(note.author, 'reviewer');
    assert.equal(note.createdAt, '2026-09-18T09:00:00Z');
    assert.equal(note.position?.newLine, 2);
  });

  it('answers the current revision only when the merge request and its newest collected version agree', async () => {
    const runner = revisionRunner({
      mr: mergeRequest({
        sha: 'c'.repeat(40),
        diff_refs: { base_sha: 'a'.repeat(40), start_sha: 'b'.repeat(40), head_sha: 'c'.repeat(40) },
      }),
      versions: [version()],
    });
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.getCurrentRevision(target);

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.state, 'current');
    assert.equal(outcome.value.versionId, 5);
    assert.equal(revisionMatches(target, outcome.value).same, true);
  });

  it('reports a moved head as stale, naming both revisions', async () => {
    const moved = 'd'.repeat(40);
    const runner = revisionRunner({
      mr: mergeRequest({
        sha: moved,
        diff_refs: { base_sha: 'a'.repeat(40), start_sha: 'b'.repeat(40), head_sha: moved },
      }),
      versions: [version({ id: 6, head_commit_sha: moved })],
    });
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.getCurrentRevision(target);

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.state, 'stale');
    assert.equal(outcome.value.versionId, 6);
    assert.equal(outcome.value.headSha, moved);

    const compared = revisionMatches(target, outcome.value);
    assert.equal(compared.same, false);
    if (compared.same) return;
    assert.match(compared.differences.join('; '), /head cccccccccccc \u2192 dddddddddddd/);
    assert.match(compared.differences.join('; '), /diff version 5 \u2192 6/);
  });

  /**
   * The race the P1.5 correction is about: a push has happened, so the merge
   * request head has moved, but GitLab has not built the new diff version yet.
   * The newest collected version is the one the review pinned, and every field
   * an identity comparison looks at still matches it \u2014 which is exactly why
   * "collecting" has to be its own answer rather than "current".
   */
  it('refuses to call the pinned version current while GitLab is still collecting a newer head', async () => {
    const pushed = 'e'.repeat(40);
    const runner = revisionRunner({
      mr: mergeRequest({
        sha: pushed,
        diff_refs: { base_sha: 'a'.repeat(40), start_sha: 'b'.repeat(40), head_sha: pushed },
      }),
      // Still only the version the review pinned.
      versions: [version()],
    });
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.getCurrentRevision(target);

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.state, 'collecting');
    assert.equal(outcome.value.headSha, pushed);
    assert.equal(outcome.value.collectedHeadSha, 'c'.repeat(40));
    assert.match(outcome.value.reason ?? '', /has not collected the newest push yet/);
    assert.equal(revisionMatches(target, outcome.value).same, false);
  });

  it('treats absent diff refs as still collecting, not as a match', async () => {
    const runner = revisionRunner({
      mr: mergeRequest({ sha: 'c'.repeat(40), diff_refs: null }),
      versions: [version()],
    });
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.getCurrentRevision(target);

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.state, 'collecting');
    assert.match(outcome.value.reason ?? '', /has not published current diff refs/);
    assert.equal(revisionMatches(target, outcome.value).same, false);
  });

  it('reports a closed, merged or unreadable merge request as unavailable', async () => {
    for (const state of ['closed', 'merged', 'locked']) {
      const runner = revisionRunner({ mr: mergeRequest({ state }), versions: [version()] });
      const outcome = await new GitLabProvider({ runner, cwd: '/work' }).getCurrentRevision(target);
      assert.equal(outcome.kind === 'ok' ? outcome.value.state : null, 'unavailable', state);
      assert.equal(outcome.kind === 'ok' ? revisionMatches(target, outcome.value).same : true, false);
    }

    const gone = new FakeProcessRunner().stub(() => true, { exitCode: 1, stderr: 'HTTP 404' });
    const missing = await new GitLabProvider({ runner: gone, cwd: '/work' }).getCurrentRevision(target);
    assert.equal(missing.kind === 'ok' ? missing.value.state : null, 'unavailable');

    const truncated = new FakeProcessRunner().stub(() => true, { stdout: '{"iid":4', truncated: true });
    const cut = await new GitLabProvider({ runner: truncated, cwd: '/work' }).getCurrentRevision(target);
    assert.equal(cut.kind === 'ok' ? cut.value.state : null, 'unavailable');
    assert.match(cut.kind === 'ok' ? (cut.value.reason ?? '') : '', /more output than AMBICODE reads/);
  });

  /**
   * Correction 4: a ceiling is a ceiling. A server that answers with more items
   * than the page size AMBICODE asked for must not slip past the limit because
   * its page happened to be the last one.
   */
  it('never returns more than maxItems, even when one page carries more', async () => {
    const sixty = Array.from({ length: 60 }, (_unused, index) => discussion(`d${index}`, 'x'));
    const runner = pagedRunner([sixty]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });

    const outcome = await provider.listDiscussions({ target, maxDiscussions: 50 });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.discussions.length, 50);
    assert.equal(outcome.value.complete, false);
    assert.match(outcome.value.omissions.join('\n'), /Older threads exist and were not shown/);
  });

  it('reports a complete listing as complete, so reconciliation may rely on it', async () => {
    const runner = pagedRunner([[discussion('only', 'x')]]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.listDiscussions({
      target,
      maxDiscussions: Number.POSITIVE_INFINITY,
    });

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.complete, true);
    assert.deepEqual(outcome.value.omissions, []);
  });
});

describe('U18 fetching the pinned snapshot', () => {
  const target: RemoteTarget = {
    provider: 'gitlab',
    host: 'gitlab.example.com',
    projectId: '91',
    projectPath: 'group/sub/project',
    sourceProjectId: '404',
    sourceProjectPath: 'contributor/project',
    mergeRequestIid: 42,
    webUrl: URL_BASE,
    versionId: 5,
    baseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    startSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    headSha: 'cccccccccccccccccccccccccccccccccccccccc',
  };

  function detailRunner(diffs: unknown[], overrides: Record<string, unknown> = {}): FakeProcessRunner {
    return new FakeProcessRunner()
      .stub((argv) => /versions\/5$/.test(argv.at(-1) ?? ''), {
        stdout: JSON.stringify(versionDetail(diffs, overrides)),
      })
      // The neutral comparison: every changed file still differs from the
      // target branch, so nothing is narrowed and these tests see the diff
      // exactly as GitLab delivered it. A test about the narrowing itself
      // overrides this with its own answer.
      .stub((argv) => (argv.at(-1) ?? '').includes('repository/compare'), {
        stdout: JSON.stringify({
          compare_timeout: false,
          diffs: (diffs as { old_path?: string; new_path?: string }[]).map((entry) => ({
            old_path: entry.old_path ?? '',
            new_path: entry.new_path ?? '',
          })),
        }),
      });
  }

  it('rebuilds a patch whose added, deleted and renamed files keep their real paths', async () => {
    const runner = detailRunner([
      { old_path: 'src/orders.ts', new_path: 'src/orders.ts', diff: MODIFIED_DIFF },
      {
        old_path: 'src/new file.ts',
        new_path: 'src/new file.ts',
        new_file: true,
        diff: '@@ -0,0 +1,1 @@\n+export const added = 1;\n',
      },
      {
        old_path: 'src/gone.ts',
        new_path: 'src/gone.ts',
        deleted_file: true,
        diff: '@@ -1,1 +0,0 @@\n-export const removed = 1;\n',
      },
      {
        old_path: 'src/ünïcode-old.ts',
        new_path: 'src/--option-like.ts',
        renamed_file: true,
        diff: '@@ -1,1 +1,1 @@\n-export const a = 1;\n+export const b = 2;\n',
      },
    ]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.deepEqual(
      outcome.value.files.map((file) => [file.changeKind, file.oldPath, file.newPath]),
      [
        ['modified', 'src/orders.ts', 'src/orders.ts'],
        ['added', null, 'src/new file.ts'],
        ['deleted', 'src/gone.ts', null],
        ['renamed', 'src/ünïcode-old.ts', 'src/--option-like.ts'],
      ],
    );
    assert.match(outcome.value.patch, /--- \/dev\/null\n\+\+\+ b\/src\/new file\.ts/);
    assert.match(outcome.value.patch, /--- a\/src\/gone\.ts\n\+\+\+ \/dev\/null/);
    assert.match(outcome.value.patch, /diff --git a\/src\/ünïcode-old\.ts b\/src\/--option-like\.ts/);
  });

  /**
   * MR 2677: GitLab's diff is against the merge base, which for a long-lived
   * branch is far behind the target. 299 files were listed, 249 of them already
   * byte-identical to the target branch — including package-lock.json and 15 of
   * 16 translation bundles, which blocked the review twice on the per-file
   * ceiling for changes that merging would not make.
   */
  function comparing(diffs: unknown[], compare: unknown): FakeProcessRunner {
    // The compare stub goes on first: the fake answers with the earliest
    // matching stub, so it has to precede `detailRunner`'s neutral one.
    return new FakeProcessRunner()
      .stub((argv) => (argv.at(-1) ?? '').includes('repository/compare'), {
        stdout: JSON.stringify(compare),
      })
      .stub((argv) => /versions\/5$/.test(argv.at(-1) ?? ''), {
        stdout: JSON.stringify(versionDetail(diffs)),
      });
  }

  it('reviews only the files that still differ from the target branch', async () => {
    const runner = comparing(
      [
        { old_path: 'src/orders.ts', new_path: 'src/orders.ts', diff: MODIFIED_DIFF },
        { old_path: 'package-lock.json', new_path: 'package-lock.json', diff: MODIFIED_DIFF },
      ],
      { compare_timeout: false, diffs: [{ old_path: 'src/orders.ts', new_path: 'src/orders.ts' }] },
    );
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.deepEqual(outcome.value.files.map((file) => file.newPath), ['src/orders.ts']);
    // It leaves the patch as well, or the reviewer reads it anyway.
    assert.doesNotMatch(outcome.value.patch, /package-lock\.json/);
    assert.match(
      outcome.value.omissions.join('\n'),
      /1 of the merge request's 2 changed file\(s\) are already identical/,
    );
    // The compare is one call, not one per file.
    assert.equal(
      runner.argvs().filter((argv) => (argv.at(-1) ?? '').includes('repository/compare')).length,
      1,
    );
  });

  it('reviews the whole diff when GitLab could not finish the comparison', async () => {
    // A partial answer would silently narrow the review, which is the one
    // failure this narrowing is not allowed to cause.
    const runner = comparing(
      [
        { old_path: 'src/orders.ts', new_path: 'src/orders.ts', diff: MODIFIED_DIFF },
        { old_path: 'package-lock.json', new_path: 'package-lock.json', diff: MODIFIED_DIFF },
      ],
      { compare_timeout: true, diffs: [] },
    );
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.files.length, 2);
    assert.match(outcome.value.omissions.join('\n'), /could not be established/);
  });

  it('reports a collapsed or too-large file as an omission, not as an unchanged one', async () => {
    const runner = detailRunner([
      { old_path: 'src/huge.ts', new_path: 'src/huge.ts', diff: '', too_large: true },
      { old_path: 'src/folded.ts', new_path: 'src/folded.ts', diff: '', collapsed: true },
    ]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.match(outcome.value.omissions.join('\n'), /src\/huge\.ts:.*too large/);
    assert.match(outcome.value.omissions.join('\n'), /src\/folded\.ts:.*collapsed/);
    assert.ok(outcome.value.files.every((file) => file.incomplete));
  });

  it('refuses when the pinned version no longer reports the pinned head', async () => {
    const runner = new FakeProcessRunner().stub(
      (argv) => /versions\/5$/.test(argv.at(-1) ?? ''),
      { stdout: JSON.stringify({ ...versionDetail([]), head_commit_sha: 'e'.repeat(40) }) },
    );
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });

    assert.equal(outcome.kind, 'failed');
    if (outcome.kind !== 'failed') return;
    assert.match(outcome.message, /not the pinned cccccccccccc/);
  });

  it('reads post-image content from the fork at the pinned head sha', async () => {
    const runner = detailRunner([{ old_path: 'src/a.ts', new_path: 'src/a.ts', diff: MODIFIED_DIFF }]);
    runner.stub(
      (argv) => (argv.at(-1) ?? '').includes('repository/files'),
      {
        stdout: JSON.stringify({
          file_path: 'src/a.ts',
          size: 12,
          encoding: 'base64',
          content: Buffer.from('export const a = 1;\n', 'utf8').toString('base64'),
        }),
      },
    );
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;

    const content = await outcome.value.read('src/a.ts');
    assert.equal(content?.kind, 'text');
    assert.equal(content?.kind === 'text' ? content.text : '', 'export const a = 1;\n');

    const fileCall = runner.argvs().find((argv) => (argv.at(-1) ?? '').includes('repository/files'));
    assert.ok(fileCall);
    // The fork, not the target project, and the pinned head, not a branch name.
    assert.match(fileCall.at(-1) ?? '', /^projects\/404\/repository\/files\/src%2Fa\.ts\?/);
    assert.match(fileCall.at(-1) ?? '', /ref=cccccccccccccccccccccccccccccccccccccccc/);
  });

  /**
   * One request per changed file was the largest cost of a merge-request
   * review: 141 files mirrored as 160 `glab` calls, 61s. GraphQL answers a
   * hundred paths at once — and answers a hundred however many were asked for,
   * which is why every one of these tests is about what happens when it does
   * not answer with the whole truth.
   */
  describe('U18 batched blob reads', () => {
    const isGraphql = (argv: readonly string[]): boolean => (argv.at(-1) ?? '') === 'graphql';
    const isFileRead = (argv: readonly string[]): boolean => (argv.at(-1) ?? '').includes('repository/files');

    function blobs(
      nodes: { path: string; rawSize: string | null; rawTextBlob: string | null }[],
      hasNextPage = false,
    ): string {
      return JSON.stringify({
        data: { project: { repository: { blobs: { pageInfo: { hasNextPage }, nodes } } } },
      });
    }

    /** Two changed files, and whatever the batch and the per-file read answer. */
    async function snapshotWith(runner: FakeProcessRunner) {
      const provider = new GitLabProvider({ runner, cwd: '/work' });
      const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });
      assert.equal(outcome.kind, 'ok');
      return outcome.kind === 'ok' ? outcome.value : null;
    }

    function changed(): FakeProcessRunner {
      return detailRunner([
        { old_path: 'src/a.ts', new_path: 'src/a.ts', diff: MODIFIED_DIFF },
        { old_path: 'src/b.ts', new_path: 'src/b.ts', diff: MODIFIED_DIFF },
      ]);
    }

    it('reads every primed path in one query and then makes no per-file request', async () => {
      const runner = changed().stub(isGraphql, {
        stdout: blobs([
          { path: 'src/a.ts', rawSize: '4', rawTextBlob: 'a=1\n' },
          { path: 'src/b.ts', rawSize: '4', rawTextBlob: 'b=2\n' },
        ]),
      });
      const snapshot = await snapshotWith(runner);
      if (snapshot === null) return;

      await snapshot.prime?.(['src/a.ts', 'src/b.ts']);
      const a = await snapshot.read('src/a.ts');
      const b = await snapshot.read('src/b.ts');

      assert.equal(a?.kind === 'text' ? a.text : '', 'a=1\n');
      assert.equal(b?.kind === 'text' ? b.text : '', 'b=2\n');
      assert.equal(runner.argvs().filter(isGraphql).length, 1);
      assert.deepEqual(runner.argvs().filter(isFileRead), [], 'the batch answered, so nothing is read twice');
    });

    it('falls back to per-file reads when the page was capped', async () => {
      // Asked for 141 paths, gitlab.com returned 124 and named none of the
      // missing ones. `hasNextPage` is the only evidence that happened.
      const runner = changed()
        .stub(isGraphql, {
          stdout: blobs([{ path: 'src/a.ts', rawSize: '4', rawTextBlob: 'a=1\n' }], true),
        })
        .stub(isFileRead, {
          stdout: JSON.stringify({
            file_path: 'src/a.ts',
            size: 8,
            encoding: 'base64',
            content: Buffer.from('whole a\n', 'utf8').toString('base64'),
          }),
        });
      const snapshot = await snapshotWith(runner);
      if (snapshot === null) return;

      await snapshot.prime?.(['src/a.ts', 'src/b.ts']);
      const a = await snapshot.read('src/a.ts');

      // Not the node from the capped page: a response that admits it is partial
      // is not read for the part it did deliver.
      assert.equal(a?.kind === 'text' ? a.text : '', 'whole a\n');
      assert.equal(runner.argvs().filter(isFileRead).length, 1);
    });

    it('falls back for a blob whose body does not weigh what the blob does', async () => {
      // A binary blob comes back as an empty string against a non-zero
      // rawSize. Mirroring that would put an empty file in the snapshot and
      // call it the file's content.
      const runner = changed()
        .stub(isGraphql, {
          stdout: blobs([{ path: 'src/a.ts', rawSize: '2011', rawTextBlob: '' }]),
        })
        .stub(isFileRead, {
          stdout: JSON.stringify({
            file_path: 'src/a.ts',
            size: 4,
            encoding: 'base64',
            content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]).toString('base64'),
          }),
        });
      const snapshot = await snapshotWith(runner);
      if (snapshot === null) return;

      await snapshot.prime?.(['src/a.ts']);
      const a = await snapshot.read('src/a.ts');

      // The per-file path classifies the bytes, which is the whole reason the
      // fallback exists.
      assert.equal(a?.kind, 'binary');
      assert.equal(runner.argvs().filter(isFileRead).length, 1);
    });

    it('takes a blob over the per-file ceiling from its size alone', async () => {
      const runner = changed()
        .stub(isGraphql, {
          stdout: blobs([{ path: 'src/a.ts', rawSize: String(MAX_SNAPSHOT_FILE_BYTES + 1), rawTextBlob: '' }]),
        })
        .stub(isFileRead, { exitCode: 1, stderr: 'this must not be reached' });
      const snapshot = await snapshotWith(runner);
      if (snapshot === null) return;

      await snapshot.prime?.(['src/a.ts']);
      const a = await snapshot.read('src/a.ts');

      assert.equal(a?.kind, 'too-large');
      assert.deepEqual(runner.argvs().filter(isFileRead), []);
    });

    it('splits the paths into queries of a hundred, which is what the connection returns', async () => {
      const paths = Array.from({ length: 101 }, (_, index) => `src/f${String(index)}.ts`);
      const runner = changed().stub(isGraphql, { stdout: blobs([]) });
      const snapshot = await snapshotWith(runner);
      if (snapshot === null) return;

      await snapshot.prime?.(paths);
      assert.equal(runner.argvs().filter(isGraphql).length, 2);
      const sent = runner.calls.filter((call) => isGraphql(call.argv));
      const first = JSON.parse(sent[0]?.stdin ?? '{}') as { variables: { paths: string[] } };
      const second = JSON.parse(sent[1]?.stdin ?? '{}') as { variables: { paths: string[] } };
      assert.equal(first.variables.paths.length, 100);
      assert.equal(second.variables.paths.length, 1);
    });

    it('does not spend a query on a fork whose path could not be resolved', async () => {
      // An unreadable fork leaves the numeric id where the full path goes, and
      // GraphQL addresses a project by path only.
      const runner = changed().stub(isGraphql, { stdout: blobs([]) });
      const provider = new GitLabProvider({ runner, cwd: '/work' });
      const outcome = await provider.fetchSnapshot({
        target: { ...target, sourceProjectPath: '404' },
        includeSiblingContext: false,
      });
      assert.equal(outcome.kind, 'ok');
      if (outcome.kind !== 'ok') return;

      await outcome.value.prime?.(['src/a.ts']);
      assert.deepEqual(runner.argvs().filter(isGraphql), []);
    });
  });

  it('records inaccessible fork content as an omission rather than as an empty file', async () => {
    const runner = detailRunner([{ old_path: 'src/a.ts', new_path: 'src/a.ts', diff: MODIFIED_DIFF }]);
    runner.stub((argv) => (argv.at(-1) ?? '').includes('repository/files'), {
      exitCode: 1,
      stderr: 'HTTP 404: Project Not Found',
    });
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;

    const content = await outcome.value.read('src/a.ts');
    assert.equal(content?.kind, 'unavailable');
    assert.match(outcome.value.omissions.join('\n'), /could not be read from contributor\/project/);
  });

  it('reports an aggregate cap as a material coverage gap, not as a complete review', async () => {
    const runner = detailRunner(
      [{ old_path: 'src/a.ts', new_path: 'src/a.ts', diff: MODIFIED_DIFF }],
      { real_size: '12', state: 'overflow' },
    );
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    const coverage = outcome.value.coverage;
    assert.equal(coverage.complete, false);
    assert.equal(coverage.declaredFileCount, 12);
    assert.equal(coverage.deliveredFileCount, 1);
    assert.equal(coverage.versionState, 'overflow');
    assert.deepEqual(
      [...new Set(coverage.gaps.map((gap) => gap.kind))].sort(),
      ['aggregate-cap', 'omitted-files'],
    );
    // The reader is told, not only the data model.
    assert.match(outcome.value.omissions.join('\n'), /declares 12 changed file\(s\).*delivered 1/);
  });

  it('treats a without-files version as a coverage gap', async () => {
    const runner = detailRunner([], { state: 'without_files', real_size: '4' });
    const outcome = await new GitLabProvider({ runner, cwd: '/work' }).fetchSnapshot({
      target,
      includeSiblingContext: false,
    });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.coverage.complete, false);
    assert.ok(outcome.value.coverage.gaps.some((gap) => gap.kind === 'no-files'));
    assert.ok(outcome.value.coverage.gaps.some((gap) => gap.kind === 'aggregate-cap'));
  });

  it('calls a fully delivered version complete', async () => {
    const runner = detailRunner([{ old_path: 'src/a.ts', new_path: 'src/a.ts', diff: MODIFIED_DIFF }], {
      real_size: '1',
      state: 'collected',
    });
    const outcome = await new GitLabProvider({ runner, cwd: '/work' }).fetchSnapshot({
      target,
      includeSiblingContext: false,
    });
    assert.equal(outcome.kind === 'ok' ? outcome.value.coverage.complete : false, true);
    assert.deepEqual(outcome.kind === 'ok' ? outcome.value.coverage.gaps : [{}], []);
  });

  /**
   * Correction 5: an empty diff body is normal for a change that has no hunks.
   * Calling it a truncation would turn every renamed file into a coverage gap.
   */
  it('accepts a pure rename with an empty diff as complete coverage', async () => {
    const runner = detailRunner(
      [
        {
          old_path: 'src/old-name.ts',
          new_path: 'src/new-name.ts',
          renamed_file: true,
          a_mode: '100644',
          b_mode: '100644',
          diff: '',
        },
      ],
      { real_size: '1', state: 'collected' },
    );
    const outcome = await new GitLabProvider({ runner, cwd: '/work' }).fetchSnapshot({
      target,
      includeSiblingContext: false,
    });

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    const [file] = outcome.value.files;
    assert.ok(file);
    assert.equal(file.changeKind, 'renamed');
    assert.equal(file.incomplete, false);
    assert.equal(file.incompleteReason, null);
    assert.equal(outcome.value.coverage.complete, true);
    assert.deepEqual(outcome.value.omissions, []);
    assert.match(outcome.value.patch, /diff --git a\/src\/old-name\.ts b\/src\/new-name\.ts/);
  });

  it('identifies a symlink from its mode and never mirrors it as text', async () => {
    const runner = detailRunner(
      [
        {
          old_path: 'config/link',
          new_path: 'config/link',
          a_mode: '100644',
          b_mode: '120000',
          diff: '@@ -1 +1 @@\n-plain\n+../../../etc/passwd\n',
        },
      ],
      { real_size: '1', state: 'collected' },
    );
    const outcome = await new GitLabProvider({ runner, cwd: '/work' }).fetchSnapshot({
      target,
      includeSiblingContext: false,
    });

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    const [file] = outcome.value.files;
    assert.ok(file);
    assert.equal(file.symlink, true);
    // A mode change from a regular file to a symlink is a type change.
    assert.equal(file.changeKind, 'type-changed');

    // Reading it answers "symlink" without fetching anything, so the path it
    // points at is never resolved and never followed out of the snapshot.
    const content = await outcome.value.read('config/link');
    assert.equal(content?.kind, 'symlink');
    assert.ok(!runner.argvs().some((argv) => (argv.at(-1) ?? '').includes('repository/files')));
  });

  it('records a mode-only change with its old and new modes', async () => {
    const runner = detailRunner(
      [
        {
          old_path: 'scripts/run.sh',
          new_path: 'scripts/run.sh',
          a_mode: '100644',
          b_mode: '100755',
          diff: '',
        },
      ],
      { real_size: '1', state: 'collected' },
    );
    const outcome = await new GitLabProvider({ runner, cwd: '/work' }).fetchSnapshot({
      target,
      includeSiblingContext: false,
    });

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    const [file] = outcome.value.files;
    assert.ok(file);
    assert.equal(file.oldMode, '100644');
    assert.equal(file.newMode, '100755');
    assert.equal(file.symlink, false);
    assert.equal(file.incomplete, false);
    assert.equal(outcome.value.coverage.complete, true);
    assert.match(outcome.value.patch, /old mode 100644\nnew mode 100755/);
  });

  it('does not list sibling context when the caller did not ask for it', async () => {
    const runner = detailRunner([{ old_path: 'src/a.ts', new_path: 'src/a.ts', diff: MODIFIED_DIFF }]);
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.fetchSnapshot({ target, includeSiblingContext: false });
    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;

    assert.deepEqual(await outcome.value.list('src'), []);
    assert.ok(!runner.argvs().some((argv) => (argv.at(-1) ?? '').includes('repository/tree')));
  });
});

describe('U18 diff positions', () => {
  const section = [
    'diff --git a/src/orders.ts b/src/orders.ts',
    '--- a/src/orders.ts',
    '+++ b/src/orders.ts',
    MODIFIED_DIFF,
  ].join('\n');

  const file: DiffFile = {
    oldPath: 'src/orders.ts',
    newPath: 'src/orders.ts',
    changeKind: 'modified',
    binary: false,
    addedLines: 1,
    removedLines: 1,
    hunks: parseHunks(section),
    patchSection: section,
  };

  const target: RemoteTarget = {
    provider: 'gitlab',
    host: 'gitlab.example.com',
    projectId: '91',
    projectPath: 'group/project',
    sourceProjectId: '91',
    sourceProjectPath: 'group/project',
    mergeRequestIid: 42,
    webUrl: URL_BASE,
    versionId: 5,
    baseSha: 'a'.repeat(40),
    startSha: 'b'.repeat(40),
    headSha: 'c'.repeat(40),
  };

  it('gives an added line new_line only', () => {
    const result = positionForLocation(target, [file], {
      oldPath: 'src/orders.ts',
      newPath: 'src/orders.ts',
      side: 'new',
      line: 2,
    });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.position.newLine, 2);
    assert.equal(result.position.oldLine, null);
    assert.equal(result.position.baseSha, 'a'.repeat(40));
    assert.equal(result.position.startSha, 'b'.repeat(40));
    assert.equal(result.position.headSha, 'c'.repeat(40));
  });

  it('gives a removed line old_line only', () => {
    const result = positionForLocation(target, [file], {
      oldPath: 'src/orders.ts',
      newPath: 'src/orders.ts',
      side: 'old',
      line: 2,
    });
    assert.equal(result.kind === 'ok' ? result.position.oldLine : null, 2);
    assert.equal(result.kind === 'ok' ? result.position.newLine : 0, null);
  });

  it('gives a context line both numbers', () => {
    const result = positionForLocation(target, [file], {
      oldPath: 'src/orders.ts',
      newPath: 'src/orders.ts',
      side: 'new',
      line: 1,
    });
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') return;
    assert.equal(result.position.oldLine, 1);
    assert.equal(result.position.newLine, 1);

    const fields = toGitLabPositionFields(result.position);
    assert.equal(fields.position_type, 'text');
    assert.equal(fields.old_line, 1);
    assert.equal(fields.new_line, 1);
    assert.equal(fields.head_sha, 'c'.repeat(40));
  });

  it('refuses a location it cannot map exactly', () => {
    const outside = positionForLocation(target, [file], {
      oldPath: 'src/orders.ts',
      newPath: 'src/orders.ts',
      side: 'new',
      line: 99,
    });
    assert.equal(outside.kind, 'unmappable');

    const unknownFile = positionForLocation(target, [file], {
      oldPath: 'src/nope.ts',
      newPath: 'src/nope.ts',
      side: 'new',
      line: 1,
    });
    assert.equal(unknownFile.kind, 'unmappable');
  });
});
