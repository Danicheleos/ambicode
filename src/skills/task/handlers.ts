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
import { briefOf, investigationOf } from '../brief.ts';
import { isAmbicodeError } from '#util/errors';
import { runnableChecks } from '#modules/checks/run/check-command';
import { runFormat } from '#modules/checks/run/format';
import { runApprovedChecks } from '#modules/checks/run/approved';
import { runScopeChecks } from '#modules/checks/run/scope';
import { isBoundAnswer } from '#modules/evidence/ledger-chain';
import { GATE as CHECK_GATE, type BaselineEntryFields, type ReviewEntry } from '#types/modules/checks';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Handler, HandlerInput, HandlerResult } from '#types/harness';

const AGAIN_GATE = 'checks-again';
/** The option that goes on to the report; `fix` is the other, and acting: only the user sends the implementer round again. */
const REPORT_GAP = 'report the gap';
/** One key's output in the fix brief: the tail a runner prints its verdict in, cut so a few red keys fit the work file. */
const TAIL_BYTES = 1500;

const stepEntries = (chain: readonly LedgerEntry[]): LedgerEntry[] => chain.filter((entry) => entry.kind === 'step' && entry['step'] === 'scope-checks' && (entry['status'] === 'completed' || entry['status'] === 'failed'));

/** The latest green-phase run of each key that exited non-zero: what the end checks left red, with its output. */
const redKeys = (chain: readonly LedgerEntry[]): Map<string, string> => {
  const last = new Map<string, LedgerEntry>();
  for (const entry of chain) if (entry.kind === 'check' && entry['phase'] === 'green') last.set(String(entry['key']), entry);
  return new Map([...last].filter(([, entry]) => entry['exit'] !== 0).map(([key, entry]) => [key, String(entry['tail'] ?? '').slice(-TAIL_BYTES)]));
};

/** The keys the last failed end run sent to the implementer: the fix may leave them green by its own file run, but the scope run is what must pass. */
const sentBack = (chain: readonly LedgerEntry[]): Set<string> => {
  const revise = chain.findLast((entry) => entry.kind === 'revise' && entry['from'] === 'fix' && (entry['args'] as Record<string, string[]> | undefined)?.['Failing checks'] !== undefined);
  const lines = (revise?.['args'] as Record<string, string[]> | undefined)?.['Failing checks'] ?? [];
  return new Set(lines.map((line) => /^(\S+) exited non-zero:/.exec(line)?.[1]).filter((key): key is string => key !== undefined));
};

const redFailure = (red: ReadonlyMap<string, string>): HandlerResult => ({
  state: 'failed',
  code: 'checks-red',
  message: `${red.size} end check(s) red: ${[...red.keys()].join(', ')}.`,
  recoverable: true,
  revise: { args: { 'Failing checks': [...red].map(([key, tail]) => `${key} exited non-zero:\n${tail}`) } },
});

/** The baseline of the task route before this one, when it was cut short: its work is still in the tree and must stay in this route's review, not become "already changed". */
async function carriedBaseline(input: HandlerInput): Promise<(BaselineEntryFields & { tree?: string }) | null> {
  const read = await input.ledger.read();
  if (read.state !== 'ok') return null;
  const heads = read.entries.filter((entry) => entry.kind === 'route' && entry['skill'] === 'task');
  const before = heads[heads.findIndex((entry) => entry.id === input.view.routeId) - 1];
  if (before === undefined) return null;
  const exit = read.entries.findLast((entry) => entry.kind === 'exit' && entry['route'] === before.id);
  if (exit?.['reason'] !== 'interrupted' && exit?.['reason'] !== 'blocked') return null;
  const baseline = read.entries.findLast((entry) => entry.kind === 'baseline' && entry['route'] === before.id);
  return baseline === undefined ? null : { head: baseline['head'] as string | null, dirty: baseline['dirty'] as BaselineEntryFields['dirty'], tree: typeof baseline['tree'] === 'string' ? baseline['tree'] : undefined };
}

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
    const { planPath, iteration, iterations, through, brief } = await briefOf(input, read.state === 'ok' ? read.entries : []);
    // A plan the user took back to draft by hand is not run; a file named with --plan is the user's own choice and is read as is.
    const planText = input.args.plan === null && planPath !== null ? await input.runtime.fs.readText(path.resolve(input.dir.repositoryRoot, planPath)).catch(() => null) : null;
    if (planText !== null && planStatusOf(planText) !== 'accepted') {
      return { state: 'failed', code: 'plan-not-accepted', message: `${planPath} is not status: accepted. Accept it in the plan route, or name the file with --plan to run it as it is.`, recoverable: false };
    }
    if (iteration > iterations) return { state: 'ok', payload: `Every iteration of ${planPath ?? 'the plan'} is done (${iterations}).`, record: { planPath, iterations }, exit: 'iterations-complete' };
    const record = { planPath, iteration, iterations, through, seeded: brief !== null || (await investigationOf(input, read.state === 'ok' ? read.entries : [])) !== null };
    const head = `Task ${input.view.task} · ${through > iteration ? `iterations ${iteration}-${through}` : `iteration ${iteration}`} of ${iterations}`;
    return { state: 'ok', payload: brief === null ? head : `${head}\n\n${brief}`, record };
  },

  'checks.baseline': async (input) => {
    if ((await chainEntries(input)).some((entry) => entry.kind === 'baseline')) return { state: 'ok', payload: null };
    const carried = await carriedBaseline(input);
    const baseline = carried ?? (await captureBaseline(input.runtime));
    const byProject = await runnableByProject(input);
    const runnable = byProject.reduce((sum, entry) => sum + entry.runnable.length, 0);
    // Keys with no file form: the only ones a named iteration asks about, since they run the whole project.
    const full = byProject.reduce((sum, entry) => sum + entry.runnable.filter((key) => !key.file).length, 0);
    const { git } = await openRepository(input.runtime);
    await input.ledger.append({ kind: 'baseline', route: input.view.routeId, head: baseline.head, dirty: baseline.dirty, runnable, full, tree: carried?.tree ?? (await snapshotTree(input.runtime.fs, git)) });
    const dirty = baseline.dirty.length === 0 ? '' : ` ${baseline.dirty.length} file(s) already changed stay out of this task's review.`;
    return { state: 'ok', payload: `Baseline: HEAD ${baseline.head?.slice(0, 12) ?? 'none (unborn branch)'}.${dirty}` };
  },

  'checks.runnable': async (input) => {
    // Every project, never `projectOf`: a review spans the repository, and a project question here stopped multi-project reviews.
    const forms = (entry: { all: boolean; file: boolean; approval: { file: boolean; all: boolean } }): string =>
      // A raw `tsc | grep` through Bash left a red result outside the ledger when the all form asked for approval (a real session): the end step runs it, once.
      !entry.file ? 'no file form: left to the end step, never run it' : [entry.file ? `--file ${entry.approval.file ? 'needs approval' : 'runs freely'}` : '', entry.all ? `all ${entry.approval.all ? 'needs approval' : 'runs freely'}` : ''].filter(Boolean).join(', ');
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

  /**
   * The checks of the whole change, once, where the route has no one to ask (every iteration done, or headless) or the user said run. Red: the first
   * round goes back to the implementer on its own with the output and re-runs only the red keys; a later round is the user's gate, and its
   * default reports the gap, so a headless run never waits and a red key is never reported as clean.
   */
  'checks.scope': async (input): Promise<HandlerResult> => {
    const chain = await chainEntries(input);
    const fixed = chain.findLastIndex((entry) => entry.kind === 'step' && entry['step'] === 'fix' && entry['status'] === 'delivered');
    const answered = chain.findLastIndex((entry, at) => at > fixed && isBoundAnswer(entry) && entry['gate'] === AGAIN_GATE);
    if (answered !== -1 && chain[answered]!['answer'] === REPORT_GAP) return { state: 'ok', payload: null };
    // Another round is a code revise like the first, not a gate revise: a human revise opens a new cycle and the route would ask its run/skip question again.
    // The failure is the one the last run left, sent on afresh so the implementer reads its output, not the first round's.
    if (answered !== -1 && stepEntries(chain.slice(answered + 1)).length === 0) return redFailure(redKeys(chain));
    const previous = stepEntries(chain).at(-1);
    const rerun = previous?.['failed'] === true ? sentBack(chain) : null;
    const deps = { runtime: input.runtime, session: input.view.session, context: input.context, ledger: input.ledger };
    // An interactive named iteration runs a key that covers the whole project only when the user said run; every other run counts its start as the consent.
    const asksFull = typeof input.args.iteration === 'number' && !input.args.headless;
    const full = !asksFull || chain.some((entry) => isBoundAnswer(entry) && entry['gate'] === 'checks-offer' && entry['answer'] === 'run');
    await runScopeChecks(deps, { task: input.view.task, only: rerun, full });
    const red = redKeys(await chainEntries(input));
    if (red.size === 0) return { state: 'ok', payload: null };
    const rounds = chain.filter((entry) => entry.kind === 'step' && entry['step'] === 'scope-checks' && entry['status'] === 'failed' && entry['code'] === 'checks-red').length;
    return rounds === 0 ? redFailure(red) : { state: 'raise', gate: AGAIN_GATE, values: { key: [...red.keys()] }, raisedBy: 'scope-checks' };
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
};

/** The question names the full keys the answer would run: they cover the whole project, which is why this is asked and the scoped keys are not. */
onGatePrint('checks-offer', async ({ runtime }) => {
  const workspace = await openWorkspace(runtime);
  const keys: string[] = [];
  for (const project of workspace.config.projects) for (const entry of await runnableChecks(workspace, project)) if (!entry.file) keys.push(`${project.id}/${entry.key}`);
  return { question: `Run the full checks ${keys.join(', ')} (the whole project, not by file)?`, details: `Checks by file already ran on what changed. This would also run: ${keys.join(', ')}.`, values: { key: keys } };
});

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
