import type { GateDef, Qualified, When } from '../definition/routes.ts';
import type { RouteDef, StepDef } from '#types/harness';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Chain } from '#types/modules/evidence';
import { mrRequirements } from '#modules/requirements/capture/has-requirement';
import { buildChain, cycleEntries, exitOf, isBoundAnswer, isBoundKind, latestBound, liveHeads, text } from '#modules/evidence/ledger-chain';

export { buildChain, exitOf, isBoundAnswer, latestBound, liveHeads };

/** The latest `route` entry written by this session. */
export function latestRouteOf(all: readonly LedgerEntry[], session: string): LedgerEntry | null {
  return all.findLast((entry) => entry.kind === 'route' && entry.session === session) ?? null;
}

export const isGreen = (entry: LedgerEntry): boolean => entry['exit'] === 0;

/** `kind{value}` matches on the field that kind carries its qualifier in (01-contracts §1). */
export function matches(entry: LedgerEntry, qualified: Qualified): boolean {
  if (entry.kind !== qualified.kind) return false;
  if (qualified.value === null) return true;
  switch (qualified.kind) {
    case 'note': return entry['note'] === qualified.value;
    case 'policy': return entry['stage'] === qualified.value;
    // A green needs exit 0 and a red a failing exit: an unproven run keeps the step open until the check limit releases it.
    case 'check': return entry['phase'] === qualified.value && (entry['exit'] === 0) === (qualified.value === 'green');
    case 'requirement': return entry['capture'] === qualified.value;
    case 'review': return entry['stage'] === qualified.value;
    default: return true;
  }
}

/** Entries after the latest `revise` aimed at or before this step (03-F2). */
function windowStart(def: RouteDef, entries: readonly LedgerEntry[], stepIndex: number): number {
  const index = entries.findLastIndex((entry) => {
    if (entry.kind !== 'revise') return false;
    const target = def.steps.find((step) => step.id === entry['from']);
    return target !== undefined && target.index <= stepIndex;
  });
  return index + 1;
}

interface FoldContext { args: { iteration?: number | null; headless?: boolean; hasRequirement?: boolean; target?: { mr?: string | null } } }

const estimateAsks = (all: readonly LedgerEntry[]): boolean =>
  all.findLast((entry) => entry.kind === 'step' && entry['step'] === 'estimate-step' && entry['status'] === 'completed')?.['asks'] === true;

function evaluate(when: When, all: readonly LedgerEntry[], context: FoldContext, gateWindow: (gate: string) => readonly LedgerEntry[], opener: LedgerEntry | undefined, step: StepDef): boolean {
  switch (when.predicate) {
    case 'args.hasRequirement': return context.args.hasRequirement === true;
    case 'args.hasMergeRequest': return typeof context.args.target?.mr === 'string';
    case 'mr.requirements': return mrRequirements(all).length > 0;
    // The estimate step records whether a refusal needs the human; a route that never ran it asks nothing.
    case 'estimate.asks': return estimateAsks(all);
    case 'estimate.run': return !estimateAsks(all);
    case 'map.empty': {
      const map = all.findLast((entry) => entry.kind === 'map');
      return map !== undefined && map['candidates'] === 0;
    }
    // Only an interactive session is offered anything: a headless one has no one to answer and no review to run, so neither predicate holds for it.
    case 'iteration.named': return typeof context.args.iteration === 'number' && context.args.headless !== true;
    case 'iteration.unnamed': return typeof context.args.iteration !== 'number' && context.args.headless !== true;
    // Only a full key (no file form) is asked about; the scoped ones run unasked, so a project without one has nothing to offer.
    case 'checks.offer': return typeof context.args.iteration === 'number' && context.args.headless !== true && Number(all.findLast((entry) => entry.kind === 'baseline')?.['full']) > 0;
    // The end checks run without a question where one route covers every iteration, or a headless run named one (nothing else will).
    case 'checks.auto': return typeof context.args.iteration !== 'number' || context.args.headless === true;
    // The start step recorded whether a plan brief or an investigation exists, by the functions the context map reads them with.
    case 'task.seeded': return all.findLast((entry) => entry.kind === 'step' && entry['step'] === 'start')?.['seeded'] === true;
    case 'task.unseeded': return all.findLast((entry) => entry.kind === 'step' && entry['step'] === 'start')?.['seeded'] !== true;
    case 'revised': return opener?.kind === 'revise' && opener['from'] === step.id;
    case 'any': return when.of.some((part) => evaluate(part, all, context, gateWindow, opener, step));
    case 'gate.is': return latestBound(gateWindow(when.gate), when.gate)?.['answer'] === when.option;
    case 'gate.isnt': {
      const answer = latestBound(gateWindow(when.gate), when.gate)?.['answer'];
      return answer !== undefined && answer !== when.option;
    }
  }
}

const ownCompletion = (window: readonly LedgerEntry[], step: StepDef): boolean =>
  window.some((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'completed');

const limited = (window: readonly LedgerEntry[], step: StepDef): boolean =>
  window.some((entry) => entry.kind === 'limit' && entry['step'] === step.id && (entry['which'] === 'missing-produces'
    || (entry['which'] === 'check' && step.produces.some((produced) => produced.kind === 'check' && produced.value === entry['phase']))));

/** What a step must leave on record: a repository with no runnable check cannot produce a check. */
export const producesOf = (step: StepDef, entries: readonly LedgerEntry[]): StepDef['produces'] =>
  entries.some((entry) => entry.kind === 'baseline' && entry['runnable'] === 0) ? step.produces.filter((qualified) => qualified.kind !== 'check') : step.produces;

/** Done-ness per actor (03-F3). */
function isDone(step: StepDef, window: readonly LedgerEntry[], all: readonly LedgerEntry[]): boolean {
  const produced = (): boolean => producesOf(step, all).every((qualified) => window.some((entry) => matches(entry, qualified)));
  switch (step.actor) {
    case 'code': return ownCompletion(window, step) && produced();
    case 'model': return (producesOf(step, all).length > 0 ? produced() : ownCompletion(window, step)) || limited(window, step);
    case 'human': return latestBound(window, step.gate!.id) !== null || limited(window, step);
  }
}

interface StepState {
  step: StepDef;
  state: 'done' | 'pending' | 'skipped';
  windowStart: number;
  /** A step after the position whose `when` is false now: it stays pending, but a final step before it still closes the route. */
  skipsNow?: true;
}

interface Fold {
  chain: Chain;
  steps: StepState[];
  position: StepDef | null;
}

export function foldRoute(def: RouteDef, chain: Chain): Fold {
  const head = chain.head;
  const context: FoldContext = { args: (head['args'] ?? {}) as FoldContext['args'] };
  const steps: StepState[] = [];
  let position: StepDef | null = null;
  // A gate's answer is read in its own step's window: a revise to a later step does not unanswer it.
  const gateWindow = (gate: string): readonly LedgerEntry[] => {
    const owner = def.steps.find((step) => step.gate?.id === gate);
    return owner === undefined ? chain.entries : chain.entries.slice(windowStart(def, chain.entries, owner.index));
  };
  for (const step of def.steps) {
    const start = windowStart(def, chain.entries, step.index);
    const window = chain.entries.slice(start);
    let state: StepState['state'];
    const whenFalse = step.when !== null && !evaluate(step.when, chain.entries, context, gateWindow, chain.entries[start - 1], step);
    if (position !== null) state = 'pending';
    else if (whenFalse) state = 'skipped';
    else if (isDone(step, window, chain.entries)) state = 'done';
    else {
      state = 'pending';
      position = step;
    }
    steps.push({ step, state, windowStart: start, ...(position !== null && state === 'pending' && whenFalse ? { skipsNow: true as const } : {}) });
  }
  return { chain, steps, position };
}

export const windowOf = (fold: Fold, step: StepDef): LedgerEntry[] => fold.chain.entries.slice(fold.steps[step.index]!.windowStart);

/** Executions of a step in this cycle: completions of a code step, deliveries of a model step. */
export function executions(entries: readonly LedgerEntry[], step: StepDef): number {
  const status = step.actor === 'code' ? 'completed' : 'delivered';
  return cycleEntries(entries).filter((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === status).length;
}

export const humanRevisesLeft = (entries: readonly LedgerEntry[], gate: GateDef): number =>
  Math.max(0, gate.repeat - entries.filter((entry) => entry.kind === 'revise' && entry['via'] === 'gate' && entry['gate'] === gate.id).length);

export const printsOf = (window: readonly LedgerEntry[], gate: string): LedgerEntry[] => window.filter((entry) => entry.kind === 'gate' && entry['gate'] === gate);

/** The first preanswer for this gate that no answer names yet; preanswers are read outside windows (03-G3). */
export function unconsumedPreanswer(entries: readonly LedgerEntry[], gate: string): LedgerEntry | null {
  const consumed = new Set(entries.filter((entry) => isBoundKind(entry)).map((entry) => text(entry, 'preanswer')).filter((id): id is string => id !== null));
  return entries.find((entry) => entry.kind === 'preanswer' && entry['gate'] === gate && !consumed.has(entry.id)) ?? null;
}

/**
 * Whether an entry still stands (D10): it is in the chain and no later `revise` targets a step at or before the
 * step it is attributed to, the step of the latest `step` entry before it.
 */
export function currentIn(def: RouteDef, chain: Chain): (entry: LedgerEntry) => boolean {
  const where = new Map<string, { position: number; step: number }>();
  const revises: { position: number; step: number }[] = [];
  let attributed = 0;
  chain.entries.forEach((entry, position) => {
    if (entry.kind === 'step') attributed = def.steps.find((step) => step.id === entry['step'])?.index ?? attributed;
    if (entry.kind === 'revise') revises.push({ position, step: def.steps.find((step) => step.id === entry['from'])?.index ?? Number.MAX_SAFE_INTEGER });
    where.set(entry.id, { position, step: attributed });
  });
  return (entry) => {
    const at = where.get(entry.id);
    return at !== undefined && !revises.some((revise) => revise.position > at.position && revise.step <= at.step);
  };
}

/** The gate's latest print, or the answered instance, that no human answer has bound yet. */
function openPrint(entries: readonly LedgerEntry[], gate: string, instance: string | undefined): boolean {
  const print = entries.findLast((entry) => entry.kind === 'gate' && entry['gate'] === gate && (instance === undefined || entry.id === instance));
  if (print === undefined) return false;
  return !entries.slice(entries.indexOf(print) + 1).some((entry) => (entry.kind === 'acceptance' || entry.kind === 'declined') && entry['gate'] === gate);
}

/** The delegated step whose subagent is in flight on this chain: its launch is the chain's latest step entry and the route has asked no question of its own since. */
export function delegatedStepOf(def: RouteDef, chain: Chain): StepDef | null {
  const at = chain.entries.findLastIndex((entry) => entry.kind === 'step');
  const step = def.steps.find((candidate) => candidate.id === chain.entries[at]?.['step'] && candidate.work !== null) ?? null;
  if (step === null || foldRoute(def, chain).position === step) return step;
  // A recorded green puts the fold past the step before the hook advances it, so the fold cannot say; a gate the route printed and nobody answered can.
  return chain.entries.slice(at).some((entry) => entry.kind === 'gate' && openPrint(chain.entries, String(entry['gate']), entry.id)) ? null : step;
}
