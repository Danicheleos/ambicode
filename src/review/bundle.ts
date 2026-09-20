import path from 'node:path';
import { runChecks, type PendingApproval } from '../checks/run.ts';
import type { ChangedPath } from '../checks/select.ts';
import { REVIEWS_DIR } from '../config/defaults.ts';
import {
  openWorkspace,
  projectForPath,
  resolvePolicyFor,
  type Runtime,
  type Workspace,
} from '../composition/root.ts';
import type { ProjectConfig } from '../contracts/config.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import {
  REVIEW_SCHEMA_VERSION,
  type CheckResult,
  type ProvenanceEntry,
  type ReviewResult,
} from '../contracts/review.ts';
import type { DiffFile } from '../git/diff.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import {
  normalizeRequirements,
  readRequirementEvidence,
  type NormalizedRequirements,
} from '../requirements/normalize.ts';
import { describeExclusion, isExcludedFromReview } from '../snapshot/exclusions.ts';
import {
  enforceReviewInputLimits,
  measureInput,
  partitionChange,
  type MeasuredInput,
} from '../snapshot/limits.ts';
import { planSnapshot, writeSnapshot, type Snapshot, type SnapshotPlan } from '../snapshot/snapshot.ts';
import {
  resolveBranchTarget,
  resolveWorkingTarget,
  type TargetResolution,
} from '../snapshot/target.ts';
import { contentHash } from '../util/hash.ts';
import { normalizeRelative } from '../util/paths.ts';

/**
 * One pinned bundle: target, changed files, immutable snapshot, requirements,
 * applicable policy, check evidence, omissions and the limits everything was
 * measured against (doc 02). Both `bundle` and `review` assemble it here, so
 * neither re-derives policy or snapshot decisions.
 */
export interface ReviewBundle {
  workspace: Workspace;
  reviewId: string;
  reviewDirectory: string;
  resultPath: string;
  snapshot: Snapshot;
  plan: SnapshotPlan;
  measured: MeasuredInput;
  /** Files that entered the review, the authority for finding locations. */
  files: DiffFile[];
  /** The patch of those files, identical to `changed.diff` in the snapshot. */
  patch: string;
  /** Resolved policy per project owning a changed file, in project order. */
  policies: { project: ProjectConfig; policy: ResolvedPolicy }[];
  requirements: NormalizedRequirements;
  pendingApprovals: PendingApproval[];
  /** Findings are empty and status is `partial` until a reviewer has run. */
  result: ReviewResult;
}

export interface AssembleOptions {
  runtime: Runtime;
  branch: boolean;
  baseRef: string | null;
  /** Requirement URLs, the canonical way a requirement enters a review. */
  requirementUrls: readonly string[];
  /** Path of the evidence envelope the outer session wrote, if any. */
  evidencePath: string | null;
  approvals: ReadonlySet<string>;
}

export async function assembleBundle(options: AssembleOptions): Promise<ReviewBundle> {
  const runtime = options.runtime;
  const workspace = await openWorkspace(runtime);

  // Requirements first. An inaccessible or contradictory requirement must stop
  // the run before it costs a check or a model call (doc 02, "Data flow").
  const requirements = normalizeRequirements({
    urls: options.requirementUrls,
    evidence:
      options.evidencePath === null
        ? null
        : await readRequirementEvidence(runtime.fs, options.evidencePath),
    configuredServer: workspace.config.requirements.mcpServer,
  });

  const resolution = await resolveTarget(workspace, options);

  // Vendored directories, build output and credential-shaped files leave the
  // review here: they are not mirrored, not put in the patch, and not counted
  // against limits meant to protect genuine review.
  const reviewable = partitionChange(resolution.files);

  // The counts that cost nothing come first: a change already over the file or
  // line limit is refused without reading a single file (doc 02).
  const limits = workspace.config.review;
  enforceReviewInputLimits(measureInput(reviewable.files, reviewable.patch), limits, reviewable.files);

  // Decided and read, but not yet written. The reviewer is handed the mirrored
  // files as well as the patch, so the limit is applied to both — and applied
  // before a byte reaches the disk or a model.
  const plan = await planSnapshot({
    files: reviewable.files,
    content: resolution.content,
    contextBudgetBytes: Math.max(0, limits.maxContextBytes - Buffer.byteLength(reviewable.patch, 'utf8')),
  });

  const measured = measureInput(reviewable.files, reviewable.patch, plan.totalBytes);
  enforceReviewInputLimits(measured, limits, reviewable.files);

  const snapshot = await writeSnapshot(runtime.fs, plan, reviewable.patch);

  const reviewId = runtime.ids.reviewId();
  const reviewDirectory = path.join(workspace.repositoryRoot, REVIEWS_DIR, reviewId);
  await runtime.fs.mkdirp(reviewDirectory);

  // Both names of every change are watched: a check that resurrects a deleted or
  // renamed file has changed the tree as surely as one that rewrites a survivor.
  const watchedPaths = [
    ...new Set(
      reviewable.files
        .flatMap((file) => [file.newPath, file.oldPath])
        .filter((value): value is string => value !== null),
    ),
  ];

  const { checks, pendingApprovals, policies } = await runProjectChecks({
    workspace,
    runtime,
    resolution,
    reviewableFiles: reviewable.files,
    reviewDirectory,
    watchedPaths,
    approvals: options.approvals,
  });

  const result: ReviewResult = {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviewId,
    createdAt: runtime.clock.now().toISOString(),
    pluginVersion: await pluginVersion(runtime.fs, runtime.pluginRoot),
    reviewModel: limits.model,
    target: resolution.target,
    requirements: requirements.sources,
    requirementMode: requirements.mode,
    requirementConflicts: requirements.conflicts,
    provenance: [
      ...(await configProvenance(runtime.fs, workspace)),
      ...policyProvenance(policies),
      ...requirements.provenance,
    ],
    inputs: {
      changedFiles: measured.changedFiles,
      changedLines: measured.changedLines,
      patchBytes: measured.patchBytes,
      snapshotBytes: measured.snapshotBytes,
      contextBytes: measured.contextBytes,
      limits: {
        maxChangedFiles: limits.maxChangedFiles,
        maxChangedLines: limits.maxChangedLines,
        maxContextBytes: limits.maxContextBytes,
        maxFindings: limits.maxFindings,
      },
    },
    reviewer: null,
    policySummary: summarizePolicy(policies),
    checks,
    // Every change is listed, including the ones kept out: an omission the
    // reader cannot see is indistinguishable from a file that did not change.
    changedFiles: resolution.files.map((file) => {
      const target = file.newPath;
      const reason = isExcludedFromReview(file.oldPath, file.newPath);
      return {
        oldPath: file.oldPath,
        newPath: file.newPath,
        changeKind: file.changeKind,
        addedLines: file.addedLines,
        removedLines: file.removedLines,
        included: target !== null && snapshot.included.includes(target),
        exclusionReason: reason === null ? null : describeExclusion(reason),
      };
    }),
    findings: [],
    omissions: [
      ...reviewable.excluded.map((entry) => `${entry.path}: ${entry.reason}.`),
      ...snapshot.omissions,
      ...requirements.notices,
      ...(requirements.mode === 'quality-review'
        ? [
            'No requirement was supplied, so this is a quality review. It does not establish that the change does what any ticket or specification asked for.',
          ]
        : []),
    ],
    status: 'partial',
    statusReason: 'Evidence bundle only; the independent reviewer has not run.',
  };

  return {
    workspace,
    reviewId,
    reviewDirectory,
    resultPath: path.join(reviewDirectory, 'result.json'),
    snapshot,
    plan,
    measured,
    files: reviewable.files,
    patch: reviewable.patch,
    policies,
    requirements,
    pendingApprovals,
    result,
  };
}

/** Persists the result and the pointer to its snapshot, through the port only. */
export async function writeBundleArtifacts(runtime: Runtime, bundle: ReviewBundle): Promise<void> {
  await runtime.fs.writeText(bundle.resultPath, `${JSON.stringify(bundle.result, null, 2)}\n`);
  await runtime.fs.writeText(
    path.join(bundle.reviewDirectory, 'snapshot-path.txt'),
    `${bundle.snapshot.directory}\n`,
  );
}

async function resolveTarget(workspace: Workspace, options: AssembleOptions): Promise<TargetResolution> {
  if (!options.branch) {
    return await resolveWorkingTarget({
      fs: workspace.runtime.fs,
      git: workspace.git,
      repositoryRoot: workspace.repositoryRoot,
    });
  }
  return await resolveBranchTarget({
    git: workspace.git,
    repositoryRoot: workspace.repositoryRoot,
    baseRef: options.baseRef ?? workspace.config.baseline,
  });
}

interface ProjectChecksOptions {
  workspace: Workspace;
  runtime: Runtime;
  resolution: TargetResolution;
  reviewableFiles: readonly DiffFile[];
  reviewDirectory: string;
  watchedPaths: readonly string[];
  approvals: ReadonlySet<string>;
}

async function runProjectChecks(options: ProjectChecksOptions): Promise<{
  checks: CheckResult[];
  pendingApprovals: PendingApproval[];
  policies: { project: ProjectConfig; policy: ResolvedPolicy }[];
}> {
  const { workspace, resolution } = options;
  const byProject = new Map<string, { project: ProjectConfig; changed: ChangedPath[] }>();

  for (const file of options.reviewableFiles) {
    const probe = file.newPath ?? file.oldPath;
    if (probe === null) continue;
    const project = projectForPath(workspace.config, normalizeRelative(probe));
    if (project === null) continue; // Reported by the review, not silently owned.
    const entry = byProject.get(project.id) ?? { project, changed: [] };
    entry.changed.push({ newPath: file.newPath, oldPath: file.oldPath, changeKind: file.changeKind });
    byProject.set(project.id, entry);
  }

  // Branch review judges committed content while checks necessarily run in the
  // checkout, so when the two differ the difference is stated on every result.
  const revisionNote =
    resolution.target.kind === 'branch' && (await workspace.git.isDirty())
      ? 'Checks ran in the working checkout, which holds uncommitted changes that are not part of the reviewed revision.'
      : null;

  const checks: CheckResult[] = [];
  const pendingApprovals: PendingApproval[] = [];
  const policies: { project: ProjectConfig; policy: ResolvedPolicy }[] = [];

  for (const { project, changed } of [...byProject.values()].sort((a, b) =>
    a.project.id.localeCompare(b.project.id),
  )) {
    const policy = await resolvePolicyFor({
      workspace,
      project,
      activity: 'review',
      paths: changed
        .map((change) => change.newPath ?? change.oldPath)
        .filter((value): value is string => value !== null),
    });
    policies.push({ project, policy });

    const outcome = await runChecks({
      fs: options.runtime.fs,
      config: workspace.config,
      project,
      policy,
      changed,
      repositoryRoot: workspace.repositoryRoot,
      runner: options.runtime.runner,
      clock: options.runtime.clock,
      approvals: options.approvals,
      reviewDirectory: options.reviewDirectory,
      enumerationRevision: resolution.preImageRevision,
      git: workspace.git,
      watchedPaths: options.watchedPaths,
      revisionNote,
    });
    checks.push(...outcome.results);
    pendingApprovals.push(...outcome.pendingApprovals);
  }

  return { checks, pendingApprovals, policies };
}

function summarizePolicy(
  policies: readonly { policy: ResolvedPolicy }[],
): ReviewResult['policySummary'] {
  const packs = new Set<string>();
  const ruleIds = new Set<string>();
  for (const { policy } of policies) {
    for (const pack of policy.packs) packs.add(pack.reference);
    for (const rule of policy.rules) ruleIds.add(rule.qualifiedId);
  }
  return { packs: [...packs].sort(), ruleIds: [...ruleIds].sort() };
}

function policyProvenance(policies: readonly { policy: ResolvedPolicy }[]): ProvenanceEntry[] {
  const entries = new Map<string, ProvenanceEntry>();
  for (const { policy } of policies) {
    for (const pack of policy.packs) {
      entries.set(pack.reference, { kind: 'pack', reference: pack.reference, contentHash: pack.contentHash });
    }
    for (const prompt of policy.prompts) {
      const reference = `${prompt.packReference}:${prompt.declaredPath}@${prompt.stage}`;
      entries.set(reference, { kind: 'prompt', reference, contentHash: prompt.contentHash });
    }
  }
  return [...entries.values()].sort((a, b) => a.reference.localeCompare(b.reference));
}

async function configProvenance(fs: FileSystem, workspace: Workspace): Promise<ProvenanceEntry[]> {
  try {
    return [
      {
        kind: 'config',
        reference: '.ambicode/config.yaml',
        contentHash: contentHash(await fs.readText(workspace.configPath)),
      },
    ];
  } catch {
    return [];
  }
}

async function pluginVersion(fs: FileSystem, pluginRoot: string): Promise<string> {
  try {
    const manifest = JSON.parse(
      await fs.readText(path.join(pluginRoot, '.claude-plugin', 'plugin.json')),
    ) as { version?: unknown };
    return typeof manifest.version === 'string' ? manifest.version : 'unknown';
  } catch {
    return 'unknown';
  }
}
