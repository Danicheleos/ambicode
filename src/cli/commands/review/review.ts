import path from 'node:path';
import { REVIEWER_TOOLS, REVIEWER_REPLAY_VARIABLE, CHECKS_GATE, type ReviewResult, type ReviewerRun, type ReviewBundle, type TargetSelection, type ReviewEstimate } from '#types/modules/review';
import { ClaudeReviewer } from '#modules/review/reviewer/claude-reviewer';
import { ReplayReviewer } from '#modules/review/reviewer/replay-reviewer';
import { assembleBundle, writeBundleArtifacts } from '#modules/review/bundle/bundle';
import { selectionOf } from '#skills/review/handlers';
import { renderReport } from '#modules/review/findings/report';
import { validateFindings } from '#modules/review/findings/validate';
import { derivePositions } from '#modules/review/publication/positions';
import { ReviewStore } from '#modules/review/publication/store';
import { resolveTargetOptions, validateTargetArgs } from '../../options/target-option.ts';
import { consentForKey, routedOf, warmIndex, withLedger } from '#modules/checks/run/check-command';
import { baselineOf } from '#modules/checks/run/format';
import { touchedSet } from '#modules/checks/workspace/baseline';
import { estimateReview, renderEstimate } from '#modules/review/bundle/estimate';
import { routeEvidence } from '#modules/requirements/envelope/envelope';
import { taskSlugFor } from '#modules/review/bundle/review-name';
import { ledgerRouteContext, readEntries } from '#harness/engine/context';
import { runCommandTail } from '#harness/engine/command-tail';
import { AmbicodeError } from '#util/errors';
import { routeTools } from '../route/route.ts';
import { GATE, type PendingApproval, type CheckDeps, type Routed } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { RouteArgs } from '#types/harness';
import type { Reviewer } from '#types/platform/ports';
import type { EvidenceSource } from '#types/modules/requirements';
import type { ParsedArgs, RouteTools, CliCommand, OptionSpec } from '../../types/cli.ts';
import { TARGET_OPTIONS, type ResolvedTargetOptions } from '../../types/options.ts';

export const REVIEW_OPTIONS: OptionSpec = { ...TARGET_OPTIONS, flags: [...TARGET_OPTIONS.flags, 'estimate'] };

/** What `--task` adds to a review (07-B3 … 07-B5, 07-K5): the baseline scope, consent-checked approvals and the ledger fields. */
interface TaskScope {
  task: string;
  tools: RouteTools;
  deps: CheckDeps;
  routed: Routed | null;
  preexisting: string[];
  omissions: string[];
  approvals: Set<string>;
  declines: Set<string>;
  target: TargetSelection;
  /** The route's requirement envelope as evidence when the command names none (requirement-based review on a route). */
  requirements: { requirementUrls: string[]; evidence: EvidenceSource } | null;
  ledger: Record<string, unknown>;
}

async function envelopeRequirements(runtime: Runtime, routed: Routed, options: ResolvedTargetOptions): Promise<TaskScope['requirements']> {
  if (options.evidence !== null || options.requirementUrls.length > 0) return null;
  const chain = (await readEntries(runtime, routed.view.task)).filter((entry) => routed.view.chainIds.includes(String(entry.kind === 'route' ? entry.id : entry['route'])));
  const envelope = chain.findLast((entry) => entry.kind === 'envelope');
  const head = chain.find((entry) => entry.kind === 'route' && entry.id === routed.view.routeId);
  if (envelope === undefined || head === undefined) return null;
  const found = await routeEvidence({ runtime, dir: routed.dir, args: head['args'] as RouteArgs }, envelope, null);
  return found === null ? null : { requirementUrls: found.urls, evidence: { kind: 'inline', evidence: found.evidence } };
}

const sameTarget = (a: TargetSelection, b: TargetSelection): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Under a review route the target is the route's; the review runs only on an honoured `run` at `estimate` (08-R8). */
async function reviewRouteTarget(runtime: Runtime, deps: CheckDeps, routed: Routed, options: ResolvedTargetOptions, mode: 'review' | 'estimate'): Promise<TargetSelection> {
  const head = (await readEntries(runtime, routed.view.task)).find((entry) => entry.kind === 'route' && entry.id === routed.view.routeId);
  const target = selectionOf((head?.['args'] as RouteArgs | undefined)?.target);
  if (options.target.kind !== 'working' && !sameTarget(options.target, target)) {
    throw new AmbicodeError('conflicting-target', `Task ${routed.view.task} has an open review route on another target; this review names a different one.`, {
      field: options.target.kind === 'merge-request' ? '--mr' : '--branch',
      details: [`The route reviews ${target.kind === 'working' ? 'uncommitted work' : target.kind === 'branch' ? `the branch against ${target.baseRef ?? 'its baseline'}` : target.url}. Drop the target flags, or start another route.`],
    });
  }
  if (mode === 'review') {
    const consent = await deps.context!.consent(routed.view, 'estimate');
    if (consent.state !== 'honoured' || consent.source.answer !== 'run') {
      throw new AmbicodeError('review-not-accepted', `The independent review of task ${routed.view.task} was not accepted (${consent.state === 'refused' ? consent.reason : 'not run'}).`, {
        details: ['Release: answer the estimate question.'],
      });
    }
  }
  return target;
}

/**
 * On the review route a waiting check runs only on an honoured `with` at `review-checks`; `without`, including its
 * default, declines it. A typed --approve is recorded as declined and never approves (08-W4).
 */
async function checksAnswer(deps: CheckDeps, routed: Routed, chain: readonly LedgerEntry[], key: string, typedApprove: boolean): Promise<'honoured' | 'declined' | 'waiting'> {
  const consent = await deps.context!.consent(routed.view, CHECKS_GATE, { key });
  const source = consent.source;
  const print = source === null ? undefined : chain.find((entry) => entry.id === source['instance']);
  const keys = (print?.['values'] as { key?: unknown } | undefined)?.key;
  const answer = consent.state === 'honoured' || (source?.kind === 'default-taken' && Array.isArray(keys) && keys.includes(key)) ? source?.['answer'] : null;
  if (answer === 'with' && consent.state === 'honoured') return 'honoured';
  if (typedApprove) {
    await withLedger(deps, routed.dir, (ledger) => ledger.append({ kind: 'declined', route: routed.view.routeId, gate: CHECKS_GATE, instance: print?.id ?? null, answer: 'with', via: 'flag', reason: 'acting-needs-human', key }));
  }
  return answer === 'without' ? 'declined' : 'waiting';
}

async function taskScope(runtime: Runtime, options: ResolvedTargetOptions, mode: 'review' | 'estimate', warm?: CheckDeps['warm']): Promise<TaskScope | null> {
  if (options.task === null) return null;
  const task = taskSlugFor({ requirementIds: [], task: options.task }) ?? options.task;
  const tools = await routeTools(runtime, task);
  const session = tools.binding.state === 'bound' ? tools.binding.session : null;
  const deps: CheckDeps = { runtime, session, context: ledgerRouteContext({ runtime, routes: tools.routes }), routes: tools.routes, ...(warm === undefined ? {} : { warm }) };
  const routed = await routedOf(deps, task);
  // A merge request belongs to a task only through a review route's target.
  if (options.target.kind === 'merge-request' && routed?.view.skill !== 'review') return null;
  const scope: TaskScope = {
    task, tools, deps, routed, preexisting: [], omissions: [], approvals: options.approvals, declines: options.declines, target: options.target,
    requirements: routed === null ? null : await envelopeRequirements(runtime, routed, options),
    ledger: { ...(routed === null ? {} : { route: routed.view.routeId }), ...(session === null ? {} : { session }) },
  };
  if (routed?.view.skill === 'review') scope.target = await reviewRouteTarget(runtime, deps, routed, options, mode);
  // Baseline scoping and its refusals belong to a task route; consent applies under any route (07-B4, 07-K5).
  const scoped = routed === null || routed.view.skill === 'task';
  const baseline = scoped ? await baselineOf(deps, task, routed?.view.chainIds ?? null) : null;
  if (routed !== null && scoped && mode === 'review') {
    if (baseline === null) {
      throw new AmbicodeError('baseline-missing', `Task ${task} has an open task route but no task baseline, so the review cannot tell this task's changes from earlier ones.`, {
        details: [`Release: $A route next --task ${task} (ground records it), then run the review again.`],
      });
    }
    const offer = await deps.context!.consent(routed.view, 'review-offer');
    if (offer.state !== 'honoured' || offer.source.answer !== 'run') {
      throw new AmbicodeError('review-not-accepted', `The independent review of task ${task} was not accepted (${offer.state === 'refused' ? offer.reason : 'not run'}).`, {
        details: ['Release: answer the review-offer question.'],
      });
    }
  }
  if (routed !== null) {
    // A typed --approve never approves by itself: only an honoured answer for that key does.
    const entries = (await readEntries(runtime, task)).filter((entry) => routed.view.chainIds.includes(String(entry['route'])));
    const waiting = entries.filter((entry) => entry.kind === 'review').flatMap((entry) => (Array.isArray(entry['waiting']) ? (entry['waiting'] as string[]) : []));
    scope.approvals = new Set();
    scope.declines = new Set();
    for (const key of new Set([...waiting, ...options.approvals, ...options.declines])) {
      const consent = routed.view.skill === 'review'
        ? await checksAnswer(deps, routed, entries, key, mode === 'review' && options.approvals.has(key))
        : mode === 'estimate'
        ? ((await deps.context!.consent(routed.view, GATE, { key })).state === 'honoured' ? 'honoured' : 'waiting')
        : await consentForKey(deps, routed, { key, files: [], approve: [...options.approvals], decline: [...options.declines], raise: false });
      if (consent === 'honoured') scope.approvals.add(key);
      if (consent === 'declined') scope.declines.add(key);
    }
  }
  if (!scoped) return scope;
  if (baseline === null) {
    scope.omissions.push('no task baseline: pre-existing changes included');
    scope.ledger = { ...scope.ledger, baseline: null, preexisting: [] };
    return scope;
  }
  const touched = await touchedSet(runtime, baseline);
  scope.preexisting = touched.preexisting;
  if (touched.headMoved) scope.omissions.push('HEAD moved since the task baseline');
  scope.ledger = { ...scope.ledger, baseline: baseline.id, preexisting: touched.preexisting };
  return scope;
}

interface ReviewEstimateOutput { command: 'review --estimate'; estimate: ReviewEstimate; text: string }

/** Read-only: no ledger entry, no snapshot, no review directory, no step acknowledged (07-E3). */
export async function runReviewEstimate(runtime: Runtime, args: ParsedArgs): Promise<ReviewEstimateOutput> {
  const resolved = resolveTargetOptions('review', runtime, args);
  const scope = await taskScope(runtime, resolved, 'estimate');
  const estimate = await estimateReview(runtime, { runtime, ...resolved, ...(scope === null ? {} : { target: scope.target, approvals: scope.approvals, declines: scope.declines, preexisting: scope.preexisting, ...scope.requirements }) });
  return { command: 'review --estimate', estimate, text: renderEstimate(estimate) };
}

/** Beside `result.json`; see `ReviewerRun.rejectedOutputRef`. */
export const REJECTED_OUTPUT_FILE = 'reviewer-rejected-output.json';

interface ReviewOutput {
  command: 'review';
  reviewId: string;
  reviewDirectory: string;
  snapshotDirectory: string;
  resultPath: string;
  reportPath: string;
  result: ReviewResult;
  pendingApprovals: PendingApproval[];
  publishablePositions: number;
  /**
   * True when a check is waiting for a human, so no reviewer was invoked; the
   * finding list is then absent rather than empty.
   */
  awaitingAuthorization: boolean;
  /** The task route's next step, printed by the command tail under `--task`. */
  next?: string;
}

export interface ReviewDependencies {
  reviewer?: Reviewer;
  /** The detached index refresh after a routed `review --task` (07-G3). */
  warm?: CheckDeps['warm'];
}

/**
 * A check waiting for a human stops the run before the reviewer: check evidence
 * is part of the prompt, so reviewing now would pay for the same review twice.
 */
export async function runReview(
  runtime: Runtime,
  args: ParsedArgs,
  dependencies: ReviewDependencies = {},
): Promise<ReviewOutput> {
  // The bundle refuses the whole review if the measured prompt exceeds the
  // limit, so nothing below can reach a model with more than configured.
  const resolved = resolveTargetOptions('review', runtime, args);
  const scope = await taskScope(runtime, resolved, 'review', dependencies.warm);
  // Outside a route no human answer can be recorded, so a typed --approve approves nothing (01-contracts §5).
  const ignored = scope?.routed == null ? [...resolved.approvals] : [];
  if (scope !== null && scope.routed === null) scope.approvals = new Set();
  const bundle = await assembleBundle({ runtime, ...resolved, approvals: scope?.approvals ?? new Set(), ...(scope === null ? (resolved.target.kind === 'merge-request' ? { task: null } : {}) : { target: scope.target, declines: scope.declines, preexisting: scope.preexisting, ...scope.requirements }) });
  if (scope !== null) bundle.result.omissions = [...bundle.result.omissions, ...scope.omissions];
  if (ignored.length > 0) bundle.result.omissions = [...bundle.result.omissions, `A typed --approve approves nothing outside a route (${ignored.join(', ')}): start the review route (\`route start review\`) to answer waiting checks.`];
  const output = await reviewWith(runtime, bundle, dependencies, scope?.ledger ?? {});
  if (scope === null) return output;
  const entry = output.entryId;
  delete output.entryId;
  if (scope.routed !== null) warmIndex(scope.deps, bundle.workspace, bundle.policies[0]?.project ?? bundle.workspace.config.projects[0]!);
  const next = await runCommandTail({ engine: scope.tools.engine }, { task: scope.task, cause: 'review', session: scope.tools.binding, ...(entry === undefined ? {} : { produced: [entry] }) });
  return next === null ? output : { ...output, next: next.text };
}

async function reviewWith(runtime: Runtime, bundle: ReviewBundle, dependencies: ReviewDependencies, ledger: Record<string, unknown>): Promise<ReviewOutput & { entryId?: string }> {
  if (bundle.pendingApprovals.length > 0) {
    return await stopForAuthorization(runtime, bundle, ledger);
  }

  const reviewConfig = bundle.workspace.config.review;
  const replayPath = runtime.env[REVIEWER_REPLAY_VARIABLE];
  const reviewer: Reviewer =
    dependencies.reviewer ??
    (replayPath === undefined || replayPath === ''
      ? new ClaudeReviewer({
          runner: runtime.runner,
          fs: runtime.fs,
          clock: runtime.clock,
          cwd: runtime.cwd,
        })
      : new ReplayReviewer({ fs: runtime.fs, recordingsPath: replayPath, snapshotId: bundle.result.target.snapshotId }));
  const replayed = reviewer.source === 'replay';

  // Refuses before the prompt is built if the boundary cannot be established.
  await reviewer.assertIsolationAvailable?.();

  const started = runtime.clock.elapsed();
  const invocation = await reviewer.invoke({
    systemPrompt: bundle.prompt.system,
    prompt: bundle.prompt.user,
    // The sanitized snapshot, which is also the reviewer's only readable tree.
    workingDirectory: bundle.snapshot.directory,
    model: reviewConfig.model,
    timeoutMs: reviewConfig.timeoutSeconds * 1000,
  });
  const durationMs = Math.max(0, Math.round(runtime.clock.elapsed() - started));

  const run: ReviewerRun = {
    status: invocation.kind === 'ok' ? 'ok' : 'failed',
    model: reviewConfig.model,
    timeoutSeconds: reviewConfig.timeoutSeconds,
    // Read back from the vector that actually ran, not from the constant. A
    // replay started no process, so it had no tools and no isolation to claim.
    tools: replayed ? [] : toolsOf(invocation.argv),
    isolation: replayed ? [] : isolationOf(invocation.argv),
    rejections: [],
    detail: invocation.kind === 'ok' ? (invocation.detail ?? null) : `${invocation.reason}: ${invocation.detail}`,
    durationMs,
    usage: invocation.usage ?? null,
    rejectedOutputRef: null,
    // Last, and only when true: an ordinary result keeps its bytes, and
    // `status` stays the first key the eval trace indicators read.
    ...(replayed ? { source: 'replay' as const } : {}),
  };

  // Output that fails validation fails the run with a stated reason, never a
  // shorter finding list presented as validated.
  let reviewerOk = invocation.kind === 'ok';
  let dropped: string | null = null;
  if (invocation.kind === 'ok') {
    const validated = validateFindings({
      output: invocation.output,
      files: bundle.files,
      snapshotText: new Map(bundle.plan.entries.map((entry) => [entry.path, entry.text])),
      reviewId: bundle.reviewId,
      maxFindings: reviewConfig.maxFindings,
      knownRuleIds: new Set(bundle.result.policySummary.ruleIds),
      knownRequirementIds: new Set(bundle.result.requirements.map((source) => source.id)),
      onInvalid: reviewConfig.onInvalid,
    });

    if (validated.kind === 'ok' || validated.kind === 'partial') {
      bundle.result.findings = validated.findings;
      bundle.result.omissions = [...bundle.result.omissions, ...invocation.output.coverageNotes];
      if (validated.kind === 'partial') {
        run.rejections = validated.rejections;
        dropped = validated.reason;
      }
    } else {
      reviewerOk = false;
      run.status = 'failed';
      run.rejections = validated.rejections;
      run.detail = `invalid-output: ${validated.reason}`;
      // Kept as the reviewer wrote it, for a person diagnosing the refusal. It is
      // untrusted model output and nothing reads it back as findings.
      await runtime.fs.writeText(
        path.join(bundle.reviewDirectory, REJECTED_OUTPUT_FILE),
        `${JSON.stringify(invocation.output, null, 2)}\n`,
      );
      run.rejectedOutputRef = REJECTED_OUTPUT_FILE;
    }
  }

  bundle.result.reviewer = run;
  applyStatus(bundle, reviewerOk, dropped);

  const entry = await writeBundleArtifacts(runtime, bundle, ledger);
  // Derived while the pinned diff is in hand: afterwards the snapshot is
  // disposable and the merge request may move, so a position is never recomputed.
  const positions = await persistPublicationPositions(runtime, bundle);
  const reportPath = path.join(bundle.reviewDirectory, 'report.txt');
  const report = renderReport({
    result: bundle.result,
    snapshotDirectory: bundle.snapshot.directory,
    resultPath: bundle.resultPath,
    pendingApprovals: bundle.pendingApprovals,
  });
  await runtime.fs.writeText(reportPath, `${report}\n`);

  return {
    command: 'review',
    reviewId: bundle.reviewId,
    reviewDirectory: bundle.reviewDirectory,
    snapshotDirectory: bundle.snapshot.directory,
    resultPath: bundle.resultPath,
    reportPath,
    result: bundle.result,
    pendingApprovals: bundle.pendingApprovals,
    publishablePositions: positions,
    awaitingAuthorization: false,
    ...(entry === null ? {} : { entryId: entry.id }),
  };
}

async function stopForAuthorization(runtime: Runtime, bundle: ReviewBundle, ledger: Record<string, unknown>): Promise<ReviewOutput & { entryId?: string }> {
  const keys = bundle.pendingApprovals.map((approval) => approval.approvalKey);
  bundle.result.status = 'partial';
  bundle.result.statusReason =
    `No reviewer was invoked: ${keys.length} check(s) are waiting for authorization (${keys.join(', ')}). ` +
    'Check evidence is part of what the reviewer is given, so the review runs once, after the answer.';
  bundle.result.omissions = [
    ...bundle.result.omissions,
    'No model review was run: the evidence is still waiting on a human. An empty finding list here does not mean the change is clean.',
    `Waiting checks: ${keys.join(', ')}. --decline <key> reviews without one; approving one needs a human answer on the review route (\`route start review\`).`,
  ];

  const entry = await writeBundleArtifacts(runtime, bundle, ledger);
  const reportPath = path.join(bundle.reviewDirectory, 'report.txt');
  const report = renderReport({
    result: bundle.result,
    snapshotDirectory: bundle.snapshot.directory,
    resultPath: bundle.resultPath,
    pendingApprovals: bundle.pendingApprovals,
  });
  await runtime.fs.writeText(reportPath, `${report}\n`);

  return {
    ...(entry === null ? {} : { entryId: entry.id }),
    command: 'review',
    reviewId: bundle.reviewId,
    reviewDirectory: bundle.reviewDirectory,
    snapshotDirectory: bundle.snapshot.directory,
    resultPath: bundle.resultPath,
    reportPath,
    result: bundle.result,
    pendingApprovals: bundle.pendingApprovals,
    publishablePositions: 0,
    awaitingAuthorization: true,
  };
}

async function persistPublicationPositions(
  runtime: Runtime,
  bundle: ReviewBundle,
): Promise<number> {
  const remote = bundle.result.target.remote;
  if (bundle.result.target.kind !== 'merge-request' || remote === null) return 0;

  const derived = derivePositions({
    reviewId: bundle.reviewId,
    target: remote,
    files: bundle.files,
    findings: bundle.result.findings,
    derivedAt: runtime.clock.now().toISOString(),
  });
  await new ReviewStore(runtime.fs, runtime.clock, bundle.reviewDirectory).writePositions(derived);
  return derived.positions.length;
}

/**
 * A failed or skipped check narrows what was verified (`partial`) but does not
 * stop the model; only unusable reviewer output makes the review an error.
 */
function applyStatus(bundle: ReviewBundle, reviewerOk: boolean, dropped: string | null = null): void {
  if (!reviewerOk) {
    bundle.result.status = 'error';
    bundle.result.statusReason =
        bundle.result.reviewer?.detail ??
      'The independent reviewer did not produce a validated result, so no finding list was produced. This is not a clean review.';
    return;
  }

  // A check configured as null says the project has nothing to run there; a declined or failed one is still a gap.
  const unverified = bundle.result.checks.filter(
    (check) => check.adapter !== 'unconfigured' && (check.status !== 'passed' || !check.selectionComplete),
  );
  const policyGaps = bundle.policies.reduce(
    (total, { policy }) => total + policy.diagnostics.filter((d) => d.severity === 'error').length,
    0,
  );
  const gaps = [
    ...(policyGaps > 0 ? [`${policyGaps} applicable policy diagnostic(s) could not be resolved`] : []),
    ...(bundle.result.coverage.complete
      ? []
      : [
          `the reviewed diff is missing ${bundle.result.coverage.gaps.length} piece(s) of the change that ${bundle.result.target.remote?.provider ?? 'the remote'} did not deliver`,
        ]),
    ...(unverified.length > 0
      ? [`${unverified.length} check(s) did not pass or could not establish what they covered`]
      : []),
    ...(bundle.pendingApprovals.length > 0
      ? [`${bundle.pendingApprovals.length} check(s) are waiting for authorization`]
      : []),
    ...(dropped !== null ? [dropped] : (bundle.result.reviewer?.rejections.length ?? 0) > 0
      ? ['some reviewer output was rejected as unverifiable']
      : []),
    ...(bundle.result.reviewer?.source === 'replay'
      ? ['the reviewer answer was replayed from a recording; no model reviewed the change in this run']
      : []),
  ];

  if (gaps.length === 0) {
    const narrowed = bundle.result.omissions.some((line) => line.startsWith('This review was narrowed on request'));
    bundle.result.status = 'complete';
    bundle.result.statusReason = narrowed
      ? 'Complete for the paths reviewed only: --only or --exclude left part of the change unexamined (see section 4).'
      : null;
    return;
  }
  bundle.result.status = 'partial';
  bundle.result.statusReason = gaps.length === 1 && gaps[0] === dropped ? dropped : `The review ran, with gaps: ${gaps.join('; ')}.`;
}

function isolationOf(argv: readonly string[]): string[] {
  return argv.filter((value) => value.startsWith('--'));
}

function toolsOf(argv: readonly string[]): string[] {
  const at = argv.indexOf('--tools');
  const declared = at < 0 ? undefined : argv[at + 1];
  return declared === undefined || declared.startsWith('--')
    ? [...REVIEWER_TOOLS]
    : declared.split(',');
}

export function renderReview(output: ReviewOutput): string {
  const report = renderReport({
    result: output.result,
    snapshotDirectory: output.snapshotDirectory,
    resultPath: output.resultPath,
    pendingApprovals: output.pendingApprovals,
  });
  return output.next === undefined ? report : `${report}\n\n${output.next}`;
}

export const reviewCommand: CliCommand = {
  name: 'review',
  options: REVIEW_OPTIONS,
  validate: (args) => validateTargetArgs('review', args),
  run: async (runtime, args) => {
    if (args.flag('estimate')) {
      const estimate = await runReviewEstimate(runtime, args);
      return { text: estimate.text, data: estimate };
    }
    const output = await runReview(runtime, args);
    return { text: renderReview(output), data: output };
  },
};
