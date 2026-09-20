import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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

  it('answers the current revision from the newest version and compares identity explicitly', async () => {
    const runner = new FakeProcessRunner().stub(
      (argv) => (argv.at(-1) ?? '').includes('/versions?'),
      { stdout: JSON.stringify([version({ id: 6, head_commit_sha: 'd'.repeat(40) })]) },
    );
    const provider = new GitLabProvider({ runner, cwd: '/work' });
    const outcome = await provider.getCurrentRevision(target);

    assert.equal(outcome.kind, 'ok');
    if (outcome.kind !== 'ok') return;
    assert.equal(outcome.value.versionId, 6);
    assert.equal(outcome.value.headSha, 'd'.repeat(40));

    const compared = revisionMatches(target, outcome.value);
    assert.equal(compared.same, false);
    if (compared.same) return;
    assert.match(compared.differences.join('; '), /head cccccccccccc → dddddddddddd/);
    assert.match(compared.differences.join('; '), /diff version 5 → 6/);

    assert.equal(
      revisionMatches(target, {
        provider: 'gitlab',
        host: target.host,
        projectId: target.projectId,
        mergeRequestIid: target.mergeRequestIid,
        headSha: target.headSha,
        versionId: target.versionId,
      }).same,
      true,
    );
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
    return new FakeProcessRunner().stub(
      (argv) => /versions\/5$/.test(argv.at(-1) ?? ''),
      { stdout: JSON.stringify(versionDetail(diffs, overrides)) },
    );
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
