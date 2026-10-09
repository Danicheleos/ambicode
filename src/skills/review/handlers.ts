import path from 'node:path';
import { openRepository } from '#platform/git/open';
import { chainKey, loadPayload } from '#harness/engine/delivery';
import { isBoundAnswer } from '#harness/engine/fold';
import { onGatePrint, onNeedCommand } from '#harness/gates/gates';
import { chainEntries } from '../common.ts';
import { agentPayload } from './agent-payload.ts';
import { TASK_HANDLERS } from '../task/handlers.ts';
import { isAmbicodeError } from '#util/errors';
import { parseMergeRequestUrl } from '#modules/review/snapshot/mr-url';
import { estimateReview, parseNarrow, renderEstimate } from '#modules/review/bundle/estimate';
import { routeEvidence } from '#modules/requirements/envelope/envelope';
import type { ReviewEntry } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ReviewTargetArgs, RouteArgs, Handler, HandlerInput, HandlerResult } from '#types/harness';
import { CHECKS_GATE, type Finding, type TargetSelection } from '#types/modules/review';
const ANSWERS = new Set(['acceptance', 'declined', 'default-taken']);
const AGAIN_GATE = 'review-again';
const ESTIMATE_STEP = 'estimate-step';
const NARROW_HINT = 'give the --only/--exclude tokens as your answer';

export const selectionOf = (target: ReviewTargetArgs | undefined): TargetSelection =>
  target === undefined ? { kind: 'working' } : target.mr !== null ? { kind: 'merge-request', url: target.mr } : { kind: 'branch', baseRef: target.base };

const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;
const narrowOf = (entry: LedgerEntry): string | null => ((entry['args'] as { narrow?: string[] } | undefined)?.narrow ?? [])[0] ?? null;

/** The narrowing estimate-step last used: the latest re-entry whose tokens parsed; `narrow` and bad tokens keep it (08-E6). */
export function narrowingInForce(chain: readonly LedgerEntry[]): string | null {
  let inForce: string | null = null;
  for (const entry of chain.filter((candidate) => candidate.kind === 'revise' && candidate['from'] === ESTIMATE_STEP)) {
    const text = narrowOf(entry);
    if (text === null || text === 'narrow') continue;
    try {
      parseNarrow(text);
      inForce = text;
    } catch {
      // A bad answer is refused at the gate; the previous narrowing stands.
    }
  }
  return inForce;
}

/** `review --task <slug>` with the route's target and the narrowing in force (08-R5); consent to checks comes from the gate, not flags. */
export function reviewCommand(task: string, args: RouteArgs, chain: readonly LedgerEntry[]): string {
  const target = args.target === undefined ? [] : args.target.mr !== null ? ['--mr', quote(args.target.mr)] : ['--branch', ...(args.target.base === null ? [] : ['--base', quote(args.target.base)])];
  const narrowing = narrowingInForce(chain);
  const narrowed = narrowing === null ? { onlyPaths: [], excludePaths: [] } : parseNarrow(narrowing);
  const tokens = [...narrowed.onlyPaths.flatMap((glob) => ['--only', quote(glob)]), ...narrowed.excludePaths.flatMap((glob) => ['--exclude', quote(glob)])];
  return ['review', '--task', task, ...target, ...tokens].join(' ');
}

/**
 * Checks waiting after a review stopped before the reviewer: one question for all of them. `with` and `without` run the
 * review once more; `no review` and any later answer go on to readback. Nothing re-runs without an answer.
 */
const evaluate: Handler = async (input): Promise<HandlerResult> => {
  const chain = await chainEntries(input);
  if (input.view.skill !== 'review') return (await fixNotReviewed(input, chain)) ?? TASK_HANDLERS['review.evaluate']!(input);
  const review = chain.findLast((entry): entry is ReviewEntry => entry.kind === 'review');
  if (review === undefined) return { state: 'ok', payload: null };
  const waiting = Array.isArray(review['waiting']) ? (review['waiting'] as string[]) : [];
  const answered = chain.slice(chain.indexOf(review) + 1).some((entry) => ANSWERS.has(entry.kind) && entry['gate'] === CHECKS_GATE && isBoundAnswer(entry));
  if (waiting.length === 0 || answered) return { state: 'ok', payload: await agentPayload(input, review) };
  return { state: 'raise', gate: CHECKS_GATE, values: { key: waiting }, raisedBy: 'review-run' };
};

/** After a fix round the review does not rerun on its own: report-step asks once whether it should, and a skip goes on with the fix as it is. */
async function fixNotReviewed(input: HandlerInput, chain: readonly LedgerEntry[]): Promise<HandlerResult | null> {
  if (input.raisedBy !== 'report-step') return null;
  const fixed = chain.findLastIndex((entry) => entry.kind === 'step' && entry['step'] === 'fix' && entry['status'] === 'delivered');
  const review = chain.findLastIndex((entry) => entry.kind === 'review' && entry['reviewerRan'] !== false);
  if (fixed === -1 || review === -1 || fixed < review) return null;
  const answered = chain.slice(fixed + 1).some((entry) => ANSWERS.has(entry.kind) && entry['gate'] === AGAIN_GATE && isBoundAnswer(entry));
  return answered ? { state: 'ok', payload: null } : { state: 'raise', gate: AGAIN_GATE, values: {}, raisedBy: 'report-step' };
}

const estimate: Handler = async (input) => {
  const chain = await chainEntries(input);
  const asked = input.revise === null ? null : (input.revise.args['narrow'] ?? [])[0] ?? null;
  const notes: string[] = [];
  if (asked === 'narrow') notes.push(NARROW_HINT);
  else if (asked !== null) {
    try {
      parseNarrow(asked);
    } catch (error) {
      if (!isAmbicodeError(error)) throw error;
      notes.push(`bad-argument (narrow): ${error.message} The previous narrowing stands.`);
    }
  }
  const narrowing = input.revise === null ? null : narrowingInForce(chain);
  const narrowed = narrowing === null ? { onlyPaths: [], excludePaths: [] } : parseNarrow(narrowing);
  try {
    const envelope = chain.findLast((entry) => entry.kind === 'envelope');
    const found = envelope === undefined ? null : await routeEvidence({ runtime: input.runtime, dir: input.dir, args: input.args }, envelope, null);
    const requirements = found === null ? { requirementUrls: [], evidence: null } : { requirementUrls: found.urls, evidence: { kind: 'inline' as const, evidence: found.evidence } };
    const estimated = await estimateReview(input.runtime, {
      runtime: input.runtime, target: selectionOf(input.args.target), ...requirements, approvals: new Set(), declines: new Set(), task: input.view.task, ...narrowed,
    });
    const payload = [...notes, ...(narrowing === null ? [] : [`narrowed: ${narrowing}`]), renderEstimate(estimated)].join('\n');
    // Headless nobody can narrow or decline, and a preanswered `run` would deliver a command that refuses the same way and leave the route open.
    if (input.args.headless && estimated.refusal !== null) return { state: 'ok', payload, exit: 'blocked', exitDetail: `${estimated.refusal.code}: ${estimated.refusal.message.slice(0, 200)}` };
    return { state: 'ok', payload };
  } catch (error) {
    if (!isAmbicodeError(error)) throw error;
    const unavailable = `Review estimate unavailable: ${error.code}: ${error.message}`;
    if (input.args.headless) return { state: 'ok', payload: [...notes, unavailable].join('\n'), exit: 'blocked', exitDetail: `${error.code}: ${error.message.slice(0, 200)}` };
    return { state: 'ok', payload: [...notes, unavailable].join('\n') };
  }
};

const mrTemplate: Handler = async (input) => {
  const { project, iid } = parseMergeRequestUrl(input.args.target?.mr ?? '');
  return { state: 'ok', payload: [`Call your GitLab MCP server for project "${project}", merge request ${iid}:`, '1. get_merge_request', '2. get_merge_request_diffs, or the diff tool of your GitLab MCP server (every page of it)', 'The hook records the diff from the second response.'].join('\n') };
};

/** The recorded findings as the numbered list the user picks from; no findings ends the route, since there is nothing to ask. */
const publishList: Handler = async (input) => {
  const review = (await chainEntries(input)).findLast((entry) => entry.kind === 'review' && entry['stage'] === 'recorded');
  const text = typeof review?.['result'] === 'string' ? await input.runtime.fs.readText(path.join(input.dir.repositoryRoot, review['result'])).catch(() => null) : null;
  const findings = text === null ? [] : ((JSON.parse(text) as { findings?: Finding[] }).findings ?? []);
  if (findings.length === 0) return { state: 'ok', payload: 'no findings to publish', exit: 'done', exitDetail: 'no findings to publish' };
  return { state: 'ok', payload: findings.map((finding, at) => `${at + 1}. ${finding.location.newPath ?? finding.location.oldPath}:${finding.location.line} — ${finding.suggestedComment} (${finding.risk}/${finding.confidence})`).join('\n') };
};

export const REVIEW_HANDLERS: Readonly<Record<string, Handler>> = { 'review.estimate': estimate, 'review.evaluate': evaluate, 'review.mrTemplate': mrTemplate, 'review.publishList': publishList };

onGatePrint('estimate', async ({ runtime, dir, chain }) => {
  const text = await loadPayload(runtime.fs, dir, chainKey(chain.filter((entry) => entry.kind === 'route').map((entry) => entry.id).reverse()), 'review.estimate');
  return text === null || text === '' ? null : { line: text };
});

onGatePrint('publish', async ({ runtime, dir, chain }) => {
  const text = await loadPayload(runtime.fs, dir, chainKey(chain.filter((entry) => entry.kind === 'route').map((entry) => entry.id).reverse()), 'review.publishList');
  return text === null || text === '' ? null : { line: text };
});

onNeedCommand('review', 'review', async ({ task, args, chain }) => reviewCommand(task, args, chain));
