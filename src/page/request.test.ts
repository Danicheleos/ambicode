import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTHORITY,
  ORIGIN,
  cookieJar,
  form,
  openPage,
  reopenHarness,
  startHarness,
  type Harness,
  type OpenedPage,
} from '../testing/page-harness.ts';

/**
 * U21. What the server accepts, and what it refuses. Every refusal here has to
 * leave the merge request untouched, which the fake provider's call list
 * proves rather than implies.
 */

async function post(
  harness: Harness,
  page: OpenedPage,
  fields: Record<string, string | string[]>,
  overrides: {
    host?: string;
    origin?: string | null;
    contentType?: string;
    cookie?: string;
    secFetchSite?: string;
    referer?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    host: overrides.host ?? AUTHORITY,
    'content-type': overrides.contentType ?? 'application/x-www-form-urlencoded',
    cookie: overrides.cookie ?? page.cookies,
  };
  if (overrides.origin !== null) headers.origin = overrides.origin ?? ORIGIN;
  if (overrides.secFetchSite !== undefined) headers['sec-fetch-site'] = overrides.secFetchSite;
  if (overrides.referer !== undefined) headers.referer = overrides.referer;
  return await harness.server.app.inject({
    method: 'POST',
    url: '/publish',
    headers,
    payload: form(fields),
  });
}

function validFields(page: OpenedPage): Record<string, string> {
  return {
    _csrf: page.csrfToken,
    submissionId: page.submissionId,
    'body_f-aaaa': 'Please seed the reduce.',
    'body_f-bbbb': 'A second comment.',
    'select_f-aaaa': 'on',
  };
}

describe('U21 the page accepts only its own form', () => {
  it('opens a session from the link and redirects to a clean URL, on every visit', async () => {
    const harness = await startHarness();
    try {
      const first = await harness.server.app.inject({
        method: 'GET',
        url: `/${harness.server.capability}`,
        headers: { host: AUTHORITY },
      });
      assert.equal(first.statusCode, 303);
      assert.equal(first.headers.location, '/');
      const session = first.cookies.find((cookie) => cookie.name === 'ambicode_session');
      assert.ok(session, 'a session cookie is set');
      assert.equal(session.httpOnly, true);
      assert.equal(session.sameSite, 'Strict');
      assert.equal(session.path, '/');
      assert.equal(session.domain, undefined);
      assert.ok((session.maxAge ?? 0) > 0);
      // The signed value is not the raw session id.
      assert.ok(session.value.includes('.'));

      // Reusable by design since MR 2719: a second browser, with no cookie,
      // gets its own session rather than "already used".
      const replay = await harness.server.app.inject({
        method: 'GET',
        url: `/${harness.server.capability}`,
        headers: { host: AUTHORITY },
      });
      assert.equal(replay.statusCode, 303);
      const second = replay.cookies.find((cookie) => cookie.name === 'ambicode_session');
      assert.ok(second);
      assert.notEqual(second.value, session.value);
      assert.equal(harness.server.sessions.sessionCount, 2);

      // The bare address carries no session and says where the link is.
      const bare = await harness.server.app.inject({ method: 'GET', url: '/', headers: { host: AUTHORITY } });
      assert.equal(bare.statusCode, 401);
      assert.match(bare.body, /ends in a token/);
      assert.ok(!bare.body.includes(harness.server.capability));
    } finally {
      await harness.dispose();
    }
  });

  it('lets a browser that already has a session load the link again without a second one', async () => {
    const harness = await startHarness();
    try {
      const url = `/${harness.server.capability}`;
      const first = await harness.server.app.inject({ method: 'GET', url, headers: { host: AUTHORITY } });
      const jar = cookieJar(first.cookies);

      const again = await harness.server.app.inject({
        method: 'GET',
        url,
        headers: { host: AUTHORITY, cookie: jar.header() },
      });
      assert.equal(again.statusCode, 303);
      assert.equal(again.headers.location, '/');
      assert.equal(harness.server.sessions.sessionCount, 1, 'no second session is created');

      const page = await harness.server.app.inject({
        method: 'GET',
        url: '/',
        headers: { host: AUTHORITY, cookie: jar.header() },
      });
      assert.equal(page.statusCode, 200);
    } finally {
      await harness.dispose();
    }
  });

  it('opens no session for a HEAD, a prefetch or a subresource fetch', async () => {
    const lines: string[] = [];
    const harness = await startHarness({ log: (line) => lines.push(line) });
    try {
      const url = `/${harness.server.capability}`;
      const probes: Record<string, string>[] = [
        { 'sec-purpose': 'prefetch' },
        { purpose: 'prefetch' },
        { 'sec-purpose': 'prefetch;prerender' },
        { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' },
        { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' },
      ];
      const head = await harness.server.app.inject({ method: 'HEAD', url, headers: { host: AUTHORITY } });
      assert.equal(head.statusCode, 503);
      for (const extra of probes) {
        const probe = await harness.server.app.inject({ method: 'GET', url, headers: { host: AUTHORITY, ...extra } });
        assert.equal(probe.statusCode, 503, JSON.stringify(extra));
        assert.ok(!probe.cookies.some((cookie) => cookie.name === 'ambicode_session'));
      }
      assert.equal(harness.server.sessions.sessionCount, 0);

      const tab = await harness.server.app.inject({
        method: 'GET',
        url,
        headers: { host: AUTHORITY, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
      });
      assert.equal(tab.statusCode, 303);

      await harness.server.app.inject({
        method: 'HEAD',
        url,
        headers: { host: AUTHORITY, 'user-agent': `probe \u001b]0;owned\u0007 ${'x'.repeat(500)}` },
      });
      const hostile = lines.pop() ?? '';
      assert.doesNotMatch(hostile, /[\u0000-\u001f\u007f]/);
      assert.match(hostile, /user-agent probe \?\]0;owned\? x+\)$/);
      assert.ok(hostile.length < 600, 'the header is bounded');
      // The refusal names the header but never echoes its value, to the page or the log.
      const refused = await harness.server.app.inject({
        method: 'GET',
        url,
        headers: { host: AUTHORITY, 'sec-fetch-mode': `cors\u001b[2J${'y'.repeat(500)}` },
      });
      assert.doesNotMatch(refused.body, /cors|\u001b/);
      const echoed = lines.pop() ?? '';
      assert.match(echoed, /not redeemed: not a navigation \(Sec-Fetch-Mode\) \(sec-fetch-mode cors\?\[2Jy+,/);
      assert.doesNotMatch(echoed, /[\u0000-\u001f\u007f]/);
      assert.ok(echoed.length < 800, 'the logged header is bounded');

      assert.equal(lines.length, probes.length + 2);
      assert.match(lines[0] ?? '', /^page: HEAD \/<link> not redeemed: a HEAD request/);
      assert.match(lines.at(-1) ?? '', /GET \/<link> redeemed .*sec-fetch-mode navigate/);
      for (const line of lines) assert.ok(!line.includes(harness.server.capability), line);
    } finally {
      await harness.dispose();
    }
  });

  it('does not count a probe that carries the session cookie as activity', async () => {
    const harness = await startHarness();
    try {
      const url = `/${harness.server.capability}`;
      const first = await harness.server.app.inject({ method: 'GET', url, headers: { host: AUTHORITY } });
      const jar = cookieJar(first.cookies);
      const signed = first.cookies.find((cookie) => cookie.name === 'ambicode_session')?.value ?? '';
      const session = harness.server.sessions.get(harness.server.app.unsignCookie(signed).value ?? undefined);
      assert.ok(session);
      const seen = session.lastSeenAt;

      harness.clock.advance(60_000);
      const probe = await harness.server.app.inject({
        method: 'GET',
        url,
        headers: { host: AUTHORITY, cookie: jar.header(), 'sec-purpose': 'prefetch' },
      });
      assert.equal(probe.statusCode, 503);
      assert.equal(session.lastSeenAt, seen);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a link token it never issued', async () => {
    const harness = await startHarness();
    try {
      const response = await harness.server.app.inject({
        method: 'GET',
        url: `/${'z'.repeat(40)}`,
        headers: { host: AUTHORITY },
      });
      assert.equal(response.statusCode, 403);
      assert.match(response.body, /printed by an earlier ambicode view/);

      // Not shaped like a token at all: an ordinary 404, never a session.
      const other = await harness.server.app.inject({ method: 'GET', url: '/favicon.ico', headers: { host: AUTHORITY } });
      assert.equal(other.statusCode, 404);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a request that names a different host', async () => {
    const harness = await startHarness();
    try {
      const response = await harness.server.app.inject({
        method: 'GET',
        url: `/${harness.server.capability}`,
        headers: { host: 'review.example.com' },
      });
      assert.equal(response.statusCode, 400);
      assert.match(response.body, /answers only for 127\.0\.0\.1:7777/);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a page request with no session', async () => {
    const harness = await startHarness();
    try {
      const response = await harness.server.app.inject({
        method: 'GET',
        url: '/',
        headers: { host: AUTHORITY },
      });
      assert.equal(response.statusCode, 401);
      assert.match(response.body, /needs the review link./);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a session cookie from another server run', async () => {
    const one = await startHarness();
    const two = await startHarness();
    try {
      const page = await openPage(one);
      const response = await two.server.app.inject({
        method: 'GET',
        url: '/',
        headers: { host: AUTHORITY, cookie: page.cookies },
      });
      // Still refused; since the fixed port this is how a replaced page's tab
      // arrives, so it is named a disconnect rather than a missing link.
      assert.equal(response.statusCode, 410);
      assert.match(response.body, /This review page was disconnected./);
      assert.doesNotMatch(response.body, /Review r-0001/);
    } finally {
      await one.dispose();
      await two.dispose();
    }
  });

  it('refuses a submission with no CSRF token, and publishes nothing', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const fields = validFields(page);
      delete (fields as Record<string, unknown>)._csrf;
      const response = await post(harness, page, fields);

      assert.equal(response.statusCode, 403);
      assert.match(response.body, /form token was missing or did not match/);
      assert.deepEqual(harness.provider?.published, []);
      // A refused forgery is not echoed back.
      assert.ok(!response.body.includes('Please seed the reduce.'));
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a submission with the wrong Origin', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, validFields(page), {
        origin: 'http://attacker.example.com',
      });
      assert.equal(response.statusCode, 403);
      assert.match(response.body, /accepts http:\/\/127\.0\.0\.1:7777/);
      // The refusal names what actually arrived, so a genuine refusal reads
      // differently from a guard that is rejecting its own page.
      assert.match(response.body, /attacker\.example\.com/);
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a submission that cannot be shown to come from this page', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      // No Origin, and nothing else that establishes where it came from.
      const response = await post(harness, page, validFields(page), { origin: null });
      assert.equal(response.statusCode, 403);
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('stops the server when the reader closes the page, publishing nothing', async () => {
    // Deciding to publish nothing is an ordinary outcome, and it needs an
    // ending. Ctrl-C does not reach a page a skill started in the background.
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await harness.server.app.inject({
        method: 'POST',
        url: '/close',
        headers: { host: AUTHORITY, origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded', cookie: page.cookies },
        payload: form({ _csrf: page.csrfToken }),
      });

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /The page is closed/);
      assert.deepEqual(harness.provider?.published, []);
      assert.equal(await harness.server.stopped, 'closed from the page');
    } finally {
      await harness.dispose();
    }
  });

  it('refuses to close on a request that is not from the page', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const noToken = await harness.server.app.inject({
        method: 'POST',
        url: '/close',
        headers: { host: AUTHORITY, origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded', cookie: page.cookies },
        payload: form({}),
      });
      assert.equal(noToken.statusCode, 403);

      const badOrigin = await harness.server.app.inject({
        method: 'POST',
        url: '/close',
        headers: {
          host: AUTHORITY,
          origin: 'http://attacker.example.com',
          'content-type': 'application/x-www-form-urlencoded',
          cookie: page.cookies,
        },
        payload: form({ _csrf: page.csrfToken }),
      });
      assert.equal(badOrigin.statusCode, 403);
    } finally {
      await harness.dispose();
    }
  });

  it('accepts a same-origin submission that carries no Origin header', async () => {
    // A same-origin form POST is not obliged to send `Origin`, and browsers
    // differ on whether they do. Refusing on its absence rejected real
    // submissions from the page the server had just opened itself. The CSRF
    // token, the signed session cookie and the Host check all still apply.
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, validFields(page), {
        origin: null,
        secFetchSite: 'same-origin',
      });
      assert.notEqual(response.statusCode, 403);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a cross-site submission that carries no Origin header', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, validFields(page), {
        origin: null,
        secFetchSite: 'cross-site',
      });
      assert.equal(response.statusCode, 403);
      assert.match(response.body, /cross-site/);
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('accepts a Referer on this page when neither Origin nor Sec-Fetch-Site is present', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, validFields(page), {
        origin: null,
        referer: 'http://127.0.0.1:7777/',
      });
      assert.notEqual(response.statusCode, 403);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a Referer from somewhere else when Origin is absent', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, validFields(page), {
        origin: null,
        referer: 'http://evil.example.com/',
      });
      assert.equal(response.statusCode, 403);
      assert.match(response.body, /evil\.example\.com/);
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a body that is not a form', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await harness.server.app.inject({
        method: 'POST',
        url: '/publish',
        headers: {
          host: AUTHORITY,
          origin: ORIGIN,
          cookie: page.cookies,
          'content-type': 'application/json',
        },
        payload: JSON.stringify(validFields(page)),
      });
      assert.equal(response.statusCode, 415);
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses an unknown finding id, a duplicate field and an unexpected field', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);

      const unknown = await post(harness, page, {
        ...validFields(page),
        'body_f-nope': 'x',
        'select_f-nope': 'on',
      });
      assert.equal(unknown.statusCode, 400);
      assert.match(unknown.body, /a finding this review does not contain/);

      const duplicate = await post(harness, page, {
        ...validFields(page),
        'body_f-aaaa': ['one', 'two'],
      });
      assert.equal(duplicate.statusCode, 400);
      assert.match(duplicate.body, /was submitted more than once/);

      const unexpected = await post(harness, page, { ...validFields(page), colour: 'red' });
      assert.equal(unexpected.statusCode, 400);
      assert.match(unexpected.body, /is not part of this form/);

      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a submitted path, SHA, position or provider outright', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      for (const injected of ['new_path', 'head_sha', 'new_line', 'provider', 'target', 'position']) {
        const response = await post(harness, page, {
          ...validFields(page),
          [injected]: 'attacker-supplied',
        });
        assert.equal(response.statusCode, 400, injected);
        assert.match(
          response.body,
          /Positions, paths, revisions and the merge request are taken from the saved review/,
        );
      }
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a selected finding with a blank comment', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, {
        ...validFields(page),
        'body_f-aaaa': '   \n  ',
      });
      assert.equal(response.statusCode, 400);
      assert.match(response.body, /selected with an empty comment/);
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a selected finding that has no saved position', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, {
        ...validFields(page),
        'body_f-cccc': 'text',
        'select_f-cccc': 'on',
      });
      assert.equal(response.statusCode, 400);
      assert.match(response.body, /has no exact saved position/);
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses an oversized field and an oversized body', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);

      const bigField = await post(harness, page, {
        ...validFields(page),
        'body_f-bbbb': 'x'.repeat(17_000),
      });
      assert.equal(bigField.statusCode, 400);
      assert.match(bigField.body, /longer than the 16384-byte limit/);

      const bigBody = await harness.server.app.inject({
        method: 'POST',
        url: '/publish',
        headers: {
          host: AUTHORITY,
          origin: ORIGIN,
          cookie: page.cookies,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: `_csrf=${page.csrfToken}&submissionId=${page.submissionId}&body_f-aaaa=${'y'.repeat(600_000)}`,
      });
      assert.equal(bigBody.statusCode, 413);

      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('keeps the human text and the selections when it refuses a form', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, {
        ...validFields(page),
        'body_f-aaaa': 'A careful comment I do not want to lose.',
        'body_f-bbbb': `Another one with markup <b>kept as text</b>.`,
        'select_f-bbbb': 'on',
        stowaway: 'x',
      });

      assert.equal(response.statusCode, 400);
      assert.match(response.body, /A careful comment I do not want to lose\./);
      assert.match(response.body, /Another one with markup &lt;b&gt;kept as text&lt;\/b&gt;\./);
      // Both boxes the human had checked are checked again.
      assert.match(response.body, /name="select_f-aaaa" value="on" checked/);
      assert.match(response.body, /name="select_f-bbbb" value="on" checked/);
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('persists a valid draft accompanying a blank selection, and shows it unchecked on reopening', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, {
        ...validFields(page),
        'body_f-aaaa': 'A valid draft next to a field that will fail.',
        'body_f-bbbb': '   ',
        'select_f-bbbb': 'on',
      });
      assert.equal(response.statusCode, 400);
      assert.match(response.body, /selected with an empty comment/);

      // Persisted for a future load, not only redisplayed on this response
      // (doc 03 P1.7 correction E).
      const record = await harness.store.readPublication(harness.result.reviewId);
      assert.equal(
        record.drafts.find((draft) => draft.findingId === 'f-aaaa')?.body,
        'A valid draft next to a field that will fail.',
      );

      // A newly opened page — a second process reading the same saved
      // review, with a fresh capability and session and no `selected`
      // redisplay set — shows the preserved text but starts every checkbox
      // unchecked.
      const second = await reopenHarness(harness);
      try {
        const reopened = await openPage(second);
        assert.match(reopened.html, /A valid draft next to a field that will fail\./);
        assert.doesNotMatch(reopened.html, /name="select_f-aaaa" value="on" checked/);
        assert.doesNotMatch(reopened.html, /name="select_f-bbbb" value="on" checked/);
      } finally {
        await second.dispose();
      }
    } finally {
      await harness.dispose();
    }
  });

  it('persists a valid draft accompanying an unexpected field', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, {
        ...validFields(page),
        'body_f-bbbb': 'Kept even though the request carries a stowaway field.',
        stowaway: 'x',
      });
      assert.equal(response.statusCode, 400);
      assert.match(response.body, /is not part of this form/);

      const record = await harness.store.readPublication(harness.result.reviewId);
      assert.equal(
        record.drafts.find((draft) => draft.findingId === 'f-bbbb')?.body,
        'Kept even though the request carries a stowaway field.',
      );
    } finally {
      await harness.dispose();
    }
  });

  it('does not persist an oversized field from a rejected submission', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, {
        ...validFields(page),
        'body_f-bbbb': 'x'.repeat(17_000),
      });
      assert.equal(response.statusCode, 400);

      const record = await harness.store.readPublication(harness.result.reviewId);
      assert.equal(record.drafts.find((draft) => draft.findingId === 'f-bbbb'), undefined);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a replayed submission id', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const first = await post(harness, page, validFields(page));
      assert.equal(first.statusCode, 303);

      const jar = cookieJar(first.cookies);
      void jar;
      const replay = await post(harness, page, validFields(page));
      assert.equal(replay.statusCode, 409);
      assert.match(replay.body, /already submitted/);
      // Exactly one comment was sent, not two.
      assert.equal(harness.provider?.published.length, 1);
    } finally {
      await harness.dispose();
    }
  });
});
