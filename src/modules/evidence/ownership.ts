import type { LedgerEntry } from '#types/modules/evidence';
import type { PlanOwnership } from '#types/harness';

// No runtime imports: the guard bundles this predicate and its startup time is the point (see hook/guard/guard.ts).

/** Skills whose route owns a model-writable file (`steps/plan-body.md` and the plan drafts, task-wide). */
export const OWNING_SKILLS: ReadonlySet<string> = new Set(['plan']);

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value !== '';

/**
 * Who owns the task's live plan route (12 §2.3, H2): the session of the one plan `route` entry with no `exit`; age
 * and idle time never end it. Anything that could hide a takeover — a route or exit missing a field ownership is
 * read from, an exit bound to no route, a repeated id, two live plan routes — is `unknown`, never a guess, so every
 * caller fails closed. Other kinds are skipped. `entries` are one task ledger's, in file order.
 */
export function ownerOf(entries: readonly LedgerEntry[], slug: string): PlanOwnership {
  const unknown = (reason: string): PlanOwnership => ({ task: slug, state: 'unknown', reason });
  const routes = new Set<string>();
  const plans = new Map<string, { session: string; closed: boolean }>();
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!nonEmpty(entry.id)) return unknown('a ledger entry has no id');
    if (seen.has(entry.id)) return unknown(`ledger id ${entry.id} appears twice`);
    seen.add(entry.id);
    if (entry.kind === 'route') {
      if (!nonEmpty(entry.skill)) return unknown(`route ${entry.id} names no skill`);
      if (entry.session !== undefined && !nonEmpty(entry.session)) return unknown(`route ${entry.id} has a malformed session`);
      routes.add(entry.id);
      if (!OWNING_SKILLS.has(entry.skill)) continue;
      if (!nonEmpty(entry.session)) return unknown(`plan route ${entry.id} names no session`);
      plans.set(entry.id, { session: entry.session, closed: false });
    } else if (entry.kind === 'exit') {
      // An exit that cannot be matched to a route before it could have ended any of them: not proof of no owner.
      if (!nonEmpty(entry.route) || !routes.has(entry.route)) return unknown(`exit ${entry.id} names no route before it`);
      if (entry.reason !== undefined && typeof entry.reason !== 'string') return unknown(`exit ${entry.id} has a malformed reason`);
      const plan = plans.get(entry.route);
      if (plan !== undefined) plan.closed = true;
    }
  }
  const live = [...plans].filter(([, plan]) => !plan.closed);
  if (live.length > 1) return unknown(`${live.length} plan routes are open at once`);
  if (live.length === 0) return { task: slug, state: 'none' };
  const [routeId, owner] = live[0]!;
  return { task: slug, state: 'owned', session: owner.session, routeId, chainIds: [routeId] };
}
