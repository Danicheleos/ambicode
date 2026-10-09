import path from 'node:path';
import { runChecks } from '#modules/checks/run/run';
import { REVIEWS_DIR, UNLIMITED_CONTEXT_BUDGET_BYTES } from '#types/defaults';
import { appendLedger } from '#platform/ledger/ledger';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { writeBrief } from './brief.ts';
import { taskSlugFor, uniqueReviewName } from './review-name.ts';
import { openWorkspace, projectForPath } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import { REVIEW_SCHEMA_VERSION, type CheckResult, type ReviewResult, type SnapshotPlan, type ReviewBundle, type AssembleOptions } from '#types/modules/review';
import { configProvenance, policyProvenance } from '#modules/policy/packs/provenance';
import { canonicalUrl, normalizeRequirements, loadRequirementEvidence } from '#modules/requirements/envelope/normalize';
import { describeExclusion, isExcludedFromReview } from '#util/path-classes';
import { byteLength, enforceReviewInputLimits, measureInput, partitionChange, planSnapshot, writeSnapshot } from '../snapshot/snapshot.ts';
import { resolveBranchTarget, resolveCapturedTarget, resolveWorkingTarget } from '../snapshot/target.ts';
import { AmbicodeError } from '#util/errors';
import { normalizeRelative } from '#util/paths';
import { findDependents, flagCollisions } from './dependents.ts';
import type { ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import type { ChangedPath, PendingApproval } from '#types/modules/checks';
import type { Dependent } from '#types/modules/search';
import type { Runtime, Workspace } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { DiffFile } from '#types/platform/git';
import type { TargetResolution } from '../types/snapshot.ts';

type Policies = { project: ProjectConfig; policy: ResolvedPolicy }[];

/** What a dry run measured; a limit refusal is returned, not thrown. */
interface DryRunPlan {
  workspace: Workspace;
  target: TargetResolution['target'];
  files: DiffFile[];
  policies: Policies;
  plan: SnapshotPlan | null;
  refusal: AmbicodeError | null;
}

const DRY_REFUSALS = new Set(['input-too-large', 'snapshot-too-large']);
const quoteAll = (globs: readonly string[]): string => globs.map((glob) => `"${glob}"`).join(', ');
const AGAINST_EMPTY = 'AMBICODE does not spend a reviewer on an empty change and report the result as a review.';

function nothingToReview(changedFiles: number, excludePaths: readonly string[], onlyPaths: readonly string[]): AmbicodeError {
  if (changedFiles === 0) {
    return new AmbicodeError('nothing-to-review', 'Nothing has changed, so there is nothing to review.', {
      details: [
        'The target resolved to no changed file at all.',
        'For uncommitted work that means a clean tree; for --branch, a branch level with its baseline; for --mr, an empty diff.',
        AGAINST_EMPTY,
      ],
    });
  }
  const patterns = [...(onlyPaths.length === 0 ? [] : [`--only ${quoteAll(onlyPaths)}`]), ...(excludePaths.length === 0 ? [] : [`--exclude ${quoteAll(excludePaths)}`])];
  return new AmbicodeError('nothing-to-review', 'Every changed file was left out by the path patterns, so there is nothing to review.', {
    field: patterns.length === 0 ? 'review' : 'review.excludePaths',
    details: [`${changedFiles} changed file(s), and none of them survived: ${patterns.join(' ; ') || 'the built-in exclusions'}.`, 'Widen the patterns so the change itself is still reviewed.', AGAINST_EMPTY],
  });
}

export function groupByProject(workspace: Workspace, files: readonly DiffFile[]): { project: ProjectConfig; changed: ChangedPath[] }[] {
  const byProject = new Map<string, { project: ProjectConfig; changed: ChangedPath[] }>();
  for (const file of files) {
    const probe = file.newPath ?? file.oldPath;
    const project = probe === null ? null : projectForPath(workspace.config, normalizeRelative(probe));
    if (project === null) continue;
    const entry = byProject.get(project.id) ?? { project, changed: [] };
    entry.changed.push({ newPath: file.newPath, oldPath: file.oldPath, changeKind: file.changeKind });
    byProject.set(project.id, entry);
  }
  return [...byProject.values()].sort((a, b) => a.project.id.localeCompare(b.project.id));
}

async function resolveTarget(workspace: Workspace, options: AssembleOptions, dependentPaths: (files: readonly DiffFile[]) => Promise<readonly string[]>): Promise<TargetResolution> {
  const { target } = options;
  if (target.kind === 'merge-request') return resolveCapturedTarget({ workspace, task: options.task, url: target.url });
  if (target.kind === 'branch') return resolveBranchTarget({ git: workspace.git, repositoryRoot: workspace.repositoryRoot, baseRef: target.baseRef ?? workspace.config.baseline });
  return resolveWorkingTarget({ fs: workspace.runtime.fs, git: workspace.git, repositoryRoot: workspace.repositoryRoot, extraPaths: dependentPaths });
}

export async function assembleBundle(options: AssembleOptions & { dryRun: true }): Promise<DryRunPlan>;
export async function assembleBundle(options: AssembleOptions): Promise<ReviewBundle>;
export async function assembleBundle(options: AssembleOptions): Promise<ReviewBundle | DryRunPlan> {
  const { runtime } = options;
  const workspace = await openWorkspace(runtime);
  const limits = workspace.config.review;

  // Requirements first: a bad requirement must stop the run before it costs a check or a model call.
  const requirements = normalizeRequirements({
    urls: options.requirementUrls,
    evidence: options.evidence === null ? null : await loadRequirementEvidence(runtime, options.evidence),
    configuredServer: workspace.config.requirements.mcpServer,
    declared: options.evidence?.kind === 'inline' ? 'captured' : 'urls',
  });
  const requirementBytes = requirements.sources.reduce((total, source) => total + byteLength(source.content), 0);

  // The working tree is read once, so what relies on the change is chosen before that read.
  // A merge request's code is not the checkout, so a name search there would describe the wrong tree.
  const named = (options.contextPaths ?? []).map((entry) => ({ path: normalizeRelative(entry), reasons: ['named with --context'] }));
  let lookedUp: Dependent[] | null = null;
  const lookUp = async (files: readonly DiffFile[]): Promise<Dependent[]> => {
    const projects = groupByProject(workspace, files).map(({ project }) => project);
    const found = (await findDependents({ git: workspace.git, projects, files })).dependents;
    lookedUp = await flagCollisions(workspace.git, runtime.fs, projects, [...named, ...found.filter((entry) => !named.some((other) => other.path === entry.path))]);
    return lookedUp;
  };
  const resolution = await resolveTarget(workspace, options, async (files) => (await lookUp(files)).map((entry) => entry.path));
  const preexisting = new Set(options.preexisting ?? []);
  if (preexisting.size > 0) resolution.files = resolution.files.filter((file) => !preexisting.has(file.newPath ?? '') && !preexisting.has(file.oldPath ?? ''));

  // Vendored, build-output and credential-shaped files leave the review here: not mirrored, not in the patch, not counted.
  const excludePaths = [...limits.excludePaths, ...(options.excludePaths ?? [])];
  const onlyPaths = [...(options.onlyPaths ?? [])];
  // Merge-request tests are never executed here (no pinned container), so they are dropped; a local review keeps them.
  const excludeTests = options.withTests !== true && resolution.target.kind === 'merge-request';
  const patterns = { exclude: excludePaths, include: onlyPaths, excludeTests };
  const reviewable = partitionChange(resolution.files, patterns);
  if (reviewable.files.length === 0) throw nothingToReview(resolution.files.length, excludePaths, onlyPaths);

  const policies: Policies = [];
  for (const { project, changed } of groupByProject(workspace, reviewable.files)) {
    const paths = changed.map((change) => change.newPath ?? change.oldPath).filter((value): value is string => value !== null);
    policies.push({ project, policy: await resolvePolicyFor({ workspace, project, activity: 'review', paths }) });
  }
  const dry = (plan: SnapshotPlan | null, refusal: AmbicodeError | null): DryRunPlan => ({ workspace, target: resolution.target, files: reviewable.files, policies, plan, refusal });
  const refused = (error: unknown): AmbicodeError | null => (options.dryRun === true && error instanceof AmbicodeError && DRY_REFUSALS.has(error.code) ? error : null);

  const local = resolution.target.kind !== 'merge-request';
  let plan: SnapshotPlan;
  let wanted: Dependent[] = [];
  try {
    enforceReviewInputLimits(measureInput(reviewable.files, reviewable.patch, { requirementBytes }), limits, reviewable.files);
    wanted = !local ? [] : lookedUp ?? (await lookUp(resolution.files));
    plan = await planSnapshot({
      files: reviewable.files,
      content: resolution.content,
      includeSiblingContext: local,
      operator: patterns,
      contextBudgetBytes: Math.max(0, limits.maxContextBytes ?? UNLIMITED_CONTEXT_BUDGET_BYTES),
      dependentPaths: wanted.map((entry) => entry.path),
    });
  } catch (error) {
    const refusal = refused(error);
    if (refusal === null) throw error;
    return dry(null, refusal);
  }
  if (options.dryRun === true) return dry(plan, null);

  const snapshot = await writeSnapshot(runtime.fs, plan, reviewable.patch);
  const requirementIds = requirements.sources.map((source) => source.id);
  // `normalizeRequirements` sorts sources by id, but the task is named after the first `--requirement` the caller gave.
  const asNamed = options.requirementUrls.flatMap((url) => requirements.sources.find((source) => canonicalUrl(source.url) === canonicalUrl(url))?.id ?? []);
  const taskSlug = taskSlugFor({ requirementIds: !local ? [] : asNamed.length > 0 ? asNamed : requirementIds, task: options.task });
  const reviewsRoot = taskSlug === null ? path.join(workspace.repositoryRoot, REVIEWS_DIR) : taskDirFor(workspace.repositoryRoot, taskSlug).reviews;
  const reviewId = await uniqueReviewName(
    { target: resolution.target, requirementIds, now: runtime.clock.now(), insideTask: taskSlug !== null },
    (name) => runtime.fs.exists(path.join(reviewsRoot, name)),
    runtime.ids.reviewId(),
  );
  const reviewDirectory = path.join(reviewsRoot, reviewId);
  await runtime.fs.mkdirp(reviewDirectory);

  // Both names of every change are watched: a check that resurrects a deleted or renamed file changed the tree as surely as one that rewrites a survivor.
  const watchedPaths = [...new Set(reviewable.files.flatMap((file) => [file.newPath, file.oldPath]).filter((value): value is string => value !== null))];
  // Branch review judges committed content while checks run in the checkout, so a dirty checkout is stated on every result.
  const revisionNote = resolution.target.kind === 'branch' && (await workspace.git.isDirty()) ? 'Checks ran in the working checkout, which holds uncommitted changes that are not part of the reviewed revision.' : null;
  const checks: CheckResult[] = [];
  const pendingApprovals: PendingApproval[] = [];
  for (const { project, changed } of groupByProject(workspace, reviewable.files)) {
    const outcome = await runChecks({
      fs: runtime.fs, config: workspace.config, project, policy: policies.find((entry) => entry.project.id === project.id)!.policy, changed,
      repositoryRoot: workspace.repositoryRoot, runner: runtime.runner, clock: runtime.clock, approvals: options.approvals, declines: options.declines,
      reviewDirectory, enumerationRevision: resolution.preImageRevision, git: workspace.git, watchedPaths, revisionNote,
    });
    checks.push(...outcome.results);
    pendingApprovals.push(...outcome.pendingApprovals);
  }

  const measured = measureInput(reviewable.files, reviewable.patch, { snapshotBytes: plan.totalBytes, requirementBytes });
  const manifest = JSON.parse(await runtime.fs.readText(path.join(runtime.pluginRoot, '.claude-plugin', 'plugin.json')).catch(() => '{}')) as { version?: unknown };
  const sourceFree = requirements.mode === 'source-free';
  const narrowed = (what: string, globs: readonly string[], rest: string): string[] => (globs.length === 0 ? [] : [`This review was narrowed on request: ${what} matching ${quoteAll(globs)} ${rest}`]);
  const result: ReviewResult = {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviewId,
    createdAt: runtime.clock.now().toISOString(),
    pluginVersion: typeof manifest.version === 'string' ? manifest.version : 'unknown',
    target: resolution.target,
    requirements: requirements.sources,
    requirementMode: sourceFree ? 'quality-review' : 'requirement-based',
    requirementConflicts: requirements.conflicts,
    provenance: [...(await configProvenance(runtime.fs, workspace)), ...policyProvenance(policies), ...requirements.provenance],
    inputs: { ...measured, limits: { maxChangedFiles: limits.maxChangedFiles, maxChangedLines: limits.maxChangedLines, maxContextBytes: limits.maxContextBytes, maxFindings: limits.maxFindings } },
    reviewer: null,
    brief: null,
    policySummary: { packs: [...new Set(policies.flatMap(({ policy }) => policy.packs.map((pack) => pack.reference)))].sort(), ruleIds: [...new Set(policies.flatMap(({ policy }) => policy.rules.map((rule) => rule.qualifiedId)))].sort() },
    checks,
    changedFiles: resolution.files.map((file) => {
      const reason = isExcludedFromReview(file.oldPath, file.newPath, patterns);
      return { oldPath: file.oldPath, newPath: file.newPath, changeKind: file.changeKind, addedLines: file.addedLines, removedLines: file.removedLines, included: file.newPath !== null && snapshot.included.includes(file.newPath), exclusionReason: reason === null ? null : describeExclusion(reason) };
    }),
    findings: [],
    omissions: [
      ...(preexisting.size === 0 ? [] : [`not covered: pre-existing changes: ${[...preexisting].sort().slice(0, 10).join(', ')}${preexisting.size > 10 ? ` (+${preexisting.size - 10} more)` : ''}`]),
      ...narrowed('only paths', onlyPaths, 'were reviewed. Everything else the change touches is unexamined.'),
      ...narrowed('paths', excludePaths, 'were not reviewed. Whatever changed in them is unexamined.'),
      ...(excludeTests && reviewable.excluded.some((entry) => entry.reason.includes('test code'))
        ? ["This is a merge-request review, so the change's test code was not reviewed and no check executed it. Whether the tests cover the change, and whether any assertion was weakened, is unestablished. Re-run with --with-tests to review them."]
        : []),
      ...reviewable.excluded.map((entry) => `${entry.path}: ${entry.reason}.`),
      ...snapshot.omissions,
      ...requirements.notices,
      // An applicable policy error becomes a coverage omission: it keeps the result `partial` without stopping the reviewer.
      ...policies.flatMap(({ project, policy }) => policy.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').map((diagnostic) => `project "${project.id}" policy: ${diagnostic.code}: ${diagnostic.message}`)),
      ...(sourceFree ? ['No requirement was supplied, so this is a quality review. It does not establish that the change does what any ticket or specification asked for.'] : []),
    ],
    status: 'partial',
    statusReason: 'Evidence bundle only; the independent reviewer has not run.',
  };

  return {
    workspace, reviewId, reviewDirectory,
    taskDirectory: taskSlug === null ? null : taskDirFor(workspace.repositoryRoot, taskSlug).root,
    resultPath: path.join(reviewDirectory, 'result.json'),
    snapshot, plan, dependents: wanted.filter((entry) => plan.dependentPaths.includes(entry.path)),
    measured, files: reviewable.files, patch: reviewable.patch, policies, requirements, pendingApprovals, result,
  };
}

/** `ledger` adds fields to the `review` entry (route, session, baseline, preexisting); the entry is returned. */
export async function writeBundleArtifacts(runtime: Runtime, bundle: ReviewBundle, ledger: Readonly<Record<string, unknown>> = {}): Promise<LedgerEntry | null> {
  const { result } = bundle;
  result.brief = path.relative(bundle.workspace.repositoryRoot, await writeBrief(runtime, bundle));
  await runtime.fs.writeText(bundle.resultPath, `${JSON.stringify(result, null, 2)}\n`);
  await runtime.fs.writeText(path.join(bundle.reviewDirectory, 'snapshot-path.txt'), `${bundle.snapshot.directory}\n`);
  if (bundle.taskDirectory === null) return null;
  return (await appendLedger(runtime.fs, bundle.taskDirectory, runtime.clock.now(), runtime.ids.writerId(), {
    ...ledger,
    kind: 'review',
    reviewId: bundle.reviewId,
    result: path.relative(bundle.workspace.repositoryRoot, bundle.resultPath),
    status: result.status,
    statusReason: result.statusReason,
    stage: result.reviewer === null ? 'pending' : 'recorded',
    reviewerRan: result.reviewer !== null,
    findings: result.findings.length,
    omissions: result.omissions.length,
    checks: result.checks.map((check) => ({ projectId: check.projectId, commandId: check.commandId, status: check.status, exitCode: check.exitCode })),
    waiting: bundle.pendingApprovals.map((approval) => approval.approvalKey),
  })).entry;
}
