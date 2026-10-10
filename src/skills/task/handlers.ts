import path from 'node:path';
import { touchedSet, captureBaseline } from '#modules/checks/workspace/baseline';
import { evaluateReview } from '#modules/checks/review-evaluation';
import { ReviewResult } from '#types/modules/review';
import { estimateReview, renderEstimate } from '#modules/review/bundle/estimate';
import { buildChain, currentIn } from '#harness/engine/fold';
import { onGatePrint } from '#harness/gates/gates';
import { chainEntries, configOf, isResult, projectOf } from '../common.ts';
import { briefOf } from '../brief.ts';
import { isAmbicodeError } from '#util/errors';
import { buildReport } from '#modules/evidence/report/report';
import type { BaselineEntryFields, ReviewEntry } from '#types/modules/checks';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Handler, HandlerInput, HandlerResult } from '#types/harness';

const MAX_START_BYTES = 4096;
const MAX_REPORT_BYTES = 3072;

const cutTo = (text: string, bytes: number, rest: string): string => {
  if (Buffer.byteLength(text) <= bytes) return text;
  let kept = text.slice(0, bytes - Buffer.byteLength(rest) - 1);
  while (Buffer.byteLength(`${kept}\n${rest}`) > bytes) kept = kept.slice(0, -1);
  return `${kept}\n${rest}`;
};

async function readResult(input: HandlerInput, review: LedgerEntry): Promise<ReviewResult | null> {
  if (typeof review['result'] !== 'string') return null;
  const text = await input.runtime.fs.readText(path.join(input.dir.repositoryRoot, review['result'])).catch(() => null);
  const parsed = text === null ? null : ReviewResult.safeParse(JSON.parse(text));
  return parsed?.success === true ? parsed.data : null;
}

const baselineIn = (chain: readonly LedgerEntry[]): BaselineEntryFields | null => {
  const entry = chain.findLast((candidate) => candidate.kind === 'baseline');
  return entry === undefined ? null : { head: (entry['head'] as string | null) ?? null, dirty: (entry['dirty'] as BaselineEntryFields['dirty']) ?? [] };
};

export const TASK_HANDLERS: Readonly<Record<string, Handler>> = {
  'task.start': async (input) => {
    const read = await input.ledger.read();
    const { planPath, iteration, iterations, brief } = await briefOf(input, read.state === 'ok' ? read.entries : []);
    const record = { planPath, iteration, iterations };
    if (iteration > iterations) return { state: 'ok', payload: `Every iteration of ${planPath ?? 'the plan'} is done (${iterations}).`, record, exit: 'iterations-complete' };
    const head = `Task ${input.view.task} · iteration ${iteration} of ${iterations} · plan: ${planPath ?? 'none (the request is the brief)'}`;
    return { state: 'ok', payload: cutTo(brief === null ? head : `${head}\n\n${brief}`, MAX_START_BYTES, `[cut: read ${planPath ?? 'the plan'}]`), record };
  },

  'checks.baseline': async (input) => {
    if ((await chainEntries(input)).some((entry) => entry.kind === 'baseline')) return { state: 'ok', payload: null };
    const baseline = await captureBaseline(input.runtime);
    await input.ledger.append({ kind: 'baseline', route: input.view.routeId, ...baseline });
    const dirty = baseline.dirty.length === 0 ? '' : ` ${baseline.dirty.length} file(s) already changed stay out of this task's review.`;
    return { state: 'ok', payload: `Baseline: HEAD ${baseline.head?.slice(0, 12) ?? 'none (unborn branch)'}.${dirty}` };
  },

  /** e-cLRPPf: with every check null, red cannot be recorded and the model edited production code before the route ended no-red. */
  'checks.preflight': async (input) => {
    const project = await projectOf(input, await configOf(input));
    if (isResult(project)) return project;
    const runnable = Object.values(project.checks).some((check) => check.all !== null || check.file !== null);
    if (runnable) return { state: 'ok', payload: null };
    const detail = `no-check: project "${project.id}" has no check with a configured command, so no failing test can be recorded`;
    return { state: 'ok', payload: `${detail}. Configure one in .ambicode/config.yaml, then start the task again.`, exit: 'blocked', exitDetail: detail };
  },

  /** 07-V1 on the latest review; the route's onFail turns `review-findings` into the revise to fix. */
  'review.evaluate': async (input): Promise<HandlerResult> => {
    const chain = await chainEntries(input);
    const review = chain.findLast((entry): entry is ReviewEntry => entry.kind === 'review');
    if (review === undefined) return { state: 'ok', payload: null };
    const evaluation = evaluateReview(review, await readResult(input, review));
    return evaluation.next === 'revise-fix'
      ? { state: 'failed', code: 'review-findings', message: `${evaluation.findings.length} review finding(s) to fix.`, recoverable: true, revise: { args: { Findings: evaluation.findings } } }
      : { state: 'ok', payload: null };
  },

  'task.report': async (input) => {
    const chain = await chainEntries(input);
    const head = chain.find((entry) => entry.kind === 'route' && entry.id === input.view.routeId);
    const current = input.def === undefined || head === undefined ? undefined : currentIn(input.def, buildChain(chain, head));
    const report = buildReport(chain, current === undefined ? {} : { current });
    const text = `${report.evidence}\n${report.notVerified}\n<!-- ambicode report ${report.hash} -->`;
    return { state: 'ok', payload: cutTo(text, MAX_REPORT_BYTES, `[cut: \`report --task ${input.view.task}\` prints all of it]`) };
  },
};

onGatePrint('review-offer', async ({ runtime, task, chain }) => {
  try {
    const baseline = baselineIn(chain);
    const preexisting = baseline === null ? [] : (await touchedSet(runtime, baseline)).preexisting;
    const estimate = await estimateReview(runtime, { runtime, target: { kind: 'working' }, requirements: [], task, preexisting });
    return { line: renderEstimate(estimate) };
  } catch (error) {
    return { line: `Review estimate unavailable: ${isAmbicodeError(error) ? error.code : 'an unexpected error'}.` };
  }
});
