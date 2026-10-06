import path from 'node:path';
import { openRepository } from '#composition/root';
import { indexDepsOf, startIndexBuild } from '#modules/search/code-index/codeindex';
import { refs } from '#modules/search/declarations/refs';
import { touchedSet, captureBaseline } from '#modules/checks/workspace/baseline';
import { evaluateReview } from '#modules/checks/review-evaluation';
import { ReviewResult } from '#types/modules/review';
import { estimateReview, renderEstimate } from '#modules/review/bundle/estimate';
import { buildChain, currentIn } from '#harness/engine/fold';
import { onGatePrint, onNeedCommand, onRaisedAnswer, raiseGate } from '#harness/gates/gates';
import { chainEntries, configOf, isResult, projectOf } from '../common.ts';
import { isAmbicodeError } from '#util/errors';
import { buildReport } from '#modules/evidence/report/report';
import type { BaselineEntryFields, ReviewEntry } from '#types/modules/checks';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Handler, HandlerInput, HandlerResult } from '#types/harness';

const MAX_START_BYTES = 4096;
const MAX_REPORT_BYTES = 3072;
const MAX_CALLERS = 8;
const ITERATION = /^##\s+Iteration\s+(\d+)\b.*$/gim;
const CODE_SHAPED = /`([^`\s]{2,80})`|\b([A-Za-z_$][\w$]*(?:[a-z0-9][A-Z]|_[A-Za-z0-9])[\w$]*)\b/g;
const KEY_GATE = 'check-only-unauthorized';
const keyValues = (key: string): Record<string, string[]> => ({ key: [key], files: ['the change under review'] });
const DEFECT = /\bdefect\b|\b(?:issue\s*)?type\W{0,3}(?:bug|defect)\b/i;

const cutTo = (text: string, bytes: number, rest: string): string => {
  if (Buffer.byteLength(text) <= bytes) return text;
  let kept = text.slice(0, bytes - Buffer.byteLength(rest) - 1);
  while (Buffer.byteLength(`${kept}\n${rest}`) > bytes) kept = kept.slice(0, -1);
  return `${kept}\n${rest}`;
};

/** The plan this route implements, its iteration count, and the brief of the iteration it starts at (07-R2, D18). */
async function briefOf(input: HandlerInput, entries: readonly LedgerEntry[]): Promise<{ planPath: string | null; iteration: number; iterations: number; brief: string | null }> {
  const planPath = input.args.plan ?? (entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan')?.['path'] as string | undefined) ?? null;
  const plan = planPath === null ? null : await input.runtime.fs.readText(path.resolve(input.dir.repositoryRoot, planPath)).catch(() => null);
  const done = entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'notes' && typeof entry['iteration'] === 'number')?.['iteration'] as number | undefined;
  const iteration = (done ?? 0) + 1;
  const headings = plan === null ? [] : [...plan.matchAll(ITERATION)];
  const at = headings.findIndex((heading) => Number(heading[1]) === iteration);
  const brief = plan === null ? null : headings.length === 0 ? plan : at < 0 ? null : plan.slice(headings[at]!.index, headings[at + 1]?.index ?? plan.length);
  return { planPath, iteration, iterations: Math.max(1, headings.length), brief: brief?.trim() ?? null };
}

const identifiers = (text: string): string[] => {
  const names = [...text.matchAll(CODE_SHAPED)].map((match) => (match[1] ?? match[2] ?? '').replace(/\(\)$/, '').split('.').at(-1) ?? '');
  return [...new Set(names.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name)))].slice(0, MAX_CALLERS);
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

  /** Callers of the brief's code-shaped names (07-G1, 07-G2); also records whether the brief is a defect (07-S2, D19). */
  'task.inventory': async (input) => {
    const chain = await chainEntries(input);
    const config = await configOf(input);
    const project = await projectOf(input, config);
    if (isResult(project)) return project;
    const { brief } = await briefOf(input, (await input.ledger.read().then((read) => (read.state === 'ok' ? read.entries : []))));
    const text = brief ?? input.args.text;
    const sources = JSON.stringify(chain.filter((entry) => entry.kind === 'envelope').map((entry) => entry['sources']));
    const defectBrief = DEFECT.test(text) || DEFECT.test(input.args.text) || DEFECT.test(sources);
    const names = identifiers(text);
    const lines = ['Callers (whole-word search; a `collides` caller → verify its import before editing):'];
    if (names.length === 0) lines.push('  no code-shaped name in the brief');
    else {
      const found = await refs(input.runtime, names, { project, show: false });
      for (const row of found.names) lines.push(`  ${row.name} — ${row.hits} refs${row.collides === true ? ', collides' : ''}`);
      for (const limitation of found.limitations) lines.push(`  ${limitation}`);
    }
    if (config.search.index === 'none') lines.push('index: none — grep fallback');
    return { state: 'ok', payload: lines.join('\n'), record: defectBrief ? { defectBrief } : {} };
  },

  'task.index': async (input) => {
    const config = await configOf(input);
    if (config.search.index === 'none') return { state: 'ok', payload: null };
    const project = await projectOf(input, config);
    if (isResult(project)) return project;
    const { git } = await openRepository(input.runtime);
    void startIndexBuild(indexDepsOf(input.runtime, git, input.dir.repositoryRoot, config), project).catch(() => undefined);
    return { state: 'ok', payload: null };
  },

  /** 07-V1 on the latest review; the route's onFail turns `review-findings` into the revise to fix. */
  'review.evaluate': async (input): Promise<HandlerResult> => {
    const chain = await chainEntries(input);
    const review = chain.findLast((entry): entry is ReviewEntry => entry.kind === 'review');
    if (review === undefined) return { state: 'ok', payload: null };
    const { touched } = await touchedSet(input.runtime, baselineIn(chain) ?? { head: null, dirty: [] });
    const evaluation = evaluateReview(input.view, review, await readResult(input, review), touched, chain);
    switch (evaluation.next) {
      case 'waiting':
        return { state: 'raise', gate: KEY_GATE, values: keyValues(evaluation.keys[0]!), raisedBy: evaluation.raisedBy };
      case 'scope':
        return { state: 'raise', gate: 'scope-expanding', values: { finding: [...evaluation.findings, ...(evaluation.more > 0 ? [`(+${evaluation.more} more)`] : [])] } };
      case 'revise-fix':
        return { state: 'failed', code: 'review-findings', message: `${evaluation.findings.length} review finding(s) to fix.`, recoverable: true, revise: { args: { Findings: evaluation.findings } } };
      case 'proceed':
        return { state: 'ok', payload: null };
    }
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

// An approve revises its step, so the review's next waiting key is raised now rather than after another review (07-V1).
onRaisedAnswer(KEY_GATE, async ({ view, ledger, acceptance, routes }) => {
  if (acceptance['answer'] !== 'approve') return;
  const read = await ledger.read();
  const chain: LedgerEntry[] = (read.state === 'ok' ? read.entries : []).filter((entry) => view.chainIds.includes(String(entry.kind === 'route' ? entry.id : entry['route'])));
  const print = chain.find((entry) => entry.id === acceptance['instance']);
  const review = chain.findLast((entry): entry is ReviewEntry => entry.kind === 'review');
  if (print === undefined || review === undefined || chain.indexOf(review) > chain.indexOf(print)) return;
  const later = chain.slice(chain.findIndex((entry) => entry.id === acceptance.id) + 1);
  if (!later.some((entry) => entry.kind === 'revise') || later.some((entry) => entry.kind === 'gate' && entry['gate'] === KEY_GATE)) return;
  const evaluation = evaluateReview(view, review, null, [], chain);
  if (evaluation.next === 'waiting') await raiseGate(ledger, view, { gate: KEY_GATE, values: keyValues(evaluation.keys[0]!), raisedBy: String(print['raisedBy']) }, routes);
});

onNeedCommand('task', 'review', async ({ task }) => `review --task ${task}`);

onGatePrint('review-offer', async ({ runtime, task, chain }) => {
  try {
    const baseline = baselineIn(chain);
    const preexisting = baseline === null ? [] : (await touchedSet(runtime, baseline)).preexisting;
    const estimate = await estimateReview(runtime, { runtime, target: { kind: 'working' }, requirementUrls: [], evidence: null, approvals: new Set(), declines: new Set(), task, preexisting });
    return { line: renderEstimate(estimate) };
  } catch (error) {
    return { line: `Review estimate unavailable: ${isAmbicodeError(error) ? error.code : 'an unexpected error'}.` };
  }
});
