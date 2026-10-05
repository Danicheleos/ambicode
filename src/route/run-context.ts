import type { Runtime } from '../composition/root.ts';
import type { ArtifactRef } from '../task/kinds.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import type { LockedLedger } from '../task/ledger-lock.ts';
import type { TaskDir } from '../task/task-dir.ts';
import type { RouteView } from './context.ts';
import { refOf } from './context.ts';
import type { DeliveryChannel } from './delivery.ts';
import { buildChain, foldRoute, matches, windowOf, type Chain } from './fold.ts';
import { instantiateGate } from './gates.ts';
import type { GateDef, RouteDef, RouteRegistry, StepDef } from './routes.ts';

type Entry = LedgerEntry;

/** Everything one advance works on. The ledger lock is held for the whole run (03-O6). */
export interface Run {
  runtime: Runtime;
  routes: RouteRegistry;
  def: RouteDef;
  task: string;
  dir: TaskDir;
  ledger: LockedLedger;
  entries: Entry[];
  head: Entry;
  session: string;
  /** The Claude session whose hook state (pointer, delivery markers) this route writes: its harness session, else its owner. */
  stateKey: string;
  cause: string;
  channel: DeliveryChannel;
  scratchpadDir: string | undefined;
  /** Same-session reprint and re-injection: fold and deliver, run and count nothing (03-E2). */
  deliverOnly: boolean;
  written: string[];
  notes: string[];
  exited: string | null;
}

export const chainOf = (run: Run): Chain => buildChain(run.entries, run.head);

/** The run's ledger tracks what it writes: the shared entry list and the run's written ids. */
export const append = (run: Run, entry: { kind: string; [field: string]: unknown }): Promise<Entry> => run.ledger.append(entry);

export function viewFor(run: Run, position: string | 'complete'): RouteView {
  const head = run.head;
  return {
    task: run.task,
    routeId: head.id,
    chainIds: [...chainOf(run).ids],
    skill: String(head['skill']),
    session: run.session,
    mode: head['mode'] === 'headless' ? 'headless' : 'interactive',
    channel: head['channel'] as RouteView['channel'],
    trusted: head['trusted'] === true,
    position,
  };
}

/** A route's own gate, or a registry gate instantiated from the values its print recorded. */
export function gateFor(run: Run, gateId: string, print?: Entry | null): GateDef | null {
  const declared = run.def.steps.find((step) => step.gate?.id === gateId)?.gate;
  if (declared !== undefined && declared !== null) return declared;
  const registry = run.routes.gate(gateId);
  if (registry === null) return null;
  const values = (print?.['values'] ?? {}) as Record<string, string[]>;
  return instantiateGate(registry, { skill: String(run.head['skill']), values }, gateId);
}

export const latestPrint = (entries: readonly Entry[], gateId: string): Entry | null =>
  entries.findLast((entry) => entry.kind === 'gate' && entry['gate'] === gateId) ?? null;

/** The object a gate asks about: the latest matching entry in the window of the step that produces it (03-G10). */
export function objectOf(run: Run, step: StepDef): ArtifactRef | null {
  const object = step.gate?.object;
  if (object === null || object === undefined) return null;
  const producer = run.def.steps.slice(0, step.index).find((earlier) => earlier.produces.some((produced) => produced.kind === object.kind && (object.value === null || produced.value === object.value)));
  if (producer === undefined) return null;
  const fold = foldRoute(run.def, chainOf(run));
  const entry = windowOf(fold, producer).findLast((candidate) => matches(candidate, object));
  return entry === undefined ? null : refOf(entry, object.kind, object.value);
}
