import path from 'node:path';
import { runChecks, type PendingApproval } from '../checks/run.ts';
import { runRemoteChecks } from '../checks/remote.ts';
import type { ChangedPath } from '../checks/select.ts';
import { MAX_REVIEWED_DISCUSSIONS, REVIEWS_DIR } from '../config/defaults.ts';
import { uniqueReviewName } from './review-name.ts';
import {
  openWorkspace,
  projectForPath,
  resolvePolicyFor,
  type Runtime,
  type Workspace,
} from '../composition/root.ts';
import type { ProjectConfig } from '../contracts/config.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import { COMPLETE_COVERAGE, type RemoteDiscussion } from '../contracts/provider.ts';
import { REVIEW_SCHEMA_VERSION, type CheckResult, type ReviewResult } from '../contracts/review.ts';
import type { DiffFile } from '../git/diff.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { configProvenance, policyProvenance } from '../policy/provenance.ts';
import {
  normalizeRequirements,
  loadRequirementEvidence,
  type EvidenceSource,
  type NormalizedRequirements,
} from '../requirements/normalize.ts';
import { describeExclusion, isExcludedFromReview } from '../snapshot/exclusions.ts';
import {
  byteLength,
  enforceReviewInputLimits,
  measureInput,
  partitionChange,
  type MeasuredInput,
} from '../snapshot/limits.ts';
import { resolveMergeRequestTarget } from '../snapshot/remote-target.ts';
import { planSnapshot, writeSnapshot, type Snapshot, type SnapshotPlan } from '../snapshot/snapshot.ts';
import {
  resolveBranchTarget,
  resolveWorkingTarget,
  type TargetResolution,
} from '../snapshot/target.ts';
import { normalizeRelative } from '../util/paths.ts';
import { composeReviewerPrompt, estimatePromptOverheadBytes, type ComposedPrompt } from './prompt.ts';

/**
 * One pinned bundle: target, changed files, immutable snapshot, requirements,
 * applicable policy, check evidence, omissions and the limits everything was
 * measured against (doc 02). Both `bundle` and `review` assemble it here, so
 * neither re-derives policy or snapshot decisions.
 *
 * The canonical prompt is composed here too, and the complete model input is
 * measured against `review.maxContextBytes` before this function returns —
 * which is before any caller can reach a reviewer (doc 02).
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
  /** The exact text a reviewer would be given, already measured. */
  prompt: ComposedPrompt;
  /** Findings are empty and status is `partial` until a reviewer has run. */
  result: ReviewResult;
}

export type TargetSelection =
  | { kind: 'working' }
  | { kind: 'branch'; baseRef: string | null }
  | { kind: 'merge-request'; url: string };

export interface AssembleOptions {
  runtime: Runtime;
  target: TargetSelection;
  /** Requirement URLs, the canonical way a requirement enters a review. */
  requirementUrls: readonly string[];
  /** Where the outer session's evidence envelope comes from, if any. */
  evidence: EvidenceSource | null;
  approvals: ReadonlySet<string>;
  /** Approval keys a human refused, so the run stops waiting on them. */
  declines: ReadonlySet<string>;
}

export async function assembleBundle(options: AssembleOptions): Promise<ReviewBundle> {
  const runtime = options.runtime;
  const workspace = await openWorkspace(runtime);
  const limits = workspace.config.review;

  // Requirements first. An inaccessible or contradictory requirement must stop
  // the run before it costs a check or a model call (doc 02, "Data flow").
  const requirements = normalizeRequirements({
    urls: options.requirementUrls,
    evidence:
      options.evidence === null
        ? null
        : await loadRequirementEvidence(runtime, options.evidence),
    configuredServer: workspace.config.requirements.mcpServer,
  });
  const requirementBytes = requirements.sources.reduce(
    (total, source) => total + byteLength(source.content),
    0,
  );

  const resolution = await resolveTarget(workspace, options);
  const discussions = 'discussions' in resolution ? resolution.discussions : [];
  const remoteOmissions = 'omissions' in resolution ? resolution.omissions : [];
  // Structural coverage of the change. A local target is always complete: git
  // delivers the whole diff or fails, so there is no aggregate cap to detect.
  const coverage = 'coverage' in resolution ? resolution.coverage : COMPLETE_COVERAGE;

  // Vendored directories, build output and credential-shaped files leave the
  // review here: they are not mirrored, not put in the patch, and not counted
  // against limits meant to protect genuine review.
  const reviewable = partitionChange(resolution.files);

  // The counts that cost nothing come first: a change already over the file,
  // line or requirement limit is refused without reading a single file, and
  // without a process, a container or a model (doc 02).
  enforceReviewInputLimits(
    measureInput(reviewable.files, reviewable.patch, { requirementBytes }),
    limits,
    reviewable.files,
  );

  // Policy is resolved before the snapshot is planned, because the scoped rules
  // and prompt files are part of what the model is handed and therefore part of
  // what the context budget has to cover.
  const policies = await resolveProjectPolicies(workspace, reviewable.files);

  const overheadBytes = await estimatePromptOverheadBytes(runtime.fs, runtime.pluginRoot, {
    patch: reviewable.patch,
    requirements: requirements.sources,
    policies,
    discussions,
  });

  // Decided and read, but not yet written. Changed files are mirrored whatever
  // the budget says — a review that silently dropped part of its own change
  // would report on half of it — and only unchanged neighbours are fitted into
  // what the prompt leaves over.
  const plan = await planSnapshot({
    files: reviewable.files,
    content: resolution.content,
    contextBudgetBytes: Math.max(0, limits.maxContextBytes - overheadBytes),
  });

  const snapshot = await writeSnapshot(runtime.fs, plan, reviewable.patch, runtime.clock);

  // The directory name is the review id, and it is what a person scans the
  // listing for: which merge request, which ticket, which day.
  const reviewsRoot = path.join(workspace.repositoryRoot, REVIEWS_DIR);
  const reviewId = await uniqueReviewName(
    {
      target: resolution.target,
      requirementIds: requirements.sources.map((source) => source.id),
      now: runtime.clock.now(),
    },
    (name) => runtime.fs.exists(path.join(reviewsRoot, name)),
    runtime.ids.reviewId(),
  );
  const reviewDirectory = path.join(reviewsRoot, reviewId);
  await runtime.fs.mkdirp(reviewDirectory);

  const { checks, pendingApprovals, notes: checkNotes } = await runProjectChecks({
    workspace,
    runtime,
    resolution,
    policies,
    reviewableFiles: reviewable.files,
    reviewDirectory,
    snapshot,
    approvals: options.approvals,
    declines: options.declines,
  });

  const measured = measureInput(reviewable.files, reviewable.patch, {
    snapshotBytes: plan.totalBytes,
    requirementBytes,
  });

  const result: ReviewResult = {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviewId,
    createdAt: runtime.clock.now().toISOString(),
    pluginVersion: await pluginVersion(runtime.fs, runtime.pluginRoot),
    reviewModel: limits.model,
    target: resolution.target,
    requirements: requirements.sources,
    // ReviewResult keeps its own historical spelling; `source-free` (the
    // canonical, activity-neutral value normalizeRequirements returns) maps
    // to `quality-review` only here, at the one place a ReviewResult is built
    // (doc 04 P2.2 correction C; contracts/review.ts, ReviewRequirementMode).
    requirementMode: requirements.mode === 'source-free' ? 'quality-review' : 'requirement-based',
    requirementConflicts: requirements.conflicts,
    provenance: [
      ...(await configProvenance(runtime.fs, workspace)),
      ...policyProvenance(policies),
      ...requirements.provenance,
    ],
    inputs: {
      ...measured,
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
    coverage,
    discussions,
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
      ...remoteOmissions,
      ...reviewable.excluded.map((entry) => `${entry.path}: ${entry.reason}.`),
      ...snapshot.omissions,
      ...checkNotes,
      ...requirements.notices,
      ...policyDiagnosticOmissions(policies),
      ...(requirements.mode === 'source-free'
        ? [
            'No requirement was supplied, so this is a quality review. It does not establish that the change does what any ticket or specification asked for.',
          ]
        : []),
    ],
    status: 'partial',
    statusReason: 'Evidence bundle only; the independent reviewer has not run.',
  };

  const bundle: ReviewBundle = {
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
    prompt: { system: '', user: '', provenance: [] },
    result,
  };

  bundle.prompt = await composeReviewerPrompt(runtime.fs, runtime.pluginRoot, bundle);
  bundle.result.provenance = [...bundle.result.provenance, ...bundle.prompt.provenance].sort((a, b) =>
    `${a.kind}${a.reference}`.localeCompare(`${b.kind}${b.reference}`),
  );

  // The authoritative measurement, on the bytes that exist rather than on an
  // estimate: the composed system and user prompts plus the tree the
  // reviewer can read (doc 04 P2.4 correction E5: both prompts count against
  // the one canonical limit). It happens here, before any caller can invoke a
  // reviewer.
  bundle.measured = measureInput(reviewable.files, reviewable.patch, {
    snapshotBytes: plan.totalBytes,
    requirementBytes,
    promptBytes: byteLength(bundle.prompt.system) + byteLength(bundle.prompt.user),
  });
  bundle.result.inputs = { ...bundle.measured, limits: bundle.result.inputs.limits };
  enforceReviewInputLimits(bundle.measured, limits, reviewable.files);

  return bundle;
}

/**
 * Persists the result, the two composed prompt artifacts and the pointer to
 * its snapshot. The system and user prompts are written as two separate
 * files (doc 04 P2.4 correction E6) so an audit can see exactly what was
 * appended to the reviewer's system prompt versus what it received as the
 * ordinary user prompt, without reconstructing the split from one merged file.
 */
export async function writeBundleArtifacts(runtime: Runtime, bundle: ReviewBundle): Promise<void> {
  await runtime.fs.writeText(bundle.resultPath, `${JSON.stringify(bundle.result, null, 2)}\n`);
  await runtime.fs.writeText(
    path.join(bundle.reviewDirectory, 'reviewer-system-prompt.md'),
    bundle.prompt.system,
  );
  await runtime.fs.writeText(
    path.join(bundle.reviewDirectory, 'reviewer-user-prompt.md'),
    bundle.prompt.user,
  );
  await runtime.fs.writeText(
    path.join(bundle.reviewDirectory, 'snapshot-path.txt'),
    `${bundle.snapshot.directory}\n`,
  );
}

async function resolveTarget(
  workspace: Workspace,
  options: AssembleOptions,
): Promise<TargetResolution | Awaited<ReturnType<typeof resolveMergeRequestTarget>>> {
  const target = options.target;
  if (target.kind === 'merge-request') {
    return await resolveMergeRequestTarget({
      // The registry chooses the provider from the URL; no module here names
      // GitLab or GitHub (doc 02).
      provider: workspace.runtime.providers.forUrl(target.url),
      url: target.url,
      repositoryRoot: workspace.repositoryRoot,
      includeSiblingContext: true,
      maxDiscussions: MAX_REVIEWED_DISCUSSIONS,
    });
  }
  if (target.kind === 'branch') {
    return await resolveBranchTarget({
      git: workspace.git,
      repositoryRoot: workspace.repositoryRoot,
      baseRef: target.baseRef ?? workspace.config.baseline,
    });
  }
  return await resolveWorkingTarget({
    fs: workspace.runtime.fs,
    git: workspace.git,
    repositoryRoot: workspace.repositoryRoot,
  });
}

/** Policy for every project that owns a changed file, in project order. */
async function resolveProjectPolicies(
  workspace: Workspace,
  reviewableFiles: readonly DiffFile[],
): Promise<{ project: ProjectConfig; policy: ResolvedPolicy }[]> {
  const grouped = groupByProject(workspace, reviewableFiles);
  const policies: { project: ProjectConfig; policy: ResolvedPolicy }[] = [];

  for (const { project, changed } of grouped) {
    policies.push({
      project,
      policy: await resolvePolicyFor({
        workspace,
        project,
        activity: 'review',
        paths: changed
          .map((change) => change.newPath ?? change.oldPath)
          .filter((value): value is string => value !== null),
      }),
    });
  }
  return policies;
}

function groupByProject(
  workspace: Workspace,
  reviewableFiles: readonly DiffFile[],
): { project: ProjectConfig; changed: ChangedPath[] }[] {
  const byProject = new Map<string, { project: ProjectConfig; changed: ChangedPath[] }>();

  for (const file of reviewableFiles) {
    const probe = file.newPath ?? file.oldPath;
    if (probe === null) continue;
    const project = projectForPath(workspace.config, normalizeRelative(probe));
    if (project === null) continue; // Reported by the review, not silently owned.
    const entry = byProject.get(project.id) ?? { project, changed: [] };
    entry.changed.push({ newPath: file.newPath, oldPath: file.oldPath, changeKind: file.changeKind });
    byProject.set(project.id, entry);
  }

  return [...byProject.values()].sort((a, b) => a.project.id.localeCompare(b.project.id));
}

interface ProjectChecksOptions {
  workspace: Workspace;
  runtime: Runtime;
  resolution: TargetResolution;
  policies: readonly { project: ProjectConfig; policy: ResolvedPolicy }[];
  reviewableFiles: readonly DiffFile[];
  reviewDirectory: string;
  snapshot: Snapshot;
  approvals: ReadonlySet<string>;
  declines: ReadonlySet<string>;
}

async function runProjectChecks(options: ProjectChecksOptions): Promise<{
  checks: CheckResult[];
  pendingApprovals: PendingApproval[];
  notes: string[];
}> {
  const { workspace, resolution } = options;
  const grouped = groupByProject(workspace, options.reviewableFiles);
  const policyOf = new Map(options.policies.map((entry) => [entry.project.id, entry.policy]));

  // Merge request code is somebody else's, so it is executed only inside the
  // configured isolated environment, and never in the developer's checkout
  // (doc 05). There is no fallback path from one to the other.
  if (resolution.target.kind === 'merge-request') {
    const outcome = await runRemoteChecks({
      fs: options.runtime.fs,
      config: workspace.config,
      runner: options.runtime.runner,
      clock: options.runtime.clock,
      projects: grouped.map((entry) => ({
        project: entry.project,
        policy: policyOf.get(entry.project.id) as ResolvedPolicy,
        changed: entry.changed,
      })),
      snapshotFilesDirectory: options.snapshot.filesDirectory,
      reviewDirectory: options.reviewDirectory,
      approvals: options.approvals,
    });
    return { checks: outcome.results, pendingApprovals: [], notes: outcome.notes };
  }

  // Both names of every change are watched: a check that resurrects a deleted or
  // renamed file has changed the tree as surely as one that rewrites a survivor.
  const watchedPaths = [
    ...new Set(
      options.reviewableFiles
        .flatMap((file) => [file.newPath, file.oldPath])
        .filter((value): value is string => value !== null),
    ),
  ];

  // Branch review judges committed content while checks necessarily run in the
  // checkout, so when the two differ the difference is stated on every result.
  const revisionNote =
    resolution.target.kind === 'branch' && (await workspace.git.isDirty())
      ? 'Checks ran in the working checkout, which holds uncommitted changes that are not part of the reviewed revision.'
      : null;

  const checks: CheckResult[] = [];
  const pendingApprovals: PendingApproval[] = [];

  for (const { project, changed } of grouped) {
    const outcome = await runChecks({
      fs: options.runtime.fs,
      config: workspace.config,
      project,
      policy: policyOf.get(project.id) as ResolvedPolicy,
      changed,
      repositoryRoot: workspace.repositoryRoot,
      runner: options.runtime.runner,
      clock: options.runtime.clock,
      approvals: options.approvals,
      declines: options.declines,
      reviewDirectory: options.reviewDirectory,
      enumerationRevision: resolution.preImageRevision,
      git: workspace.git,
      watchedPaths,
      revisionNote,
    });
    checks.push(...outcome.results);
    pendingApprovals.push(...outcome.pendingApprovals);
  }

  return { checks, pendingApprovals, notes: [] };
}

/**
 * An applicable policy diagnostic (an unreadable review prompt, an unknown
 * command reference) must become an explicit coverage omission rather than
 * silently disappearing (doc 04 P2.4 correction B8): review/bundle never
 * inspected `ResolvedPolicy.diagnostics` at all before this, so a blocking
 * error here was invisible in the result. It does not stop the quality
 * reviewer from examining the available change — only `applyStatus`
 * (`src/cli/commands/review.ts`) uses this to keep the result honestly
 * `partial` rather than `complete`. A diagnostic already downgraded to
 * `notice`/`warning` because it does not apply to this review (resolved by
 * `resolvePolicy`, correction B6/B7) is omitted here: it was never coverage
 * this review needed.
 */
function policyDiagnosticOmissions(policies: readonly { project: ProjectConfig; policy: ResolvedPolicy }[]): string[] {
  const omissions: string[] = [];
  for (const { project, policy } of policies) {
    for (const diagnostic of policy.diagnostics) {
      if (diagnostic.severity !== 'error') continue;
      omissions.push(`project "${project.id}" policy: ${diagnostic.code}: ${diagnostic.message}`);
    }
  }
  return omissions;
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

/** Kept for the discussions a caller wants without re-reading the result. */
export function discussionsOf(bundle: ReviewBundle): readonly RemoteDiscussion[] {
  return bundle.result.discussions;
}
