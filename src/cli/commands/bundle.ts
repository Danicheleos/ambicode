import path from 'node:path';
import { REVIEWS_DIR } from '../../config/defaults.ts';
import { runChecks, type PendingApproval } from '../../checks/run.ts';
import type { ChangedPath } from '../../checks/select.ts';
import {
  openWorkspace,
  projectForPath,
  resolvePolicyFor,
  type Runtime,
  type Workspace,
} from '../../composition/root.ts';
import type { DiffFile } from '../../git/diff.ts';
import type { FileSystem } from '../../ports/filesystem.ts';
import type { CheckResult, ReviewResult } from '../../contracts/review.ts';
import type { ProjectConfig } from '../../contracts/config.ts';
import { REVIEW_SCHEMA_VERSION } from '../../contracts/review.ts';
import {
  enforceReviewInputLimits,
  measureInput,
  partitionChange,
  type MeasuredInput,
} from '../../snapshot/limits.ts';
import { planSnapshot, writeSnapshot } from '../../snapshot/snapshot.ts';
import { resolveBranchTarget, resolveWorkingTarget, type TargetResolution } from '../../snapshot/target.ts';
import { describeExclusion, isExcludedFromReview } from '../../snapshot/exclusions.ts';
import { normalizeRelative } from '../../util/paths.ts';
import type { ParsedArgs } from '../args.ts';

export const BUNDLE_OPTIONS = {
  values: ['base'],
  repeated: ['approve'],
  flags: ['json', 'branch'],
} as const;

export interface BundleOutput {
  command: 'bundle';
  reviewId: string;
  reviewDirectory: string;
  snapshotDirectory: string;
  resultPath: string;
  measured: MeasuredInput;
  result: ReviewResult;
  pendingApprovals: PendingApproval[];
}

/**
 * Everything a review needs before a model is involved: pinned target,
 * immutable snapshot, applicable policy, check evidence. It stops at the
 * evidence and says so, rather than emitting a finding list that reads clean.
 */
export async function runBundle(runtime: Runtime, args: ParsedArgs): Promise<BundleOutput> {
  const workspace = await openWorkspace(runtime);
  const resolution = await resolveTarget(workspace, args);

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

  const { checks, pendingApprovals, packs, ruleIds } = await runProjectChecks({
    workspace,
    runtime,
    resolution,
    reviewableFiles: reviewable.files,
    reviewDirectory,
    watchedPaths,
    approvals: new Set(args.all('approve')),
  });

  const result: ReviewResult = {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviewId,
    createdAt: runtime.clock.now().toISOString(),
    pluginVersion: await pluginVersion(runtime.fs, runtime.pluginRoot),
    reviewModel: workspace.config.review.model,
    target: resolution.target,
    requirements: [],
    requirementMode: 'quality-review',
    provenance: [],
    policySummary: { packs: [...packs].sort(), ruleIds: [...ruleIds].sort() },
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
      'No model review was run: this command produces the evidence bundle only. An empty finding list here does not mean the change is clean.',
    ],
    // "partial" is the honest status: real evidence, no judgement yet.
    status: 'partial',
    statusReason: 'Evidence bundle only; the independent reviewer has not run.',
  };

  const resultPath = path.join(reviewDirectory, 'result.json');
  await runtime.fs.writeText(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  await runtime.fs.writeText(path.join(reviewDirectory, 'snapshot-path.txt'), `${snapshot.directory}\n`);

  return {
    command: 'bundle',
    reviewId,
    reviewDirectory,
    snapshotDirectory: snapshot.directory,
    resultPath,
    measured,
    result,
    pendingApprovals,
  };
}

async function resolveTarget(workspace: Workspace, args: ParsedArgs): Promise<TargetResolution> {
  if (!args.flag('branch')) {
    return await resolveWorkingTarget({
      fs: workspace.runtime.fs,
      git: workspace.git,
      repositoryRoot: workspace.repositoryRoot,
    });
  }
  return await resolveBranchTarget({
    git: workspace.git,
    repositoryRoot: workspace.repositoryRoot,
    baseRef: args.value('base') ?? workspace.config.baseline,
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
  packs: Set<string>;
  ruleIds: Set<string>;
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
  const packs = new Set<string>();
  const ruleIds = new Set<string>();

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
    for (const pack of policy.packs) packs.add(pack.reference);
    for (const rule of policy.rules) ruleIds.add(rule.qualifiedId);

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

  return { checks, pendingApprovals, packs, ruleIds };
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

export function renderBundle(output: BundleOutput): string {
  const lines = [
    `review ${output.reviewId}`,
    `  target      ${output.result.target.kind} (${output.result.target.snapshotId})`,
    `  measured    ${output.measured.changedFiles} file(s), ${output.measured.changedLines} line(s), ` +
      `${output.measured.contextBytes} context byte(s) ` +
      `(${output.measured.patchBytes} patch + ${output.measured.snapshotBytes} mirrored)`,
    `  snapshot    ${output.snapshotDirectory}`,
    `  result      ${output.resultPath}`,
  ];

  for (const note of output.result.target.notes) lines.push(`  note        ${note}`);

  lines.push('', 'checks');
  if (output.result.checks.length === 0) lines.push('  (no project owns a file in this change)');
  for (const check of output.result.checks) {
    lines.push(
      `  ${check.projectId}/${check.checkId}: ${check.status}` +
        `  selected=${check.selected.length}` +
        `  complete=${check.selectionComplete}`,
    );
    for (const limitation of check.limitations) lines.push(`      - ${limitation}`);
    for (const mutation of check.mutations) lines.push(`      ! ${mutation}`);
  }

  if (output.pendingApprovals.length > 0) {
    lines.push('', 'waiting for authorization');
    for (const approval of output.pendingApprovals) {
      lines.push(`  --approve ${approval.approvalKey}`);
      lines.push(`      reason: ${approval.reason}`);
      lines.push(`      scope:  ${approval.scope}`);
      lines.push(`      would run: ${approval.proposedArgv.join(' ')}`);
    }
  }

  lines.push('', 'omissions');
  for (const omission of output.result.omissions) lines.push(`  - ${omission}`);
  return lines.join('\n');
}
