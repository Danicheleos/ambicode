import { timingSafeEqual } from 'node:crypto';
import { escape, themed } from '#modules/review/findings/page';
import type { StoredLink } from '#modules/review/page/state';
import { PAGE_SESSION_MS } from '#types/defaults';
import { messageOf } from '#util/errors';
import type { HttpHost, HttpRequest, HttpResponse, IdSource } from '#types/platform/ports';

const SESSION_COOKIE = 'ambicode_page';
const LINK = /^\/([A-Za-z0-9_-]{16,128})$/;
/** The header a later review sends to /register; a browser form cannot set a custom header cross-site, and a foreign process on the port does not know the secret. */
export const SECRET_HEADER = 'x-ambicode-secret';
/** The URL holds the capability, hence no-referrer; the CSP allows no script, so an injected one has nowhere to run. */
const HEADERS = {
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'content-type': 'text/html; charset=utf-8',
};

/** What the application answers for an authenticated request; `stop` ends the server after the reply, `location` redirects. */
export interface AppReply { status: number; body?: string; location?: string; stop?: string }

interface PageServerOptions {
  host: HttpHost;
  ids: IdSource;
  idleMs: number;
  /** 0 asks the OS for a free port. */
  port: number;
  /** Authorises POST /register; kept in a mode-600 file by the caller. */
  secret: string;
  /** An authenticated, CSRF-checked request; `csrf` goes into every form of the page. */
  handle: (call: { method: 'GET' | 'POST'; path: string; form: URLSearchParams; csrf: string }) => Promise<AppReply>;
  /** POST /register: the path to open for the review the form names, or null when there is no such review. */
  admit: (form: URLSearchParams) => Promise<string | null>;
  /** Where login links survive a restart; absent keeps them in memory only. `load` returns the links still valid. */
  linkStore?: { load(): Promise<Record<string, StoredLink>>; save(links: Record<string, StoredLink>): Promise<void> };
  /** Epoch ms; the tests' fake clock. */
  now?: () => number;
}

interface PageServer {
  port: number;
  /** A login URL that lands on `to`; it opens a session for 24 h from minting, as often as it is opened. */
  mint(to: string): string;
  stopped: Promise<string>;
  stop(reason: string): Promise<void>;
}

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/;
const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const reply = (status: number, body = '', headers: Record<string, string> = {}): HttpResponse => {
  const all = { ...HEADERS, ...headers };
  return { status, headers: all, body: all['content-type']!.startsWith('text/html') ? themed(body === '' && status >= 400 ? `Error ${status}.` : body) : body };
};
const cookieOf = (request: HttpRequest): string => (request.headers['cookie'] ?? '').split(/;\s*/).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) ?? '';

/**
 * One server for every review of a repository. A login link is exchanged for a cookie session (shared by the
 * tabs of that browser) with a CSRF token; it stops on idle, when the application says so, or when the process does.
 */
export async function startPageServer(options: PageServerOptions): Promise<PageServer> {
  const now = options.now ?? Date.now;
  const links = new Map<string, StoredLink>(Object.entries(await options.linkStore?.load().catch(() => ({})) ?? {}));
  let saving: Promise<void> = Promise.resolve();
  const save = (): void => {
    const live = Object.fromEntries([...links].filter(([, link]) => link.expiresAt > now()));
    saving = saving.then(() => options.linkStore?.save(live)).catch(() => undefined);
  };
  const sessions = new Map<string, string>();
  let origin = '';
  let idle: NodeJS.Timeout | undefined;
  let listener: Awaited<ReturnType<HttpHost['listen']>> | null = null;
  let resolveStopped: (reason: string) => void = () => undefined;
  const stopped = new Promise<string>((resolve) => { resolveStopped = resolve; });

  const stop = async (reason: string): Promise<void> => {
    if (listener === null) return;
    const closing = listener;
    listener = null;
    clearTimeout(idle);
    sessions.clear();
    links.clear();
    await closing.close();
    await saving;
    resolveStopped(reason);
  };
  const touch = (): void => {
    clearTimeout(idle);
    idle = setTimeout(() => void stop(`idle for ${options.idleMs / 1000}s`), options.idleMs);
    idle.unref();
  };
  const mint = (to: string): string => {
    const token = options.ids.capability();
    links.set(token, { to, expiresAt: now() + PAGE_SESSION_MS });
    save();
    return `${origin}/${token}`;
  };
  const sessionOf = (request: HttpRequest): { id: string; csrf: string } | null => {
    const cookie = cookieOf(request);
    for (const [id, csrf] of sessions) if (same(cookie, id)) return { id, csrf };
    return null;
  };

  const handle = async (request: HttpRequest): Promise<HttpResponse> => {
    // A loopback name on any port (an ssh forward may use another local port); a request under another name is a DNS-rebinding probe.
    const host = request.headers['host'] ?? '';
    if (!LOOPBACK_HOST.test(host)) return reply(403, 'Wrong host.');
    const [url = '/', query = ''] = request.url.split('?') as [string, string?];
    const session = sessionOf(request);
    if (request.method === 'GET') {
      const link = LINK.exec(url)?.[1];
      if (link !== undefined) {
        // A prefetch or an embedded request must not spend the single use.
        const mode = request.headers['sec-fetch-mode'];
        if (mode !== undefined && mode !== 'navigate') return reply(403, 'This link opens only as a page.');
        const found = [...links].find(([token]) => same(link, token));
        if (found === undefined || found[1].expiresAt <= now()) {
          if (found !== undefined) { links.delete(found[0]); save(); }
          return reply(403, 'That review link is no longer valid.');
        }
        const to = found[1].to;
        touch();
        // A browser that is signed in keeps its session: a second review opens beside the first without breaking the first tab's forms.
        if (session !== null) return reply(303, '', { location: to });
        const created = { id: options.ids.sessionId(), csrf: options.ids.csrfToken() };
        sessions.set(created.id, created.csrf);
        // Expiry on both sides: Max-Age is only the browser's promise, the server forgets the session itself.
        setTimeout(() => sessions.delete(created.id), PAGE_SESSION_MS).unref();
        return reply(303, '', { location: to, 'set-cookie': `${SESSION_COOKIE}=${created.id}; Max-Age=${PAGE_SESSION_MS / 1000}; HttpOnly; SameSite=Strict; Path=/` });
      }
      if (session === null) return reply(401, 'Open the review link you were given.');
      touch();
      return answer(await options.handle({ method: 'GET', path: url, form: new URLSearchParams(query), csrf: session.csrf }).catch((error: unknown) => ({ status: 500, body: `<!doctype html><title>Review</title><p>${escape(messageOf(error))}</p>` })));
    }
    if (request.method !== 'POST') return reply(405, 'Method not allowed.');
    if (url === '/register') {
      if (!same(request.headers[SECRET_HEADER] ?? '', options.secret)) return reply(403, 'Not allowed.');
      const to = await options.admit(new URLSearchParams(request.body));
      if (to === null) return reply(404, 'No such review.');
      touch();
      return reply(200, JSON.stringify({ url: mint(to) }), { 'content-type': 'application/json' });
    }
    // Same-origin means the Origin the browser sent equals the Host it used, not this server's bound address: a forward changes the host and port. The no-referrer policy
    // makes a browser send `Origin: null` on a same-origin form post, so null passes only with `Sec-Fetch-Site: same-origin`, which a page cannot forge.
    const from = request.headers['origin'];
    const site = request.headers['sec-fetch-site'];
    const sameSite = site === undefined || site === 'same-origin';
    const sameOrigin = from === undefined || from === `http://${host}` || (from === 'null' && site === 'same-origin');
    if (!sameSite || !sameOrigin) return reply(403, 'Cross-site request refused.');
    if (session === null) return reply(401, 'No valid session.');
    const form = new URLSearchParams(request.body);
    if (!same(form.get('csrf') ?? '', session.csrf)) return reply(403, 'Bad form token.');
    touch();
    return answer(await options.handle({ method: 'POST', path: url, form, csrf: session.csrf }).catch((error: unknown) => ({ status: 500, body: `<!doctype html><title>Review</title><p>${escape(messageOf(error))}</p>` })));
  };
  const answer = (done: AppReply): HttpResponse => {
    if (done.stop !== undefined) setImmediate(() => void stop(done.stop!));
    return reply(done.status, done.body ?? '', { ...(done.location === undefined ? {} : { location: done.location }), ...(done.stop === undefined ? {} : { connection: 'close' }) });
  };

  listener = await options.host.listen(handle, options.port);
  origin = `http://127.0.0.1:${listener.port}`;
  touch();
  return { port: listener.port, mint, stopped, stop };
}
