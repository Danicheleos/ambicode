import { z } from 'zod';
import { CheckStatus, Confidence, ReviewStatus, Risk, TargetKind } from '../primitives.ts';
import { ProvenanceEntry, RequirementConflict, RequirementSource, type NormalizedRequirements, type EvidenceSource } from './requirements.ts';
import type { PendingApproval } from './checks.ts';
import type { Workspace, Runtime } from '../composition.ts';
import type { ProjectConfig } from './config.ts';
import type { DiffFile } from '../platform/git.ts';
import type { ResolvedPolicy } from './policy.ts';
import type { Dependent } from './search.ts';

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

export const CheckResult = z.strictObject({
  checkId: z.string().min(1),
  projectId: z.string().min(1),
  commandId: z.string().min(1),
  adapter: z.string().min(1),
  status: CheckStatus,
  selected: z.array(z.strictObject({ path: z.string().min(1), reason: z.string().min(1) })).default([]),
  selectionComplete: z.boolean(),
  argv: z.array(z.string()).default([]),
  durationMs: count.nullable().default(null),
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
  findings: z.array(Finding.omit({ id: true, evidence: true })).default([]),
  coverageNotes: z.array(z.string()).default([]),
});
export type ReviewerOutput = z.infer<typeof ReviewerOutput>;

export const ReviewInputs = z.strictObject({
  changedFiles: count,
  changedLines: count,
  patchBytes: count,
  snapshotBytes: count,
  requirementBytes: count.default(0),
  contextBytes: count,
  limits: z.strictObject({
    maxChangedFiles: z.number().int().positive().nullable(),
    maxChangedLines: z.number().int().positive().nullable(),
    maxContextBytes: z.number().int().positive().nullable(),
    maxFindings: z.number().int().positive().nullable(),
  }),
});
export type ReviewInputs = z.infer<typeof ReviewInputs>;
export type MeasuredInput = Omit<ReviewInputs, 'limits'>;

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
  pluginVersion: z.string().min(1),
  target: ReviewTarget,
  requirements: z.array(RequirementSource).default([]),
  requirementMode: ReviewRequirementMode,
  requirementConflicts: z.array(RequirementConflict).default([]),
  provenance: z.array(ProvenanceEntry).default([]),
  inputs: ReviewInputs,
  reviewer: ReviewerRun.nullable().default(null),
  /** Repository-relative path of the reviewer's `brief.md`. */
  brief: z.string().nullable().default(null),
  policySummary: z.strictObject({ packs: z.array(z.string()).default([]), ruleIds: z.array(z.string()).default([]) }),
  checks: z.array(CheckResult).default([]),
  changedFiles: z
    .array(
      z.strictObject({
        oldPath: z.string().nullable(),
        newPath: z.string().nullable(),
        changeKind: z.enum(['added', 'modified', 'deleted', 'renamed', 'copied', 'type-changed']),
        addedLines: count,
        removedLines: count,
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

/** What `assembleBundle` measured and decided: policy, snapshot and checks, so no caller re-derives them. */
export interface ReviewBundle {
  workspace: Workspace;
  reviewId: string;
  reviewDirectory: string;
  /** `null` when the run belongs to no task, so there is no ledger to write. */
  taskDirectory: string | null;
  resultPath: string;
  snapshot: Snapshot;
  plan: SnapshotPlan;
  /** Unchanged files the reviewer was given because they rely on the change, with why. */
  dependents: Dependent[];
  measured: MeasuredInput;
  files: DiffFile[];
  patch: string;
  policies: { project: ProjectConfig; policy: ResolvedPolicy }[];
  requirements: NormalizedRequirements;
  pendingApprovals: PendingApproval[];
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
  checks: { key: string; decision: 'run' | 'waiting' | 'skip' | 'forbid'; reason: string | null }[];
  waitingKeys: string[];
  snapshotBytes: number | null;
  refusal: { code: 'input-too-large' | 'snapshot-too-large'; message: string; suggestions: string[] } | null;
}

/** Exactly what the reviewer may read, mirrored under `files/` outside the checkout and without `.git`. */
export interface Snapshot {
  directory: string;
  filesDirectory: string;
  included: string[];
  omissions: string[];
  totalBytes: number;
  dispose(): Promise<void>;
}

export interface SnapshotEntry {
  path: string;
  text: string;
  bytes: number;
}

/** Everything the snapshot would contain, so the whole input can be measured against the limits before any of it exists on disk. */
export interface SnapshotPlan {
  entries: SnapshotEntry[];
  changedPaths: string[];
  omissions: string[];
  totalBytes: number;
  /** Unchanged files included because they rely on the change; a subset of `entries`. */
  dependentPaths: string[];
}

export const CHECKS_GATE = 'review-checks';

export interface AssembleOptions {
  runtime: Runtime;
  target: TargetSelection;
  requirementUrls: readonly string[];
  evidence: EvidenceSource | null;
  approvals: ReadonlySet<string>;
  declines: ReadonlySet<string>;
  task: string | null;
  excludePaths?: readonly string[];
  onlyPaths?: readonly string[];
  withTests?: boolean;
  /** `--context <path>`: unchanged files the caller found relying on the change, e.g. by LSP references. */
  contextPaths?: readonly string[];
  /** Dirty before the task began and untouched since: left out of the review and of check selection (07-B3). */
  preexisting?: readonly string[];
  /** Stop after `planSnapshot`: nothing is written and no check runs (07-E1). */
  dryRun?: boolean;
}
