import path from 'node:path';
import { runChecks, type PendingApproval } from '../checks/run.ts';
import { runRemoteChecks } from '../checks/remote.ts';
import type { ChangedPath } from '../checks/select.ts';
import { MAX_REVIEWED_DISCUSSIONS, REVIEWS_DIR, REVIEWS_LEAF, TASKS_DIR } from '../config/defaults.ts';
import { taskSlugFor, uniqueReviewName } from './review-name.ts';
import {
  openWorkspace,
  projectForPath,
  resolvePolicyFor,
  type Runtime,
  type Workspace,
} from '../composition/root.ts';
import type { ProjectConfig } from '../contracts/config.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import { COMPLETE_COVERAGE } from '../contracts/provider.ts';
import { REVIEW_SCHEMA_VERSION, type CheckResult, type ReviewResult } from '../contracts/review.ts';
import type { DiffFile } from '../git/diff.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { configProvenance, policyProvenance } from '../policy/provenance.ts';
import {
  canonicalUrl,
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
import { AmbicodeError } from '../util/errors.ts';
import { normalizeRelative } from '../util/paths.ts';
import { composeReviewerPrompt, estimatePromptOverheadBytes, type ComposedPrompt } from './prompt.ts';

/**
 * Both `bundle` and `review` assemble it here, so neither re-derives policy or
 * snapshot decisions. The full model input is measured against
 * `review.maxContextBytes` before any caller can reach a reviewer.
 */
export interface ReviewBundle {
  workspace: Workspace;
  reviewId: string;
  reviewDirectory: string;
  resultPath: string;
  snapshot: Snapshot;
  plan: SnapshotPlan;
  measured: MeasuredInput;
  files: DiffFile[];
  patch: string;
  policies: { project: ProjectConfig; policy: ResolvedPolicy }[];
  requirements: NormalizedRequirements;
  pendingApprovals: PendingApproval[];
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
  requirementUrls: readonly string[];
  evidence: EvidenceSource | null;
  approvals: ReadonlySet<string>;
  declines: ReadonlySet<string>;
  task: string | null;
  excludePaths?: readonly string[];
  onlyPaths?: readonly string[];
  withTests?: boolean;
}

function quoteAll(globs: readonly string[]): string {
  return globs.map((glob) => `"${glob}"`).join(', ');
}

function nothingToReview(
  changedFiles: number,
  excludePaths: readonly string[],
  onlyPaths: readonly string[],
): AmbicodeError {
  if (changedFiles === 0) {
    return new AmbicodeError('nothing-to-review', 'Nothing has changed, so there is nothing to review.', {
      details: [
        'The target resolved to no changed file at all.',
        'For uncommitted work that means a clean tree; for --branch, a branch level with its baseline; for --mr, an empty diff.',
        'AMBICODE does not spend a reviewer on an empty change and report the result as a review.',
      ],
    });
  }
  const patterns = [
    ...(onlyPaths.length === 0 ? [] : [`--only ${quoteAll(onlyPaths)}`]),
    ...(excludePaths.length === 0 ? [] : [`--exclude ${quoteAll(excludePaths)}`]),
  ];
  return new AmbicodeError(
    'nothing-to-review',
    'Every changed file was left out by the path patterns, so there is nothing to review.',
    {
      field: patterns.length === 0 ? 'review' : 'review.excludePaths',
      details: [
        `${changedFiles} changed file(s), and none of them survived: ${patterns.join(' ; ') || 'the built-in exclusions'}.`,
        'Widen the patterns so the change itself is still reviewed.',
        'AMBICODE does not spend a reviewer on an empty change and report the result as a review.',
      ],
    },
  );
}

export async function assembleBundle(options: AssembleOptions): Promise<ReviewBundle> {
  const runtime = options.runtime;
  const workspace = await openWorkspace(runtime);
  const limits = workspace.config.review;

  // Requirements first: a bad requirement must stop the run before it costs a check
  // or a model call.
  const requirements = normalizeRequirements({
    urls: options.requirementUrls,
    evidence:
      options.evidence === null
        ? null
        : await loadRequirementEvidence(runtime, options.evidence),
    configuredServer: workspace.config.requirements.mcpServer,
    clock: runtime.clock,
  });
  const requirementBytes = requirements.sources.reduce(
    (total, source) => total + byteLength(source.content),
    0,
  );

  const resolution = await resolveTarget(workspace, options);
  const discussions = 'discussions' in resolution ? resolution.discussions : [];
  const remoteOmissions = 'omissions' in resolution ? resolution.omissions : [];
  const coverage = 'coverage' in resolution ? resolution.coverage : COMPLETE_COVERAGE;

  // Vendored, build-output and credential-shaped files leave the review here: not
  // mirrored, not in the patch, not counted against limits.
  const excludePaths = [...limits.excludePaths, ...(options.excludePaths ?? [])];
  const onlyPaths = [...(options.onlyPaths ?? [])];
  // Merge-request tests are never executed here (without a pinned container every
  // check is skipped), so they are dropped. A local review keeps them: `task` just
  // wrote them and their coverage is the question.
  const excludeTests =
    options.withTests !== true && resolution.target.kind === 'merge-request';
  const patterns = { exclude: excludePaths, include: onlyPaths, excludeTests };
  const reviewable = partitionChange(resolution.files, patterns);

  // A review of no files would report an empty finding list, which reads exactly
  // like a review that found nothing wrong.
  if (reviewable.files.length === 0) {
    throw nothingToReview(resolution.files.length, excludePaths, onlyPaths);
  }

  enforceReviewInputLimits(
    measureInput(reviewable.files, reviewable.patch, { requirementBytes }),
    limits,
    reviewable.files,
  );

  const policies = await resolveProjectPolicies(workspace, reviewable.files);

  const overheadBytes = await estimatePromptOverheadBytes(runtime.fs, runtime.pluginRoot, {
    patch: reviewable.patch,
    requirements: requirements.sources,
    policies,
    discussions,
    files: reviewable.files,
  });

  const plan = await planSnapshot({
    files: reviewable.files,
    content: resolution.content,
    includeSiblingContext: resolution.target.kind !== 'merge-request',
    operator: patterns,
    contextBudgetBytes: Math.max(0, limits.maxContextBytes - overheadBytes),
  });

  const snapshot = await writeSnapshot(runtime.fs, plan, reviewable.patch, runtime.clock);

  const requirementIds = requirements.sources.map((source) => source.id);
  // `normalizeRequirements` sorts sources by id, but the task is named after the
  // first `--requirement` the caller gave (the ticket, not its Confluence page).
  const asNamed = options.requirementUrls
    .map(
      (url) =>
        requirements.sources.find((source) => canonicalUrl(source.url) === canonicalUrl(url))?.id,
    )
    .filter((id): id is string => id !== undefined);
  const taskSlug =
    resolution.target.kind === 'merge-request'
      ? null
      : taskSlugFor({
          requirementIds: asNamed.length > 0 ? asNamed : requirementIds,
          task: options.task,
        });
  const reviewsRoot =
    taskSlug === null
      ? path.join(workspace.repositoryRoot, REVIEWS_DIR)
      : path.join(workspace.repositoryRoot, TASKS_DIR, taskSlug, REVIEWS_LEAF);
  const reviewId = await uniqueReviewName(
    {
      target: resolution.target,
      requirementIds,
      now: runtime.clock.now(),
      insideTask: taskSlug !== null,
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
    changedFiles: resolution.files.map((file) => {
      const target = file.newPath;
      const reason = isExcludedFromReview(file.oldPath, file.newPath, patterns);
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
      ...(onlyPaths.length === 0
        ? []
        : [
            `This review was narrowed on request: only paths matching ${quoteAll(onlyPaths)} were reviewed. Everything else the change touches is unexamined.`,
          ]),
      ...(excludePaths.length === 0
        ? []
        : [
            `This review was narrowed on request: paths matching ${quoteAll(excludePaths)} were not reviewed. Whatever changed in them is unexamined.`,
          ]),
      ...(excludeTests && reviewable.excluded.some((entry) => entry.reason.includes('test code'))
        ? [
            "This is a merge-request review, so the change's test code was not reviewed and no check executed it. Whether the tests cover the change, and whether any assertion was weakened, is unestablished. Re-run with --with-tests to review them.",
          ]
        : []),
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

  bundle.measured = measureInput(reviewable.files, reviewable.patch, {
    snapshotBytes: plan.totalBytes,
    requirementBytes,
    promptBytes: byteLength(bundle.prompt.system) + byteLength(bundle.prompt.user),
  });
  bundle.result.inputs = { ...bundle.measured, limits: bundle.result.inputs.limits };
  enforceReviewInputLimits(bundle.measured, limits, reviewable.files);

  return bundle;
}

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
      provider: workspace.runtime.providers.forUrl(target.url),
      url: target.url,
      repositoryRoot: workspace.repositoryRoot,
      checkoutOriginUrl: await workspace.git.remoteUrl('origin'),
      // Each unchanged neighbour costs a remote request for code the change does not touch.
      includeSiblingContext: false,
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
    if (project === null) continue;
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

  // Merge request code is somebody else's: it runs only in the configured isolated
  // environment, never in the checkout, with no fallback.
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
 * An applicable policy diagnostic becomes an explicit coverage omission, keeping the
 * result `partial` without stopping the reviewer. Diagnostics already downgraded
 * to notice/warning as not applicable to this review are skipped.
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
