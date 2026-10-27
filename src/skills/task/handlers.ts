import path from 'node:path';
import { openWorkspace } from '#modules/config/workspace';
import { baselineIn, touchedSet, captureBaseline } from '#modules/checks/workspace/baseline';
import { evaluateReview } from '#modules/checks/review-evaluation';
import { ReviewResult } from '#types/modules/review';
import { estimateReview, renderEstimate } from '#modules/review/bundle/estimate';
import { baselineTree } from '#modules/review/bundle/bundle';
import { snapshotTree } from '#modules/review/snapshot/target';
import { openRepository } from '#platform/git/open';
import { buildChain, currentIn, isGreen } from '#harness/engine/fold';
import { onGatePrint } from '#harness/gates/gates';
import { chainEntries } from '../common.ts';
import { planStatusOf } from '#modules/evidence/notes';
import { briefOf } from '../brief.ts';
import { isAmbicodeError } from '#util/errors';
import { runnableChecks } from '#modules/checks/run/check-command';
import { runFormat } from '#modules/checks/run/format';
import { runApprovedChecks } from '#modules/checks/run/approved';
import { GATE as CHECK_GATE, type ReviewEntry } from '#types/modules/checks';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Handler, HandlerInput, HandlerResult } from '#types/harness';

const MAX_START_BYTES = 4096;

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

/** Every project's runnable checks: a repository may have none, and then no step waits for a check. */
async function runnableByProject(input: HandlerInput) {
  const workspace = await openWorkspace(input.runtime);
  return Promise.all(workspace.config.projects.map(async (project) => ({ project, runnable: await runnableChecks(workspace, project) })));
}

export const TASK_HANDLERS: Readonly<Record<string, Handler>> = {
  'task.start': async (input) => {
    const read = await input.ledger.read();
    const { planPath, iteration, iterations, brief } = await briefOf(input, read.state === 'ok' ? read.entries : []);
    // A plan the user took back to draft by hand is not run; a file named with --plan is the user's own choice and is read as is.
    const planText = input.args.plan === null && planPath !== null ? await input.runtime.fs.readText(path.resolve(input.dir.repositoryRoot, planPath)).catch(() => null) : null;
    if (planText !== null && planStatusOf(planText) !== 'accepted') {
      return { state: 'failed', code: 'plan-not-accepted', message: `${planPath} is not status: accepted. Accept it in the plan route, or name the file with --plan to run it as it is.`, recoverable: false };
    }
    if (iteration > iterations) return { state: 'ok', payload: `Every iteration of ${planPath ?? 'the plan'} is done (${iterations}).`, record: { planPath, iterations }, exit: 'iterations-complete' };
    const record = { planPath, iteration, iterations };
    const head = `Task ${input.view.task} · iteration ${iteration} of ${iterations} · plan: ${planPath ?? 'none (the request is the brief)'}`;
    return { state: 'ok', payload: cutTo(brief === null ? head : `${head}\n\n${brief}`, MAX_START_BYTES, `[cut: read ${planPath ?? 'the plan'}]`), record };
  },

  'checks.baseline': async (input) => {
    if ((await chainEntries(input)).some((entry) => entry.kind === 'baseline')) return { state: 'ok', payload: null };
    const baseline = await captureBaseline(input.runtime);
    const runnable = (await runnableByProject(input)).reduce((sum, entry) => sum + entry.runnable.length, 0);
    const { git } = await openRepository(input.runtime);
    await input.ledger.append({ kind: 'baseline', route: input.view.routeId, ...baseline, runnable, tree: await snapshotTree(input.runtime.fs, git) });
    const dirty = baseline.dirty.length === 0 ? '' : ` ${baseline.dirty.length} file(s) already changed stay out of this task's review.`;
    return { state: 'ok', payload: `Baseline: HEAD ${baseline.head?.slice(0, 12) ?? 'none (unborn branch)'}.${dirty}` };
  },

  'checks.runnable': async (input) => {
    // Every project, never `projectOf`: a review spans the repository, and a project question here stopped multi-project reviews.
    const forms = (entry: { all: boolean; file: boolean; approval: { file: boolean; all: boolean } }): string =>
      [entry.file ? `--file ${entry.approval.file ? 'needs approval' : 'runs freely'}` : '', entry.all ? `all ${entry.approval.all ? 'needs approval' : 'runs freely'}` : ''].filter(Boolean).join(', ');
    const lines: string[] = [];
    for (const { project, runnable } of await runnableByProject(input)) {
      if (runnable.length > 0) lines.push(`Project ${project.id}: ${runnable.map((entry) => `${entry.key} (${forms(entry)})`).join(', ')}.`);
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

  /** An answered check question runs here, once the step that raised it is behind the route; the entry it writes is the route's evidence. */
  'checks.approved': async (input) => {
    await runApprovedChecks({ runtime: input.runtime, session: input.view.session, context: input.context, ledger: input.ledger }, { task: input.view.task });
    return { state: 'ok', payload: null };
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

  /** A route whose last check is red did not do its iteration, however it got here: it ends blocked and the next start redoes it. */
  'task.verdict': async (input) => {
    const last = (await chainEntries(input)).findLast((entry) => entry.kind === 'check');
    if (last === undefined || isGreen(last)) return { state: 'ok', payload: null };
    return { state: 'ok', payload: null, exit: 'blocked', exitDetail: `the last check (${String(last['key'])}) is red, exit ${String(last['exit'])}: this iteration is not done` };
  },

  /** The route's own end for an iteration with more to come: the engine opens the next route on this task. */
  'task.continue': async () => ({ state: 'ok', payload: null, exit: 'done', restart: true }),
};

onGatePrint('review-offer', async ({ runtime, task, chain }) => {
  try {
    const baseline = baselineIn(chain);
    const preexisting = baseline === null ? [] : (await touchedSet(runtime, baseline)).preexisting;
    const estimate = await estimateReview(runtime, { runtime, target: { kind: 'working' }, requirements: [], task, preexisting, baseTree: baselineTree(chain) });
    return { details: renderEstimate(estimate) };
  } catch (error) {
    return { details: `Review estimate unavailable: ${isAmbicodeError(error) ? error.code : 'an unexpected error'}.` };
  }
});
