import type { PersistedPosition } from '../contracts/publication.ts';
import { samePosition, type RemoteDiscussion } from '../contracts/provider.ts';
import { findMarker, markerMatches } from './marker.ts';

/**
 * Whether a comment AMBICODE would post is already on the merge request.
 *
 * Four things must agree, and any one of them missing means "not found" rather
 * than "probably the same" (doc 03 P1.6):
 *
 *  - the hidden marker, with this review, this finding and this position digest;
 *  - the posting identity, so a marker somebody else copied is not confirmation;
 *  - the exact pinned position, so the same marker on another line is not either;
 *  - the merge request the discussions were read from, which the caller pins by
 *    listing discussions for exactly that target.
 */

export interface ReconcileRequest {
  discussions: readonly RemoteDiscussion[];
  /** True only when every remote thread was read. A capped listing proves nothing. */
  listingComplete: boolean;
  reviewId: string;
  position: PersistedPosition;
  /** The account the provider is authenticated as, from the remote itself. */
  postedBy: string;
}

export type ReconcileResult =
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
      // The marker is in a comment. Everything else decides whether it is ours.
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

/** Why a marker that looked right was rejected, for the operator-facing record. */
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
