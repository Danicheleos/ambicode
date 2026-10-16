import path from 'node:path';
import { chainKey, loadPayload } from '#harness/engine/execute';
import { isBoundAnswer } from '#harness/engine/fold';
import { onGatePrint } from '#harness/gates/gates';
import { chainEntries, failed } from '../common.ts';
import { TASK_HANDLERS } from '../task/handlers.ts';
import { isAmbicodeError } from '#util/errors';
import { estimateReview, parseNarrow, renderEstimate } from '#modules/review/bundle/estimate';
import { assembleBundle, baselineScope, envelopeRequirements, pinAssembled, recordedChecks } from '#modules/review/bundle/bundle';
import { runReviewChecks } from './checks.ts';
import { GATE as CHECK_GATE } from '#types/modules/checks';
import { baselineOf } from '#modules/checks/workspace/baseline';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ReviewTargetArgs, Handler, HandlerInput, HandlerResult } from '#types/harness';
import type { Finding, TargetSelection } from '#types/modules/review';
const ANSWERS = new Set(['acceptance', 'declined', 'default-taken']);
const AGAIN_GATE = 'review-again';
const ESTIMATE_STEP = 'estimate-step';
const NARROW_HINT = 'give the --only/--exclude tokens as your answer';

export const selectionOf = (target: ReviewTargetArgs | undefined): TargetSelection =>
  target === undefined ? { kind: 'working' } : target.mr !== null ? { kind: 'merge-request', url: target.mr } : { kind: 'branch', baseRef: target.base };

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

/** After a fix round the review does not rerun on its own: report-step asks once whether it should, and a skip goes on with the fix as it is. */
async function fixNotReviewed(input: HandlerInput, chain: readonly LedgerEntry[]): Promise<HandlerResult | null> {
  if (input.raisedBy !== 'report-step') return null;
  const fixed = chain.findLastIndex((entry) => entry.kind === 'step' && entry['step'] === 'fix' && entry['status'] === 'delivered');
  const review = chain.findLastIndex((entry) => entry.kind === 'review' && entry['reviewerRan'] !== false);
  if (fixed === -1 || review === -1 || fixed < review) return null;
  const answered = chain.slice(fixed + 1).some((entry) => ANSWERS.has(entry.kind) && entry['gate'] === AGAIN_GATE && isBoundAnswer(entry));
  return answered ? { state: 'ok', payload: null } : { state: 'raise', gate: AGAIN_GATE, values: {}, raisedBy: 'report-step' };
}

/** The task route's evaluation, except right after a fix round, when the review is offered again instead of rerun. */
const evaluate: Handler = async (input) => (await fixNotReviewed(input, await chainEntries(input))) ?? TASK_HANDLERS['review.evaluate']!(input);

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
    const requirements = (await envelopeRequirements({ runtime: input.runtime, session: input.view.session, context: input.context }, { view: input.view, dir: input.dir })) ?? [];
    const estimated = await estimateReview(input.runtime, {
      runtime: input.runtime, target: selectionOf(input.args.target), requirements, task: input.view.task, ...narrowed,
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

/** The recorded findings as the numbered list the user picks from; no findings ends the route, since there is nothing to ask. */
const publishList: Handler = async (input) => {
  const review = (await chainEntries(input)).findLast((entry) => entry.kind === 'review' && entry['stage'] === 'recorded');
  const text = typeof review?.['result'] === 'string' ? await input.runtime.fs.readText(path.join(input.dir.repositoryRoot, review['result'])).catch(() => null) : null;
  const findings = text === null ? [] : ((JSON.parse(text) as { findings?: Finding[] }).findings ?? []);
  if (findings.length === 0) return { state: 'ok', payload: 'no findings to publish', exit: 'done', exitDetail: 'no findings to publish' };
  return { state: 'ok', payload: findings.map((finding, at) => `${at + 1}. ${finding.location.newPath ?? finding.location.oldPath}:${finding.location.line} — ${finding.suggestedComment} (${finding.risk}/${finding.confidence})`).join('\n') };
};

/** Both routes pin their own review: the model never runs a pin command itself, so no step can be skipped past an absent pin. The review route also runs its checks first, since the pinned result lists them. */
const pin: Handler = async (input) => {
  if ((await input.context.window(input.view, input.raisedBy)).some((entry) => entry.kind === 'review')) return { state: 'ok', payload: null };
  const { view, runtime } = input;
  const deps = { runtime, session: view.session, context: input.context, ledger: input.ledger };
  const routed = { view, dir: input.dir };
  const reviewing = view.skill === 'review';
  try {
    const chain = await chainEntries(input);
    const baseline = reviewing ? null : await baselineOf(deps, view.task, view.chainIds);
    const scope = reviewing ? { preexisting: [], omissions: [] as string[], ledger: { route: view.routeId, session: view.session } } : await baselineScope(runtime, baseline, { route: view.routeId, session: view.session });
    const requirements = (await envelopeRequirements(deps, routed)) ?? [];
    const narrowing = reviewing ? narrowingInForce(chain) : null;
    const assemble = { target: selectionOf(input.args.target), task: view.task, requirements, preexisting: scope.preexisting, ...(narrowing === null ? {} : parseNarrow(narrowing)) };
    const bundle = await assembleBundle({ runtime, ...assemble });
    if (reviewing && assemble.target.kind !== 'merge-request') {
      const checks = await runReviewChecks(input, bundle.files, chain);
      if (checks.waiting.length > 0) return { state: 'raise', gate: CHECK_GATE, values: { key: checks.waiting.map((entry) => entry.key), files: checks.waiting.flatMap((entry) => entry.files) } };
      scope.omissions.push(...checks.notes);
      bundle.result.checks = await recordedChecks(runtime, bundle.taskDirectory);
    }
    await pinAssembled(runtime, bundle, { omissions: scope.omissions, ledger: scope.ledger, append: (fields) => input.ledger.append(fields) });
    return { state: 'ok', payload: null };
  } catch (error) {
    return failed(error);
  }
};

export const REVIEW_HANDLERS: Readonly<Record<string, Handler>> = { 'review.pin': pin, 'review.estimate': estimate, 'review.evaluate': evaluate, 'review.publishList': publishList };

onGatePrint('estimate', async ({ runtime, dir, chain }) => {
  const text = await loadPayload(runtime.fs, dir, chainKey(chain.filter((entry) => entry.kind === 'route').map((entry) => entry.id).reverse()), 'review.estimate');
  return text === null || text === '' ? null : { line: text };
});

onGatePrint('publish', async ({ runtime, dir, chain }) => {
  const text = await loadPayload(runtime.fs, dir, chainKey(chain.filter((entry) => entry.kind === 'route').map((entry) => entry.id).reverse()), 'review.publishList');
  return text === null || text === '' ? null : { line: text };
});

