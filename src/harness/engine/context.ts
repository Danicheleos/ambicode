import { AmbicodeError } from '#util/errors';
import { readLedgerStrict } from '#platform/ledger/ledger';
import { taskExists, taskUnknown } from '#platform/ledger/task-unknown';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { evaluateConsent } from '../gates/consent.ts';
import { raiseGate } from '../gates/gates.ts';
import { routeView } from './run-context.ts';
import { buildChain, exitOf, foldRoute, latestRouteOf, windowOf } from './fold.ts';
import type { Runtime } from '#types/composition';
import type { LedgerEntry, StrictRead } from '#types/modules/evidence';
import type { RouteDef, RouteRegistry, RouteView, CommandContext } from '#types/harness';
import type { Chain, ConsentBinding } from '../types/engine.ts';

const ledgerUnreadable = (task: string, reason: string): AmbicodeError =>
  new AmbicodeError('ledger-unreadable', `The ledger of task ${task} cannot be read: ${reason}. Nothing was written.`, {
    details: [`Repair or delete that ledger.jsonl, then run again with --task ${task}.`],
  });

export function entriesOf(task: string, read: StrictRead): LedgerEntry[] {
  if (read.state === 'unreadable') throw ledgerUnreadable(task, read.reason);
  return read.state === 'ok' ? read.entries : [];
}

export async function readEntries(runtime: Runtime, task: string): Promise<LedgerEntry[]> {
  const dir = await resolveTaskDir(runtime, task);
  if (!(await taskExists(runtime.fs, dir.root))) throw await taskUnknown(runtime.fs, dir.root);
  return entriesOf(task, await readLedgerStrict(runtime.fs, dir.root));
}

export const routeNotOpen = (task: string): AmbicodeError =>
  new AmbicodeError('route-not-open', `Task ${task} has no live route.`, { details: [`Start one: route start <skill> --task ${task}`] });

/** The session's route when it has not ended; a finished route owns nothing and tags no later entry. */
export async function openRouteView(runtime: Runtime, routes: RouteRegistry, task: string, session: string): Promise<RouteView | null> {
  const entries = await readEntries(runtime, task);
  const head = latestRouteOf(entries, session);
  const def = head === null ? null : routes.route(String(head['skill']));
  if (head === null || def === null) return null;
  const chain = buildChain(entries, head);
  return exitOf(chain) === null ? routeView(task, chain, foldRoute(def, chain).position?.id ?? 'complete') : null;
}

export function commandContext(deps: { runtime: Runtime; routes: RouteRegistry }): CommandContext {
  const { runtime, routes } = deps;
  const loaded = async (view: RouteView): Promise<{ entries: LedgerEntry[]; def: RouteDef; chain: Chain }> => {
    const entries = await readEntries(runtime, view.task);
    const head = entries.find((entry) => entry.id === view.routeId);
    const def = routes.route(view.skill);
    if (head === undefined || def === null) throw new AmbicodeError('route-not-open', `Route ${view.routeId} is not on record for task ${view.task}.`);
    return { entries, def, chain: buildChain(entries, head) };
  };
  const stepOf = (def: RouteDef, id: string) => {
    const step = def.steps.find((candidate) => candidate.id === id);
    if (step === undefined) throw new AmbicodeError('internal', `Route ${def.skill} has no step "${id}".`);
    return step;
  };
  return {
    open: (task, session) => openRouteView(runtime, routes, task, session),
    entries: (task) => readEntries(runtime, task),
    raise: (ledger, view, input) => raiseGate(ledger, view, input, routes),
    async window(view, stepId) {
      const { def, chain } = await loaded(view);
      return windowOf(foldRoute(def, chain), stepOf(def, stepId));
    },
    async consent(view, gateId, binding) {
      const { def, chain } = await loaded(view);
      const step = def.steps.find((candidate) => candidate.gate?.id === gateId);
      const gate = step?.gate ?? routes.gate(gateId);
      const window = step === undefined ? chain.entries : windowOf(foldRoute(def, chain), step);
      return evaluateConsent({ window, chain: chain.entries, gate: gateId, acting: gate?.acting ?? [], binding: binding as ConsentBinding | undefined });
    },
  };
}
