import { z } from 'zod';
import { PublicationState, ProviderId } from './primitives.ts';
import { RemotePosition, RemoteTarget } from './provider.ts';

/**
 * What survives a review's temporary snapshot: the exact remote position of
 * every publishable finding, the human's drafts, and what was actually
 * published (doc 03 P1.6).
 *
 * Positions are derived once, while the pinned diff is still in hand, and read
 * back verbatim afterwards. Reopening a saved review never recomputes a
 * position from the current branch or the current merge request, because the
 * current merge request is not what was reviewed.
 *
 * Nothing here may hold a capability, a session id, a cookie or CSRF secret, a
 * glab token, or any model or provider credential.
 */

export const PUBLICATION_SCHEMA_VERSION = 1;

/** One finding's pinned position, with the digest a marker carries. */
export const PersistedPosition = z.strictObject({
  findingId: z.string().min(1),
  provider: ProviderId,
  host: z.string().min(1),
  projectId: z.string().min(1),
  projectPath: z.string().min(1),
  mergeRequestIid: z.number().int().positive(),
  webUrl: z.string().min(1),
  versionId: z.number().int().positive(),
  position: RemotePosition,
  /** Stable over the review's lifetime; identifies this exact placement. */
  digest: z.string().min(1),
});
export type PersistedPosition = z.infer<typeof PersistedPosition>;

/** A finding that has no exact remote position, and why. Never publishable. */
export const UnplaceableFinding = z.strictObject({
  findingId: z.string().min(1),
  reason: z.string().min(1),
});
export type UnplaceableFinding = z.infer<typeof UnplaceableFinding>;

export const PublicationPositions = z.strictObject({
  schemaVersion: z.literal(PUBLICATION_SCHEMA_VERSION),
  reviewId: z.string().min(1),
  derivedAt: z.string().min(1),
  target: RemoteTarget,
  positions: z.array(PersistedPosition).default([]),
  unplaceable: z.array(UnplaceableFinding).default([]),
});
export type PublicationPositions = z.infer<typeof PublicationPositions>;

/** The human's editable text for one finding, and whether they selected it. */
export const CommentDraft = z.strictObject({
  findingId: z.string().min(1),
  body: z.string(),
  selected: z.boolean().default(false),
  updatedAt: z.string().min(1),
});
export type CommentDraft = z.infer<typeof CommentDraft>;

/**
 * What happened to one comment. `body` is the human's visible text exactly as
 * they submitted it, without the hidden marker: a redisplay must show what they
 * wrote, not what was transmitted.
 */
export const PublicationOutcome = z.strictObject({
  findingId: z.string().min(1),
  state: PublicationState,
  body: z.string(),
  positionDigest: z.string().nullable().default(null),
  discussionId: z.string().nullable().default(null),
  noteId: z.string().nullable().default(null),
  discussionUrl: z.string().nullable().default(null),
  /** Operator-facing explanation; never a credential or a raw token. */
  message: z.string().nullable().default(null),
  at: z.string().min(1),
});
export type PublicationOutcome = z.infer<typeof PublicationOutcome>;

/** One human submission. Several may exist: a retry is a new submission. */
export const SubmissionRecord = z.strictObject({
  submissionId: z.string().min(1),
  submittedAt: z.string().min(1),
  /** True when the run stopped before sending everything selected. */
  stopped: z.boolean(),
  stoppedReason: z.string().nullable().default(null),
  /** The revision state observed immediately before the run. */
  revisionState: z.string().nullable().default(null),
  outcomes: z.array(PublicationOutcome).default([]),
});
export type SubmissionRecord = z.infer<typeof SubmissionRecord>;

export const PublicationRecord = z.strictObject({
  schemaVersion: z.literal(PUBLICATION_SCHEMA_VERSION),
  reviewId: z.string().min(1),
  updatedAt: z.string().min(1),
  drafts: z.array(CommentDraft).default([]),
  /** The current state of each finding: the newest outcome wins. */
  outcomes: z.array(PublicationOutcome).default([]),
  submissions: z.array(SubmissionRecord).default([]),
});
export type PublicationRecord = z.infer<typeof PublicationRecord>;

export function emptyPublicationRecord(reviewId: string, at: string): PublicationRecord {
  return {
    schemaVersion: PUBLICATION_SCHEMA_VERSION,
    reviewId,
    updatedAt: at,
    drafts: [],
    outcomes: [],
    submissions: [],
  };
}

/**
 * Whether a state means the comment exists on the merge request. Re-sending one
 * of these would duplicate a published comment, so the publication run refuses
 * to, whatever the form asked for.
 */
export function isSettled(state: PublicationState): boolean {
  return state === 'published' || state === 'already-published';
}
