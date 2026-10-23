import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import { finding } from '#testing/fixtures/review-fixture';
import { CHECK_CONFIG, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { gapsOf } from '#modules/evidence/report/report';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const MR = 'https://gitlab.example.com/g/p/-/merge_requests/7';
const HEAD = 'a'.repeat(40);
const DIFF = 'diff --git a/src/orders.ts b/src/orders.ts\n--- a/src/orders.ts\n+++ b/src/orders.ts\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n';
const mrJson = (title: string, description: string, html: { title?: string; description?: string } = {}) => JSON.stringify({ title, description, title_html: html.title ?? title, description_html: html.description ?? description, diff_refs: { base_sha: 'b'.repeat(40), start_sha: 's'.repeat(40), head_sha: HEAD } });
const MR_JSON = mrJson('T', 'D');
const note = (body: string, extra: object = {}) => ({ body, system: false, author: { username: 'bob' }, ...extra });
/** The discussions endpoint answers `pages` (one reply per page, then []), the commits endpoint `commits`; every other `glab api` call answers the MR record. */
const glabStubs = (record = MR_JSON, pages: unknown[][] = [[]], commits: unknown[] = []) => {
  let page = 0;
  return new FakeProcessRunner().stubEffect((argv) => argv.some((arg) => arg.includes('/commits?')), async () => ({ stdout: JSON.stringify(commits) })).stubEffect((argv) => argv.some((arg) => arg.includes('/discussions?')), async () => ({ stdout: JSON.stringify(pages[page++] ?? []) })).stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stubArgv(['glab', 'api'], { stdout: record });
};
type Fixture = Awaited<ReturnType<typeof reviewRouteFixture>>;

/** glab answers from the fake; git still reaches the real repository. */
function glabFake(t: Fixture, fake = glabStubs()): FakeProcessRunner {
  const real = t.fx.runtime.runner;
  t.fx.runtime.runner = { run: (request) => (request.argv[0] === 'glab' ? fake.run(request) : real.run(request)) };
  return fake;
}
const posts = (fake: FakeProcessRunner): string[][] => fake.argvs().filter((argv) => argv.includes('POST'));

async function toReadback(t: Fixture, fake: FakeProcessRunner, findings = [finding({ id: 'f-1' }), finding({ id: 'f-2', risk: 'low', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'old', line: 2 } }), finding({ id: 'f-3', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 1 } })]) {
  const start = await t.start({ target: { branch: false, base: null, mr: MR } });
  assert.equal(start.position, 'review-agent', 'mr-fetch and the estimate are code and nothing was refused: the route is already at the reviewer');
  assert.ok(fake.calls.length >= 3, 'diff, MR record, discussions');
  const meta = JSON.parse(await t.fx.runtime.fs.readText(path.join(t.fx.repo.root, '.ambicode', 'reviews', CHECK_TASK, 'mr-diff.json')));
  assert.equal(meta.sha, HEAD);
  // The pin is code: the fetched merge-request diff is pinned and no check runs on a checkout that is not the merge request.
  assert.deepEqual([(await t.kinds('review')).map((entry) => entry['stage']), await t.kinds('check')], [['pending'], []]);
  return t.synthetic(findings, { stage: 'recorded' });
}

describe('review route: --mr through glab', () => {
  it('fetch writes the diff and head sha; the route ends at the read-back and posts nothing', async () => {
    const t = await reviewRouteFixture();
    try {
      const fake = glabFake(t);
      assert.equal((await toReadback(t, fake)).position, 'readback');
      await t.next();
      assert.equal(posts(fake).length, 0);
      assert.equal((await t.kinds('gate')).filter((entry) => entry['gate'] === 'publish').length, 0);
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    } finally {
      await t.fx.dispose();
    }
  });

  it('glab exit 1 on fetch ends the route with mr-fetch-failed carrying stderr', async () => {
    const t = await reviewRouteFixture();
    try {
      glabFake(t, new FakeProcessRunner().stubArgv(['glab'], { exitCode: 1, stderr: 'glab: not logged in' }));
      const start = await t.start({ target: { branch: false, base: null, mr: MR } });
      assert.match(start.text, /mr-fetch-failed/);
      assert.match(start.text, /not logged in/);
      assert.equal((await t.kinds('exit')).length, 1);
    } finally {
      await t.fx.dispose();
    }
  });

});

const TOTALS = Array.from({ length: 10 }, (_, at) => `export const computeOrderTotal${at === 0 ? '' : at} = (amounts: number[]): number => amounts.length + ${at};`).join('\n');
const MR_ONLY_DIFF = `diff --git a/src/orders.ts b/src/orders.ts\n--- a/src/orders.ts\n+++ b/src/orders.ts\n@@ -1,2 +1,3 @@\n a\n-b\n+computeOrderTotal(amounts)\n+computeOrderTotal1(amounts)\n`;
const git = (cwd: string, ...argv: string[]): string => execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...argv], { cwd, encoding: 'utf8' }).trim();

/** A clone of the fixture's committed history plus one merge-request commit that adds src/totals.ts, which the working tree does not have. */
async function mergeRequestHead(t: Fixture): Promise<{ sha: string; remote: string }> {
  const remote = await mkdtemp(path.join(tmpdir(), 'ambicode-mr-remote-'));
  git(t.fx.repo.root, 'clone', '-q', t.fx.repo.root, remote);
  await writeFile(path.join(remote, 'src', 'totals.ts'), `${TOTALS}\n`);
  git(remote, 'add', '-A');
  git(remote, 'commit', '-qm', 'mr');
  const sha = git(remote, 'rev-parse', 'HEAD');
  git(remote, 'update-ref', 'refs/merge-requests/7/head', sha);
  return { sha, remote };
}
const withHead = (sha: string): FakeProcessRunner => new FakeProcessRunner().stubArgv(['glab', 'mr', 'diff'], { stdout: MR_ONLY_DIFF }).stubArgv(['glab', 'api'], { stdout: JSON.stringify({ title: 'T', diff_refs: { base_sha: 'b'.repeat(40), start_sha: 's'.repeat(40), head_sha: sha } }) });
const checkoutPath = (t: Fixture): string => path.join(t.dir, 'steps', 'checkout');
/** Registered worktrees whose directory exists: git still lists a deleted one, as prunable, until a prune. */
const worktrees = (t: Fixture): string[] => git(t.fx.repo.root, 'worktree', 'list', '--porcelain').split('\n\n').filter((block) => !block.includes('\nprunable')).map((block) => block.split('\n')[0]!);
const toReadbackExit = async (t: Fixture): Promise<void> => {
  await runToBrief(t);
  await t.synthetic([finding({ id: 'f-1', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 1 } })], { stage: 'recorded' });
  await t.next();
};
const registered = (t: Fixture): number => git(t.fx.repo.root, 'worktree', 'list', '--porcelain').split('\n\n').length;
const runToBrief = async (t: Fixture): Promise<string> => {
  await t.start({ target: { branch: false, base: null, mr: MR } });
  return readFile(path.join(t.bundle, 'brief.md'), 'utf8');
};

describe('review route: --mr reads the merge request head, not the working tree', () => {
  it('a head commit present locally: the brief relates the file the merge request adds', async () => {
    const t = await reviewRouteFixture();
    const { sha, remote } = await mergeRequestHead(t);
    try {
      git(t.fx.repo.root, 'fetch', '-q', remote, 'HEAD');
      glabFake(t, withHead(sha));
      const brief = await runToBrief(t);
      assert.match(brief, /### src\/totals\.ts \(related/);
      const result = JSON.parse(await readFile(path.join(t.bundle, 'result.json'), 'utf8'));
      assert.equal(await realpath(result.target.repositoryRoot), await realpath(checkoutPath(t)));
      assert.equal(result.omissions.some((line: { text: string }) => line.text.startsWith('Diff-only review')), false);
    } finally {
      await t.fx.dispose();
      await rm(remote, { recursive: true, force: true });
    }
  });

  it('a head commit only on the remote is fetched from refs/merge-requests/<iid>/head; the worktree is removed when the route ends', async () => {
    const t = await reviewRouteFixture();
    const { sha, remote } = await mergeRequestHead(t);
    try {
      git(t.fx.repo.root, 'remote', 'add', 'origin', remote);
      glabFake(t, withHead(sha));
      assert.match(await runToBrief(t), /### src\/totals\.ts \(related/);
      assert.equal(worktrees(t).length, 2, 'the checkout is registered while the route runs');
      await t.synthetic([], { stage: 'recorded' });
      await t.next();
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done', 'no findings ends the route');
      assert.equal(worktrees(t).length, 1);
      await assert.rejects(stat(checkoutPath(t)));
    } finally {
      await t.fx.dispose();
      await rm(remote, { recursive: true, force: true });
    }
  });

  it('the record step unregisters the worktree from git once the reviewer has answered', async () => {
    const t = await reviewRouteFixture();
    const { sha, remote } = await mergeRequestHead(t);
    try {
      git(t.fx.repo.root, 'fetch', '-q', remote, 'HEAD');
      glabFake(t, withHead(sha));
      await runToBrief(t);
      assert.equal(registered(t), 2);
      await writeFile(path.join(t.bundle, 'answer.json'), '{"findings":[],"coverageNotes":["read src/totals.ts"]}');
      await t.next();
      assert.equal(registered(t), 1, 'no prunable leftover');
      await assert.rejects(stat(checkoutPath(t)));
    } finally {
      await t.fx.dispose();
      await rm(remote, { recursive: true, force: true });
    }
  });

  it('a head commit that cannot be fetched falls back to the diff and reports the gap', async () => {
    const t = await reviewRouteFixture();
    try {
      glabFake(t, withHead('c'.repeat(40)));
      const brief = await runToBrief(t);
      assert.doesNotMatch(brief, /### src\/totals\.ts/);
      assert.match(brief, /head is not checked out/);
      const result = JSON.parse(await readFile(path.join(t.bundle, 'result.json'), 'utf8'));
      assert.equal(await realpath(result.target.repositoryRoot), await realpath(t.fx.repo.root));
      assert.ok(result.omissions.some((line: { text: string }) => /^Diff-only review: the checkout is not the merge request head/.test(line.text)));
      assert.ok(result.target.notes.some((line: string) => /not checked out: .*fetch/i.test(line)), result.target.notes.join('\n'));
      assert.equal(worktrees(t).length, 1);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a route abandoned after the checkout was made still removes it', async () => {
    const t = await reviewRouteFixture();
    const { sha, remote } = await mergeRequestHead(t);
    try {
      git(t.fx.repo.root, 'fetch', '-q', remote, 'HEAD');
      glabFake(t, withHead(sha));
      await runToBrief(t);
      assert.equal(worktrees(t).length, 2);
      await t.start();
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'interrupted');
      assert.equal(worktrees(t).length, 1);
      await assert.rejects(stat(checkoutPath(t)));
    } finally {
      await t.fx.dispose();
      await rm(remote, { recursive: true, force: true });
    }
  });

  it('every other exit leaves no worktree: skip at the estimate gate (asked only when the estimate is refused), a stop answer while the reviewer runs, the read-back', async () => {
    const exits: Array<[string, (t: Fixture, sha: string) => Promise<void>]> = [
      ['skip', async (t) => { await t.start({ target: { branch: false, base: null, mr: MR } }); await t.hook('estimate', 'skip'); }],
      ['stop while the reviewer runs', async (t) => { await runToBrief(t); assert.equal(worktrees(t).length, 2); await t.fx.engine.stop(CHECK_TASK, 'blocked'); }],
      ['read-back', async (t) => { await toReadbackExit(t); }],
    ];
    for (const [name, exit] of exits) {
      const t = await reviewRouteFixture(name === 'skip' ? { config: CHECK_CONFIG.replace('maxChangedLines: 2000', 'maxChangedLines: 1') } : {});
      const { sha, remote } = await mergeRequestHead(t);
      try {
        git(t.fx.repo.root, 'fetch', '-q', remote, 'HEAD');
        glabFake(t, withHead(sha));
        await exit(t, sha);
        assert.equal((await t.kinds('exit')).length, 1, name);
        assert.equal(worktrees(t).length, 1, name);
        assert.ok(await stat(checkoutPath(t)).then(() => false, () => true), name);
      } finally {
        await t.fx.dispose();
        await rm(remote, { recursive: true, force: true });
      }
    }
  });

  it('a head sha that git would read as an option is a diff-only gap, not a git call', async () => {
    const t = await reviewRouteFixture();
    try {
      glabFake(t, withHead('--force'));
      await runToBrief(t);
      const result = JSON.parse(await readFile(path.join(t.bundle, 'result.json'), 'utf8'));
      assert.match(result.target.diffOnly, /no usable head commit/);
      assert.equal(worktrees(t).length, 1);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('review route: requirements and discussions named by the merge request', () => {
  const ledgerGaps = async (t: Fixture) => gapsOf(await t.ledger());

  it('the key shape in the title is the fallback when GitLab resolved no link: the route fetches it first; an unfetched one is a gap that names the MR', async () => {
    const t = await reviewRouteFixture();
    try {
      const fake = glabFake(t, glabStubs(mrJson('VS-6876: Support GM RFC wizard', 'no links here')));
      const start = await t.start({ target: { branch: false, base: null, mr: MR } });
      assert.equal(start.position, 'fetch', 'the MR is read before the fetch step is decided');
      assert.match(start.text, /The merge request names these requirements in its title or description: VS-6876\./);
      assert.equal(fake.calls.length, 4, 'diff, record, discussions, commits');
      assert.equal((await t.next()).position, 'review-agent');
      assert.deepEqual((await t.kinds('envelope')).map((entry) => entry['missingAsked']), [['VS-6876']]);
      assert.ok((await ledgerGaps(t)).includes('requirement VS-6876 named by the MR was not fetched: no Jira or Confluence result was captured for it'));
    } finally {
      await t.fx.dispose();
    }
  });

  it('the tracker link GitLab resolved in the rendered title is the candidate, as a full URL without tracking parameters', async () => {
    const t = await reviewRouteFixture();
    try {
      const anchor = '<a href="https://x.atlassian.net/browse/VS-6876?atlOrigin=abc" data-reference-type="external_issue" data-external-issue="VS-6876">VS-6876</a>';
      glabFake(t, glabStubs(mrJson('VS-6876: Support GM RFC wizard', '', { title: `${anchor}: Support GM RFC wizard` })));
      const start = await t.start({ target: { branch: false, base: null, mr: MR } });
      assert.equal(start.position, 'fetch');
      assert.match(start.text, /: https:\/\/x\.atlassian\.net\/browse\/VS-6876\./);
      assert.doesNotMatch(start.text, /atlOrigin|, VS-6876/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('an issue link in the description is a candidate; a plain link is not; two candidates at most', async () => {
    const t = await reviewRouteFixture();
    try {
      glabFake(t, glabStubs(mrJson('Fix wizard', 'See https://x.atlassian.net/browse/AB-12 and https://example.com/logo.png and https://x.atlassian.net/wiki/spaces/S/pages/9 and CD-3')));
      const start = await t.start({ target: { branch: false, base: null, mr: MR } });
      assert.equal(start.position, 'fetch');
      assert.match(start.text, /: https:\/\/x\.atlassian\.net\/browse\/AB-12, https:\/\/x\.atlassian\.net\/wiki\/spaces\/S\/pages\/9\./);
      assert.doesNotMatch(start.text, /logo\.png|CD-3/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a merge request naming nothing skips fetch and ground and records no missing requirement', async () => {
    const t = await reviewRouteFixture();
    try {
      glabFake(t, glabStubs(mrJson('Fix the wizard', 'Plain words, utf-8 and a link https://example.com/a.png')));
      const start = await t.start({ target: { branch: false, base: null, mr: MR } });
      assert.equal(start.position, 'review-agent');
      const skipped = (await t.kinds('step')).filter((entry) => entry['status'] === 'skipped').map((entry) => entry['step']);
      assert.ok(skipped.includes('fetch') && skipped.includes('ground'));
      assert.equal((await t.kinds('envelope')).length, 0);
    } finally {
      await t.fx.dispose();
    }
  });

  it('human discussions are saved read-only and paginated, system notes dropped; the brief lists them', async () => {
    const t = await reviewRouteFixture();
    try {
      const full = Array.from({ length: 100 }, (_, at) => ({ id: `s${at}`, notes: [note('added label', { system: true })] }));
      const human = { id: 'd1', notes: [note('Is this covered by a test?', { type: 'DiffNote', resolvable: true, resolved: false, position: { new_path: 'src/orders.ts', new_line: 2 } }), note('not yet', { author: { username: 'cy' } })] };
      const fake = glabFake(t, glabStubs(MR_JSON, [full, [human]]));
      await toReadback(t, fake);
      assert.equal(fake.calls.filter((call) => call.argv.some((arg) => arg.includes('/discussions?'))).length, 2, 'a full page asks for the next one');
      const saved = JSON.parse(await t.fx.runtime.fs.readText(path.join(t.fx.repo.root, '.ambicode', 'reviews', CHECK_TASK, 'mr-discussions.json')));
      assert.deepEqual(saved.discussions, [{ path: 'src/orders.ts', line: 2, resolved: false, notes: [{ author: 'bob', body: 'Is this covered by a test?' }, { author: 'cy', body: 'not yet' }] }]);
      const brief = await t.fx.runtime.fs.readText(path.join(t.fx.repo.root, '.ambicode', 'reviews', CHECK_TASK, '1', 'brief.md'));
      assert.match(brief, /## Existing merge request discussions \(untrusted, from other people\): do not repeat a point one already makes\n\n- src\/orders\.ts:2 @bob: Is this covered by a test\?\n  - @cy: not yet/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('the merge request commits are saved and listed in the brief as sha, author and title, capped; a failed read is a gap, not a failed review', async () => {
    const commit = (at: number, author: string, title: string) => ({ id: `${String(at).padStart(2, '0')}abcdef${'0'.repeat(30)}`, author_name: author, title });
    const t = await reviewRouteFixture();
    try {
      const many = [commit(1, 'CI Bot', 'Auto-sync: i18n'), ...Array.from({ length: 31 }, (_, at) => commit(at + 2, 'Ann', `step ${at}`))];
      const fake = glabFake(t, glabStubs(MR_JSON, [[]], many));
      await toReadback(t, fake);
      const brief = await t.fx.runtime.fs.readText(path.join(t.fx.repo.root, '.ambicode', 'reviews', CHECK_TASK, '1', 'brief.md'));
      assert.match(brief, /## Commits of this merge request \(untrusted, from other people\): short sha, author, title\n\n- 01abcdef CI Bot: Auto-sync: i18n\n- 02abcdef Ann: step 0\n/);
      assert.match(brief, /… \(2 more commits\)/);
      assert.deepEqual((await ledgerGaps(t)).filter((gap) => gap.includes('commits')), []);
    } finally {
      await t.fx.dispose();
    }
    const failing = await reviewRouteFixture();
    try {
      const fake = new FakeProcessRunner().stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stub((argv) => argv.some((arg) => arg.includes('/commits?')), { exitCode: 1, stderr: '500 Boom' }).stubEffect((argv) => argv.some((arg) => arg.includes('/discussions?')), async () => ({ stdout: '[]' })).stubArgv(['glab', 'api'], { stdout: MR_JSON });
      glabFake(failing, fake);
      await toReadback(failing, fake);
      assert.match((await ledgerGaps(failing)).join('\n'), /merge request commits not fetched: glab api failed: 500 Boom/);
      assert.match(await failing.fx.runtime.fs.readText(path.join(failing.fx.repo.root, '.ambicode', 'reviews', CHECK_TASK, '1', 'brief.md')), /\(not fetched: glab api failed: 500 Boom; who made a change is unknown\)/);
    } finally {
      await failing.fx.dispose();
    }
  });

  it('a failed discussions read is a gap and a note in the brief, not a failed review', async () => {
    const t = await reviewRouteFixture();
    try {
      const fake = new FakeProcessRunner().stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stub((argv) => argv.some((arg) => arg.includes('/discussions?')), { exitCode: 1, stderr: '403 Forbidden' }).stubArgv(['glab', 'api'], { stdout: MR_JSON });
      glabFake(t, fake);
      await toReadback(t, fake);
      assert.match((await ledgerGaps(t)).join('\n'), /existing merge request discussions not fetched: glab api failed: 403 Forbidden/);
      const brief = await t.fx.runtime.fs.readText(path.join(t.fx.repo.root, '.ambicode', 'reviews', CHECK_TASK, '1', 'brief.md'));
      assert.match(brief, /\(not fetched: glab api failed: 403 Forbidden; a point may already be made there\)/);
    } finally {
      await t.fx.dispose();
    }
  });
});
