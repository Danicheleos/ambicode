import { z } from 'zod';
import { COMPLETE_COVERAGE, RemoteDiscussion, RemoteTarget, ReviewCoverage } from './provider.ts';
import { CheckStatus, Confidence, ReviewStatus, Risk, TargetKind } from './primitives.ts';
import { ProvenanceEntry, RequirementConflict, RequirementSource } from './requirements.ts';

export const REVIEW_SCHEMA_VERSION = 1;

export { ProvenanceEntry, RequirementConflict, RequirementSource };

export const ReviewTarget = z.strictObject({
  kind: TargetKind,
  repositoryRoot: z.string().min(1),
  snapshotId: z.string().min(1),
  headSha: z.string().min(1).nullable(),
  baseSha: z.string().min(1).nullable(),
  baseRef: z.string().nullable(),
  remote: RemoteTarget.nullable(),
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
  outputRef: z.string().nullable().default(null),
  limitations: z.array(z.string()).default([]),
  /** Source or index changes this command made, reported and never reverted. */
  mutations: z.array(z.string()).default([]),
});
export type CheckResult = z.infer<typeof CheckResult>;

export const FindingLocation = z.strictObject({
  oldPath: z.string().nullable(),
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

export const ReviewInputs = z.strictObject({
  changedFiles: z.number().int().nonnegative(),
  changedLines: z.number().int().nonnegative(),
  patchBytes: z.number().int().nonnegative(),
  snapshotBytes: z.number().int().nonnegative(),
  requirementBytes: z.number().int().nonnegative().default(0),
  promptBytes: z.number().int().nonnegative().default(0),
  contextBytes: z.number().int().nonnegative(),
  limits: z.strictObject({
    maxChangedFiles: z.number().int().positive(),
    maxChangedLines: z.number().int().positive(),
    maxContextBytes: z.number().int().positive(),
    maxFindings: z.number().int().positive(),
  }),
});
export type ReviewInputs = z.infer<typeof ReviewInputs>;

/** Each field is null when the envelope did not carry it, never zero. */
export const ReviewerUsage = z.strictObject({
  turns: z.number().int().nonnegative().nullable(),
  apiDurationMs: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  thinkingTokens: z.number().int().nonnegative().nullable().default(null),
});
export type ReviewerUsage = z.infer<typeof ReviewerUsage>;

export const ReviewerRun = z.strictObject({
  status: z.enum(['ok', 'not-run', 'failed']),
  model: z.string().min(1),
  timeoutSeconds: z.number().int().positive(),
  tools: z.array(z.string()).default([]),
  isolation: z.array(z.string()).default([]),
  rejections: z.array(z.string()).default([]),
  detail: z.string().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  usage: ReviewerUsage.nullable().default(null),
  rejectedOutputRef: z.string().nullable().default(null),
  /**
   * Present only for an answer replayed from a recording (`EVAL_AMBICODE_REVIEWER_REPLAY`),
   * so a replay never reads as a review; absent otherwise, keeping ordinary results byte-identical.
   */
  source: z.literal('replay').optional(),
});
export type ReviewerRun = z.infer<typeof ReviewerRun>;

/** `quality-review` is the persisted spelling of `source-free`, mapped in `src/review/bundle.ts`. */
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
  coverage: ReviewCoverage.default(COMPLETE_COVERAGE),
  /** Pre-existing threads: evidence for deduplication, never proof that a defect was fixed. */
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
