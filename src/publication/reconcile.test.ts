import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PersistedPosition, PublicationOutcome } from '../contracts/publication.ts';
import {
  FAKE_TARGET,
  FakeProvider,
  currentRevision,
  note,
  thread,
} from '../testing/fake-provider.ts';
import { FakeClock } from '../testing/page-harness.ts';
import { publicationPositions, reviewResult } from '../testing/review-fixture.ts';
import { buildMarker } from './marker.ts';
import { reconcileUncertainOutcomes, runPublication } from './publish.ts';

/**
 * U23. A marker on its own proves nothing: reconciliation confirms a comment
 * only when the marker, the posting identity and the exact pinned position all
 * agree, and it never turns a lost answer into a second POST.
 */

const RESULT = reviewResult();
const POSITIONS = publicationPositions(RESULT);
const POSITION = POSITIONS.positions.find((entry) => entry.findingId === 'f-aaaa') as PersistedPosition;

function positionsMap(): Map<string, PersistedPosition> {
  return new Map(POSITIONS.positions.map((entry) => [entry.findingId, entry]));
}

/** A comment that looks exactly like one AMBICODE published. */
function ourComment(overrides: { author?: string; line?: number; digest?: string } = {}) {
  const body = `Seed the reduce with zero.\n\n${buildMarker({
    reviewId: RESULT.reviewId,
    findingId: 'f-aaaa',
    positionDigest: overrides.digest ?? POSITION.digest,
  })}`;
  return thread('existing', [
    note({
      id: 'n-existing',
      discussionId: 'existing',
      author: overrides.author ?? 'ambicode-bot',
      body,
      position: { ...POSITION.position, newLine: overrides.line ?? POSITION.position.newLine },
    }),
  ]);
}

async function run(provider: FakeProvider, previous: Map<string, PublicationOutcome> = new Map()) {
  return await runPublication({
    provider,
    target: FAKE_TARGET,
    reviewId: RESULT.reviewId,
    submissionId: 's-1',
    clock: new FakeClock(),
    positions: positionsMap(),
    selected: [{ findingId: 'f-aaaa', body: 'An edited retry that must not overwrite anything.' }],
    unselected: [],
    previous,
  });
}

describe('U23 reconciliation before any write', () => {
  it('recognizes its own comment and does not post it again', async () => {
    const provider = new FakeProvider();
    provider.discussions = [ourComment()];

    const submission = await run(provider);
    assert.deepEqual(provider.published, []);
    const [outcome] = submission.outcomes;
    assert.equal(outcome?.state, 'already-published');
    assert.equal(outcome?.discussionId, 'existing');
    assert.equal(outcome?.noteId, 'n-existing');
    assert.match(outcome?.message ?? '', /never overwrites a published comment/);
    // The retry text is kept as the human's own, but was not transmitted.
    assert.equal(outcome?.body, 'An edited retry that must not overwrite anything.');
  });

  it('rejects the same marker written by another account', async () => {
    const provider = new FakeProvider();
    provider.discussions = [ourComment({ author: 'someone-else' })];

    const submission = await run(provider);
    // Not recognized, so the comment is published for the first time.
    assert.equal(provider.published.length, 1);
    assert.equal(submission.outcomes[0]?.state, 'published');
  });

  it('rejects the same marker at a different position', async () => {
    const provider = new FakeProvider();
    provider.discussions = [ourComment({ line: 99 })];

    const submission = await run(provider);
    assert.equal(provider.published.length, 1);
    assert.equal(submission.outcomes[0]?.state, 'published');
  });

  it('reads every discussion, with no display ceiling', async () => {
    const provider = new FakeProvider();
    await run(provider);
    assert.ok(
      provider.calls.some((call) => call === `listDiscussions:${Number.POSITIVE_INFINITY}`),
      'reconciliation asks for the whole collection',
    );
  });

  it('will not post at all when the discussion list is incomplete', async () => {
    const provider = new FakeProvider();
    provider.listingComplete = false;

    const submission = await run(provider);
    assert.deepEqual(provider.published, []);
    assert.equal(submission.outcomes[0]?.state, 'failed-before-send');
    assert.match(
      submission.stoppedReason ?? '',
      /absence of an earlier comment could not be established.*must not be posted twice/s,
    );
  });

  it('will not post when the discussions cannot be read at all', async () => {
    const provider = new FakeProvider();
    provider.listFailure = 'HTTP 502';
    const submission = await run(provider);
    assert.deepEqual(provider.published, []);
    assert.equal(submission.outcomes[0]?.state, 'failed-before-send');
  });

  it('will not post when the publishing account cannot be established', async () => {
    const provider = new FakeProvider();
    provider.identity = null;
    const submission = await run(provider);
    assert.deepEqual(provider.published, []);
    assert.equal(submission.outcomes[0]?.state, 'failed-before-send');
    assert.match(submission.stoppedReason ?? '', /account AMBICODE would publish as could not be established/);
  });

  it('never re-sends a comment an earlier submission confirmed', async () => {
    const provider = new FakeProvider();
    const previous = new Map<string, PublicationOutcome>([
      [
        'f-aaaa',
        {
          findingId: 'f-aaaa',
          state: 'published',
          body: 'The original wording.',
          positionDigest: POSITION.digest,
          discussionId: 'existing',
          noteId: 'n-existing',
          discussionUrl: 'https://gitlab.example.com/#note_n-existing',
          message: null,
          at: '2026-09-20T12:00:00.000Z',
        },
      ],
    ]);

    const submission = await run(provider, previous);
    assert.deepEqual(provider.published, []);
    assert.equal(submission.outcomes[0]?.state, 'already-published');
    assert.equal(submission.outcomes[0]?.discussionUrl, 'https://gitlab.example.com/#note_n-existing');
    assert.match(submission.outcomes[0]?.message ?? '', /edit made here was not applied/);
  });
});

describe('U23 uncertain delivery', () => {
  it('confirms a lost response when the comment turns out to be there', async () => {
    const provider = new FakeProvider();
    // The write "fails" with a timeout, but the comment exists afterwards.
    provider.publishFailures = ['glab api projects/91/... timed out after 60s.'];
    const original = provider.publishComment.bind(provider);
    provider.publishComment = async (request) => {
      const outcome = await original(request);
      provider.discussions = [...provider.discussions, ourComment()];
      return outcome;
    };

    const submission = await run(provider);
    const [outcome] = submission.outcomes;
    assert.equal(outcome?.state, 'published');
    assert.match(outcome?.message ?? '', /response to the write was lost, but the comment was found/);
    // Exactly one attempt: reconciliation is a read, not a retry.
    assert.equal(provider.published.length, 1);
  });

  it('leaves a lost response uncertain when nothing matching is found, and does not resend', async () => {
    const provider = new FakeProvider();
    provider.publishFailures = ['glab api projects/91/... timed out after 60s.'];
    // The fake's default behaviour records the comment; suppress that so the
    // reconciliation genuinely finds nothing.
    provider.publishComment = async (request) => {
      provider.calls.push('publishComment');
      provider.published.push(request);
      return {
        kind: 'failed',
        provider: 'gitlab',
        operation: 'publishComment',
        message: 'glab api projects/91/... timed out after 60s.',
        details: [],
        certainty: 'uncertain',
      };
    };

    const submission = await run(provider);
    const [outcome] = submission.outcomes;
    assert.equal(outcome?.state, 'uncertain');
    assert.match(outcome?.message ?? '', /whether it was delivered is unknown/);
    assert.match(outcome?.message ?? '', /not sent again/);
    assert.equal(provider.published.length, 1);
  });

  it('stays uncertain when reconciliation itself cannot complete', async () => {
    const provider = new FakeProvider();
    let listed = 0;
    provider.publishComment = async (request) => {
      provider.published.push(request);
      // After the write, the discussion listing stops working.
      provider.listFailure = 'HTTP 502';
      return {
        kind: 'failed',
        provider: 'gitlab',
        operation: 'publishComment',
        message: 'The GitLab response for discussions does not match what AMBICODE expects.',
        details: [],
        certainty: 'uncertain',
      };
    };
    const originalList = provider.listDiscussions.bind(provider);
    provider.listDiscussions = async (request) => {
      listed += 1;
      return await originalList(request);
    };

    const submission = await run(provider);
    assert.equal(submission.outcomes[0]?.state, 'uncertain');
    assert.match(submission.outcomes[0]?.message ?? '', /Reconciliation could not complete/);
    // One listing before the write, one after it; never a second write.
    assert.equal(listed, 2);
    assert.equal(provider.published.length, 1);
  });

  it('reconciles uncertain outcomes on reopening, without publishing anything', async () => {
    const provider = new FakeProvider();
    provider.revisions = [currentRevision()];
    provider.discussions = [ourComment()];

    const outcomes: PublicationOutcome[] = [
      {
        findingId: 'f-aaaa',
        state: 'uncertain',
        body: 'Seed the reduce with zero.',
        positionDigest: POSITION.digest,
        discussionId: null,
        noteId: null,
        discussionUrl: null,
        message: 'The answer was lost.',
        at: '2026-09-20T12:00:00.000Z',
      },
    ];

    const reconciled = await reconcileUncertainOutcomes({
      provider,
      target: FAKE_TARGET,
      reviewId: RESULT.reviewId,
      positions: positionsMap(),
      outcomes,
      clock: new FakeClock(),
    });

    assert.equal(reconciled.updated.length, 1);
    assert.equal(reconciled.updated[0]?.state, 'published');
    assert.equal(reconciled.updated[0]?.noteId, 'n-existing');
    assert.deepEqual(provider.published, []);
  });

  it('keeps an outcome uncertain on reopening when reconciliation finds nothing', async () => {
    const provider = new FakeProvider();
    const reconciled = await reconcileUncertainOutcomes({
      provider,
      target: FAKE_TARGET,
      reviewId: RESULT.reviewId,
      positions: positionsMap(),
      outcomes: [
        {
          findingId: 'f-aaaa',
          state: 'uncertain',
          body: 'x',
          positionDigest: POSITION.digest,
          discussionId: null,
          noteId: null,
          discussionUrl: null,
          message: null,
          at: '2026-09-20T12:00:00.000Z',
        },
      ],
      clock: new FakeClock(),
    });

    assert.deepEqual(reconciled.updated, []);
    assert.match(reconciled.notes.join('\n'), /remains uncertain; submit it again deliberately/);
    assert.deepEqual(provider.published, []);
  });
});
