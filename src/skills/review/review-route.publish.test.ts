import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { reviewRouteFixture, type RequirementRows } from '#testing/fixtures/review-route-fixture';
import { finding } from '#testing/fixtures/review-fixture';
import { CHECK_CONFIG, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { reviewPageCommand } from '#cli/commands/review/page';
import { parseArgs } from '#util/args';
import type { HttpRequest, HttpResponse, IdSource } from '#types/platform/ports';

const MR = 'https://gitlab.example.com/g/p/-/merge_requests/7';
const DIFF = 'diff --git a/src/orders.ts b/src/orders.ts\n--- a/src/orders.ts\n+++ b/src/orders.ts\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n';
const MR_JSON = JSON.stringify({ title: 'T', description: 'D', diff_refs: { base_sha: 'b'.repeat(40), start_sha: 's'.repeat(40), head_sha: 'a'.repeat(40) } });
const CONFIG = CHECK_CONFIG.replace(/checks:[\s\S]*$/, 'checks:\n      unit: { all: null, file: "true {file}" }\n');
type Fixture = Awaited<ReturnType<typeof reviewRouteFixture>>;

const FINDINGS = () => [finding({ id: 'f-1' }), finding({ id: 'f-2', risk: 'low', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'old', line: 2 } }), finding({ id: 'f-3', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 1 } })];

/** glab answers from the fake; a POST fails while `broken.on` and otherwise names its discussion `disc-<n>`. */
function glabFake(t: Fixture) {
  const broken: { on: boolean; failBody: string | null } = { on: false, failBody: null };
  let posted = 0;
  const fake = new FakeProcessRunner()
    .stubEffect((argv) => argv.includes('POST'), async (request) => (broken.on || (broken.failBody !== null && request.argv.includes(`body=${broken.failBody}`)) ? { exitCode: 1, stderr: '500 upstream down' } : { stdout: JSON.stringify({ id: `disc-${++posted}`, notes: [{ id: 100 + posted }] }) }))
    .stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stubArgv(['glab', 'api'], { stdout: MR_JSON });
  const real = t.fx.runtime.runner;
  t.fx.runtime.runner = { run: (request) => (request.argv[0] === 'glab' ? fake.run(request) : real.run(request)) };
  return { fake, broken };
}
const bodies = (fake: FakeProcessRunner): string[] => fake.argvs().filter((argv) => argv.includes('POST')).map((argv) => argv[argv.indexOf('-f') + 1]!.slice('body='.length));

async function withReview(mr: boolean, body: (t: Fixture, glab: ReturnType<typeof glabFake>) => Promise<void>, requirements?: RequirementRows, config?: string): Promise<void> {
  const t = await reviewRouteFixture({ config: config ?? CONFIG });
  printed = [];
  const original = process.stdout.write.bind(process.stdout);
  const write = mock.method(process.stdout, 'write', ((chunk: string) => (/^(http:\/\/127\.0\.0\.1:|Port )/.test(String(chunk)) ? (printed.push(String(chunk)), true) : original(chunk))) as typeof process.stdout.write);
  try {
    const glab = glabFake(t);
    await t.start(mr ? { target: { branch: false, base: null, mr: MR } } : {});
    await t.synthetic(FINDINGS(), requirements === undefined ? {} : { requirements });
    await body(t, glab);
  } finally {
    write.mock.restore();
    await t.fx.dispose();
  }
}

interface Page { slug: string; get(url?: string): Promise<HttpResponse>; index(): Promise<HttpResponse>; post(url: string, form: Record<string, string | string[]>, extra?: Record<string, string>): Promise<HttpResponse>; csrf: string; close(url?: string): Promise<HttpResponse> }

/** The loopback network without sockets: the server's handler is reached directly, a port that another process holds refuses to bind, and a call reaches only the server that listens. */
function fakeNet(foreignPort: number | null = null) {
  const net = {
    handler: null as null | ((request: HttpRequest) => Promise<HttpResponse>), port: 0, listened: [] as number[], listening: null as null | (() => void),
    http: {
      listen: async (given: (request: HttpRequest) => Promise<HttpResponse>, port = 0) => {
        net.listened.push(port);
        if (port !== 0 && port === foreignPort) throw Object.assign(new Error('address in use'), { code: 'EADDRINUSE' });
        net.handler = given;
        net.port = port === 0 ? 4321 : port;
        net.listening?.();
        return { port: net.port, close: async () => { net.handler = null; } };
      },
      call: async (port: number, request: { method: string; url: string; headers?: Record<string, string>; body?: string }) =>
        (net.handler !== null && port === net.port ? net.handler({ method: request.method, url: request.url, headers: { host: `127.0.0.1:${port}`, ...request.headers }, body: request.body ?? '' }) : null),
    },
  };
  return net;
}
type Net = ReturnType<typeof fakeNet>;

/** Fresh per review run: the secret first (the command asks for it before starting), then one link per mint. */
const makeIds = (): IdSource => { let calls = 0; let sessions = 0; return { reviewId: () => 'r', sessionId: () => `session-${++sessions}`, capability: () => (calls++ === 0 ? 'server-secret-0123456789' : `link-${calls}-0123456789abcdef`), csrfToken: () => 'csrf-1' }; };

/** What the commands print: the link (and a note before it), captured so nothing reaches the test output. */
let printed: string[] = [];

/** The real `review page` command on a fake network: the first run starts the server and stays, a later run registers with it and ends. */
async function openPage(t: Fixture, net: Net = fakeNet(), slug = CHECK_TASK, cookie?: string): Promise<Page> {
  const before = printed.length;
  const runtime = { ...t.fx.runtime, ids: makeIds(), http: net.http };
  const running = reviewPageCommand.run(runtime, parseArgs('review page', ['--task', slug], reviewPageCommand.options));
  let ended = false;
  void running.then(() => { ended = true; }, () => { ended = true; });
  const link = async (): Promise<string> => {
    for (let waited = 0; waited < 2000; waited++) {
      const line = printed.slice(before).flatMap((chunk) => chunk.trim().split('\n')).find((one) => one.startsWith('http://127.0.0.1:'));
      if (line !== undefined) return line;
      if (ended) await running;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return assert.fail('the page command printed no link');
  };
  const url = new URL(await link());
  const send = (request: Partial<HttpRequest> & { url: string }, jar = cookie) => net.handler!({ method: 'GET', body: '', headers: { host: url.host, ...(jar === undefined ? {} : { cookie: jar }) }, ...request });
  const opened = await send({ url: `${url.pathname}` });
  const jar = opened.headers!['set-cookie']?.split(';')[0] ?? cookie;
  const own = (route: string): string => (route === '/' ? `/r/${slug}` : `/r/${slug}${route}`);
  return {
    slug, csrf: 'csrf-1',
    get: (route = '/') => send({ url: own(route) }, jar),
    index: () => send({ url: '/' }, jar),
    post: (route, form, extra = {}) => {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries({ csrf: 'csrf-1', ...form })) for (const one of [value].flat()) body.append(key, one);
      return send({ method: 'POST', url: own(route), body: body.toString(), headers: { host: url.host, ...(jar === undefined ? {} : { cookie: jar }), origin: `http://${url.host}`, 'sec-fetch-site': 'same-origin', ...extra } }, jar);
    },
    close: async (route = '/close') => {
      const done = await send({ method: 'POST', url: own(route), body: 'csrf=csrf-1', headers: { host: url.host, ...(jar === undefined ? {} : { cookie: jar }), origin: `http://${url.host}` } }, jar);
      // The server stops on the next turn after a reply that ends it.
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (net.handler === null) await running;
      return done;
    },
  };
}

const record = async (t: Fixture) => JSON.parse(await t.fx.runtime.fs.readText(path.join(t.dir, 'publication.json')));

describe('publishing from the review page', () => {
  it('posts the picked findings with the edited comment text and shows each as posted with its discussion', async () => {
    await withReview(true, async (t, { fake }) => {
      const page = await openPage(t);
      const html = (await page.get()).body!;
      assert.match(html, /<button type="submit" class="primary">Publish<\/button><button type="submit" form="close">Close<\/button><button type="submit" form="delete">Delete/);
      const done = await page.post('/publish', { pick: ['1', '3'], 'comment-1': '  edited by hand \n', 'comment-3': 'third' });
      assert.equal(done.status, 200);
      assert.deepEqual(bodies(fake), ['edited by hand', 'third']);
      assert.match(done.body!, /#1<\/b> posted \(discussion disc-1\)/);
      assert.match(done.body!, new RegExp(`href="/r/${CHECK_TASK}"`));
      assert.deepEqual(Object.entries((await record(t)).findings).map(([number, entry]) => [number, (entry as { status: string }).status]), [['1', 'posted'], ['3', 'posted']]);
      const after = (await page.get()).body!;
      assert.doesNotMatch(after, /name="pick" value="[13]"/);
      assert.match(after, /name="pick" value="2"/);
      assert.match(after, /posted \(discussion disc-1\)/);
      await page.close();
    });
  });

  it('a double submit posts once', async () => {
    await withReview(true, async (t, { fake }) => {
      const page = await openPage(t);
      const form = { pick: '1', 'comment-1': 'once' };
      const [first, second] = await Promise.all([page.post('/publish', form), page.post('/publish', form)]);
      assert.equal(bodies(fake).length, 1);
      assert.deepEqual([first.body, second.body].filter((body) => /already posted/.test(body!)).length, 1);
      await page.post('/publish', form);
      assert.equal(bodies(fake).length, 1);
      await page.close();
    });
  });

  it('a finding on a removed line is posted on the old side', async () => {
    await withReview(true, async (t, { fake }) => {
      const page = await openPage(t);
      await page.post('/publish', { pick: '2', 'comment-2': 'old side' });
      const argv = fake.argvs().find((args) => args.includes('POST'))!;
      const position = JSON.parse(argv[argv.indexOf('-F') + 1]!.slice(9));
      assert.deepEqual([position.old_path, position.old_line, position.new_line], ['src/orders.ts', 2, undefined]);
      await page.close();
    });
  });

  it('a glab failure is shown as failed with its reason, stays pickable, and posts on the retry', async () => {
    await withReview(true, async (t, { fake, broken }) => {
      const page = await openPage(t);
      broken.on = true;
      const failed = await page.post('/publish', { pick: '1', 'comment-1': 'try' });
      assert.match(failed.body!, /#1<\/b> FAILED: mr-publish-failed: .*500 upstream down/);
      const html = (await page.get()).body!;
      assert.match(html, /name="pick" value="1"/);
      assert.match(html, /last attempt failed: mr-publish-failed/);
      broken.on = false;
      assert.match((await page.post('/publish', { pick: '1', 'comment-1': 'try' })).body!, /#1<\/b> posted/);
      assert.equal(bodies(fake).length, 2);
      await page.close();
    });
  });

  it('a failure in the middle of a batch fails only that finding: the others post and it stays pickable', async () => {
    await withReview(true, async (t, { fake, broken }) => {
      const page = await openPage(t);
      broken.failBody = 'two';
      const done = await page.post('/publish', { pick: ['1', '2', '3'], 'comment-1': 'one', 'comment-2': 'two', 'comment-3': 'three' });
      assert.deepEqual(bodies(fake), ['one', 'two', 'three'], 'the batch went on past the failure');
      assert.match(done.body!, /#1<\/b> posted/);
      assert.match(done.body!, /#2<\/b> FAILED: mr-publish-failed: .*500 upstream down/);
      assert.match(done.body!, /#3<\/b> posted/);
      assert.deepEqual(Object.entries((await record(t)).findings).map(([number, entry]) => [number, (entry as { status: string }).status]), [['1', 'posted'], ['2', 'failed'], ['3', 'posted']]);
      const html = (await page.get()).body!;
      assert.match(html, /name="pick" value="2"/);
      assert.doesNotMatch(html, /name="pick" value="[13]"/);
      await page.close();
    });
  });

  it('a publish that finds its review folder deleted before it took the lock says so and posts nothing, instead of a bare 500', async () => {
    await withReview(true, async (t, { fake }) => {
      const page = await openPage(t);
      const fs = t.fx.runtime.fs;
      // What a Delete that finished while this request waited leaves: the lock file's folder is gone.
      const original = fs.createExclusive;
      fs.createExclusive = async () => { throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }); };
      const done = await page.post('/publish', { pick: ['1'], 'comment-1': 'x' }).finally(() => { fs.createExclusive = original; });
      assert.equal(done.status, 410);
      assert.match(done.body!, /This review was deleted while the request waited; nothing was posted\./);
      assert.deepEqual(bodies(fake), []);
      await page.close();
    });
  });

  it('an unreadable publication.json answers the page with the error, not a bare 500', async () => {
    await withReview(true, async (t) => {
      const page = await openPage(t);
      await t.fx.runtime.fs.writeText(path.join(t.dir, 'publication.json'), '{"reviewId": ');
      const shown = await page.get();
      assert.equal(shown.status, 500);
      assert.match(shown.body!, /publication\.json is not valid JSON; no comment was posted/);
      await page.close();
    });
  });

  it('an empty comment fails only its finding; a bad pick number or a missing CSRF token posts nothing', async () => {
    await withReview(true, async (t, { fake }) => {
      const page = await openPage(t);
      const mixed = await page.post('/publish', { pick: ['1', '2'], 'comment-1': '   ', 'comment-2': 'two' });
      assert.match(mixed.body!, /#1<\/b> FAILED: not posted: the comment is empty/);
      assert.deepEqual(bodies(fake), ['two']);
      assert.equal((await page.post('/publish', { pick: ['2', '9'] })).status, 400);
      assert.equal((await page.post('/publish', { pick: 'x' })).status, 400);
      assert.equal((await page.post('/publish', {})).status, 400);
      assert.equal((await page.post('/publish', { pick: '1', csrf: 'wrong', 'comment-1': 'x' })).status, 403);
      assert.equal((await page.post('/publish', { pick: '1', 'comment-1': 'x' }, { origin: 'https://evil.example' })).status, 403);
      assert.equal(bodies(fake).length, 1);
      await page.close();
    });
  });

  it('a local review has no button and /publish is 404', async () => {
    await withReview(false, async (t, { fake }) => {
      const page = await openPage(t);
      const html = (await page.get()).body!;
      assert.doesNotMatch(html, /action="\/publish"|name="pick"|<textarea/);
      assert.match(html, /#1<\/b>/);
      assert.equal((await page.post('/publish', { pick: '1', 'comment-1': 'x' })).status, 404);
      assert.equal(bodies(fake).length, 0);
      await page.close();
    });
  });

  it('a requirement row that is not covered posts as a general note, with no position, recorded under r<n>', async () => {
    const source = { id: 'https://x.example/browse/VS-1', url: 'https://x.example/browse/VS-1', title: 'Totals', retrievedAt: 't', content: 'c' };
    const requirements = {
      requirements: [source],
      requirementCoverage: [
        { ref: source.id, point: 'Rounds to cents', status: 'covered' as const, note: '', finding: null },
        { ref: source.id, point: 'Exports as CSV', status: 'cannot-verify' as const, note: 'no exporter in the diff', finding: null },
      ],
    };
    await withReview(true, async (t, { fake }) => {
      const page = await openPage(t);
      const html = (await page.get()).body!;
      assert.doesNotMatch(html, /name="pick-req" value="1"/);
      assert.match(html, /name="pick-req" value="2"/);
      assert.match(html, /<textarea form="publish" name="comment-req-2"[^>]*>Requirement Totals: &#34;Exports as CSV&#34; is cannot verify from the diff\. no exporter in the diff<\/textarea>/);
      const done = await page.post('/publish', { 'pick-req': '2', 'comment-req-2': 'Please add the CSV export.' });
      assert.match(done.body!, /requirement row 2<\/b> posted \(discussion disc-1\)/);
      const argv = fake.argvs().find((args) => args.includes('POST'))!;
      assert.ok(!argv.includes('-F'), 'a general note carries no position');
      assert.deepEqual(bodies(fake), ['Please add the CSV export.']);
      assert.deepEqual(Object.keys((await record(t)).findings), ['r2']);
      const after = (await page.get()).body!;
      assert.doesNotMatch(after, /name="pick-req"/);
      assert.match(after, /posted as a note \(discussion disc-1\)/);
      assert.equal((await page.post('/publish', { 'pick-req': '3', 'comment-req-3': 'x' })).status, 400);
      await page.close();
    }, requirements);
  });

  describe('one page server for every review of the repository', () => {
    const PORT_CONFIG = CONFIG.replace('excludePaths: []', 'excludePaths: [], pagePort: 45831');
    const OTHER = 'mr-other';
    /** A second review folder: the same recorded review under another slug, so the index has two rows. */
    const cloneReview = async (t: Fixture): Promise<void> => t.fx.repo.write(path.join('.ambicode', 'reviews', OTHER, 'ledger.jsonl'), await t.fx.runtime.fs.readText(path.join(t.dir, 'ledger.jsonl')));
    const exists = (t: Fixture, ...parts: string[]) => t.fx.runtime.fs.exists(path.join(t.fx.repo.root, ...parts));

    it('binds the configured port and keeps a random one when none is set; the secret record is private and goes with the server', async () => {
      assert.ok(PORT_CONFIG.includes('pagePort: 45831'));
      await withReview(true, async (t) => {
        const net = fakeNet();
        const page = await openPage(t, net);
        assert.deepEqual(net.listened, [45831]);
        const file = path.join(t.fx.repo.root, '.ambicode', 'page.json');
        assert.equal(JSON.parse(await t.fx.runtime.fs.readText(file)).port, 45831);
        if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
        await page.close();
        assert.equal(await t.fx.runtime.fs.exists(file), false);
      }, undefined, PORT_CONFIG);
      await withReview(true, async (t) => {
        const net = fakeNet();
        const page = await openPage(t, net);
        assert.deepEqual(net.listened, [0]);
        await page.close();
      });
    });

    it('a second review registers with the running server instead of starting another, and both appear in the index', async () => {
      await withReview(true, async (t) => {
        const net = fakeNet();
        const first = await openPage(t, net);
        await cloneReview(t);
        const second = await openPage(t, net, OTHER);
        assert.deepEqual(net.listened, [0], 'one server');
        const index = (await first.index()).body!;
        assert.match(index, new RegExp(`href="/r/${CHECK_TASK}"`));
        assert.match(index, new RegExp(`href="/r/${OTHER}"`));
        assert.match(index, /3 findings|\d+ of 3 posted/);
        assert.equal((await second.get()).status, 200);
        await second.close();
        await first.close();
      });
    });

    it('a foreign process on the configured port is left alone: one note, then a free port', async () => {
      await withReview(true, async (t) => {
        const net = fakeNet(45831);
        const page = await openPage(t, net);
        assert.deepEqual(net.listened, [45831, 0]);
        assert.match(printed.join(''), /^Port 45831 is held by another process, which is left alone; the review page uses a free port instead\.\nhttp:\/\/127\.0\.0\.1:4321\/\S+\n$/);
        assert.equal((await page.get()).status, 200);
        await page.close();
      }, undefined, PORT_CONFIG);
    });

    it('Close goes back to the index while other review pages are open and stops the server with the last one', async () => {
      await withReview(true, async (t) => {
        const net = fakeNet();
        const first = await openPage(t, net);
        await cloneReview(t);
        const second = await openPage(t, net, OTHER);
        assert.equal((await first.get()).status, 200);
        assert.equal((await second.get()).status, 200);
        const closed = await second.close();
        assert.deepEqual([closed.status, closed.headers!['location']], [303, '/']);
        assert.equal((await first.get()).status, 200, 'the other review is still reachable');
        assert.equal(await t.fx.runtime.fs.exists(t.dir), true, 'Close deletes nothing');
        assert.equal(await exists(t, '.ambicode', 'reviews', OTHER, 'ledger.jsonl'), true);
        const last = await first.close();
        assert.match(last.body!, /server has stopped/);
        assert.equal(net.handler, null);
      });
    });

    it('Delete removes this review folder only, then lists the index without it; sibling reviews, tasks and config stay', async () => {
      await withReview(true, async (t) => {
        const net = fakeNet();
        const first = await openPage(t, net);
        await cloneReview(t);
        const second = await openPage(t, net, OTHER);
        await t.fx.repo.write(path.join('.ambicode', 'tasks', 'work-1', 'ledger.jsonl'), '{}\n');
        await t.fx.repo.write(path.join('.ambicode', 'config.yaml'), 'a: 1\n');
        assert.match((await first.get()).body!, /posted comments stay on the MR/);
        const removed = await first.close('/delete');
        assert.deepEqual([removed.status, removed.headers!['location']], [303, '/']);
        assert.equal(await t.fx.runtime.fs.exists(t.dir), false);
        assert.equal(await exists(t, '.ambicode', 'reviews', OTHER, 'ledger.jsonl'), true);
        assert.equal(await exists(t, '.ambicode', 'tasks', 'work-1', 'ledger.jsonl'), true);
        assert.equal(await exists(t, '.ambicode', 'config.yaml'), true);
        const index = (await second.index()).body!;
        assert.doesNotMatch(index, new RegExp(`href="/r/${CHECK_TASK}"`));
        assert.match(index, new RegExp(`href="/r/${OTHER}"`));
        assert.equal((await first.get()).status, 404, 'the deleted review has no page');
        await second.close();
      });
    });

    it('Delete is refused while a publish holds the lock, and needs the CSRF token', async () => {
      await withReview(true, async (t) => {
        const page = await openPage(t);
        assert.equal((await page.post('/delete', { csrf: 'wrong' })).status, 403);
        assert.equal(await t.fx.runtime.fs.exists(t.dir), true);
        await t.fx.runtime.fs.writeText(path.join(t.dir, 'publication.lock'), JSON.stringify({ pid: process.pid }));
        const busy = await page.post('/delete', {});
        assert.equal(busy.status, 409);
        assert.match(busy.body!, /A publication is running right now\. Nothing was deleted/);
        assert.equal(await t.fx.runtime.fs.exists(path.join(t.dir, 'ledger.jsonl')), true);
        await t.fx.runtime.fs.remove(path.join(t.dir, 'publication.lock'));
        await page.close('/delete');
        assert.equal(await t.fx.runtime.fs.exists(t.dir), false);
      });
    });

    it('publish, requirement-row publish, close and delete all pass the origin gate with the null Origin a no-referrer page makes the browser send', async () => {
      const source = { id: 'https://x.example/browse/VS-1', url: 'https://x.example/browse/VS-1', title: 'Totals', retrievedAt: 't', content: 'c' };
      const requirements = { requirements: [source], requirementCoverage: [{ ref: source.id, point: 'Exports as CSV', status: 'missed' as const, note: '', finding: null }] };
      await withReview(true, async (t) => {
        const page = await openPage(t);
        const browser = { origin: 'null', 'sec-fetch-site': 'same-origin' };
        assert.equal((await page.post('/publish', { pick: '1', 'comment-1': 'one' }, browser)).status, 200);
        assert.equal((await page.post('/publish', { 'pick-req': '1', 'comment-req-1': 'note' }, browser)).status, 200);
        assert.equal((await page.post('/delete', {}, browser)).status, 200, 'the last open review: the server stops');
        assert.equal(await t.fx.runtime.fs.exists(t.dir), false);
      }, requirements);
      await withReview(true, async (t) => {
        const page = await openPage(t);
        assert.equal((await page.post('/close', {}, { origin: 'null', 'sec-fetch-site': 'same-origin' })).status, 200);
      });
    });

    it('authentication still holds on the shared server: no cookie, no page; a link opens only as a page; /register needs the secret', async () => {
      await withReview(true, async (t) => {
        const net = fakeNet();
        const page = await openPage(t, net);
        const host = `127.0.0.1:${net.port}`;
        const bare = (request: Partial<HttpRequest> & { url: string }) => net.handler!({ method: 'GET', body: '', headers: { host }, ...request });
        assert.equal((await bare({ url: '/' })).status, 401);
        assert.equal((await bare({ url: `/r/${CHECK_TASK}` })).status, 401);
        assert.equal((await bare({ method: 'POST', url: '/register', body: `task=${CHECK_TASK}` })).status, 403);
        assert.equal((await bare({ method: 'POST', url: `/r/${CHECK_TASK}/publish`, body: 'csrf=csrf-1&pick=1' })).status, 401);
        const link = new URL(printed.join('').trim().split('\n').at(-1)!).pathname;
        assert.equal((await bare({ url: link, headers: { host, 'sec-fetch-mode': 'no-cors' } })).status, 403, 'a prefetch does not open the link');
        assert.equal((await bare({ url: '/wrong-token-0123456789' })).status, 403, 'an unknown link is refused');
        assert.equal((await page.post('/publish', { pick: '1', csrf: 'wrong' })).status, 403);
        await page.close();
      });
    });
  });
});
