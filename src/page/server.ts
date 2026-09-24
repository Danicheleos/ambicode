import path from 'node:path';
import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import view from '@fastify/view';
import { Eta } from 'eta';
import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { PublicationPositions, PublicationRecord } from '../contracts/publication.ts';
import type { RemoteTarget } from '../contracts/provider.ts';
import type { ReviewResult } from '../contracts/review.ts';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import type { IdSource } from '../ports/ids.ts';
import type { ReviewProvider } from '../contracts/provider.ts';
import { acquirePublicationLease } from '../publication/lease.ts';
import { runPublication, type SelectedComment } from '../publication/publish.ts';
import type { ReviewStore } from '../publication/store.ts';
import { SessionStore } from './session.ts';
import { TAKEOVER_HEADER } from './takeover.ts';
import { parseSubmission, type ParsedSubmission } from './submission.ts';
import {
  buildPageModel,
  publicationAvailability,
  summarizeSubmission,
  type LastSubmission,
} from './view-model.ts';

/**
 * The local selection page: ordinary server-rendered forms on 127.0.0.1, and
 * the only path by which a comment reaches a merge request.
 *
 * Fastify and its plugins own HTTP parsing, cookie mechanics, CSRF tokens and
 * security headers; Eta owns escaped interpolation. What this module owns is
 * the part a library cannot decide: that the capability is one-time, that the
 * position comes from server-held state and never from the form, that a
 * publication happens only on a valid POST, and that a stale revision stops
 * the run (doc 11, "Local page").
 */

export const SESSION_COOKIE = 'ambicode_session';
/** The whole form, bounded. A review page's fields are text, not uploads. */
export const MAX_BODY_BYTES = 512 * 1024;

export interface PageServerOptions {
  fs: FileSystem;
  clock: Clock;
  ids: IdSource;
  store: ReviewStore;
  result: ReviewResult;
  positions: PublicationPositions | null;
  record: PublicationRecord;
  /** Null for a local review, which has no provider and no publication action. */
  provider: ReviewProvider | null;
  templatesDirectory: string;
  idleTimeoutSeconds: number;
  /** The exact command that reopens this review, shown on refusal pages. */
  reopenCommand: string;
  /** `host:port` this server answers for. Set after listen, or fixed in tests. */
  authority?: string;
  /** This process's pid, recorded in the publication lease for diagnostics. */
  processId: number;
  /** Diagnostic lines for the terminal. Never given a capability or session value. */
  log?: (line: string) => void;
  /** Presented by a newer `ambicode view` to stop this one. Absent: nothing can. */
  takeoverToken?: string;
  /**
   * Awaited before the listener closes, so a successor that binds the freed
   * port cannot have its control file removed by this server's cleanup.
   */
  beforeClose?: () => Promise<void>;
}

export interface PageServer {
  app: FastifyInstance;
  sessions: SessionStore;
  /** The one-time capability, issued once at construction. */
  capability: string;
  setAuthority(authority: string): void;
  /** Resolves with the reason the server stopped. */
  stopped: Promise<string>;
  /**
   * Stops accepting requests and drops every session, without closing the
   * listener. `stop` does this and then closes; a test uses it directly to see
   * the refusal a request racing the shutdown receives.
   */
  beginShutdown(reason: string): void;
  stop(reason: string): Promise<void>;
  /** Restarts the idle countdown; only valid authenticated requests do this. */
  noteActivity(): void;
}

export async function createPageServer(options: PageServerOptions): Promise<PageServer> {
  const app = Fastify({ logger: false, bodyLimit: MAX_BODY_BYTES, trustProxy: false });
  const sessions = new SessionStore({
    ids: options.ids,
    clock: options.clock,
    sessionTtlMs: options.idleTimeoutSeconds * 1000,
  });

  let authority = options.authority ?? '';
  let shuttingDown = false;
  let idleTimer: NodeJS.Timeout | null = null;
  let resolveStopped: (reason: string) => void = () => undefined;
  const stopped = new Promise<string>((resolve) => {
    resolveStopped = resolve;
  });

  // A fresh secret per process, held only in memory: cookies from an earlier
  // run cannot be presented to this one.
  await app.register(cookie, { secret: options.ids.capability() });
  await app.register(csrf, {
    cookieKey: '_csrf',
    cookieOpts: { signed: true, path: '/', sameSite: 'strict', httpOnly: true },
  });
  await app.register(formbody, { bodyLimit: MAX_BODY_BYTES });
  // This server accepts exactly one content type: the one its own form posts.
  // Fastify's default JSON and text parsers would otherwise make the page
  // reachable by a request no browser form could produce.
  app.removeContentTypeParser(['application/json', 'text/plain']);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'none'"],
        // The one stylesheet this server serves itself. No CDN, no font host.
        'style-src': ["'self'"],
        'script-src': ["'none'"],
        'img-src': ["'none'"],
        'connect-src': ["'none'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    // Loopback HTTP: an HSTS header here would be a claim about a transport
    // this page does not use.
    hsts: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(view, {
    engine: { eta: new Eta() },
    root: options.templatesDirectory,
  });

  const beginShutdown = (reason: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
    // Every server-side session goes, so no cookie that was issued still names
    // anything. The cookie in the browser becomes inert rather than trusted.
    sessions.clear();
    resolveStopped(reason);
  };

  const stop = async (reason: string): Promise<void> => {
    const first = !shuttingDown;
    beginShutdown(reason);
    if (!first) return;
    await options.beforeClose?.().catch(() => undefined);
    await app.close();
  };

  const noteActivity = (): void => {
    if (shuttingDown) return;
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      void stop(`idle for ${options.idleTimeoutSeconds}s`);
    }, options.idleTimeoutSeconds * 1000);
    // The listening socket is what keeps the process alive; this timer only
    // decides when to stop, so it must not hold the process open by itself.
    idleTimer.unref();
  };

  // A page that is never opened still stops on its own.
  noteActivity();

  app.addHook('onRequest', async (request, reply) => {
    if (shuttingDown) {
      await refuse(reply, 503, 'This review page is shutting down.', 'Reopen the review to get a new link.');
      return reply;
    }
    // Exactly the loopback address and port this server bound to. A request
    // that arrived under any other name is refused before it is routed.
    const host = request.headers.host;
    if (authority !== '' && host !== authority) {
      await refuse(
        reply,
        400,
        'That request did not come from this review page.',
        `This server answers only for ${authority}. A request naming a different host is refused.`,
      );
      return reply;
    }
    return undefined;
  });

  // Nothing this server renders may be cached: it is per-session, and the
  // capability redirect must never be replayed from a store.
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    reply.header('Pragma', 'no-cache');
    return payload;
  });

  const refuse = async (
    reply: FastifyReply,
    status: number,
    title: string,
    detail: string,
  ): Promise<void> => {
    reply.status(status).type('text/html; charset=utf-8');
    // Never any credential, capability or session value on a refusal page.
    reply.send(
      await reply.view('error', {
        title,
        detail,
        reopen: true,
        reopenCommand: options.reopenCommand,
      }),
    );
  };

  app.get('/assets/page.css', async (_request, reply) => {
    reply.type('text/css; charset=utf-8');
    // The stylesheet ships with the plugin, beside the templates.
    return await options.fs.readText(path.join(options.templatesDirectory, 'page.css'));
  });

  /**
   * The bootstrap. The capability appears in the URL exactly once; it is
   * consumed here, exchanged for an opaque server-side session, and the browser
   * is redirected to a clean URL so the capability leaves the address bar,
   * history and any Referer.
   */
  app.get('/', async (request, reply) => {
    const presented = (request.query as Record<string, unknown> | undefined)?.['c'];
    if (typeof presented === 'string') {
      // First, so a probe carrying the cookie does not count as activity either.
      const notNavigation = nonNavigationReason(request);
      if (notNavigation !== null) {
        logBootstrap(request, `not consumed: ${notNavigation}`);
        // Not 2xx, so a prefetch is discarded rather than served as the page.
        await refuse(
          reply,
          503,
          'This link opens only as a page.',
          `The request was ${notNavigation}, so the link was left unused. Open it in a browser tab.`,
        );
        return reply;
      }
      // Before the capability is looked at: the browser that consumed it may
      // load the same URL again, and its signed cookie already authenticates it.
      const existing = authenticate(request);
      if (existing !== null) {
        logBootstrap(request, 'already signed in, redirected');
        sessions.touch(existing);
        noteActivity();
        reply.redirect('/', 303);
        return reply;
      }
      const consumed = sessions.consumeCapability(presented);
      if (consumed.kind !== 'ok') {
        logBootstrap(request, `refused: ${consumed.reason}`);
        await refuse(reply, 403, 'That link is no longer valid.', consumed.reason);
        return reply;
      }
      logBootstrap(request, 'consumed');
      reply.setCookie(SESSION_COOKIE, consumed.session.id, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        signed: true,
        maxAge: options.idleTimeoutSeconds,
        // `secure` is deliberately not set: this page is plain HTTP on
        // 127.0.0.1, and a Secure cookie would simply never be sent back.
        // Loopback is treated as a secure context by browsers, so the cookie
        // is still not exposed to any network.
      });
      noteActivity();
      reply.redirect('/', 303);
      return reply;
    }

    const session = authenticate(request);
    if (session === null) {
      if (fromEarlierServer(request)) {
        await refuseDisconnected(reply, 'Nothing was changed.');
        return reply;
      }
      await refuse(
        reply,
        401,
        'This page needs the link your terminal printed.',
        'The session has expired, was never established, or belongs to an earlier run of the server.',
      );
      return reply;
    }
    sessions.touch(session);
    noteActivity();

    const record = await options.store.readPublication(options.result.reviewId);
    reply.type('text/html; charset=utf-8');
    return await reply.view('review', await model(reply, record, {}));
  });

  /**
   * Ends the session and stops the server, from the page itself.
   *
   * Deciding to publish nothing is an ordinary outcome of a review, and until
   * this existed it had no ending: the page went on serving until it idled out
   * half an hour later, and Ctrl-C only reaches it when `ambicode view` is
   * running in the foreground — which it is not when a skill started it. The
   * reader needs a way to say "done" from the place they are already looking.
   *
   * It writes nothing and publishes nothing. It goes through the same guards
   * as `/publish` anyway, so a page in another tab cannot close this one out
   * from under its reader.
   */
  app.post('/close', { preHandler: [disconnectGuard, originGuard, app.csrfProtection] }, async (request, reply) => {
    const session = authenticate(request);
    if (session === null) {
      await refuse(
        reply,
        401,
        'That request had no valid session.',
        'The session expired or belongs to an earlier run of the server. Nothing was changed.',
      );
      return reply;
    }

    reply.status(200).type('text/html; charset=utf-8');
    const body = await reply.view('closed', { reopenCommand: options.reopenCommand });
    // The listener is what keeps the process alive, so it can only close once
    // this response has actually reached the browser.
    reply.raw.once('finish', () => {
      void stop('closed from the page');
    });
    await reply.send(body);
    return reply;
  });

  /**
   * The only write path. It reaches a provider only from here, only with a
   * valid CSRF token, a matching Origin and an authenticated session, and only
   * for findings whose positions were saved at review time.
   */
  app.post(
    '/publish',
    { preHandler: [disconnectGuard, originGuard, app.csrfProtection] },
    async (request, reply) => {
      const session = authenticate(request);
      if (session === null) {
        await refuse(
          reply,
          401,
          'That submission had no valid session.',
          'The session expired or belongs to an earlier run of the server. Nothing was published.',
        );
        return reply;
      }
      sessions.touch(session);
      noteActivity();

      const availability = publicationAvailability(options.result, options.positions);
      if (!availability.available || options.provider === null || options.positions === null) {
        await refuse(
          reply,
          400,
          'This review cannot publish.',
          availability.unavailableReason ??
            'No provider is available for this review, so nothing was published.',
        );
        return reply;
      }

      const parsed = parseSubmission({
        body: request.body,
        knownFindingIds: new Set(options.result.findings.map((finding) => finding.id)),
        publishableFindingIds: new Set(options.positions.positions.map((entry) => entry.findingId)),
      });

      if (parsed.kind === 'invalid') {
        // The CSRF token already proved this came from our own form, so the
        // human's text is theirs and is shown back to them rather than lost.
        // `parsed.drafts` already excludes anything unknown, duplicated,
        // oversized or malformed — parsing rejected those before they ever
        // reached this map — so what remains is safe to persist even though
        // another field made the whole submission invalid (doc 03 P1.7
        // correction E). Only this response redisplays the checkboxes the
        // human had ticked; a freshly opened page never does, because
        // `buildPageModel` only checks a box from an explicit `selected` set,
        // never from a persisted draft.
        let record = await options.store.readPublication(options.result.reviewId);
        record = await options.store.saveDrafts(record, draftsOf(parsed, options.clock));
        reply.status(400).type('text/html; charset=utf-8');
        return await reply.view(
          'review',
          await model(reply, record, {
            errors: parsed.errors,
            pendingDrafts: parsed.drafts,
            selected: parsed.selected,
          }),
        );
      }

      const claimed = sessions.beginSubmission(session, parsed.submissionId);
      if (!claimed.ok) {
        await refuse(reply, 409, 'That submission was not accepted.', claimed.reason);
        return reply;
      }

      // The in-memory session lock above only serializes within this process;
      // the same saved review can be opened by a second `ambicode view`
      // (doc 03 P1.7 correction C). The lease is acquired only now, after
      // authentication, CSRF/Origin and form validation all passed, and it
      // covers everything from here through the recorded outcome.
      const lease = await acquirePublicationLease({
        fs: options.fs,
        clock: options.clock,
        ids: options.ids,
        reviewDirectory: options.store.directory,
        reviewId: options.result.reviewId,
        submissionId: parsed.submissionId,
        pid: options.processId,
      });
      if (lease.kind === 'held') {
        sessions.endSubmission(session);
        await refuse(reply, 409, 'This review is already publishing.', lease.message);
        return reply;
      }

      try {
        // The human's edits are saved before anything is sent, so a refusal,
        // a stale revision or a lost connection cannot lose their wording.
        let record = await options.store.readPublication(options.result.reviewId);
        record = await options.store.saveDrafts(record, draftsOf(parsed, options.clock));

        const positionsById = new Map(
          options.positions.positions.map((entry) => [entry.findingId, entry]),
        );
        const previous = new Map(record.outcomes.map((outcome) => [outcome.findingId, outcome]));

        const submission = await runPublication({
          provider: options.provider,
          // Server-held, from the review that was saved. Nothing about the
          // target, the position or the provider comes from the form.
          target: options.result.target.remote as RemoteTarget,
          reviewId: options.result.reviewId,
          submissionId: parsed.submissionId,
          clock: options.clock,
          positions: positionsById,
          selected: selectedComments(parsed),
          unselected: unselectedComments(parsed),
          previous,
        });

        await options.store.recordSubmission(record, submission);
      } finally {
        await lease.release();
        sessions.endSubmission(session);
      }

      // POST/Redirect/GET: a refresh re-reads the outcome instead of repeating
      // the write.
      reply.redirect('/', 303);
      return reply;
    },
  );

  /**
   * A newer `ambicode view` asking for the fixed port. Only the token this
   * process wrote to its control file is accepted, and never while a
   * publication is running: stopping then would leave comments half-posted.
   */
  app.post('/takeover', async (request, reply) => {
    const presented = request.headers[TAKEOVER_HEADER];
    const expected = options.takeoverToken;
    const matches =
      typeof presented === 'string' &&
      expected !== undefined &&
      Buffer.byteLength(presented) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
    if (!matches) {
      await refuse(reply, 403, 'That request was refused.', 'Only a newer review page on this machine can stop this one.');
      return reply;
    }
    if (sessions.publishing) {
      await refuse(reply, 409, 'This review page is publishing.', 'It stops once the publication has finished.');
      return reply;
    }
    reply.raw.once('finish', () => {
      void stop('replaced by a newer ambicode view');
    });
    reply.status(200).type('text/plain; charset=utf-8');
    await reply.send('stopping');
    return reply;
  });

  app.setNotFoundHandler(async (_request, reply) => {
    await refuse(reply, 404, 'No such page.', 'This server serves one review page and its stylesheet.');
    return reply;
  });

  app.setErrorHandler(async (error, request, reply) => {
    const code = (error as { code?: string }).code ?? '';
    if (code.startsWith('FST_CSRF')) {
      // A forged or stale submission: its content is not echoed back.
      await refuse(
        reply,
        403,
        'That submission was refused.',
        'Its form token was missing or did not match this session. Nothing was published. Reload the page and submit again.',
      );
      return reply;
    }
    if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || code === 'FST_ERR_CTP_EMPTY_TYPE') {
      await refuse(
        reply,
        415,
        'That submission was refused.',
        'This page accepts only its own HTML form, submitted as application/x-www-form-urlencoded.',
      );
      return reply;
    }
    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      await refuse(
        reply,
        413,
        'That submission was too large.',
        `A review form is bounded at ${MAX_BODY_BYTES} bytes. Nothing was published.`,
      );
      return reply;
    }
    request.log.error(error);
    await refuse(
      reply,
      500,
      'The review page could not complete that request.',
      'Nothing was published. The detail is in the terminal that started this page.',
    );
    return reply;
  });

  /**
   * One line per request carrying a capability, never the capability itself.
   * Without it, a link reported as "already been used" on its first visible
   * load could not say what had used it (MR 2719, both launches).
   */
  function logBootstrap(request: FastifyRequest, outcome: string): void {
    const header = (name: string): string => {
      const value = request.headers[name];
      return typeof value === 'string' && value !== '' ? value.slice(0, 200) : '-';
    };
    const line =
      `page: ${request.method} /?c=… ${outcome} ` +
        `(sec-fetch-mode ${header('sec-fetch-mode')}, sec-fetch-dest ${header('sec-fetch-dest')}, ` +
        `sec-purpose ${header('sec-purpose')}, purpose ${header('purpose')}, ` +
        `session cookie ${request.cookies[SESSION_COOKIE] === undefined ? 'absent' : 'present'}, ` +
        `user-agent ${header('user-agent')})`;
    // Header values reach the operator's terminal: control bytes, ANSI escapes
    // and the Unicode line separators are replaced at the sink.
    options.log?.(line.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '?'));
  }

  /**
   * A signed cookie this server cannot verify was issued by an earlier one:
   * each process signs with its own secret. On the fixed port that is the tab
   * of a page that stopped or was replaced, and it gets said so rather than
   * a CSRF or session refusal that reads like a bug.
   */
  function fromEarlierServer(request: FastifyRequest): boolean {
    const raw = request.cookies[SESSION_COOKIE];
    return raw !== undefined && !request.unsignCookie(raw).valid;
  }

  async function refuseDisconnected(reply: FastifyReply, outcome: string): Promise<void> {
    await refuse(
      reply,
      410,
      'This review page was disconnected.',
      `The page in this tab belonged to an earlier ambicode view, which has stopped or was replaced by a newer one. ${outcome} Use the newest review tab, or reopen the review.`,
    );
  }

  /** Runs before the CSRF check, whose token an earlier server signed too. */
  async function disconnectGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (fromEarlierServer(request)) await refuseDisconnected(reply, 'Nothing was published.');
  }

  function authenticate(request: FastifyRequest): ReturnType<SessionStore['get']> {
    const raw = request.cookies[SESSION_COOKIE];
    if (raw === undefined) return null;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || unsigned.value === null) return null;
    return sessions.get(unsigned.value);
  }

  /**
   * Refuses a state-changing request that did not come from this page.
   *
   * An `Origin` that names something else is always refused. An **absent**
   * `Origin` is not the same thing, and treating it as a mismatch rejected
   * legitimate submissions: a same-origin form POST is not required to carry
   * one, and browsers differ on whether they send it. So when it is absent,
   * same origin has to be established some other way — `Sec-Fetch-Site`,
   * which every current browser sends and no page can forge, or a `Referer`
   * on this exact origin.
   *
   * Dropping to that fallback gives up very little. This request has already
   * passed the `Host` check in `onRequest`, and it still has to carry the CSRF
   * token and an authenticated signed session cookie, which is what actually
   * stops a cross-site post. `Origin` is the outermost of four checks, not the
   * only one.
   */
  async function originGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (authority === '') return;
    const expected = `http://${authority}`;
    const origin = request.headers.origin;
    const site = request.headers['sec-fetch-site'];
    const referer = request.headers.referer;

    let refusal: string | null = null;
    if (origin !== undefined && origin !== 'null') {
      if (origin !== expected) refusal = `This page accepts ${expected}; the request carried Origin ${origin}.`;
    } else if (site !== undefined) {
      if (site !== 'same-origin') refusal = `The request reported Sec-Fetch-Site ${String(site)}, not same-origin.`;
    } else if (referer !== undefined) {
      if (!referer.startsWith(`${expected}/`) && referer !== expected) {
        refusal = `The request carried no Origin, and its Referer ${referer} is not this page.`;
      }
    } else {
      refusal = `The request carried no Origin, no Sec-Fetch-Site and no Referer, so it could not be shown to come from ${expected}.`;
    }
    if (refusal === null) return;

    reply.status(403).type('text/html; charset=utf-8');
    await reply.send(
      await reply.view('error', {
        title: 'That submission did not come from this page.',
        // Say what actually arrived: the previous message named only what was
        // wanted, which left a legitimate refusal indistinguishable from a bug.
        detail: `${refusal} Nothing was published.`,
        reopen: true,
        reopenCommand: options.reopenCommand,
      }),
    );
  }

  async function model(
    reply: FastifyReply,
    record: PublicationRecord,
    extra: {
      errors?: string[];
      pendingDrafts?: Map<string, string>;
      selected?: Set<string>;
    },
  ): Promise<ReturnType<typeof buildPageModel>> {
    const last = record.submissions.at(-1);
    const lastSubmission: LastSubmission | null =
      last === undefined
        ? null
        : summarizeSubmission(last.submittedAt, last.stopped, last.stoppedReason, last.outcomes);

    return buildPageModel({
      result: options.result,
      positions: options.positions,
      drafts: record.drafts,
      outcomes: record.outcomes,
      lastSubmission,
      // A per-render token bound to the session's CSRF secret cookie.
      csrfToken: reply.generateCsrf(),
      submissionId: options.ids.capability(),
      ...(extra.errors === undefined ? {} : { errors: extra.errors }),
      ...(extra.pendingDrafts === undefined ? {} : { pendingDrafts: extra.pendingDrafts }),
      ...(extra.selected === undefined ? {} : { selected: extra.selected }),
    });
  }

  return {
    app,
    sessions,
    capability: sessions.issueCapability(),
    setAuthority: (value: string) => {
      authority = value;
    },
    stopped,
    beginShutdown,
    stop,
    noteActivity,
  };
}

/**
 * Why a request presenting the capability must not consume it, or null for a
 * top-level page load. Fastify answers HEAD with the GET handler, and a
 * prefetch or subresource fetch would otherwise spend the link before the tab
 * does. `Sec-Fetch-*` is judged only when sent: a client that sends none is not
 * shown to be anything but a navigation.
 */
function nonNavigationReason(request: FastifyRequest): string | null {
  if (request.method === 'HEAD') return 'a HEAD request';
  const purpose = `${String(request.headers['sec-purpose'] ?? '')} ${String(request.headers['purpose'] ?? '')}`;
  if (/prefetch|prerender/i.test(purpose)) return 'a prefetch';
  const mode = request.headers['sec-fetch-mode'];
  if (mode !== undefined && mode !== 'navigate') return 'not a navigation (Sec-Fetch-Mode)';
  const dest = request.headers['sec-fetch-dest'];
  if (dest !== undefined && dest !== 'document') return 'not for a page (Sec-Fetch-Dest)';
  return null;
}

/**
 * Shared by the accepted and the rejected path: both carry the same
 * `drafts`/`selected` shape, and a rejected submission's known, bounded draft
 * text is preserved exactly like an accepted one's (doc 03 P1.7 correction E).
 */
function draftsOf(parsed: Pick<ParsedSubmission, 'drafts' | 'selected'>, clock: Clock) {
  const at = clock.now().toISOString();
  return [...parsed.drafts.entries()].map(([findingId, body]) => ({
    findingId,
    body,
    selected: parsed.selected.has(findingId),
    updatedAt: at,
  }));
}

function selectedComments(parsed: ParsedSubmission & { kind: 'ok' }): SelectedComment[] {
  return [...parsed.drafts.entries()]
    .filter(([findingId]) => parsed.selected.has(findingId))
    .map(([findingId, body]) => ({ findingId, body }));
}

function unselectedComments(parsed: ParsedSubmission & { kind: 'ok' }): SelectedComment[] {
  return [...parsed.drafts.entries()]
    .filter(([findingId]) => !parsed.selected.has(findingId))
    .map(([findingId, body]) => ({ findingId, body }));
}
