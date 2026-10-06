import { openRepository } from '#composition/root';
import { chainKey, loadPayload } from '#harness/engine/delivery';
import { isBoundAnswer } from '#harness/engine/fold';
import { onGatePrint, onNeedCommand } from '#harness/gates/gates';
import { chainEntries } from '../common.ts';
import { TASK_HANDLERS } from '../task/handlers.ts';
import { isAmbicodeError } from '#util/errors';
import { estimateReview, parseNarrow, renderEstimate } from '#modules/review/bundle/estimate';
import { routeEvidence } from '#modules/requirements/envelope/envelope';
import type { ReviewEntry } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ReviewTargetArgs, RouteArgs, Handler, HandlerResult } from '#types/harness';
import { CHECKS_GATE, type TargetSelection } from '#types/modules/review';
const ANSWERS = new Set(['acceptance', 'declined', 'default-taken']);
const ESTIMATE_STEP = 'estimate-step';
const NARROW_HINT = 'give the --only/--exclude tokens as your answer';
const METRICS = '.ambicode/metrics.jsonl';

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
  if (input.view.skill !== 'review') return TASK_HANDLERS['review.evaluate']!(input);
  const chain = await chainEntries(input);
  const review = chain.findLast((entry): entry is ReviewEntry => entry.kind === 'review');
  if (review === undefined) return { state: 'ok', payload: null };
  const waiting = Array.isArray(review['waiting']) ? (review['waiting'] as string[]) : [];
  const answered = chain.slice(chain.indexOf(review) + 1).some((entry) => ANSWERS.has(entry.kind) && entry['gate'] === CHECKS_GATE && isBoundAnswer(entry));
  if (waiting.length === 0 || answered) return { state: 'ok', payload: null };
  return { state: 'raise', gate: CHECKS_GATE, values: { key: waiting }, raisedBy: 'review-run' };
};

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
    return { state: 'ok', payload: [...notes, ...(narrowing === null ? [] : [`narrowed: ${narrowing}`]), renderEstimate(estimated)].join('\n') };
  } catch (error) {
    if (!isAmbicodeError(error)) throw error;
    return { state: 'ok', payload: [...notes, `Review estimate unavailable: ${error.code}: ${error.message}`].join('\n') };
  }
};

export const REVIEW_HANDLERS: Readonly<Record<string, Handler>> = { 'review.estimate': estimate, 'review.evaluate': evaluate };

/** One warning line when `.ambicode/metrics.jsonl` is not git-ignored (08-R7, D11); the route starts either way. */
export async function metricsIgnoreWarning(runtime: Runtime, skill: string): Promise<string | null> {
  if (skill !== 'review') return null;
  try {
    const { git } = await openRepository(runtime);
    return (await git.isIgnored(METRICS)) ? null : `warning: ${METRICS} is not ignored by git; run \`ambicode init --apply\` to add it to .gitignore.`;
  } catch {
    return null;
  }
}

onGatePrint('estimate', async ({ runtime, dir, chain }) => {
  const text = await loadPayload(runtime.fs, dir, chainKey(chain.filter((entry) => entry.kind === 'route').map((entry) => entry.id).reverse()), 'review.estimate');
  return text === null || text === '' ? null : { line: text };
});

onNeedCommand('review', 'review', async ({ task, args, chain }) => reviewCommand(task, args, chain));
