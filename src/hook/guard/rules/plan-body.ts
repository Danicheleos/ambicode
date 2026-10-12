// Serves plan: only the session that owns the live plan route may write steps/plan-body.md, and only with a file tool.
import { ownerOfHarness } from '#harness/session/harness';
import { ownerOf } from '#modules/evidence/ownership';
import type { ActiveRoute, GuardState } from '../../types/guard.ts';
import { isAbsolute } from '../paths.ts';

export const PLAN_BODY = /^(.*\/)?\.ambicode\/tasks\/([^/]+)\/steps\/plan-body\.md$/;

export function planBodyReason(slug: string): string {
  return `AMBICODE: the plan body is not written with the shell. Write it with the Write tool to .ambicode/tasks/${slug}/steps/plan-body.md, then run route next: the route saves it as the draft and checks it.`;
}

/** Why this session may not write the plan body of `slug`; `null` when it may. */
export function planBodyRefusal(
  session: string | null,
  route: ActiveRoute | null,
  state: GuardState | undefined,
  taskDirectory: string,
  slug: string,
): string | null {
  const refuse = (why: string): string =>
    `AMBICODE: steps/plan-body.md is written only by the session that owns the task's live plan route; ${why}. ${planBodyReason(slug)}`;
  if (session === null) return refuse('the hook named no session');
  if (!isAbsolute(taskDirectory)) return refuse('the hook gave no absolute path for it');
  if (route === null) return refuse('no active route is on record for this session');
  if (route.skill !== 'plan' || route.task !== slug) return refuse(`this session's active route is ${route.skill} on ${route.task}, not plan on ${slug}`);
  const entries = state!.ledger(taskDirectory);
  if (entries === null) return refuse(`the ledger of ${slug} is missing, unreadable or over 1 MiB`);
  const owner = ownerOf(entries, slug);
  if (owner.state === 'none') return refuse(`no plan route is open on ${slug}`);
  if (owner.state === 'unknown') return refuse(owner.reason);
  const mine = ownerOfHarness(entries, session);
  return mine !== null && owner.session === mine ? null : refuse(`session ${owner.session} owns it`);
}
