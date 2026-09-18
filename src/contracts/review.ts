import { z } from 'zod';
import {
  CheckStatus,
  Confidence,
  ProviderId,
  PublicationState,
  ReviewStatus,
  Risk,
  TargetKind,
} from './primitives.ts';

/** Persisted review schemas (doc 02, "Shared contracts"). */

export const REVIEW_SCHEMA_VERSION = 1;

export const RemoteTarget = z.strictObject({
  provider: ProviderId,
  host: z.string().min(1),
  projectId: z.string().min(1),
  projectPath: z.string().min(1),
  mergeRequestIid: z.number().int().positive(),
  webUrl: z.string().min(1),
  /** The collected diff version the review is pinned to. */
  versionId: z.number().int().positive(),
  baseSha: z.string().min(1),
  startSha: z.string().min(1),
  headSha: z.string().min(1),
});
export type RemoteTarget = z.infer<typeof RemoteTarget>;

export const ReviewTarget = z.strictObject({
  kind: TargetKind,
  repositoryRoot: z.string().min(1),
  /** Stable identity of the reviewed content: HEAD sha, or a content digest for a working tree. */
  snapshotId: z.string().min(1),
  headSha: z.string().min(1).nullable(),
  baseSha: z.string().min(1).nullable(),
  baseRef: z.string().nullable(),
  remote: RemoteTarget.nullable(),
  /** Facts the reader must see, e.g. "dirty working-tree changes were excluded". */
  notes: z.array(z.string()).default([]),
});
export type ReviewTarget = z.infer<typeof ReviewTarget>;

export const RequirementSource = z.strictObject({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  retrievedAt: z.string().min(1),
  sourceVersion: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  content: z.string(),
  citations: z.array(z.string()).default([]),
  status: z.enum(['retrieved', 'unavailable', 'forbidden', 'not-found']),
  /** Required whenever status is not `retrieved`. */
  failureReason: z.string().nullable().default(null),
  /** Tool the outer session used, recorded as provenance. */
  retrievedVia: z.string().min(1),
});
export type RequirementSource = z.infer<typeof RequirementSource>;

export const SelectedFile = z.strictObject({
  path: z.string().min(1),
  reason: z.string().min(1),
});

export const CheckResult = z.strictObject({
  checkId: z.string().min(1),
  projectId: z.string().min(1),
  commandId: z.string().min(1),
  adapter: z.string().min(1),
  status: CheckStatus,
  selected: z.array(SelectedFile).default([]),
  selectionComplete: z.boolean(),
  argv: z.array(z.string()).default([]),
  cwd: z.string().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  exitCode: z.number().int().nullable().default(null),
  /** Path of the bounded captured output, relative to the review directory. */
  outputRef: z.string().nullable().default(null),
  limitations: z.array(z.string()).default([]),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const FindingLocation = z.strictObject({
  /** Path in the pre-image; null for an added file. */
  oldPath: z.string().nullable(),
  /** Path in the post-image; null for a deleted file. */
  newPath: z.string().nullable(),
  side: z.enum(['old', 'new']),
  line: z.number().int().positive(),
});
export type FindingLocation = z.infer<typeof FindingLocation>;

export const Finding = z.strictObject({
  id: z.string().min(1),
  risk: Risk,
  confidence: Confidence,
  category: z.string().min(1),
  location: FindingLocation,
  supportingLocations: z.array(FindingLocation).default([]),
  /** Excerpt taken from the snapshot by the validator, never from the model. */
  evidence: z.string(),
  explanation: z.string().min(1),
  suggestedComment: z.string().min(1),
  ruleRefs: z.array(z.string()).default([]),
  requirementRefs: z.array(z.string()).default([]),
});
export type Finding = z.infer<typeof Finding>;

/** What the reviewer process is allowed to return. Locations are validated after. */
export const ReviewerOutput = z.strictObject({
  findings: z
    .array(
      z.strictObject({
        risk: Risk,
        confidence: Confidence,
        category: z.string().min(1),
        location: FindingLocation,
        supportingLocations: z.array(FindingLocation).default([]),
        explanation: z.string().min(1),
        suggestedComment: z.string().min(1),
        ruleRefs: z.array(z.string()).default([]),
        requirementRefs: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  coverageNotes: z.array(z.string()).default([]),
});
export type ReviewerOutput = z.infer<typeof ReviewerOutput>;

export const ProvenanceEntry = z.strictObject({
  kind: z.enum(['prompt', 'pack', 'config']),
  reference: z.string().min(1),
  contentHash: z.string().min(1),
});

export const ReviewResult = z.strictObject({
  schemaVersion: z.literal(REVIEW_SCHEMA_VERSION),
  reviewId: z.string().min(1),
  createdAt: z.string().min(1),
  pluginVersion: z.string().min(1),
  reviewModel: z.string().min(1),
  target: ReviewTarget,
  requirements: z.array(RequirementSource).default([]),
  /** Quality review means no requirement URLs were supplied (doc 02). */
  requirementMode: z.enum(['quality-review', 'requirement-based']),
  provenance: z.array(ProvenanceEntry).default([]),
  policySummary: z.strictObject({
    packs: z.array(z.string()).default([]),
    ruleIds: z.array(z.string()).default([]),
  }),
  checks: z.array(CheckResult).default([]),
  changedFiles: z
    .array(
      z.strictObject({
        oldPath: z.string().nullable(),
        newPath: z.string().nullable(),
        changeKind: z.enum(['added', 'modified', 'deleted', 'renamed', 'copied', 'type-changed']),
        addedLines: z.number().int().nonnegative(),
        removedLines: z.number().int().nonnegative(),
        included: z.boolean(),
        exclusionReason: z.string().nullable().default(null),
      }),
    )
    .default([]),
  findings: z.array(Finding).default([]),
  omissions: z.array(z.string()).default([]),
  status: ReviewStatus,
  statusReason: z.string().nullable().default(null),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export const PublicationOutcome = z.strictObject({
  findingId: z.string().min(1),
  state: PublicationState,
  discussionId: z.string().nullable().default(null),
  discussionUrl: z.string().nullable().default(null),
  message: z.string().nullable().default(null),
  /** Text the human submitted, preserved verbatim for redisplay. */
  body: z.string(),
});
export type PublicationOutcome = z.infer<typeof PublicationOutcome>;

export const PublicationResult = z.strictObject({
  reviewId: z.string().min(1),
  submittedAt: z.string().min(1),
  revisionAtSubmit: z.string().nullable(),
  stopped: z.boolean(),
  stoppedReason: z.string().nullable().default(null),
  outcomes: z.array(PublicationOutcome).default([]),
});
export type PublicationResult = z.infer<typeof PublicationResult>;
