import path from 'node:path';
import { openWorkspace } from '#modules/config/workspace';
import { baselineIn, touchedSet, captureBaseline } from '#modules/checks/workspace/baseline';
import { evaluateReview } from '#modules/checks/review-evaluation';
import { ReviewResult } from '#types/modules/review';
import { estimateReview, renderEstimate } from '#modules/review/bundle/estimate';
import { buildChain, currentIn } from '#harness/engine/fold';
import { onGatePrint } from '#harness/gates/gates';
import { chainEntries, configOf, isResult, projectOf } from '../common.ts';
import { briefOf } from '../brief.ts';
import { isAmbicodeError } from '#util/errors';
import { runnableChecks } from '#modules/checks/run/check-command';
import { runFormat } from '#modules/checks/run/format';
import { buildReport } from '#modules/evidence/report/report';
import { GATE as CHECK_GATE, type ReviewEntry } from '#types/modules/checks';
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

  /** With every check null, no check run can be recorded, so the route stops before the model edits production code. */
  'checks.preflight': async (input) => {
    const project = await projectOf(input, await configOf(input));
    if (isResult(project)) return project;
    if ((await runnableChecks(await openWorkspace(input.runtime), project)).length > 0) return { state: 'ok', payload: null };
    const detail = `no-check: project "${project.id}" has no check with a configured command, so no check run can be recorded`;
    return { state: 'ok', payload: `${detail}. Configure one in .ambicode/config.yaml, then start the task again.`, exit: 'blocked', exitDetail: detail };
  },

  'checks.runnable': async (input) => {
    // Every project, never `projectOf`: a review spans the repository, and a project question here stopped multi-project reviews.
    const forms = (entry: { all: boolean; file: boolean }): string => (entry.all && entry.file ? 'all or --file' : entry.all ? 'all only' : '--file only');
    const workspace = await openWorkspace(input.runtime);
    const lines: string[] = [];
    for (const project of workspace.config.projects) {
      const runnable = await runnableChecks(workspace, project);
      if (runnable.length > 0) lines.push(`Project ${project.id}: ${runnable.map((entry) => `${entry.key} (${forms(entry)}${entry.approval ? ', needs approval' : ''})`).join(', ')}.`);
    }
    return { state: 'ok', payload: lines.length === 0 ? 'No check has a command configured: run no tests; the report states that nothing was verified by execution.' : lines.join('\n') };
  },

  /** Formatting the touched files is a fact of the change, not a model choice; an approval-needing format raises the same question as a check, and the answer re-runs this step. */
  'checks.format': async (input) => {
    const waiting: { key: string; files: string[] }[] = [];
    await runFormat({ runtime: input.runtime, session: input.view.session, context: input.context, ledger: input.ledger }, { task: input.view.task, waiting });
    if (waiting.length === 0) return { state: 'ok', payload: null };
    return { state: 'raise', gate: CHECK_GATE, values: { key: waiting.map((entry) => entry.key), files: waiting.flatMap((entry) => entry.files) } };
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

  /** The route's own end for an iteration with more to come: the engine opens the next route on this task. */
  'task.continue': async () => ({ state: 'ok', payload: null, exit: 'done', restart: true }),

  'task.report': async (input) => {
    const chain = await chainEntries(input);
    const head = chain.find((entry) => entry.kind === 'route' && entry.id === input.view.routeId);
    const current = input.def === undefined || head === undefined ? undefined : currentIn(input.def, buildChain(chain, head));
    const report = buildReport(chain, current === undefined ? {} : { current });
    const text = `${report.evidence}\n${report.notVerified}`;
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
