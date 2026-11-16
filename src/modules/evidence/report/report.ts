import { newestReviews } from '#modules/review/answer/captured';
import { isBoundAnswer } from '#modules/evidence/ledger-chain';
import { mrRequirements } from '#modules/requirements/capture/has-requirement';
import { outputPointer } from '#modules/checks/run/check-command';
import type { LedgerEntry } from '#types/modules/evidence';

const squash = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The gaps a message does not state, compared on words only so markup and punctuation around a generated line do not count. */
export const unstated = (gaps: readonly string[], message: string): string[] => {
  const stated = squash(message);
  return gaps.filter((gap) => !stated.includes(squash(gap)));
};

const shown = (value: unknown): string => String(value ?? '');
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
// Route step ids are not words a reader knows; an id outside this table is left unnamed rather than leaked.
const STEP_WORDS: Record<string, string> = { change: 'the change', fix: 'the fix', format: 'formatting', 'scope-checks': 'the end checks' };
const during = (step: unknown): string => (typeof step === 'string' && STEP_WORDS[step] !== undefined ? ` during ${STEP_WORDS[step]}` : '');
const omissionsOf = (entry: LedgerEntry): number => (typeof entry.omissions === 'number' ? entry.omissions : list(entry.omissions).length);

/** How a recorded review ended, from its status: a failed one has no result, a partial one has omissions. */
const reviewState = (entry: LedgerEntry): { failed: boolean; partial: boolean } => ({
  failed: entry.status === 'error',
  partial: typeof entry.status === 'string' && entry.status !== 'complete' && entry.status !== 'error',
});

function limitGap(entry: LedgerEntry): string {
  const where = during(entry.step);
  const phase = String(entry.which).replace(/-unproven$/, '');
  if (entry.which === 'read-bytes') return `Read ${shown(entry.bytes)} bytes during the route, past the ${shown(entry.cap)} byte budget`;
  if (entry.which === 'note-not-saved') return `The final message was not saved as the result note: ${shown(entry.message)}`;
  if (entry.which === 'report-not-saved') return `The task report was not saved: the implementer ended without \`note save\`, its final message was "${shown(entry.message)}"`;
  if (entry.which === 'hook-error') return `The ${shown(entry.event)} hook failed: ${shown(entry.message)}`;
  if (entry.which === 'check') return `Checks kept failing${where}: stopped after ${entry.count} attempts`;
  if (entry.which === 'repeat') return `A step was repeated ${entry.count} times and stopped there`;
  if (entry.which === 'missing-produces') return `The required result was not produced${where} after ${entry.count} tries`;
  if (phase !== entry.which) {
    const key = typeof entry.key === 'string' ? entry.key : null;
    if (key === null) return `A passing check was not proven${where}`;
    if (entry.cause === 'not-run') return `${key} could not run${where}`;
    return `${key} failed${where} and no later run passed on the same files`;
  }
  return `Stopped${where}: ${shown(entry.which).replace(/-/g, ' ')} (${entry.count})`;
}

/** The Not verified lines of a plan-critic worker entry: one per defect and per claim it did not check, or the one saying it gave no valid answer. */
export function criticGaps(worker: LedgerEntry | undefined): string[] {
  const summary = worker?.summary as { defects?: { kind: string; where: string; evidence: string }[]; claims?: { n: number; verdict: string; evidence: string; where?: string }[]; unknownNs?: string[]; reason?: string } | undefined;
  if (worker === undefined || summary === undefined) return [];
  if (summary.defects === undefined) return [`plan critic: no valid answer: ${shown(summary.reason)}`];
  const unchecked = (summary.claims ?? []).filter((claim) => claim.verdict === 'not-checked');
  return [...summary.defects.map((defect) => `plan critic: ${defect.kind} ${defect.where}: ${defect.evidence}`), ...unchecked.map((claim) => `plan critic: claim not checked ${claim.where ?? `#${claim.n}`}: ${claim.evidence}`), ...[...new Set(summary.unknownNs ?? [])].map((n) => `plan critic: critic row #${shown(n)} names no listed claim`)];
}

/**
 * What the ledger says was not verified, one plain line each, from the ledger alone. `current` drops entries a later
 * revise superseded. A delivery or an exit code is no test result, so only recorded gaps are listed.
 */
export function gapsOf(entries: readonly LedgerEntry[], current: (entry: LedgerEntry) => boolean = () => true): string[] {
  const of = (...kinds: string[]): LedgerEntry[] => entries.filter((entry) => kinds.includes(entry.kind) && current(entry));
  const gaps: string[] = [];

  const runs = new Map<string, LedgerEntry>();
  for (const entry of entries.filter((item) => item.kind === 'check')) runs.set(String(entry.key), entry);
  for (const [key, last] of runs) if (last.exit !== 0 && current(last)) gaps.push(`${key}: last run: ${outputPointer(last)}`);

  // A pending entry and its recorded one share an id; the pending one would report a reviewer that never ran after it had.
  for (const entry of newestReviews(entries).values()) {
    if (!current(entry)) continue;
    const ran = entry.reviewerRan !== false;
    const omitted = omissionsOf(entry);
    const state = reviewState(entry);
    if (ran && state.failed) gaps.push('The independent review failed: the reviewer\'s answer could not be verified, so its result is not counted');
    else if (!ran) gaps.push('The independent review did not run');
    else if (state.partial) gaps.push(`The independent review was partial${omitted > 0 ? `: ${plural(omitted, 'omission')}` : ''}`);
  }

  for (const entry of of('acceptance', 'declined', 'default-taken')) {
    if (entry.kind === 'declined') gaps.push(`${shown(entry.gate)}: declined "${shown(entry.answer)}"${entry.reason === undefined ? '' : ` (${shown(entry.reason)})`}`);
    if (entry.kind === 'default-taken') gaps.push(`${shown(entry.gate)}: default taken, "${shown(entry.answer)}" (${shown(entry.via)})`);
    if (entry.gate === 'review-again' && entry.answer === 'skip') gaps.push('fix not re-reviewed');
    if (entry.kind === 'default-taken' && entry.gate === 'plan-unaccepted' && entry.answer === 'run on the draft') gaps.push('plan run without being accepted');
    if (entry.gate === 'checks-offer' && String(entry.answer).startsWith('skip') && isBoundAnswer(entry)) {
      const keys = list(entries.find((print) => print.id === entry.instance)?.['values'] && (entries.find((print) => print.id === entry.instance)!['values'] as { key?: unknown }).key);
      gaps.push(keys.length === 0 ? 'checks skipped — verification incomplete' : `checks skipped: ${keys.map(String).join(', ')} — verification incomplete`);
    }
  }
  gaps.push(...criticGaps(of('worker').findLast((worker) => worker.worker === 'plan-critic')));
  for (const entry of of('format')) if (entry.outcome !== 'formatted' && entry.outcome !== 'unconfigured') gaps.push(`not formatted: ${shown(entry.key)} (${shown(entry.outcome)})`);

  // stop-block is the Stop hook's own bookkeeping, not something left unverified.
  // A failed run on [service, test] then a pass on [service, repository, test] is no gap; a pass on other files or another key is.
  const proven = (limit: LedgerEntry): boolean => {
    const phase = String(limit.which).replace(/-unproven$/, '');
    if (phase === String(limit.which) || typeof limit.key !== 'string') return false;
    const failed = list(limit.files);
    for (const later of entries.slice(entries.indexOf(limit) + 1)) {
      // The end checks send a red key to fix and run it again in their own step: that pass repairs the failed run, a pass in any other step does not.
      if (later.kind === 'step' && later.step !== limit.step && !(limit.step === 'scope-checks' && later.step === 'fix')) return false;
      if (later.kind !== 'check' || later.phase !== phase || later.key !== limit.key || later.exit !== 0) continue;
      const covered = list(later.files);
      if (covered.length === 0 || failed.every((file) => covered.includes(file))) return true;
    }
    return false;
  };
  for (const entry of of('limit').filter((limit) => limit.which !== 'stop-block' && !proven(limit))) {
    gaps.push(limitGap(entry));
  }
  for (const entry of of('step').filter((step) => step.step === 'mr-fetch' && typeof step.commitsError === 'string')) gaps.push(`merge request commits not fetched: ${String(entry.commitsError)}`);
  for (const entry of of('step').filter((step) => step.step === 'mr-fetch' && typeof step.discussionsError === 'string')) gaps.push(`existing merge request discussions not fetched: ${String(entry.discussionsError)}`);
  for (const entry of of('step').filter((step) => step.recorded === true)) gaps.push(`${shown(entry.step)}: ${String(entry.message ?? '')}`);
  for (const entry of of('policy').filter((policy) => policy.stage === 'drafts' && Number(policy.errors) > 0)) gaps.push(`rules drafts: ${entry.errors} check errors`);
  const mrNamed = new Set(mrRequirements(entries));
  for (const entry of of('envelope')) for (const missing of list(entry.missingAsked)) gaps.push(mrNamed.has(String(missing)) ? `requirement ${shown(missing)} named by the MR was not fetched: no Jira or Confluence result was captured for it` : `Requirement not captured: ${shown(missing)}`);
  for (const entry of of('route')) if ((entry.args as { noReview?: boolean } | undefined)?.noReview === true) gaps.push('review skipped (--no-review)');
  for (const entry of of('route')) if (entry.mode === 'headless' && entry.channel === 'cli') gaps.push(`Route ${entry.id}: headless set by an untrusted start (channel cli)`);
  // A route that stopped short is a gap in itself; done, iterations-complete and interrupted (superseded by a new start) are not.
  for (const entry of of('exit').filter((exit) => !['done', 'iterations-complete', 'interrupted'].includes(String(exit.reason)))) gaps.push(`The route ended ${shown(entry.reason)}${typeof entry.detail === 'string' && entry.detail !== '' ? `: ${shown(entry.detail)}` : ''}`);
  return [...new Set(gaps)];
}

/** Each key's last result by outcome, and a formatter that was never configured, said once. */
export function checkFacts(entries: readonly LedgerEntry[]): string[] {
  const runs = new Map<string, LedgerEntry>();
  for (const entry of entries.filter((item) => item.kind === 'check')) runs.set(String(entry.key), entry);
  const lines = [...runs].map(([key, last]) => `${key}: ${last.exit === 0 ? 'passed' : `failed exit ${last.exit}`}`);
  if (entries.some((entry) => entry.kind === 'format' && entry.outcome === 'unconfigured')) lines.push('no formatter configured');
  return lines;
}

/** How the review ended: the first round's findings and what the ledger shows of the re-review; never a count of what was fixed. */
export function reviewFact(entries: readonly LedgerEntry[]): string | null {
  const recorded = [...newestReviews(entries).values()].filter((entry) => entry.stage === 'recorded' || entry.reviewerRan === true);
  const count = (n: number): string => `${n} finding${n === 1 ? '' : 's'}`;
  const bound = entries.filter((entry) => (entry.kind === 'acceptance' || entry.kind === 'default-taken') && isBoundAnswer(entry));
  const skip = (gate: string): LedgerEntry | undefined => bound.find((entry) => entry.gate === gate && (gate === 'review-again' ? entry.answer === 'skip' : String(entry.answer).startsWith('skip')));
  const by = (entry: LedgerEntry): string => (entry.kind === 'default-taken' ? 'by default (headless)' : 'by you');
  // A review the user skipped at the offer is no gap line; `--no-review` is listed by gapsOf, and a Review line alone would restate either.
  if (recorded.length === 0) return null;
  const first = Number(recorded[0]!.findings ?? 0);
  const last = recorded.at(-1)!;
  const left = Number(last.findings ?? 0);
  const state = reviewState(last);
  const open = left === 0 ? 'no findings' : `${left} open`;
  const omitted = omissionsOf(last);
  // A failed review returned no result, so its 0 findings say nothing; a partial one is only as clean as what it covered.
  const partial = `partial: ${open}${omitted > 0 ? `, ${plural(omitted, 'omission')}` : ''}`;
  const again = skip('review-again');
  if (recorded.length === 1 && first === 0 && (again === undefined || !state.failed)) return state.failed ? 'review failed' : state.partial ? `no findings, review partial${omitted > 0 ? `: ${plural(omitted, 'omission')}` : ''}` : 'no findings';
  const firstText = reviewState(recorded[0]!).failed ? 'review failed' : count(first);
  const outcome = again !== undefined ? `skipped ${by(again)}` : recorded.length === 1 ? 'not run' : state.failed ? 'failed' : state.partial ? partial : left === 0 ? 'clean' : `${left} open`;
  return `${firstText}, re-review ${outcome}`;
}

/** The Checks, Review and Not verified sections the final message copies; a section with nothing to say is left out. */
export function factsOf(entries: readonly LedgerEntry[], current?: (entry: LedgerEntry) => boolean, options: { checks: boolean } = { checks: true }): string {
  const checks = checkFacts(entries);
  const review = reviewFact(entries);
  const gaps = gapsOf(entries, current);
  const section = (title: string, lines: readonly string[]): string[] => (lines.length === 0 ? [] : [title, ...lines.map((line) => `- ${line}`)]);
  return [
    ...section('Checks', checks.length === 0 && options.checks ? ['no check ran'] : checks),
    ...section('Review', review === null ? [] : [review]),
    ...section('Not verified', gaps),
  ].join('\n');
}
