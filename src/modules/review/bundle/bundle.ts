import path from 'node:path';
import { REVIEWS_DIR } from '#types/defaults';
import { appendLedger, readLedger } from '#platform/ledger/ledger';
import { resolveTaskDir, taskDirFor } from '#modules/evidence/task/task-dir';
import { reviewName, taskSlugFor } from './review-name.ts';
import { openWorkspace, projectForPath } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import { REVIEW_SCHEMA_VERSION, type RecordedCheck, type ReviewResult, type ReviewBundle, type AssembleOptions } from '#types/modules/review';
import { describeExclusion, isExcludedFromReview } from '#util/path-classes';
import { byteLength, enforceReviewInputLimits, measureInput, partitionChange } from '../snapshot/change.ts';
import { resolveBranchTarget, resolveCapturedTarget, resolveWorkingTarget } from '../snapshot/target.ts';
import { AmbicodeError } from '#util/errors';
import { normalizeRelative } from '#util/paths';
import type { ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import type { ChangedPath } from '#types/modules/checks';
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
  refusal: AmbicodeError | null;
}

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

async function resolveTarget(workspace: Workspace, options: AssembleOptions): Promise<TargetResolution> {
  const { target } = options;
  if (target.kind === 'merge-request') return resolveCapturedTarget({ workspace, task: options.task, url: target.url });
  if (target.kind === 'branch') return resolveBranchTarget({ git: workspace.git, repositoryRoot: workspace.repositoryRoot, baseRef: target.baseRef ?? workspace.config.baseline ?? '' });
  return resolveWorkingTarget({ fs: workspace.runtime.fs, git: workspace.git, repositoryRoot: workspace.repositoryRoot });
}

/** The task's `check` entries, newest last: what the model chose to run and recorded with `check --task`. */
async function recordedChecks(runtime: Runtime, taskDirectory: string | null): Promise<RecordedCheck[]> {
  if (taskDirectory === null) return [];
  return (await readLedger(runtime.fs, taskDirectory)).flatMap((entry) =>
    entry.kind === 'check' && typeof entry['key'] === 'string' && typeof entry['exit'] === 'number' && (entry['phase'] === 'red' || entry['phase'] === 'green')
      ? [{ key: entry['key'], phase: entry['phase'], exit: entry['exit'], files: Array.isArray(entry['files']) ? (entry['files'] as string[]) : [] }]
      : [],
  );
}

export async function assembleBundle(options: AssembleOptions & { dryRun: true }): Promise<DryRunPlan>;
export async function assembleBundle(options: AssembleOptions): Promise<ReviewBundle>;
export async function assembleBundle(options: AssembleOptions): Promise<ReviewBundle | DryRunPlan> {
  const { runtime } = options;
  const workspace = await openWorkspace(runtime);
  const limits = workspace.config.skills.review;
  const requirements = [...options.requirements];
  const requirementBytes = requirements.reduce((total, source) => total + byteLength(source.content), 0);

  const resolution = await resolveTarget(workspace, options);
  const preexisting = new Set(options.preexisting ?? []);
  if (preexisting.size > 0) resolution.files = resolution.files.filter((file) => !preexisting.has(file.newPath ?? '') && !preexisting.has(file.oldPath ?? ''));

  // Vendored, build-output and credential-shaped files leave the review here: not in the patch, not listed, not counted.
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
  const dry = (refusal: AmbicodeError | null): DryRunPlan => ({ workspace, target: resolution.target, files: reviewable.files, policies, refusal });

  const measured = measureInput(reviewable.files, reviewable.patch, { requirementBytes });
  try {
    enforceReviewInputLimits(measured, limits, reviewable.files);
  } catch (error) {
    if (options.dryRun === true && error instanceof AmbicodeError && error.code === 'input-too-large') return dry(error);
    throw error;
  }
  if (options.dryRun === true) return dry(null);

  const taskSlug = taskSlugFor({ requirementIds: resolution.target.kind === 'merge-request' ? [] : requirements.map((source) => source.id), task: options.task });
  const reviewId = reviewName(runtime.clock.now(), runtime.ids.reviewId());
  const reviewDirectory = taskSlug === null ? path.join(workspace.repositoryRoot, REVIEWS_DIR, reviewId) : taskDirFor(workspace.repositoryRoot, taskSlug, '.', 'review').root;
  await runtime.fs.mkdirp(reviewDirectory);
  const taskDirectory = taskSlug === null ? null : (await resolveTaskDir(runtime, taskSlug)).root;

  const sourceFree = requirements.length === 0;
  const narrowed = (what: string, globs: readonly string[], rest: string): string[] => (globs.length === 0 ? [] : [`This review was narrowed on request: ${what} matching ${quoteAll(globs)} ${rest}`]);
  const result: ReviewResult = {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviewId,
    createdAt: runtime.clock.now().toISOString(),
    target: resolution.target,
    requirements,
    requirementMode: sourceFree ? 'quality-review' : 'requirement-based',
    inputs: measured,
    reviewer: null,
    brief: null,
    ruleIds: [...new Set(policies.flatMap(({ policy }) => policy.rules.map((rule) => rule.qualifiedId)))].sort(),
    checks: await recordedChecks(runtime, taskDirectory),
    changedFiles: resolution.files.map((file) => {
      const reason = isExcludedFromReview(file.oldPath, file.newPath, patterns);
      return { oldPath: file.oldPath, newPath: file.newPath, changeKind: file.changeKind, addedLines: file.addedLines, removedLines: file.removedLines, exclusionReason: reason === null ? null : describeExclusion(reason) };
    }),
    findings: [],
    omissions: [
      ...(preexisting.size === 0 ? [] : [`not covered: pre-existing changes: ${[...preexisting].sort().slice(0, 10).join(', ')}${preexisting.size > 10 ? ` (+${preexisting.size - 10} more)` : ''}`]),
      ...narrowed('only paths', onlyPaths, 'were reviewed. Everything else the change touches is unexamined.'),
      ...narrowed('paths', excludePaths, 'were not reviewed. Whatever changed in them is unexamined.'),
      ...(resolution.target.kind === 'merge-request' ? ['Diff-only review: the reviewer had the merge request diff and no file content, so code the diff does not show was not examined.'] : []),
      ...(excludeTests && reviewable.excluded.some((entry) => entry.reason.includes('test code'))
        ? ["This is a merge-request review, so the change's test code was not reviewed and no check executed it. Whether the tests cover the change, and whether any assertion was weakened, is unestablished. Re-run with --with-tests to review them."]
        : []),
      ...reviewable.excluded.map((entry) => `${entry.path}: ${entry.reason}.`),
      // An applicable policy error becomes a coverage omission: it keeps the result `partial` without stopping the reviewer.
      ...policies.flatMap(({ project, policy }) => policy.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').map((diagnostic) => `project "${project.id}" policy: ${diagnostic.code}: ${diagnostic.message}`)),
      ...(sourceFree ? ['No requirement was supplied, so this is a quality review. It does not establish that the change does what any ticket or specification asked for.'] : []),
    ],
    status: 'partial',
    statusReason: 'Evidence bundle only; the independent reviewer has not run.',
  };

  return {
    workspace, reviewId, reviewDirectory, taskDirectory,
    resultPath: path.join(reviewDirectory, 'result.json'),
    measured, files: reviewable.files, patch: reviewable.patch, policies, requirements, result,
  };
}

/** `ledger` adds fields to the `review` entry (route, session, baseline, preexisting); the entry is returned. */
export async function writeBundleArtifacts(runtime: Runtime, bundle: ReviewBundle, ledger: Readonly<Record<string, unknown>> = {}): Promise<LedgerEntry | null> {
  const { result } = bundle;
  result.brief = path.relative(bundle.workspace.repositoryRoot, path.join(bundle.reviewDirectory, 'brief.md'));
  await runtime.fs.writeText(bundle.resultPath, `${JSON.stringify(result, null, 2)}\n`);
  await runtime.fs.writeText(path.join(bundle.reviewDirectory, 'changed.diff'), bundle.patch);
  await runtime.fs.writeText(path.join(bundle.reviewDirectory, 'files.txt'), `${bundle.files.map((file) => file.newPath ?? file.oldPath ?? '').join('\n')}\n`);
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
  })).entry;
}
