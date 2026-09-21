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
  overrides: { host?: string; origin?: string | null; contentType?: string; cookie?: string } = {},
) {
  const headers: Record<string, string> = {
    host: overrides.host ?? AUTHORITY,
    'content-type': overrides.contentType ?? 'application/x-www-form-urlencoded',
    cookie: overrides.cookie ?? page.cookies,
  };
  if (overrides.origin !== null) headers.origin = overrides.origin ?? ORIGIN;
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
  it('consumes the capability exactly once and redirects to a clean URL', async () => {
    const harness = await startHarness();
    try {
      const first = await harness.server.app.inject({
        method: 'GET',
        url: `/?c=${harness.server.capability}`,
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

      // The same capability a second time is dead.
      const replay = await harness.server.app.inject({
        method: 'GET',
        url: `/?c=${harness.server.capability}`,
        headers: { host: AUTHORITY },
      });
      assert.equal(replay.statusCode, 403);
      assert.match(replay.body, /already been used/);
      assert.ok(!replay.body.includes(harness.server.capability));
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a capability it never issued', async () => {
    const harness = await startHarness();
    try {
      const response = await harness.server.app.inject({
        method: 'GET',
        url: `/?c=${'z'.repeat(40)}`,
        headers: { host: AUTHORITY },
      });
      assert.equal(response.statusCode, 403);
      assert.match(response.body, /not the one this server issued/);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a request that names a different host', async () => {
    const harness = await startHarness();
    try {
      const response = await harness.server.app.inject({
        method: 'GET',
        url: `/?c=${harness.server.capability}`,
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
      assert.match(response.body, /needs the link your terminal printed/);
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
      assert.equal(response.statusCode, 401);
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
      assert.match(response.body, /must carry Origin http:\/\/127\.0\.0\.1:7777/);
      assert.deepEqual(harness.provider?.published, []);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a submission with no Origin at all', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await post(harness, page, validFields(page), { origin: null });
      assert.equal(response.statusCode, 403);
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
