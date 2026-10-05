import type { LedgerEntry } from '../task/ledger.ts';
import type { GateDef, Qualified, RouteDef, StepDef, When } from './routes.ts';

type Entry = LedgerEntry;

const text = (entry: Entry, field: string): string | null => (typeof entry[field] === 'string' ? (entry[field] as string) : null);
const isBoundKind = (entry: Entry): boolean => entry.kind === 'acceptance' || entry.kind === 'declined' || entry.kind === 'default-taken';

/** Entries of the route a session resolved plus the routes it resumes, in file order and from any session (03-F1). */
export interface Chain {
  head: Entry;
  ids: ReadonlySet<string>;
  entries: Entry[];
}

export function buildChain(all: readonly Entry[], head: Entry): Chain {
  const routes = new Map(all.filter((entry) => entry.kind === 'route').map((entry) => [entry.id, entry]));
  const ids = new Set<string>([head.id]);
  for (let current: Entry | undefined = head; current !== undefined; ) {
    const next = text(current, 'resumes');
    if (next === null || ids.has(next)) break;
    ids.add(next);
    current = routes.get(next);
  }
  const member = (entry: Entry): boolean => (entry.kind === 'route' ? ids.has(entry.id) : ids.has(text(entry, 'route') ?? ''));
  return { head, ids, entries: all.filter(member) };
}

/** Heads of the chains no exit has closed: routes nothing resumes. */
export function liveHeads(entries: readonly Entry[]): Entry[] {
  const resumed = new Set(entries.filter((entry) => entry.kind === 'route' && typeof entry['resumes'] === 'string').map((entry) => entry['resumes'] as string));
  return entries.filter((entry) => entry.kind === 'route' && !resumed.has(entry.id)).filter((head) => exitOf(buildChain(entries, head)) === null);
}

/** The latest `route` entry written by this session. */
export function latestRouteOf(all: readonly Entry[], session: string): Entry | null {
  return all.findLast((entry) => entry.kind === 'route' && entry.session === session) ?? null;
}

export function exitOf(chain: Chain): Entry | null {
  return chain.entries.findLast((entry) => entry.kind === 'exit') ?? null;
}

export const isGreen = (entry: Entry): boolean => {
  const summary = entry['summary'] as { ran?: number; failed?: number } | null | undefined;
  return entry['exit'] === 0 && summary != null && (summary.ran ?? 0) >= 1 && summary.failed === 0;
};

/** `kind{value}` matches on the field that kind carries its qualifier in (01-contracts §1). */
export function matches(entry: Entry, qualified: Qualified): boolean {
  if (entry.kind !== qualified.kind) return false;
  if (qualified.value === null) return true;
  switch (qualified.kind) {
    case 'note': return entry['note'] === qualified.value;
    case 'policy': return entry['stage'] === qualified.value;
    case 'check': return isGreen(entry);
    case 'requirement': return entry['capture'] === qualified.value;
    default: return true;
  }
}

/** A bound answer: not an unbound hook answer and not a decline that was never an answer (03-G5). */
export function isBoundAnswer(entry: Entry): boolean {
  if (!isBoundKind(entry) || entry['unbound'] === true) return false;
  return !(entry.kind === 'declined' && (entry['reason'] === 'acting-needs-human' || entry['reason'] === 'option-not-offered'));
}

export function latestBound(window: readonly Entry[], gate: string): Entry | null {
  return window.findLast((entry) => isBoundAnswer(entry) && entry['gate'] === gate) ?? null;
}

/** Entries after the latest `revise` aimed at or before this step (03-F2). */
export function windowStart(def: RouteDef, entries: readonly Entry[], stepIndex: number): number {
  const index = entries.findLastIndex((entry) => {
    if (entry.kind !== 'revise') return false;
    const target = def.steps.find((step) => step.id === entry['from']);
    return target !== undefined && target.index <= stepIndex;
  });
  return index + 1;
}

export interface FoldContext { mode: 'interactive' | 'headless'; args: { hasRequirement?: boolean; fromDraft?: string | null } }

function evaluate(when: When, window: readonly Entry[], all: readonly Entry[], context: FoldContext): boolean {
  switch (when.predicate) {
    case 'args.hasRequirement': return context.args.hasRequirement === true;
    case '!args.hasRequirement': return context.args.hasRequirement !== true;
    case 'map.empty': {
      const map = all.findLast((entry) => entry.kind === 'map');
      return map !== undefined && map['candidates'] === 0;
    }
    case 'plan.isDraft': return context.args.fromDraft != null;
    case 'headless': return context.mode === 'headless';
    case 'interactive': return context.mode === 'interactive';
    case 'index.present': return false;
    case 'gate.answered': return latestBound(window, when.gate) !== null;
    case 'gate.is': return latestBound(window, when.gate)?.['answer'] === when.option;
  }
}

export const ownCompletion = (window: readonly Entry[], step: StepDef): boolean =>
  window.some((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === 'completed');

const limited = (window: readonly Entry[], step: StepDef): boolean =>
  window.some((entry) => entry.kind === 'limit' && entry['step'] === step.id && (entry['which'] === 'missing-produces' || entry['which'] === 'identical-next'));

/** Done-ness per actor (03-F3). */
export function isDone(step: StepDef, window: readonly Entry[]): boolean {
  const produced = (): boolean => step.produces.every((qualified) => window.some((entry) => matches(entry, qualified)));
  switch (step.actor) {
    case 'code': return ownCompletion(window, step) && produced();
    case 'model': return (step.produces.length > 0 ? produced() : ownCompletion(window, step)) || limited(window, step);
    case 'human': return latestBound(window, step.gate!.id) !== null || limited(window, step);
    case 'worker': return window.some((entry) => entry.kind === 'worker');
  }
}

export interface StepState {
  step: StepDef;
  state: 'done' | 'pending' | 'skipped';
  windowStart: number;
}

export interface Fold {
  chain: Chain;
  steps: StepState[];
  position: StepDef | null;
}

export function foldRoute(def: RouteDef, chain: Chain): Fold {
  const head = chain.head;
  const context: FoldContext = { mode: head['mode'] === 'headless' ? 'headless' : 'interactive', args: (head['args'] ?? {}) as FoldContext['args'] };
  const steps: StepState[] = [];
  let position: StepDef | null = null;
  for (const step of def.steps) {
    const start = windowStart(def, chain.entries, step.index);
    const window = chain.entries.slice(start);
    let state: StepState['state'];
    if (position !== null) state = 'pending';
    else if (step.when !== null && !evaluate(step.when, window, chain.entries, context)) state = 'skipped';
    else if (isDone(step, window)) state = 'done';
    else {
      state = 'pending';
      position = step;
    }
    steps.push({ step, state, windowStart: start });
  }
  return { chain, steps, position };
}

export const windowOf = (fold: Fold, step: StepDef): Entry[] => fold.chain.entries.slice(fold.steps[step.index]!.windowStart);

/** Entries after the latest human revise: the current cycle (03-F6). */
export function cycleEntries(entries: readonly Entry[]): Entry[] {
  return entries.slice(entries.findLastIndex((entry) => entry.kind === 'revise' && entry['via'] === 'gate') + 1);
}

/** Executions of a step in this cycle: completions of a code step, deliveries of a model step. */
export function executions(entries: readonly Entry[], step: StepDef): number {
  const status = step.actor === 'code' ? 'completed' : 'delivered';
  return cycleEntries(entries).filter((entry) => entry.kind === 'step' && entry['step'] === step.id && entry['status'] === status).length;
}

export const humanRevisesLeft = (entries: readonly Entry[], gate: GateDef): number =>
  Math.max(0, gate.maxRevises - entries.filter((entry) => entry.kind === 'revise' && entry['via'] === 'gate' && entry['gate'] === gate.id).length);

export const printsOf = (window: readonly Entry[], gate: string): Entry[] => window.filter((entry) => entry.kind === 'gate' && entry['gate'] === gate);

/** Entries the hook wrote for this gate, unbound included; prints never count (03-G7). */
export const askedCount = (window: readonly Entry[], gate: string): number =>
  window.filter((entry) => (entry.kind === 'acceptance' || entry.kind === 'declined') && entry['via'] === 'hook' && entry['gate'] === gate).length;

/** The first preanswer for this gate that no answer names yet; preanswers are read outside windows (03-G3). */
export function unconsumedPreanswer(entries: readonly Entry[], gate: string): Entry | null {
  const consumed = new Set(entries.filter((entry) => isBoundKind(entry)).map((entry) => text(entry, 'preanswer')).filter((id): id is string => id !== null));
  return entries.find((entry) => entry.kind === 'preanswer' && entry['gate'] === gate && !consumed.has(entry.id)) ?? null;
}

export const reviseCount = (entries: readonly Entry[]): number => entries.filter((entry) => entry.kind === 'revise').length;

export function modelDeliveries(def: RouteDef, entries: readonly Entry[]): number {
  const models = new Set(def.steps.filter((step) => step.actor === 'model').map((step) => step.id));
  return entries.filter((entry) => entry.kind === 'step' && entry['status'] === 'delivered' && models.has(String(entry['step']))).length;
}

/**
 * Whether an entry still stands (D10): it is in the chain and no later `revise` targets a step at or before the
 * step it is attributed to, the step of the latest `step` entry before it.
 */
export function currentIn(def: RouteDef, chain: Chain): (entry: Entry) => boolean {
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
