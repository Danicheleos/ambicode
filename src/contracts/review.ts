import { z } from 'zod';
import { COMPLETE_COVERAGE, RemoteDiscussion, RemoteTarget, ReviewCoverage } from './provider.ts';
import { CheckStatus, Confidence, ReviewStatus, Risk, TargetKind } from './primitives.ts';
import { ProvenanceEntry, RequirementConflict, RequirementSource } from './requirements.ts';

/** Persisted review schemas (doc 02, "Shared contracts"). */

export const REVIEW_SCHEMA_VERSION = 1;

// Requirement/source-presence types are activity-neutral (doc 04 P2.2
// correction C) and live on `./requirements.ts`; re-exported here so this
// module's existing importers do not need to change their import path.
export { ProvenanceEntry, RequirementConflict, RequirementSource };

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
  /** Source or index changes this command made, reported and never reverted. */
  mutations: z.array(z.string()).default([]),
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

/** What the reviewer was measured against, so a refusal can be reproduced. */
export const ReviewInputs = z.strictObject({
  changedFiles: z.number().int().nonnegative(),
  changedLines: z.number().int().nonnegative(),
  patchBytes: z.number().int().nonnegative(),
  /** Bytes of the files mirrored into the snapshot for the reviewer to read. */
  snapshotBytes: z.number().int().nonnegative(),
  /** Bytes of retrieved requirement content, which the prompt carries. */
  requirementBytes: z.number().int().nonnegative().default(0),
  /**
   * Bytes of the composed canonical prompt: role and contract prompts, scoped
   * policy, requirements, prior discussion evidence, check evidence and the
   * patch. Zero only before the prompt exists.
   */
  promptBytes: z.number().int().nonnegative().default(0),
  /**
   * Everything the model is handed: the composed prompt plus the mirrored
   * tree. Measured against `review.maxContextBytes` (doc 02).
   */
  contextBytes: z.number().int().nonnegative(),
  limits: z.strictObject({
    maxChangedFiles: z.number().int().positive(),
    maxChangedLines: z.number().int().positive(),
    maxContextBytes: z.number().int().positive(),
    maxFindings: z.number().int().positive(),
  }),
});
export type ReviewInputs = z.infer<typeof ReviewInputs>;

/**
 * The isolated reviewer invocation as it actually happened, including the case
 * where it did not: `not-run` is a fact a reader needs, not an empty result.
 */
export const ReviewerRun = z.strictObject({
  status: z.enum(['ok', 'not-run', 'failed']),
  model: z.string().min(1),
  timeoutSeconds: z.number().int().positive(),
  /** Tool names the process was restricted to. */
  tools: z.array(z.string()).default([]),
  /** Isolation arguments the process was started with, for the record. */
  isolation: z.array(z.string()).default([]),
  /** Locations the validator refused, kept because a refusal is evidence. */
  rejections: z.array(z.string()).default([]),
  detail: z.string().nullable().default(null),
  /**
   * How long the reviewer took, spawn to answer. Null in results written before
   * it was recorded. Without it a timeout cannot be set from evidence: one input
   * of 779 KB timed out at 300 s and, rerun, answered in about 264 s.
   */
  durationMs: z.number().int().nonnegative().nullable().default(null),
  /**
   * The answer the validator refused, saved beside the result and relative to
   * the review directory. Null when nothing was refused. The rejection line
   * alone named `build.mjs:29` but not what the reviewer claimed there.
   */
  rejectedOutputRef: z.string().nullable().default(null),
});
export type ReviewerRun = z.infer<typeof ReviewerRun>;

/**
 * `ReviewResult`'s own historical spelling of the canonical `RequirementMode`
 * (`./requirements.ts`): `quality-review` where the canonical value is
 * `source-free`. This is the one place that mapping happens — when a
 * `ReviewResult` is built (`src/review/bundle.ts`) — so the persisted review
 * contract (doc 02) is unaffected by doc 04 P2.2 correction C.
 */
export const ReviewRequirementMode = z.enum(['quality-review', 'requirement-based']);
export type ReviewRequirementMode = z.infer<typeof ReviewRequirementMode>;

export const ReviewResult = z.strictObject({
  schemaVersion: z.literal(REVIEW_SCHEMA_VERSION),
  reviewId: z.string().min(1),
  createdAt: z.string().min(1),
  pluginVersion: z.string().min(1),
  reviewModel: z.string().min(1),
  target: ReviewTarget,
  requirements: z.array(RequirementSource).default([]),
  /** Quality review means no requirement URLs were supplied (doc 02). */
  requirementMode: ReviewRequirementMode,
  requirementConflicts: z.array(RequirementConflict).default([]),
  provenance: z.array(ProvenanceEntry).default([]),
  inputs: ReviewInputs,
  reviewer: ReviewerRun.nullable().default(null),
  policySummary: z.strictObject({
    packs: z.array(z.string()).default([]),
    ruleIds: z.array(z.string()).default([]),
  }),
  checks: z.array(CheckResult).default([]),
  /**
   * Whether the reviewed change is structurally the whole change. A material
   * gap — a file the remote did not deliver — makes the result `partial`, and
   * the page says which files are missing (doc 03 P1.5 correction 2).
   */
  coverage: ReviewCoverage.default(COMPLETE_COVERAGE),
  /**
   * Merge-request threads that already existed. Evidence for deduplication and
   * for later reconciliation; never proof that a defect was fixed (doc 03).
   */
  discussions: z.array(RemoteDiscussion).default([]),
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
