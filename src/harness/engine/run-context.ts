import path from 'node:path';
import { refOf } from '#modules/evidence/ledger-chain';
import { renderSummary } from '#modules/evidence/report/summary';
import { buildChain, foldRoute, matches, windowOf } from './fold.ts';
import { instantiateGate, settleOpenPrints } from '../gates/gates.ts';
import type { GateDef } from '../definition/routes.ts';
import type { ArtifactRef, LedgerEntry, LockedLedger, TaskDir } from '#types/modules/evidence';
import type { Runtime } from '#types/composition';
import type { RouteRegistry, RouteView, StepDef } from '#types/harness';
import type { Chain, Run } from '../types/engine.ts';

export const chainOf = (run: Run): Chain => buildChain(run.entries, run.head);

/** The run's ledger tracks what it writes: the shared entry list and the run's written ids. */
export const append = (run: Run, entry: { kind: string; [field: string]: unknown }): Promise<LedgerEntry> => run.ledger.append(entry);

/** The one place summary.md is rendered; every writer of the ledger that changes what it shows calls it last. */
export async function writeSummary(runtime: Runtime, dir: TaskDir, ledger: LockedLedger): Promise<void> {
  const read = await ledger.read();
  if (read.state !== 'ok') return;
  const summary = await renderSummary(dir.slug, read.entries, (file) => runtime.fs.readText(path.join(dir.repositoryRoot, file)).catch(() => null));
  await runtime.fs.writeText(path.join(dir.root, 'summary.md'), summary);
}

/** Every route exit is written here: the exit entry, then the route's scratch files are removed and the task summary is rewritten. */
export async function closeRoute(runtime: Runtime, routes: RouteRegistry, dir: TaskDir, ledger: LockedLedger, exit: { route: string; reason: string; detail?: string; [field: string]: unknown }): Promise<void> {
  await settleOpenPrints(ledger, routes, exit.route);
  await ledger.append({ kind: 'exit', ...exit });
  await runtime.fs.remove(dir.steps);
  await writeSummary(runtime, dir, ledger);
}

export function routeView(task: string, chain: Chain, position: string): RouteView {
  const head = chain.head;
  return {
    task,
    routeId: head.id,
    chainIds: [...chain.ids],
    skill: String(head['skill']),
    session: String(head['session']),
    mode: head['mode'] === 'headless' ? 'headless' : 'interactive',
    channel: head['channel'] as RouteView['channel'],
    trusted: head['trusted'] === true,
    position,
  };
}

export const viewFor = (run: Run, position: string): RouteView => routeView(run.task, chainOf(run), position);

/** A route's own gate, or a registry gate instantiated from the values its print recorded. */
export function gateFor(run: Run, gateId: string, print?: LedgerEntry | null): GateDef | null {
  const declared = run.def.steps.find((step) => step.gate?.id === gateId)?.gate;
  if (declared !== undefined && declared !== null) return declared;
  const registry = run.routes.gate(gateId);
  if (registry === null) return null;
  const values = (print?.['values'] ?? {}) as Record<string, string[]>;
  return instantiateGate(registry, { skill: String(run.head['skill']), values }, gateId);
}

export const latestPrint = (entries: readonly LedgerEntry[], gateId: string): LedgerEntry | null =>
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
