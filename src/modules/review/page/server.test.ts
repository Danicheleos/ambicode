import assert from 'node:assert/strict';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { readPageLinks, writePageLinks, type StoredLink } from './state.ts';
import { afterEach, describe, it, mock } from 'node:test';
import { nodeHttpHost } from '#platform/ports/http-host';
import type { HttpHost, HttpRequest, HttpResponse, IdSource } from '#types/platform/ports';
import { SECRET_HEADER, startPageServer, type AppReply } from './server.ts';

const TOKEN = 'capability-token-0123456789';
const HOST = '127.0.0.1:4321';
const SECRET = 'server-secret-0123456789';
/** Fresh per server: the first link is TOKEN, later ones TOKEN-<n>. */
const makeIds = (): IdSource => { let links = 0; let sessions = 0; return { reviewId: () => 'r', sessionId: () => `session-${++sessions}`, capability: () => (links++ === 0 ? TOKEN : `${TOKEN}-${links}`), csrfToken: () => 'csrf-1' }; };

/** The handler without a socket: requests go straight in, so a refusal is the server's, not the network's. */
function fakeHost(): HttpHost & { send(request: Partial<HttpRequest> & { url: string }): Promise<HttpResponse>; closed: number } {
  let handler: (request: HttpRequest) => Promise<HttpResponse> = async () => ({ status: 500 });
  const host = {
    closed: 0,
    listen: async (given: typeof handler) => { handler = given; return { port: 4321, close: async () => void host.closed++ }; },
    call: async () => null,
    send: (request: Partial<HttpRequest> & { url: string }) => handler({ method: 'GET', headers: { host: HOST }, body: '', ...request }),
  };
  return host;
}
/** The application: `/` is a page, `/x/close` asks to stop, `/x/ok` answers; `/register` admits the review named `x`. */
const app = {
  handle: async ({ path, csrf }: { path: string; csrf: string }): Promise<AppReply> => (path === '/x/close' ? { status: 200, body: 'bye', stop: 'closed' } : path === '/terminate' ? { status: 200, body: 'stopped', stop: 'terminated' } : path === '/' ? { status: 200, body: `page ${csrf}` } : { status: 404 }),
  admit: async (form: URLSearchParams): Promise<string | null> => (form.get('task') === 'x' ? '/x/ok' : null),
};
/** The server with its first login link (TOKEN, landing on `/`) already minted, as the review that started it prints it. */
const start = async (host: HttpHost, idleMs = 60_000, port = 0) => {
  const server = await startPageServer({ host, ids: makeIds(), idleMs, port, secret: SECRET, ...app });
  server.mint('/');
  return server;
};
const cookieOf = (response: HttpResponse): string => response.headers!['set-cookie']!.split(';')[0]!;
const post = (host: ReturnType<typeof fakeHost>, url: string, cookie: string, extra: Record<string, string> = {}, body = 'csrf=csrf-1') =>
  host.send({ method: 'POST', url, body, headers: { host: HOST, cookie, origin: `http://${HOST}`, 'sec-fetch-site': 'same-origin', ...extra } });

afterEach(() => mock.timers.reset());

describe('the review page server', () => {
  it('hands out one link on 127.0.0.1; the token opens a cookie session once, then a token-free page', async () => {
    const host = fakeHost();
    const server = await start(host);
    assert.equal(server.mint('/'), `http://${HOST}/${TOKEN}-2`, 'a later link is another token');
    const wrong = await host.send({ url: '/wrong-token-0123456789' });
    assert.equal(wrong.status, 403);
    const opened = await host.send({ url: `/${TOKEN}` });
    assert.equal(opened.status, 303);
    assert.equal(opened.headers!['location'], '/');
    assert.match(opened.headers!['set-cookie']!, /HttpOnly; SameSite=Strict/);
    assert.equal((await host.send({ url: `/${TOKEN}` })).status, 303, 'the link opens again: the cookie may be gone');
    assert.equal((await host.send({ url: '/' })).status, 401, 'no cookie, no page');
    const page = await host.send({ url: '/', headers: { host: HOST, cookie: cookieOf(opened) } });
    assert.equal(page.status, 200);
    assert.match(page.body!, /<p>page csrf-1<\/p>/);
    assert.match(page.headers!['content-security-policy']!, /default-src 'none'/);
    assert.doesNotMatch(page.headers!['content-security-policy']!, /script-src [^;]*'(self|unsafe)/);
    await server.stop('test');
  });

  it('a prefetch does not spend the token; a request under another host name is refused', async () => {
    const host = fakeHost();
    const server = await start(host);
    assert.equal((await host.send({ url: `/${TOKEN}`, headers: { host: HOST, 'sec-fetch-mode': 'no-cors' } })).status, 403);
    assert.equal((await host.send({ url: `/${TOKEN}`, headers: { host: 'evil.example:4321' } })).status, 403);
    assert.equal((await host.send({ url: `/${TOKEN}` })).status, 303);
    await server.stop('test');
  });

  it('a POST needs the form token, this origin and the session; /close then stops the server', async () => {
    const host = fakeHost();
    const server = await start(host);
    const cookie = cookieOf(await host.send({ url: `/${TOKEN}` }));
    assert.equal((await post(host, '/x/close', cookie, {}, '')).status, 403, 'no CSRF token');
    assert.equal((await post(host, '/x/close', cookie, {}, 'csrf=other')).status, 403);
    assert.equal((await post(host, '/x/close', cookie, { origin: 'https://evil.example' })).status, 403, 'foreign Origin');
    assert.equal((await host.send({ method: 'POST', url: '/x/close', body: 'csrf=csrf-1', headers: { host: HOST, cookie, origin: 'null' } })).status, 403, 'a null Origin without Sec-Fetch-Site');
    assert.equal((await post(host, '/x/close', cookie, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await post(host, '/x/close', 'ambicode_page=guess')).status, 401, 'no session');
    assert.equal(host.closed, 0, 'every refusal left the server running');
    assert.equal((await post(host, '/x/close', cookie)).status, 200);
    assert.equal(await server.stopped, 'closed');
    assert.equal(host.closed, 1);
  });

  it('the session cookie lives 24 h and the server forgets the session at that mark, even while requests keep the server alive', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const host = fakeHost();
    const server = await start(host, 2 * 24 * 3600_000);
    const opened = await host.send({ url: `/${TOKEN}` });
    assert.match(opened.headers!['set-cookie']!, /Max-Age=86400;/);
    const cookie = cookieOf(opened);
    mock.timers.tick(24 * 3600_000 - 1000);
    assert.equal((await host.send({ url: '/', headers: { host: HOST, cookie } })).status, 200, 'still valid just before 24 h');
    mock.timers.tick(1000);
    assert.equal((await host.send({ url: '/', headers: { host: HOST, cookie } })).status, 401, 'refused at 24 h');
    await server.stop('test');
  });

  it('POST /terminate needs the session and the form token, then stops the server', async () => {
    const host = fakeHost();
    const server = await start(host);
    const cookie = cookieOf(await host.send({ url: `/${TOKEN}` }));
    assert.equal((await post(host, '/terminate', 'ambicode_page=guess')).status, 401);
    assert.equal((await post(host, '/terminate', cookie, {}, '')).status, 403);
    assert.equal(host.closed, 0);
    const done = await post(host, '/terminate', cookie);
    assert.equal(done.status, 200);
    assert.match(done.body!, /<p>stopped<\/p>/);
    assert.equal(await server.stopped, 'terminated');
    assert.equal(host.closed, 1);
  });

  it('every HTML response, error paths included, carries the one dark stylesheet; nothing is plain text', async () => {
    const host = fakeHost();
    const server = await start(host);
    const open = await host.send({ url: `/${TOKEN}` });
    const cookie = cookieOf(open);
    const as = { host: HOST, cookie };
    const responses: [string, HttpResponse][] = [
      ['wrong host', await host.send({ url: '/', headers: { host: 'evil.example' } })],
      ['unknown token', await host.send({ url: '/wrong-token-0123456789' })],
      ['prefetch', await host.send({ url: `/${TOKEN}-2`, headers: { host: HOST, 'sec-fetch-mode': 'no-cors' } })],
      ['no session', await host.send({ url: '/' })],
      ['page', await host.send({ url: '/', headers: as })],
      ['app 404 with no body', await host.send({ url: '/nowhere', headers: as })],
      ['method not allowed', await host.send({ method: 'PUT' as 'GET', url: '/', headers: as })],
      ['register refused', await host.send({ method: 'POST', url: '/register', headers: { host: HOST } })],
      ['register unknown review', await host.send({ method: 'POST', url: '/register', headers: { host: HOST, [SECRET_HEADER]: SECRET }, body: 'task=nope' })],
      ['cross-site post', await post(host, '/x/close', cookie, { 'sec-fetch-site': 'cross-site' })],
      ['post without session', await post(host, '/x/close', 'ambicode_page=guess')],
      ['bad form token', await post(host, '/x/close', cookie, {}, 'csrf=other')],
      ['stopped page', await post(host, '/terminate', cookie)],
    ];
    for (const [name, response] of responses) {
      assert.match(response.headers!['content-type']!, /^text\/html/, name);
      assert.match(response.body!, /^<!doctype html><html[^>]*><head>.*<style>:root\{color-scheme:dark\}body\{background:#0d1117;/s, `${name} carries the dark style`);
    }
    const failing = new Map<string, number>(responses.map(([name, response]) => [name, response.status]));
    assert.ok([...failing.values()].some((status) => status >= 400), 'the error paths were exercised');
    assert.equal((await server.stopped), 'terminated');
  });

  it('a handler that throws answers a dark 500 page', async () => {
    const host = fakeHost();
    const server = await startPageServer({ host, ids: makeIds(), idleMs: 60_000, port: 0, secret: SECRET, admit: app.admit, handle: async () => { throw new Error('boom <x>'); } });
    server.mint('/');
    const cookie = cookieOf(await host.send({ url: `/${TOKEN}` }));
    const failed = await host.send({ url: '/', headers: { host: HOST, cookie } });
    assert.equal(failed.status, 500);
    assert.match(failed.body!, /<style>:root\{color-scheme:dark\}.*boom &#60;x&#62;/s);
    await server.stop('test');
  });

  describe('stored login links', () => {
    const DAY = 24 * 3600_000;
    const memoryStore = () => { let saved: Record<string, StoredLink> = {}; return { load: async () => saved, save: async (links: Record<string, StoredLink>) => void (saved = links), peek: () => saved }; };
    const boot = (host: HttpHost, store: ReturnType<typeof memoryStore>, clock: { t: number }) =>
      startPageServer({ host, ids: makeIds(), idleMs: 60_000, port: 0, secret: SECRET, linkStore: store, now: () => clock.t, ...app });

    it('the same link signs a browser in again after its cookie is lost, until 24 h after minting', async () => {
      const host = fakeHost();
      const clock = { t: 1_000_000 };
      const server = await boot(host, memoryStore(), clock);
      server.mint('/');
      const first = await host.send({ url: `/${TOKEN}` });
      assert.equal((await host.send({ url: '/', headers: { host: HOST, cookie: cookieOf(first) } })).status, 200);
      clock.t += DAY - 1;
      const again = await host.send({ url: `/${TOKEN}` });
      assert.equal(again.status, 303, 'a new browser session from the same link');
      assert.equal((await host.send({ url: '/', headers: { host: HOST, cookie: cookieOf(again) } })).status, 200);
      clock.t += 1;
      assert.equal((await host.send({ url: `/${TOKEN}` })).status, 403, 'expired at 24 h');
      await server.stop('test');
    });

    it('a restarted server accepts a stored link that is still valid and not an expired one', async () => {
      const store = memoryStore();
      const clock = { t: 5_000 };
      const before = fakeHost();
      const old = await boot(before, store, clock);
      old.mint('/a');
      clock.t += DAY - 10;
      old.mint('/b');
      await old.stop('restart');
      assert.deepEqual(Object.values(store.peek()).map((link) => link.to), ['/a', '/b']);
      clock.t += 20;
      const after = fakeHost();
      const fresh = await boot(after, { ...store, load: async () => Object.fromEntries(Object.entries(store.peek()).filter(([, link]) => link.expiresAt > clock.t)) }, clock);
      assert.equal((await after.send({ url: `/${TOKEN}-2` })).headers!['location'], '/b', 'minted before the restart, still valid');
      assert.equal((await after.send({ url: `/${TOKEN}` })).status, 403, 'expired before the restart');
      await fresh.stop('test');
    });

    it('the links file is mode 600 even when replaced, and expired entries are dropped on read', async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'ambicode-links-'));
      try {
        await writePageLinks(nodeFileSystem, root, { live: { to: '/a', expiresAt: 100 }, dead: { to: '/b', expiresAt: 10 } });
        await writePageLinks(nodeFileSystem, root, { live: { to: '/a', expiresAt: 100 }, dead: { to: '/b', expiresAt: 10 } });
        assert.equal((await stat(path.join(root, '.ambicode', 'page-links.json'))).mode & 0o777, 0o600);
        assert.deepEqual(await readPageLinks(nodeFileSystem, root, 50), { live: { to: '/a', expiresAt: 100 } });
        assert.deepEqual(await readPageLinks(nodeFileSystem, root, 100), {});
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  it('stops after the idle timeout, and a request restarts the clock', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const host = fakeHost();
    const server = await start(host, 1000);
    mock.timers.tick(900);
    const cookie = cookieOf(await host.send({ url: `/${TOKEN}` }));
    mock.timers.tick(900);
    assert.equal(host.closed, 0, 'the request at 900 ms moved the deadline');
    mock.timers.tick(200);
    assert.equal(await server.stopped, 'idle for 1s');
    assert.equal((await host.send({ url: '/', headers: { host: HOST, cookie } })).status, 401, 'the session died with the server');
  });

  it('binds the loopback interface only, on a port the OS picked', async () => {
    const listener = await nodeHttpHost.listen(async () => ({ status: 200, body: 'ok' }));
    try {
      assert.ok(listener.port > 0);
      const reach = (address: string) => new Promise<boolean>((resolve) => {
        const socket = connect({ host: address, port: listener.port }, () => { socket.destroy(); resolve(true); });
        socket.on('error', () => resolve(false));
      });
      assert.equal(await reach('127.0.0.1'), true);
      assert.equal(await reach('::1'), false);
      const external = Object.values(networkInterfaces()).flat().find((entry) => entry !== undefined && !entry.internal && entry.family === 'IPv4');
      if (external !== undefined) assert.equal(await reach(external.address), false, `reachable at ${external.address}`);
    } finally {
      await listener.close();
    }
  });

  it('serves a real request end to end', async () => {
    const server = await startPageServer({ host: nodeHttpHost, ids: makeIds(), idleMs: 60_000, port: 0, secret: SECRET, ...app });
    const url = server.mint('/');
    // node:http, not fetch: undici labels its requests `sec-fetch-mode: cors`, which a real navigation never sends.
    const call = (method: string, url: string, headers: Record<string, string> = {}, body = '') => new Promise<{ status: number; headers: IncomingHttpHeaders; text: string }>((resolve, reject) => {
      const request = httpRequest(url, { method, headers }, (response) => {
        let text = '';
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, text }));
      });
      request.on('error', reject);
      request.end(body);
    });
    try {
      const opened = await call('GET', url);
      assert.equal(opened.status, 303);
      const cookie = String(opened.headers['set-cookie']![0]).split(';')[0]!;
      const page = await call('GET', new URL('/', url).href, { cookie });
      assert.match(page.text, /<p>page /);
      assert.equal((await call('POST', new URL('/register', url).href, { [SECRET_HEADER]: SECRET }, 'task=x')).status, 200, 'the shared server admits a later review');
    } finally {
      await server.stop('test');
    }
  });

  it('/register needs the server secret and a known review, mints a link that opens again, and a signed-in browser keeps its session', async () => {
    const host = fakeHost();
    const server = await start(host);
    const register = (headers: Record<string, string>, body = 'task=x') => host.send({ method: 'POST', url: '/register', body, headers: { host: HOST, ...headers } });
    assert.equal((await register({})).status, 403, 'no secret');
    assert.equal((await register({ [SECRET_HEADER]: 'wrong-secret-0123456789' })).status, 403);
    assert.equal((await register({ [SECRET_HEADER]: SECRET }, 'task=nope')).status, 404);
    assert.equal((await register({ [SECRET_HEADER]: SECRET, host: 'evil.example:4321' })).status, 403, 'rebinding probe');
    const first = cookieOf(await host.send({ url: `/${TOKEN}` }));
    const minted = await register({ [SECRET_HEADER]: SECRET });
    assert.equal(minted.status, 200);
    const link = new URL(JSON.parse(minted.body!).url).pathname;
    const opened = await host.send({ url: link, headers: { host: HOST, cookie: first } });
    assert.deepEqual([opened.status, opened.headers!['location'], opened.headers!['set-cookie']], [303, '/x/ok', undefined], 'same session, no new cookie');
    assert.equal((await host.send({ url: link, headers: { host: HOST, cookie: first } })).status, 303, 'the minted link opens again');
    assert.equal((await post(host, '/x/ok', first)).status, 404, 'the first tab still passes CSRF and reaches the app');
    await server.stop('test');
  });

  it('binds the port it is given, and a port in use rejects with EADDRINUSE', async () => {
    const probe = await nodeHttpHost.listen(async () => ({ status: 200 }));
    const port = probe.port;
    await probe.close();
    const fixed = await nodeHttpHost.listen(async () => ({ status: 200 }), port);
    try {
      assert.equal(fixed.port, port);
      await assert.rejects(nodeHttpHost.listen(async () => ({ status: 200 }), port), { code: 'EADDRINUSE' });
      assert.equal((await nodeHttpHost.call(port, { method: 'GET', url: '/' }))?.status, 200);
    } finally {
      await fixed.close();
    }
    assert.equal(await nodeHttpHost.call(port, { method: 'GET', url: '/' }), null, 'nothing answers on a closed port');
  });

  it('a post is same-origin when its Origin equals the Host the browser used: through an ssh forward, and with the null Origin that no-referrer makes a browser send', async () => {
    const host = fakeHost();
    const server = await start(host);
    const through = async (forwarded: string) => {
      const link = new URL(server.mint('/')).pathname;
      const cookie = cookieOf(await host.send({ url: link, headers: { host: forwarded } }));
      const form = (headers: Record<string, string>) => host.send({ method: 'POST', url: '/x/ok', body: 'csrf=csrf-1', headers: { host: forwarded, cookie, ...headers } });
      return form;
    };
    // The exact headers Chrome sends for a same-origin form post under `Referrer-Policy: no-referrer`.
    const direct = await through(HOST);
    assert.equal((await direct({ origin: 'null', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate' })).status, 404, 'reaches the app: not refused');
    // A forward to another local port and another loopback name.
    for (const forwarded of ['127.0.0.1:62664', 'localhost:9000']) {
      const form = await through(forwarded);
      assert.equal((await form({ origin: `http://${forwarded}`, 'sec-fetch-site': 'same-origin' })).status, 404, forwarded);
      assert.equal((await form({ origin: 'null', 'sec-fetch-site': 'same-origin' })).status, 404, `${forwarded} with a null Origin`);
      assert.equal((await form({ origin: `http://${forwarded}x` })).status, 403, 'another origin than the Host used');
      assert.equal((await form({ origin: 'http://127.0.0.1:1', 'sec-fetch-site': 'same-origin' })).status, 403, 'an Origin that is not this Host');
      assert.equal((await form({ origin: 'null', 'sec-fetch-site': 'cross-site' })).status, 403);
      assert.equal((await form({ origin: 'null' })).status, 403, 'null alone proves nothing');
      assert.equal((await form({ 'sec-fetch-site': 'same-site' })).status, 403);
    }
    assert.equal((await host.send({ url: '/', headers: { host: 'evil.example:4321' } })).status, 403, 'a non-loopback Host is still refused');
    await server.stop('test');
  });
});
