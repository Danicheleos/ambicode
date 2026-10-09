import path from 'node:path';
import { runChecks } from '#modules/checks/run/run';
import { REVIEWS_DIR, UNLIMITED_CONTEXT_BUDGET_BYTES } from '#types/defaults';
import { appendLedger } from '#platform/ledger/ledger';
import { taskDirFor } from '#modules/evidence/task/task-dir';
import { writeBrief } from './brief.ts';
import { taskSlugFor, uniqueReviewName } from './review-name.ts';
import { openWorkspace, projectForPath } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import type { ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import { REVIEW_SCHEMA_VERSION, type CheckResult, type ReviewResult, type Snapshot, type SnapshotPlan, type ReviewBundle, type AssembleOptions } from '#types/modules/review';
import { configProvenance, policyProvenance } from '#modules/policy/packs/provenance';
import { canonicalUrl, normalizeRequirements, loadRequirementEvidence } from '#modules/requirements/envelope/normalize';
import { describeExclusion, isExcludedFromReview } from '#util/path-classes';
import { byteLength, enforceReviewInputLimits, measureInput, partitionChange } from '../snapshot/limits.ts';
import { planSnapshot, writeSnapshot } from '../snapshot/snapshot.ts';
import { resolveBranchTarget, resolveCapturedTarget, resolveWorkingTarget } from '../snapshot/target.ts';
import { AmbicodeError } from '#util/errors';
import { literalPathspec } from '#platform/git/git';
import { normalizeRelative } from '#util/paths';
import { findDependents } from './dependents.ts';
import { declarationsOf } from '#modules/search/harvest';
import type { ChangedPath, PendingApproval } from '#types/modules/checks';
import type { Dependent } from '#types/modules/search';
import type { Runtime, Workspace } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { DiffFile } from '#types/platform/git';
import type { FileSystem } from '#types/platform/ports';
import type { TargetResolution } from '../types/snapshot.ts';

/** What a dry run measured; a limit refusal is returned, not thrown. */
interface DryRunPlan {
  workspace: Workspace;
  target: TargetResolution['target'];
  files: DiffFile[];
  policies: { project: ProjectConfig; policy: ResolvedPolicy }[];
  plan: SnapshotPlan | null;
  refusal: AmbicodeError | null;
}

const DRY_REFUSALS = new Set(['input-too-large', 'snapshot-too-large']);

/** `not covered: pre-existing changes: …`, first 10 paths. */
function preexistingOmission(paths: readonly string[]): string {
  const more = paths.length > 10 ? ` (+${paths.length - 10} more)` : '';
  return `not covered: pre-existing changes: ${paths.slice(0, 10).join(', ')}${more}`;
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

export async function assembleBundle(options: AssembleOptions & { dryRun: true }): Promise<DryRunPlan>;
export async function assembleBundle(options: AssembleOptions): Promise<ReviewBundle>;
export async function assembleBundle(options: AssembleOptions): Promise<ReviewBundle | DryRunPlan> {
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
    declared: options.evidence?.kind === 'inline' ? 'captured' : 'urls',
  });
  const requirementBytes = requirements.sources.reduce(
    (total, source) => total + byteLength(source.content),
    0,
  );

  // A merge request's code is not the checkout, so a name search there would describe the wrong tree.
  // The working tree is read once, so what relies on the change is chosen before that read.
  const named = (options.contextPaths ?? []).map((entry) => ({ path: normalizeRelative(entry), reasons: ['named with --context'] }));
  let lookedUp: Dependent[] | null = null;
  const lookUp = async (files: readonly DiffFile[]): Promise<Dependent[]> => {
    const projects = groupByProject(workspace, files);
    const found = (await findDependents({ git: workspace.git, projects: projects.map(({ project }) => project), files })).dependents;
    lookedUp = await flagCollisions(workspace, projects.map(({ project }) => project), [...named, ...found.filter((entry) => !named.some((other) => other.path === entry.path))]);
    return lookedUp;
  };

  const resolved = await resolveTarget(workspace, options, async (files) => (await lookUp(files)).map((entry) => entry.path));
  const preexisting = new Set(options.preexisting ?? []);
  if (preexisting.size > 0) resolved.files = resolved.files.filter((file) => !preexisting.has(file.newPath ?? '') && !preexisting.has(file.oldPath ?? ''));
  const resolution = resolved;

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

  const dry = (plan: SnapshotPlan | null, refusal: AmbicodeError | null, policies: DryRunPlan['policies']): DryRunPlan =>
    ({ workspace, target: resolution.target, files: reviewable.files, policies, plan, refusal });
  const refused = (error: unknown): AmbicodeError | null => (options.dryRun === true && error instanceof AmbicodeError && DRY_REFUSALS.has(error.code) ? error : null);
  try {
    enforceReviewInputLimits(
      measureInput(reviewable.files, reviewable.patch, { requirementBytes }),
      limits,
      reviewable.files,
    );
  } catch (error) {
    const refusal = refused(error);
    if (refusal === null) throw error;
    return dry(null, refusal, await resolveProjectPolicies(workspace, reviewable.files));
  }

  const policies = await resolveProjectPolicies(workspace, reviewable.files);

  const local = resolution.target.kind !== 'merge-request';
  const wanted: Dependent[] = !local ? [] : lookedUp ?? (await lookUp(resolution.files));

  let plan: SnapshotPlan;
  try {
    plan = await planSnapshot({
      files: reviewable.files,
      content: resolution.content,
      includeSiblingContext: local,
      operator: patterns,
      contextBudgetBytes: Math.max(0, (limits.maxContextBytes ?? UNLIMITED_CONTEXT_BUDGET_BYTES)),
      dependentPaths: wanted.map((entry) => entry.path),
    });
  } catch (error) {
    const refusal = refused(error);
    if (refusal === null) throw error;
    return dry(null, refusal, policies);
  }
  if (options.dryRun === true) return dry(plan, null, policies);

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
      ? (options.task === null ? null : taskSlugFor({ requirementIds: [], task: options.task }))
      : taskSlugFor({
          requirementIds: asNamed.length > 0 ? asNamed : requirementIds,
          task: options.task,
        });
  const reviewsRoot =
    taskSlug === null
      ? path.join(workspace.repositoryRoot, REVIEWS_DIR)
      : taskDirFor(workspace.repositoryRoot, taskSlug).reviews;
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
    brief: null,
    policySummary: summarizePolicy(policies),
    checks,
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
      ...(preexisting.size === 0 ? [] : [preexistingOmission([...preexisting].sort())]),
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
    taskDirectory: taskSlug === null ? null : taskDirFor(workspace.repositoryRoot, taskSlug).root,
    resultPath: path.join(reviewDirectory, 'result.json'),
    snapshot,
    plan,
    dependents: wanted.filter((entry) => plan.dependentPaths.includes(entry.path)),
    measured,
    files: reviewable.files,
    patch: reviewable.patch,
    policies,
    requirements,
    pendingApprovals,
    result,
  };

  return bundle;
}

/** `ledger` adds fields to the `review` entry (route, session, baseline, preexisting); the entry is returned. */
export async function writeBundleArtifacts(runtime: Runtime, bundle: ReviewBundle, ledger: Readonly<Record<string, unknown>> = {}): Promise<LedgerEntry | null> {
  bundle.result.brief = path.relative(bundle.workspace.repositoryRoot, await writeBrief(runtime, bundle));
  await runtime.fs.writeText(bundle.resultPath, `${JSON.stringify(bundle.result, null, 2)}\n`);
  await runtime.fs.writeText(
    path.join(bundle.reviewDirectory, 'snapshot-path.txt'),
    `${bundle.snapshot.directory}\n`,
  );
  if (bundle.taskDirectory !== null) {
    const { result } = bundle;
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
  return null;
}

async function resolveTarget(
  workspace: Workspace,
  options: AssembleOptions,
  dependentPaths: (files: readonly DiffFile[]) => Promise<readonly string[]>,
): Promise<TargetResolution> {
  const target = options.target;
  if (target.kind === 'merge-request') {
    return await resolveCapturedTarget({ workspace, task: options.task, url: target.url });
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
    extraPaths: dependentPaths,
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

/** A dependent found by a name another file also declares may import a different one (08-D3); flagged, never resolved. */
async function flagCollisions(workspace: Workspace, projects: readonly ProjectConfig[], dependents: Dependent[]): Promise<Dependent[]> {
  const termsOf = (entry: Dependent): string[] => entry.reasons.flatMap((reason) => /^contains "([^"]+)"/.exec(reason)?.[1] ?? []);
  const terms = [...new Set(dependents.flatMap(termsOf))];
  if (terms.length === 0) return dependents;
  const colliding = new Set<string>();
  for (const project of projects) {
    const root = normalizeRelative(project.root);
    const declared = await declarationsOf(workspace.git, workspace.runtime.fs, terms, root === '' ? null : literalPathspec(root));
    for (const declaration of declared) if (declaration.declarations >= 2) colliding.add(declaration.name);
  }
  return dependents.map((entry) => {
    const flagged = termsOf(entry).filter((term) => colliding.has(term)).map((term) => `verify import: ${term} is declared in more than one file`);
    return flagged.length === 0 ? entry : { ...entry, reasons: [...entry.reasons, ...flagged] };
  });
}

export function groupByProject(
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
