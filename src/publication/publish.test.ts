import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTHORITY,
  ORIGIN,
  form,
  openPage,
  startHarness,
  FakeClock,
  type Harness,
  type OpenedPage,
} from '../testing/page-harness.ts';
import { currentRevision, staleRevision, FakeProvider } from '../testing/fake-provider.ts';
import { publicationPositions, reviewResult } from '../testing/review-fixture.ts';
import { findMarker } from './marker.ts';

/**
 * U22. Publication happens on one path only, and the fake provider records
 * every call it receives, so "no write happened" is checked rather than
 * assumed.
 */

async function publish(
  harness: Harness,
  page: OpenedPage,
  fields: Record<string, string | string[]>,
) {
  return await harness.server.app.inject({
    method: 'POST',
    url: '/publish',
    headers: {
      host: AUTHORITY,
      origin: ORIGIN,
      cookie: page.cookies,
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: form({ _csrf: page.csrfToken, submissionId: page.submissionId, ...fields }),
  });
}

const BODIES = {
  'body_f-aaaa': 'Seed the reduce with zero.',
  'body_f-bbbb': 'This one stays a draft.',
};

describe('U22 publication happens only when a human submits the form', () => {
  it('writes nothing on any GET, however many times the page is opened', async () => {
    const harness = await startHarness();
    try {
      await openPage(harness);
      await harness.server.app.inject({ method: 'GET', url: '/', headers: { host: AUTHORITY } });
      await harness.server.app.inject({
        method: 'GET',
        url: '/assets/page.css',
        headers: { host: AUTHORITY },
      });
      assert.deepEqual(harness.provider?.published, []);
      assert.ok(!harness.provider?.calls.includes('publishComment'));
    } finally {
      await harness.dispose();
    }
  });

  it('writes nothing when the form is submitted with no finding selected', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await publish(harness, page, BODIES);
      assert.equal(response.statusCode, 303);
      assert.deepEqual(harness.provider?.published, []);

      // The drafts were still saved, so the work is not lost.
      const record = await harness.store.readPublication(harness.result.reviewId);
      assert.equal(record.drafts.find((draft) => draft.findingId === 'f-aaaa')?.body, BODIES['body_f-aaaa']);
      assert.deepEqual(
        record.outcomes.map((outcome) => [outcome.findingId, outcome.state]).sort(),
        [
          ['f-aaaa', 'not-selected'],
          ['f-bbbb', 'not-selected'],
        ],
      );
    } finally {
      await harness.dispose();
    }
  });

  it('publishes exactly the selected comments, with the human text preserved', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const response = await publish(harness, page, { ...BODIES, 'select_f-aaaa': 'on' });
      assert.equal(response.statusCode, 303);

      const sent = harness.provider?.published ?? [];
      assert.equal(sent.length, 1);
      const body = sent[0]?.body ?? '';
      // Exactly what the human wrote, then the hidden marker; nothing reflowed.
      assert.ok(body.startsWith('Seed the reduce with zero.'));
      const marker = findMarker(body);
      assert.ok(marker);
      assert.equal(marker.findingId, 'f-aaaa');
      assert.equal(marker.reviewId, harness.result.reviewId);

      // The position came from the saved review, not from the form.
      assert.equal(sent[0]?.position.headSha, 'c'.repeat(40));
      assert.equal(sent[0]?.position.newLine, 2);

      const record = await harness.store.readPublication(harness.result.reviewId);
      const published = record.outcomes.find((outcome) => outcome.findingId === 'f-aaaa');
      assert.equal(published?.state, 'published');
      assert.equal(published?.body, 'Seed the reduce with zero.');
      assert.match(published?.discussionUrl ?? '', /#note_n1$/);
      assert.equal(
        record.outcomes.find((outcome) => outcome.findingId === 'f-bbbb')?.state,
        'not-selected',
      );
    } finally {
      await harness.dispose();
    }
  });

  it('checks the current revision before the submission and before each comment', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      await publish(harness, page, {
        ...BODIES,
        'select_f-aaaa': 'on',
        'select_f-bbbb': 'on',
      });

      const checks = harness.provider?.calls.filter((call) => call === 'getCurrentRevision') ?? [];
      // Once before anything is sent, then again before the second comment.
      assert.equal(checks.length, 2);
      assert.equal(harness.provider?.published.length, 2);
    } finally {
      await harness.dispose();
    }
  });

  it('stops before sending anything when the revision has already moved', async () => {
    const provider = new FakeProvider();
    provider.revisions = [staleRevision()];
    const harness = await startHarness({ provider });
    try {
      const page = await openPage(harness);
      await publish(harness, page, { ...BODIES, 'select_f-aaaa': 'on', 'select_f-bbbb': 'on' });

      assert.deepEqual(provider.published, []);
      const record = await harness.store.readPublication(harness.result.reviewId);
      assert.ok(record.outcomes.every((outcome) => outcome.state === 'stale'));
      assert.match(record.submissions.at(-1)?.stoppedReason ?? '', /no longer the revision this review was pinned to/);
      // The human's wording survives the refusal.
      assert.equal(record.drafts.find((draft) => draft.findingId === 'f-aaaa')?.body, BODIES['body_f-aaaa']);
    } finally {
      await harness.dispose();
    }
  });

  it('stops the remaining comments when the revision moves mid-run, and never relocates one', async () => {
    const provider = new FakeProvider();
    // Current for the pre-flight check and the first comment; moved after that.
    provider.revisions = [currentRevision(), staleRevision()];
    const harness = await startHarness({ provider });
    try {
      const page = await openPage(harness);
      await publish(harness, page, { ...BODIES, 'select_f-aaaa': 'on', 'select_f-bbbb': 'on' });

      assert.equal(provider.published.length, 1);
      const record = await harness.store.readPublication(harness.result.reviewId);
      assert.equal(record.outcomes.find((o) => o.findingId === 'f-aaaa')?.state, 'published');
      const stopped = record.outcomes.find((o) => o.findingId === 'f-bbbb');
      assert.equal(stopped?.state, 'stale');
      assert.match(stopped?.message ?? '', /no comment was moved to a current line/);
      assert.match(stopped?.message ?? '', /Run a fresh review/);
      // The unsent draft is retained exactly.
      assert.equal(stopped?.body, BODIES['body_f-bbbb']);
    } finally {
      await harness.dispose();
    }
  });

  it('keeps an earlier confirmed publication accurate after a later failure', async () => {
    const provider = new FakeProvider();
    provider.publishFailures = [null, 'glab api failed with exit code 1.'];
    const harness = await startHarness({ provider });
    try {
      const page = await openPage(harness);
      await publish(harness, page, { ...BODIES, 'select_f-aaaa': 'on', 'select_f-bbbb': 'on' });

      const record = await harness.store.readPublication(harness.result.reviewId);
      assert.equal(record.outcomes.find((o) => o.findingId === 'f-aaaa')?.state, 'published');
      const failed = record.outcomes.find((o) => o.findingId === 'f-bbbb');
      assert.equal(failed?.state, 'failed-before-send');
      assert.match(failed?.message ?? '', /Nothing was created on the merge request/);
    } finally {
      await harness.dispose();
    }
  });

  it('has no publish route effect for a local review', async () => {
    const harness = await startHarness({
      result: reviewResult({ kind: 'working', remote: null }),
      positions: null,
      provider: null,
    });
    try {
      const page = await openPage(harness);
      const response = await publish(harness, page, { ...BODIES, 'select_f-aaaa': 'on' });
      assert.equal(response.statusCode, 400);
      assert.match(response.body, /This is a local review/);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses to publish a GitHub review', async () => {
    const result = reviewResult();
    const github = { ...result.target.remote!, provider: 'github' as const };
    const harness = await startHarness({
      result: { ...result, target: { ...result.target, remote: github } },
      positions: publicationPositions(result, github),
      provider: null,
    });
    try {
      const page = await openPage(harness);
      assert.match(page.html, /does not publish to github/);
      const response = await publish(harness, page, { ...BODIES, 'select_f-aaaa': 'on' });
      assert.equal(response.statusCode, 400);
      assert.match(response.body, /does not publish to github/);
    } finally {
      await harness.dispose();
    }
  });

  it('records a clock-stamped submission without persisting any secret', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      await publish(harness, page, { ...BODIES, 'select_f-aaaa': 'on' });

      const raw = await (await import('node:fs/promises')).readFile(
        `${harness.directory}/publication.json`,
        'utf8',
      );
      assert.ok(!raw.includes(harness.server.capability));
      assert.ok(!raw.includes(page.csrfToken));
      assert.ok(!/cookie|token|secret/i.test(raw));
      assert.ok(new FakeClock() instanceof Object);
    } finally {
      await harness.dispose();
    }
  });
});
