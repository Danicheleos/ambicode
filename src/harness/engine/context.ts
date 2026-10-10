import { AmbicodeError } from '#util/errors';
import { readLedgerStrict } from '#platform/ledger/ledger';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { evaluateConsent } from '../gates/consent.ts';
import { raiseGate } from '../gates/gates.ts';
import { buildChain, exitOf, foldRoute, latestRouteOf, matches, windowOf } from './fold.ts';
import { ownerOf, OWNING_SKILLS } from '#modules/evidence/ownership';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { RouteDef, RouteRegistry, RouteView, StartChannel, CommandContext } from '#types/harness';
import { refOf } from '#modules/evidence/ledger-chain';
import type { Chain, ConsentBinding } from '../types/engine.ts';

export const ledgerUnreadable = (task: string, reason: string): AmbicodeError =>
  new AmbicodeError('ledger-unreadable', `The ledger of task ${task} cannot be read: ${reason}. Nothing was written.`, {
    details: [`Continue under a new task: route start --task ${task}-2.`],
  });

export async function readEntries(runtime: Runtime, task: string): Promise<LedgerEntry[]> {
  const dir = await resolveTaskDir(runtime, task);
  const read = await readLedgerStrict(runtime.fs, dir.root);
  if (read.state === 'unreadable') throw ledgerUnreadable(task, read.reason);
  return read.state === 'ok' ? read.entries : [];
}

function viewOf(task: string, def: RouteDef, chain: Chain): RouteView {
  const head = chain.head;
  const fold = foldRoute(def, chain);
  return {
    task,
    routeId: head.id,
    chainIds: [...chain.ids],
    skill: String(head['skill']),
    session: String(head['session']),
    mode: head['mode'] === 'headless' ? 'headless' : 'interactive',
    channel: head['channel'] as StartChannel,
    trusted: head['trusted'] === true,
    position: fold.position?.id ?? 'complete',
  };
}

/** Throws unless this view may write: the plan route's one live owner passes, a taken-over or foreign session does not (03-O5). */
export function checkOwner(entries: readonly LedgerEntry[], view: RouteView): void {
  if (!OWNING_SKILLS.has(view.skill)) return;
  const owner = ownerOf(entries, view.task);
  if (owner.state === 'unknown') throw ledgerUnreadable(view.task, owner.reason);
  if (owner.state === 'none' || owner.session === view.session) return;
  if (owner.takenOver.includes(view.session)) {
    throw new AmbicodeError('route-taken-over', `The plan route of task ${view.task} now belongs to session ${owner.session}; this session no longer writes its files.`, {
      details: ['Taking it back (--adopt) or continuing under another --task is the user\'s decision.'],
    });
  }
  throw new AmbicodeError('route-busy', `Task ${view.task} has a live plan route owned by session ${owner.session} (route ${owner.routeId}).`, {
    details: ['Adopt it (--adopt), restart it (--fresh) or continue under another task: --task <slug>-2.'],
  });
}

/** The session's route when it has not ended; a finished route owns nothing and tags no later entry. */
export async function openRouteView(runtime: Runtime, routes: RouteRegistry, task: string, session: string): Promise<RouteView | null> {
  const entries = await readEntries(runtime, task);
  const head = latestRouteOf(entries, session);
  const def = head === null ? null : routes.route(String(head['skill']));
  if (head === null || def === null) return null;
  const chain = buildChain(entries, head);
  return exitOf(chain) === null ? viewOf(task, def, chain) : null;
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
    async resolve(task, session) {
      const entries = await readEntries(runtime, task);
      const head = latestRouteOf(entries, session);
      const def = head === null ? null : routes.route(String(head['skill']));
      return head === null || def === null ? null : viewOf(task, def, buildChain(entries, head));
    },
    open: (task, session) => openRouteView(runtime, routes, task, session),
    entries: (task) => readEntries(runtime, task),
    raise: (ledger, view, input) => raiseGate(ledger, view, input, routes),
    async assertOwner(view) {
      checkOwner(await readEntries(runtime, view.task), view);
    },
    async window(view, stepId) {
      const { def, chain } = await loaded(view);
      return windowOf(foldRoute(def, chain), stepOf(def, stepId));
    },
    async object(view, gateId) {
      const { def, chain } = await loaded(view);
      const step = def.steps.find((candidate) => candidate.gate?.id === gateId);
      const object = step?.gate?.object;
      if (step === undefined || object === null || object === undefined) return null;
      const fold = foldRoute(def, chain);
      const producer = def.steps.slice(0, step.index).find((earlier) => earlier.produces.some((produced) => produced.kind === object.kind && (object.value === null || produced.value === object.value)));
      if (producer === undefined) return null;
      const entry = windowOf(fold, producer).findLast((candidate) => matches(candidate, object));
      return entry === undefined ? null : refOf(entry, object.kind, object.value);
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
