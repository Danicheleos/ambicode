import type { LedgerEntry } from '#types/evidence';
import type { PlanOwnership } from '#types/harness';

// No runtime imports: the guard bundles this predicate and its startup time is the point (see hook/guard/guard.ts).

/** Skills whose route owns a model-writable file (`steps/plan-body.md` and the plan drafts, task-wide). */
export const OWNING_SKILLS: ReadonlySet<string> = new Set(['plan']);

interface Chain {
  ids: string[];
  sessions: string[];
  head: string;
  session: string;
  closed: string | null;
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value !== '';

/**
 * Who owns the task's live plan route (12 §2.3, H2): the session of the latest `route` entry of the one chain with
 * no `exit`. An adoption extends the chain with `resumes`; age and idle time never end it. Anything that could hide a
 * takeover — a route or exit missing a field ownership is read from, a dangling `resumes`, an exit bound to no
 * route, a repeated id, two live chains — is `unknown`, never a guess, so every caller fails closed. Other kinds
 * are skipped. `entries` are one task ledger's, in file order.
 */
export function ownerOf(entries: readonly LedgerEntry[], slug: string): PlanOwnership {
  const unknown = (reason: string): PlanOwnership => ({ task: slug, state: 'unknown', reason });
  const routes = new Set<string>();
  const chainOf = new Map<string, Chain>();
  const chains: Chain[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!nonEmpty(entry.id)) return unknown('a ledger entry has no id');
    if (seen.has(entry.id)) return unknown(`ledger id ${entry.id} appears twice`);
    seen.add(entry.id);
    if (entry.kind === 'route') {
      if (!nonEmpty(entry.skill)) return unknown(`route ${entry.id} names no skill`);
      if (entry.session !== undefined && !nonEmpty(entry.session)) return unknown(`route ${entry.id} has a malformed session`);
      if (entry.resumes !== undefined && !nonEmpty(entry.resumes)) return unknown(`route ${entry.id} has a malformed resumes`);
      if (entry.adopts !== undefined && typeof entry.adopts !== 'boolean') return unknown(`route ${entry.id} has a malformed adopts`);
      routes.add(entry.id);
      if (!OWNING_SKILLS.has(entry.skill)) {
        if (entry.resumes !== undefined && chainOf.has(entry.resumes)) return unknown(`${entry.skill} route ${entry.id} resumes plan route ${entry.resumes}`);
        continue;
      }
      if (!nonEmpty(entry.session)) return unknown(`plan route ${entry.id} names no session`);
      if (entry.resumes === undefined) {
        const chain: Chain = { ids: [entry.id], sessions: [entry.session], head: entry.id, session: entry.session, closed: null };
        chains.push(chain);
        chainOf.set(entry.id, chain);
        continue;
      }
      const chain = chainOf.get(entry.resumes);
      if (chain === undefined || chain.closed !== null) return unknown(`plan route ${entry.id} resumes ${entry.resumes}, which is no open plan route before it`);
      chain.ids.push(entry.id);
      chain.sessions.push(entry.session);
      chain.head = entry.id;
      chain.session = entry.session;
      chainOf.set(entry.id, chain);
    } else if (entry.kind === 'exit') {
      // An exit that cannot be matched to a route before it could have ended any of them: not proof of no owner.
      if (!nonEmpty(entry.route) || !routes.has(entry.route)) return unknown(`exit ${entry.id} names no route before it`);
      if (entry.reason !== undefined && typeof entry.reason !== 'string') return unknown(`exit ${entry.id} has a malformed reason`);
      const chain = chainOf.get(entry.route);
      if (chain !== undefined) chain.closed ??= entry.reason ?? 'exit';
    }
  }
  const live = chains.filter((chain) => chain.closed === null);
  if (live.length > 1) return unknown(`${live.length} plan routes are open at once`);
  if (live.length === 0) return { task: slug, state: 'none' };
  const owner = live[0]!;
  const takenOver = new Set<string>();
  for (const chain of chains) {
    if (chain === owner || chain.closed === 'superseded') chain.sessions.forEach((session) => takenOver.add(session));
  }
  takenOver.delete(owner.session);
  return { task: slug, state: 'owned', session: owner.session, routeId: owner.head, chainIds: [...owner.ids], takenOver: [...takenOver] };
}
