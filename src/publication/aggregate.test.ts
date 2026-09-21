import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyPublicationRecord, type PublicationOutcome } from '../contracts/publication.ts';
import { isAmbicodeError } from '../util/errors.ts';
import { FAKE_TARGET } from '../testing/fake-provider.ts';
import { publicationPositions, reviewResult } from '../testing/review-fixture.ts';
import { validateReviewAggregate } from './aggregate.ts';

/**
 * P1.7 correction D. Each fixture below is individually schema-valid; the
 * point of every test is that `validateReviewAggregate` still refuses it,
 * because it disagrees with the others across a boundary no single file's
 * schema can see.
 */

function refusalDetails(run: () => void): string[] {
  try {
    run();
  } catch (error) {
    if (isAmbicodeError(error)) return error.details;
    throw error;
  }
  throw new Error('expected validateReviewAggregate to refuse, but it did not');
}

describe('P1.7 correction D: saved review aggregate validation', () => {
  it('accepts a genuinely consistent review', () => {
    const result = reviewResult();
    const positions = publicationPositions(result);
    const record = emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z');
    assert.doesNotThrow(() => validateReviewAggregate({ result, positions, record }));
  });

  it('refuses when publication.json names a different review than result.json', () => {
    const result = reviewResult();
    const positions = publicationPositions(result);
    const record = { ...emptyPublicationRecord('r-other', '2026-09-20T10:00:00.000Z') };
    const details = refusalDetails(() => validateReviewAggregate({ result, positions, record }));
    assert.ok(details.some((line) => /reviewId "r-other".*result\.json reviewId/.test(line)));
  });

  it('refuses when publication-positions.json target does not equal result.json target.remote', () => {
    const result = reviewResult();
    const positions = publicationPositions(result, { ...FAKE_TARGET, versionId: 999 });
    const record = emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z');
    const details = refusalDetails(() => validateReviewAggregate({ result, positions, record }));
    assert.ok(details.some((line) => /target does not exactly equal/.test(line)));
  });

  it('refuses when a position disagrees with the target on host/project/MR/SHAs', () => {
    const result = reviewResult();
    const positions = publicationPositions(result);
    const tampered = {
      ...positions,
      positions: positions.positions.map((entry, index) =>
        index === 0 ? { ...entry, host: 'attacker.example.com' } : entry,
      ),
    };
    const record = emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z');
    const details = refusalDetails(() => validateReviewAggregate({ result, positions: tampered, record }));
    assert.ok(details.some((line) => /does not agree with result\.json target\.remote/.test(line)));
  });

  it('refuses when a position digest does not match a fresh calculation', () => {
    const result = reviewResult();
    const positions = publicationPositions(result);
    const tampered = {
      ...positions,
      positions: positions.positions.map((entry, index) =>
        index === 0 ? { ...entry, digest: 'sha256:not-the-real-digest' } : entry,
      ),
    };
    const record = emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z');
    const details = refusalDetails(() => validateReviewAggregate({ result, positions: tampered, record }));
    assert.ok(details.some((line) => /digest.*does not match a fresh calculation/.test(line)));
  });

  it('refuses when a finding is both positioned and unplaceable', () => {
    const result = reviewResult();
    const positions = publicationPositions(result);
    const first = positions.positions[0];
    if (first === undefined) throw new Error('fixture has no positions');
    const tampered = {
      ...positions,
      unplaceable: [...positions.unplaceable, { findingId: first.findingId, reason: 'contradiction' }],
    };
    const record = emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z');
    const details = refusalDetails(() => validateReviewAggregate({ result, positions: tampered, record }));
    assert.ok(details.some((line) => /is both positioned and unplaceable/.test(line)));
  });

  it('refuses when a position references a finding not in result.json', () => {
    const result = reviewResult();
    const positions = publicationPositions(result);
    const tampered = {
      ...positions,
      positions: positions.positions.map((entry, index) =>
        index === 0 ? { ...entry, findingId: 'f-does-not-exist' } : entry,
      ),
    };
    const record = emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z');
    const details = refusalDetails(() => validateReviewAggregate({ result, positions: tampered, record }));
    assert.ok(details.some((line) => /which is not in result\.json/.test(line)));
  });

  it('refuses duplicate finding ids in result.json', () => {
    const result = reviewResult();
    const duplicated = { ...result, findings: [...result.findings, { ...result.findings[0] }] };
    const positions = publicationPositions(result);
    const record = emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z');
    const details = refusalDetails(() =>
      validateReviewAggregate({ result: duplicated as typeof result, positions, record }),
    );
    assert.ok(details.some((line) => /duplicate finding ids/.test(line)));
  });

  it('refuses a local review that carries publication-positions.json', () => {
    const result = reviewResult({ kind: 'working', remote: null });
    const positions = publicationPositions(reviewResult());
    const record = emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z');
    const details = refusalDetails(() => validateReviewAggregate({ result, positions, record }));
    assert.ok(details.some((line) => /local review cannot acquire remote publication state/.test(line)));
  });

  it('refuses a local review whose publication.json carries a settled remote outcome', () => {
    const result = reviewResult({ kind: 'working', remote: null });
    const record = {
      ...emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z'),
      outcomes: [
        {
          findingId: result.findings[0]?.id ?? 'f-aaaa',
          state: 'published',
          body: 'x',
          positionDigest: null,
          discussionId: 'd1',
          noteId: 'n1',
          discussionUrl: null,
          message: null,
          at: '2026-09-20T10:00:00.000Z',
        } satisfies PublicationOutcome,
      ],
    };
    const details = refusalDetails(() => validateReviewAggregate({ result, positions: null, record }));
    assert.ok(details.some((line) => /local review cannot acquire remote publication state/.test(line)));
  });

  it('refuses a settled outcome whose position digest disagrees with the persisted position', () => {
    const result = reviewResult();
    const positions = publicationPositions(result);
    const first = positions.positions[0];
    if (first === undefined) throw new Error('fixture has no positions');
    const record = {
      ...emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z'),
      outcomes: [
        {
          findingId: first.findingId,
          state: 'published',
          body: 'x',
          positionDigest: 'sha256:disagrees',
          discussionId: 'd1',
          noteId: 'n1',
          discussionUrl: null,
          message: null,
          at: '2026-09-20T10:00:00.000Z',
        } satisfies PublicationOutcome,
      ],
    };
    const details = refusalDetails(() => validateReviewAggregate({ result, positions, record }));
    assert.ok(details.some((line) => /does not agree with the persisted position/.test(line)));
  });

  it('refuses a draft that references a finding not in result.json', () => {
    const result = reviewResult();
    const positions = publicationPositions(result);
    const record = {
      ...emptyPublicationRecord(result.reviewId, '2026-09-20T10:00:00.000Z'),
      drafts: [{ findingId: 'f-ghost', body: 'x', selected: false, updatedAt: '2026-09-20T10:00:00.000Z' }],
    };
    const details = refusalDetails(() => validateReviewAggregate({ result, positions, record }));
    assert.ok(details.some((line) => /drafts references finding f-ghost/.test(line)));
  });
});
