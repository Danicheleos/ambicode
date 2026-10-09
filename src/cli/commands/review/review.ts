import path from 'node:path';
import { CHECKS_GATE, type ReviewResult, type ReviewBundle, type TargetSelection, type ReviewEstimate } from '#types/modules/review';
import { assembleBundle, writeBundleArtifacts } from '#modules/review/bundle/bundle';
import { selectionOf } from '#skills/review/handlers';
import { renderReport } from '#modules/review/findings/report';
import { resolveTargetOptions, validateTargetArgs } from '../../options/target-option.ts';
import { consentForKey, routedOf, withLedger } from '#modules/checks/run/check-command';
import { baselineOf } from '#modules/checks/run/format';
import { touchedSet } from '#modules/checks/workspace/baseline';
import { estimateReview, renderEstimate } from '#modules/review/bundle/estimate';
import { routeEvidence } from '#modules/requirements/envelope/envelope';
import { taskSlugFor } from '#modules/review/bundle/review-name';
import { readEntries } from '#harness/engine/context';
import { COMMAND_SPECS } from '#skills/review/commands';
import { runCommandTail } from '#harness/engine/command-tail';
import { AmbicodeError } from '#util/errors';
import { routeTools } from '../route/route.ts';
import { GATE, type PendingApproval, type CheckDeps, type Routed } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { RouteArgs } from '#types/harness';
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
  if (mode === 'review') await requireRun(runtime, deps, routed, 'estimate', null);
  return target;
}

/** One acceptance authorizes one reviewer run: after a run, only an acceptance written later counts (`again` when the route has one). */
async function requireRun(runtime: Runtime, deps: CheckDeps, routed: Routed, first: string, again: string | null): Promise<void> {
  const entries = (await readEntries(runtime, routed.view.task)).filter((entry) => routed.view.chainIds.includes(String(entry.kind === 'route' ? entry.id : entry['route'])));
  const last = entries.findLastIndex((entry) => entry.kind === 'review' && entry['reviewerRan'] !== false);
  const gate = last === -1 || again === null ? first : again;
  const consent = await deps.context!.consent(routed.view, gate);
  if (consent.state === 'honoured' && consent.source.answer === 'run') {
    if (last === -1 || entries.findIndex((entry) => entry.id === consent.source.id) > last) return;
    throw new AmbicodeError('review-not-accepted', `The independent review of task ${routed.view.task} already ran on the acceptance given at ${gate}.`, {
      details: [`Release: ask the user again and record a new answer to the ${gate} question.`],
    });
  }
  throw new AmbicodeError('review-not-accepted', `The independent review of task ${routed.view.task} was not accepted (${consent.state === 'refused' ? consent.reason : 'not run'}).`, {
    details: [`Release: answer the ${gate} question.`],
  });
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

async function taskScope(runtime: Runtime, options: ResolvedTargetOptions, mode: 'review' | 'estimate'): Promise<TaskScope | null> {
  if (options.task === null) return null;
  const task = taskSlugFor({ requirementIds: [], task: options.task }) ?? options.task;
  const tools = await routeTools(runtime, task);
  const { session, context } = await tools.engine.command(COMMAND_SPECS.review, { task }, async (scope) => scope);
  const deps: CheckDeps = { runtime, session, context };
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
    await requireRun(runtime, deps, routed, 'review-offer', 'review-again');
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

interface ReviewOutput {
  command: 'review';
  reviewId: string;
  reviewDirectory: string;
  snapshotDirectory: string;
  resultPath: string;
  reportPath: string;
  result: ReviewResult;
  pendingApprovals: PendingApproval[];
  /**
   * True when a check is waiting for a human; the finding list is then absent
   * rather than empty.
   */
  awaitingAuthorization: boolean;
  /** The task route's next step, printed by the command tail under `--task`. */
  next?: string;
}

/**
 * A check waiting for a human stops the run before the reviewer subagent is
 * offered the evidence: reviewing now would pay for the same review twice.
 */
export async function runReview(
  runtime: Runtime,
  args: ParsedArgs,
): Promise<ReviewOutput> {
  const resolved = resolveTargetOptions('review', runtime, args);
  const scope = await taskScope(runtime, resolved, 'review');
  // Outside a route no human answer can be recorded, so a typed --approve approves nothing (01-contracts §5).
  const ignored = scope?.routed == null ? [...resolved.approvals] : [];
  if (scope !== null && scope.routed === null) scope.approvals = new Set();
  const bundle = await assembleBundle({ runtime, ...resolved, approvals: scope?.approvals ?? new Set(), ...(scope === null ? (resolved.target.kind === 'merge-request' ? { task: null } : {}) : { target: scope.target, declines: scope.declines, preexisting: scope.preexisting, ...scope.requirements }) });
  if (scope !== null) bundle.result.omissions = [...bundle.result.omissions, ...scope.omissions];
  if (ignored.length > 0) bundle.result.omissions = [...bundle.result.omissions, `A typed --approve approves nothing outside a route (${ignored.join(', ')}): start the review route (\`route start review\`) to answer waiting checks.`];
  const ledger = scope?.ledger ?? {};
  const output = bundle.pendingApprovals.length > 0
    ? await stopForAuthorization(runtime, bundle, ledger)
    : await recordPendingReviewer(runtime, bundle, ledger);
  if (scope === null) return output;
  const entry = output.entryId;
  delete output.entryId;
  const next = await runCommandTail({ engine: scope.tools.engine }, { task: scope.task, cause: 'review', session: scope.tools.binding, ...(entry === undefined ? {} : { produced: [entry] }) });
  return next === null ? output : { ...output, next: next.text };
}

async function recordPendingReviewer(runtime: Runtime, bundle: ReviewBundle, ledger: Record<string, unknown>): Promise<ReviewOutput & { entryId?: string }> {
  bundle.result.status = 'partial';
  bundle.result.statusReason = 'reviewer pending: run the ambicode:reviewer subagent, then `review record`';
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
    command: 'review',
    reviewId: bundle.reviewId,
    reviewDirectory: bundle.reviewDirectory,
    snapshotDirectory: bundle.snapshot.directory,
    resultPath: bundle.resultPath,
    reportPath,
    result: bundle.result,
    pendingApprovals: bundle.pendingApprovals,
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
    awaitingAuthorization: true,
  };
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
  summary: "Pin the target, run the affected checks and prepare the reviewer's input.",
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
