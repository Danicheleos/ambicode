import { z } from 'zod';
import { Confidence, ReviewStatus, Risk, TargetKind } from '../primitives.ts';
import { RequirementSource } from './requirements.ts';
import type { Workspace, Runtime } from '../composition.ts';
import type { ProjectConfig } from './config.ts';
import type { DiffFile } from '../platform/git.ts';
import type { ResolvedPolicy } from './policy.ts';

export const REVIEW_SCHEMA_VERSION = 1;

export const ReviewTarget = z.strictObject({
  kind: TargetKind,
  repositoryRoot: z.string().min(1),
  snapshotId: z.string().min(1),
  headSha: z.string().min(1).nullable(),
  baseSha: z.string().min(1).nullable(),
  baseRef: z.string().nullable(),
  notes: z.array(z.string()).default([]),
});
export type ReviewTarget = z.infer<typeof ReviewTarget>;

const count = z.number().int().nonnegative();

/** One `check` ledger entry of the task, as the review saw it when the bundle was assembled. */
export const RecordedCheck = z.strictObject({
  key: z.string().min(1),
  phase: z.enum(['red', 'green']),
  exit: z.number().int(),
  argv: z.array(z.string()).default([]),
  only: z.array(z.string()).default([]),
});
export type RecordedCheck = z.infer<typeof RecordedCheck>;

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
  /** Excerpt taken from the checkout or the diff by the validator, never from the model. */
  evidence: z.string(),
  explanation: z.string().min(1),
  suggestedComment: z.string().min(1),
  ruleRefs: z.array(z.string()).default([]),
  requirementRefs: z.array(z.string()).default([]),
});
export type Finding = z.infer<typeof Finding>;

export const ReviewerOutput = z.strictObject({
  findings: z.array(Finding.omit({ id: true, evidence: true })).default([]),
  coverageNotes: z.array(z.string()).default([]),
});
export type ReviewerOutput = z.infer<typeof ReviewerOutput>;

export const ReviewInputs = z.strictObject({
  changedFiles: count,
  changedLines: count,
  patchBytes: count,
  requirementBytes: count.default(0),
  contextBytes: count,
});
export type ReviewInputs = z.infer<typeof ReviewInputs>;
export type MeasuredInput = ReviewInputs;

/** `review record` stored the subagent's answer: `ok`, or `failed` with the refused text kept at `rejectedOutputRef`. */
export const ReviewerRun = z.strictObject({
  status: z.enum(['ok', 'failed']),
  rejections: z.array(z.string()).default([]),
  detail: z.string().nullable().default(null),
  rejectedOutputRef: z.string().nullable().default(null),
  at: z.string().nullable().default(null),
});
export type ReviewerRun = z.infer<typeof ReviewerRun>;

/** `quality-review` is the persisted spelling of `source-free`, mapped in the bundle. */
export const ReviewRequirementMode = z.enum(['quality-review', 'requirement-based']);

export const ReviewResult = z.strictObject({
  schemaVersion: z.literal(REVIEW_SCHEMA_VERSION),
  reviewId: z.string().min(1),
  createdAt: z.string().min(1),
  target: ReviewTarget,
  requirements: z.array(RequirementSource).default([]),
  requirementMode: ReviewRequirementMode,
  inputs: ReviewInputs,
  reviewer: ReviewerRun.nullable().default(null),
  /** Repository-relative path of the reviewer's `brief.md`. */
  brief: z.string().nullable().default(null),
  /** Rule ids of the resolved policy: the only ids a finding may cite. */
  ruleIds: z.array(z.string()).default([]),
  checks: z.array(RecordedCheck).default([]),
  changedFiles: z
    .array(
      z.strictObject({
        oldPath: z.string().nullable(),
        newPath: z.string().nullable(),
        changeKind: z.enum(['added', 'modified', 'deleted', 'renamed', 'copied', 'type-changed']),
        addedLines: count,
        removedLines: count,
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

/** What `assembleBundle` measured and decided, so no caller re-derives it. */
export interface ReviewBundle {
  workspace: Workspace;
  reviewId: string;
  reviewDirectory: string;
  /** `null` when the run belongs to no task, so there is no ledger to write. */
  taskDirectory: string | null;
  resultPath: string;
  measured: MeasuredInput;
  files: DiffFile[];
  patch: string;
  policies: { project: ProjectConfig; policy: ResolvedPolicy }[];
  requirements: readonly RequirementSource[];
  /** Findings are empty and status is `partial` until a reviewer has run. */
  result: ReviewResult;
}

export type TargetSelection =
  | { kind: 'working' }
  | { kind: 'branch'; baseRef: string | null }
  | { kind: 'merge-request'; url: string };

export interface ReviewEstimate {
  target: string;
  files: number;
  changedLines: number;
  refusal: { code: 'input-too-large'; message: string; suggestions: string[] } | null;
}

export interface AssembleOptions {
  runtime: Runtime;
  target: TargetSelection;
  /** Already validated: the review never resolves requirement URLs itself. */
  requirements: readonly RequirementSource[];
  task: string | null;
  excludePaths?: readonly string[];
  onlyPaths?: readonly string[];
  withTests?: boolean;
  /** Dirty before the task began and untouched since: left out of the review. */
  preexisting?: readonly string[];
  /** Stop after measuring the input: nothing is written. */
  dryRun?: boolean;
}
