import { z } from 'zod';
import { PublicationState, ProviderId } from './primitives.ts';
import { RemotePosition, RemoteTarget } from './provider.ts';

/**
 * Positions are derived once from the pinned diff and never recomputed on reopen:
 * the current merge request is not what was reviewed. Nothing here may hold a
 * capability, session id, cookie, CSRF secret, glab token, or any credential.
 */

export const PUBLICATION_SCHEMA_VERSION = 1;

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
  digest: z.string().min(1),
});
export type PersistedPosition = z.infer<typeof PersistedPosition>;

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

export const CommentDraft = z.strictObject({
  findingId: z.string().min(1),
  body: z.string(),
  selected: z.boolean().default(false),
  updatedAt: z.string().min(1),
});
export type CommentDraft = z.infer<typeof CommentDraft>;

/** `body` excludes the hidden marker: a redisplay must show what the human wrote, not what was sent. */
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

export const SubmissionRecord = z.strictObject({
  submissionId: z.string().min(1),
  submittedAt: z.string().min(1),
  stopped: z.boolean(),
  stoppedReason: z.string().nullable().default(null),
  revisionState: z.string().nullable().default(null),
  outcomes: z.array(PublicationOutcome).default([]),
});
export type SubmissionRecord = z.infer<typeof SubmissionRecord>;

export const PublicationRecord = z.strictObject({
  schemaVersion: z.literal(PUBLICATION_SCHEMA_VERSION),
  reviewId: z.string().min(1),
  updatedAt: z.string().min(1),
  drafts: z.array(CommentDraft).default([]),
  /** The newest outcome per finding wins. */
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

/** The comment exists on the merge request; re-sending it would duplicate it, so publication refuses. */
export function isSettled(state: PublicationState): boolean {
  return state === 'published' || state === 'already-published';
}
