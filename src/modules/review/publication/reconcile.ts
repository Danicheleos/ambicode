import type { PersistedPosition } from '#types/modules/publication';
import { samePosition, type RemoteDiscussion } from '#types/platform/provider';
import { findMarker, markerMatches } from './marker.ts';

/**
 * Already posted only when the marker (review, finding, position digest), the posting
 * identity and the exact pinned position all match on the pinned merge request;
 * anything missing means "not found", not "probably the same".
 */

interface ReconcileRequest {
  discussions: readonly RemoteDiscussion[];
  listingComplete: boolean;
  reviewId: string;
  position: PersistedPosition;
  postedBy: string;
}

type ReconcileResult =
  | { kind: 'found'; discussionId: string; noteId: string; url: string }
  | { kind: 'absent' }
  | { kind: 'inconclusive'; reason: string };

export function reconcile(request: ReconcileRequest): ReconcileResult {
  const expected = {
    reviewId: request.reviewId,
    findingId: request.position.findingId,
    positionDigest: request.position.digest,
  };

  for (const discussion of request.discussions) {
    for (const note of discussion.notes) {
      const found = findMarker(note.body);
      if (found === null || !markerMatches(found, expected)) continue;
      if (note.author !== request.postedBy) continue;
      if (note.position === null || !samePosition(note.position, request.position.position)) continue;
      return {
        kind: 'found',
        discussionId: discussion.id,
        noteId: note.id,
        url: note.url ?? `${request.position.webUrl}#note_${note.id}`,
      };
    }
  }

  if (!request.listingComplete) {
    return {
      kind: 'inconclusive',
      reason:
        'Not every merge request discussion could be read, so the absence of an earlier comment could not be established.',
    };
  }
  return { kind: 'absent' };
}

export function describeNearMiss(request: ReconcileRequest): string | null {
  const expected = {
    reviewId: request.reviewId,
    findingId: request.position.findingId,
    positionDigest: request.position.digest,
  };
  for (const discussion of request.discussions) {
    for (const note of discussion.notes) {
      const found = findMarker(note.body);
      if (found === null || !markerMatches(found, expected)) continue;
      if (note.author !== request.postedBy) {
        return `A comment in thread ${discussion.id} carries this review's marker but was written by ${note.author || 'an unnamed account'}, not by ${request.postedBy}. It is not treated as an AMBICODE publication.`;
      }
      if (note.position === null || !samePosition(note.position, request.position.position)) {
        return `A comment in thread ${discussion.id} carries this review's marker but sits at a different position than the one this finding is pinned to. It is not treated as this finding's publication.`;
      }
    }
  }
  return null;
}
