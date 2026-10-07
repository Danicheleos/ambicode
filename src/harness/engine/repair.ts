import { exitRoute, reviseTo, stopReason } from '../gates/answers.ts';
import { exitOf } from './fold.ts';
import { append, chainOf, gateFor } from './run-context.ts';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Run } from '../types/engine.ts';

const ANSWERS = ['acceptance', 'default-taken'];
const BOUNDARY = ['gate', 'acceptance', 'default-taken', 'declined'];

/** Entries written after `index` that belong to it: up to the next entry of the same gate, or the next failure of the same step. */
function after(entries: readonly LedgerEntry[], index: number, stops: (entry: LedgerEntry) => boolean): LedgerEntry[] {
  const rest = entries.slice(index + 1);
  const end = rest.findIndex(stops);
  return end < 0 ? rest : rest.slice(0, end);
}

const effective = (entry: LedgerEntry, targets: readonly string[], gate?: string): boolean =>
  entry.kind === 'exit' || (entry.kind === 'revise' && targets.includes(String(entry['from']))) || (entry.kind === 'limit' && (entry['which'] === 'repeat' || entry['which'] === 'max-revises') && (targets.includes(String(entry['step'])) || (gate !== undefined && entry['gate'] === gate)));

/** R1: a recorded answer whose `onAnswer` revise or stop exit was never written. */
async function repairAnswers(run: Run): Promise<void> {
  const entries = [...chainOf(run).entries];
  for (const [index, entry] of entries.entries()) {
    if (run.exited !== null) return;
    if (!ANSWERS.includes(entry.kind) || entry['unbound'] === true) continue;
    const gateId = String(entry['gate']);
    const print = entries.find((candidate) => candidate.id === entry['instance']) ?? null;
    const gate = gateFor(run, gateId, print);
    if (gate === null) continue;
    const answer = String(entry['answer']);
    const source = `repair:R1:${entry.id}`;
    const owned = after(entries, index, (next) => BOUNDARY.includes(next.kind) && next['gate'] === gateId);
    const stops = answer === 'stop' || answer === 'pause';
    const revise = entry.kind === 'default-taken' || stops ? undefined : (gate.onAnswer[answer] ?? (gate.options.includes(answer) ? undefined : gate.onAnswer['*']));
    if (!stops && revise === undefined) continue;
    const target = revise === undefined ? [] : [revise.target];
    if (owned.some((candidate) => candidate.kind === 'exit' || (!stops && (effective(candidate, target, gateId) || (candidate.kind === 'revise' && candidate['gate'] === gateId))))) continue;
    if (stops) {
      await exitRoute(run, stopReason(gateId), `${gateId}: stop`, { source });
      continue;
    }
    const raisedBy = print?.['raisedBy'] === undefined ? undefined : String(print['raisedBy']);
    const via = entry['via'] === 'hook' || (entry['via'] === 'prompt' && entry['trusted'] === true) ? 'gate' : entry.kind === 'default-taken' ? 'code' : 'model';
    await reviseTo(run, revise!, via, { reason: `${gateId}: ${answer}`, gate: gateId, answer, maxRevises: gate.maxRevises, source, ...(raisedBy === undefined ? {} : { raisedBy }) });
  }
}

/** R2: a failed step with an `onFail` whose completion or revise was never written. */
async function repairFailures(run: Run): Promise<void> {
  const entries = [...chainOf(run).entries];
  for (const [index, entry] of entries.entries()) {
    if (run.exited !== null) return;
    if (entry.kind !== 'step' || entry['status'] !== 'failed') continue;
    const step = run.def.steps.find((candidate) => candidate.id === entry['step']);
    if (step === undefined || step.onFail === null) continue;
    const owned = after(entries, index, (next) => next.kind === 'step' && next['step'] === step.id && next['status'] === 'failed');
    const source = `repair:R2:${entry.id}`;
    if (!owned.some((candidate) => candidate.kind === 'step' && candidate['status'] === 'completed' && candidate['failed'] === true)) {
      await append(run, { kind: 'step', step: step.id, actor: 'code', status: 'completed', cause: run.cause, failed: true, source });
    }
    if (owned.some((candidate) => effective(candidate, [step.onFail!.target]))) continue;
    if (owned.some((candidate) => candidate.kind === 'step' && candidate['step'] === step.id && candidate['status'] === 'completed' && candidate['failed'] !== true)) continue;
    const args = typeof entry['revise'] === 'object' && entry['revise'] !== null ? (entry['revise'] as Record<string, readonly string[]>) : step.onFail.args;
    await reviseTo(run, { target: step.onFail.target, args }, 'code', { reason: `${step.id}: ${String(entry['code'])}`, raisedBy: step.id, source });
  }
}

/** R3: a handler exit recorded on the completed step but never written as an exit. */
async function repairExits(run: Run): Promise<void> {
  const entries = chainOf(run).entries;
  for (const [index, entry] of entries.entries()) {
    if (run.exited !== null) return;
    if (entry.kind !== 'step' || entry['status'] !== 'completed' || typeof entry['exit'] !== 'string') continue;
    if (entries.slice(index + 1).some((next) => next.kind === 'exit')) continue;
    await exitRoute(run, entry['exit'], undefined, { source: `repair:R3:${entry.id}` });
  }
}

/** Completes what a crash between two appends left half written; each repair is marked by `source` and never repeats. */
export async function repairEffects(run: Run): Promise<void> {
  if (exitOf(chainOf(run)) !== null) return;
  await repairAnswers(run);
  await repairFailures(run);
  await repairExits(run);
}
