import path from 'node:path';
import { chainKey, loadPayload } from '#harness/engine/execute';
import { isBoundAnswer, latestBound } from '#harness/engine/fold';
import { onGatePrint } from '#harness/gates/gates';
import { chainEntries, failed } from '../common.ts';
import { TASK_HANDLERS } from '../task/handlers.ts';
import { isAmbicodeError } from '#util/errors';
import { lineAt } from '#platform/git/diff';
import { comment, fetchMr, type MrPlace, type MrRefs } from '#platform/gitlab/glab';
import { capturedFiles, MR_DIFF_JSON, MR_DIFF_PATCH } from '#modules/review/snapshot/target';
import { estimateReview, parseNarrow, renderEstimate } from '#modules/review/bundle/estimate';
import { assembleBundle, baselineScope, baselineTree, envelopeRequirements, pinAssembled, recordedChecks } from '#modules/review/bundle/bundle';
import { runReviewChecks } from './checks.ts';
import { ANSWER_FILE, recordReviewerAnswer, renderRecord } from './record-answer.ts';
import { pendingReview } from '#modules/review/answer/captured';
import { MAX_EVIDENCE_BYTES } from '#types/defaults';
import { briefOf } from '../brief.ts';
import { GATE as CHECK_GATE } from '#types/modules/checks';
import { baselineOf } from '#modules/checks/workspace/baseline';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ReviewTargetArgs, Handler, HandlerInput, HandlerResult } from '#types/harness';
import type { Finding, TargetSelection } from '#types/modules/review';
const ANSWERS = new Set(['acceptance', 'declined', 'default-taken']);
const AGAIN_GATE = 'review-again';
const ESTIMATE_STEP = 'estimate-step';
/** Beside the pinned result: the plan's section for the iteration under review, read by the brief script. */
const PLAN_SECTION = 'plan-iteration.md';
const NARROW_HINT = 'give the --only/--exclude tokens as your answer';

const selectionOf = (target: ReviewTargetArgs | undefined): TargetSelection =>
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

/** The findings of the latest recorded review. */
async function recordedFindings(input: HandlerInput): Promise<Finding[]> {
  const review = (await chainEntries(input)).findLast((entry) => entry.kind === 'review' && entry['stage'] === 'recorded');
  const text = typeof review?.['result'] === 'string' ? await input.runtime.fs.readText(path.join(input.dir.repositoryRoot, review['result'])).catch(() => null) : null;
  return text === null ? [] : ((JSON.parse(text) as { findings?: Finding[] }).findings ?? []);
}

const placeOf = (finding: Finding): { path: string; line: number } => ({ path: finding.location.newPath ?? finding.location.oldPath ?? '', line: finding.location.line });

/** An unchanged line exists on both sides, so its other number comes from the diff; a line outside it is sent as given and GitLab refuses it. */
function mrPlace(finding: Finding, patch: string): MrPlace {
  const { oldPath, newPath, side, line } = finding.location;
  const file = capturedFiles(patch).find((candidate) => candidate.oldPath === oldPath && candidate.newPath === newPath);
  const hit = file === undefined ? null : lineAt(file, side, line);
  return { oldPath, newPath, oldLine: hit?.oldLine ?? (side === 'old' ? line : null), newLine: hit?.newLine ?? (side === 'new' ? line : null) };
}

/** The recorded findings as the numbered list the user picks from; no findings ends the route, since there is nothing to ask. */
const publishList: Handler = async (input) => {
  const findings = await recordedFindings(input);
  if (findings.length === 0) return { state: 'ok', payload: 'no findings to publish', exit: 'done', exitDetail: 'no findings to publish' };
  return { state: 'ok', payload: findings.map((finding, at) => `${at + 1}. ${placeOf(finding).path}:${placeOf(finding).line} — ${finding.suggestedComment} (${finding.risk}/${finding.confidence})`).join('\n') };
};

/** The step after the reviewer: records what it wrote to its answer file (none is a failed review) and hands the report on as this step's payload. A review already recorded is left alone. */
const record: Handler = async (input) => {
  const pending = pendingReview(await chainEntries(input), null);
  if (pending === undefined) return { state: 'ok', payload: null };
  const answerFile = path.join(path.dirname(path.join(input.dir.repositoryRoot, String(pending['result']))), ANSWER_FILE);
  const answer = await input.runtime.fs.readText(answerFile).then((text) => text.slice(0, MAX_EVIDENCE_BYTES), () => null);
  return { state: 'ok', payload: renderRecord(await recordReviewerAnswer(input.runtime, { pending, answer, append: (fields) => input.ledger.append(fields) })) };
};

const mrFetch: Handler = async (input) => {
  try {
    const mr = await fetchMr(input.runtime.runner, input.dir.repositoryRoot, input.args.target?.mr ?? '');
    await input.runtime.fs.mkdirp(input.dir.root);
    await input.runtime.fs.writeText(path.join(input.dir.root, MR_DIFF_PATCH), mr.diff);
    await input.runtime.fs.writeText(path.join(input.dir.root, MR_DIFF_JSON), `${JSON.stringify({ url: input.args.target?.mr, sha: mr.refs.head_sha, refs: mr.refs, title: mr.title }, null, 2)}\n`);
    return { state: 'ok', payload: null };
  } catch (error) {
    return failed(error);
  }
};

/** Posts the findings the user picked at the `publish` gate, `all` or a number list, and nothing else. */
const publish: Handler = async (input) => {
  const findings = await recordedFindings(input);
  const answer = String(latestBound(await chainEntries(input), 'publish')?.['answer'] ?? '');
  const picked = answer === 'all' ? findings : (answer.match(/\d+/g) ?? []).map((number) => findings[Number(number) - 1]).filter((finding): finding is Finding => finding !== undefined);
  if (picked.length === 0) return { state: 'failed', code: 'bad-argument', message: `"${answer}" names none of the ${findings.length} listed findings.`, recoverable: false };
  const url = input.args.target?.mr ?? '';
  const posted: string[] = [];
  try {
    const { refs } = JSON.parse(await input.runtime.fs.readText(path.join(input.dir.root, MR_DIFF_JSON))) as { refs: MrRefs };
    const patch = await input.runtime.fs.readText(path.join(input.dir.root, MR_DIFF_PATCH));
    for (const finding of picked) {
      const { path: file, line } = placeOf(finding);
      await comment(input.runtime.runner, input.dir.repositoryRoot, url, refs, mrPlace(finding, patch), finding.suggestedComment);
      posted.push(`${file}:${line}`);
    }
  } catch (error) {
    if (!isAmbicodeError(error)) throw error;
    return { state: 'failed', code: error.code, message: `${error.message} (posted before it: ${posted.join(', ') || 'none'})`, recoverable: false };
  }
  const detail = `posted ${posted.length} comment(s): ${posted.join(', ')}`;
  return { state: 'ok', payload: detail, exit: 'done', exitDetail: detail };
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
    const assemble = { target: selectionOf(input.args.target), task: view.task, requirements, preexisting: scope.preexisting, baseTree: reviewing ? null : baselineTree(chain), ...(narrowing === null ? {} : parseNarrow(narrowing)) };
    const bundle = await assembleBundle({ runtime, ...assemble });
    if (reviewing && assemble.target.kind !== 'merge-request') {
      const checks = await runReviewChecks(input, bundle.files, chain);
      if (checks.waiting.length > 0) return { state: 'raise', gate: CHECK_GATE, values: { key: checks.waiting.map((entry) => entry.key), files: checks.waiting.flatMap((entry) => entry.files) } };
      scope.omissions.push(...checks.notes);
      bundle.result.checks = await recordedChecks(runtime, bundle.taskDirectory);
    }
    const pinned = await pinAssembled(runtime, bundle, { omissions: scope.omissions, ledger: scope.ledger, append: (fields) => input.ledger.append(fields) });
    const started = reviewing ? undefined : chain.find((entry) => entry.kind === 'step' && entry['step'] === 'start');
    const section = started === undefined ? null : (await briefOf({ ...input, args: { ...input.args, plan: started['planPath'] as string | null, iteration: started['iteration'] as number } }, [])).brief;
    if (section !== null) await runtime.fs.writeText(path.join(pinned.bundle.reviewDirectory, PLAN_SECTION), `${section}\n`);
    return { state: 'ok', payload: null };
  } catch (error) {
    return failed(error);
  }
};

export const REVIEW_HANDLERS: Readonly<Record<string, Handler>> = { 'review.pin': pin, 'review.estimate': estimate, 'review.evaluate': evaluate, 'review.record': record, 'review.publishList': publishList, 'review.mrFetch': mrFetch, 'review.publish': publish };

onGatePrint('estimate', async ({ runtime, dir, chain }) => {
  const text = await loadPayload(runtime.fs, dir, chainKey(chain.filter((entry) => entry.kind === 'route').map((entry) => entry.id).reverse()), 'review.estimate');
  return text === null || text === '' ? null : { line: text };
});

onGatePrint('publish', async ({ runtime, dir, chain }) => {
  const text = await loadPayload(runtime.fs, dir, chainKey(chain.filter((entry) => entry.kind === 'route').map((entry) => entry.id).reverse()), 'review.publishList');
  return text === null || text === '' ? null : { line: text };
});

