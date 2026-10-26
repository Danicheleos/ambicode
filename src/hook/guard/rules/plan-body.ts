// Serves plan: steps/plan-body.md is written only while the task's live route is a plan route, and only with a file tool.
import { liveHeads } from '#modules/evidence/ledger-chain';
import type { GuardState } from '../../types/guard.ts';
import { isAbsolute } from '../paths.ts';

export const PLAN_BODY = /^(.*\/)?\.ambicode\/tasks\/([^/]+)\/steps\/plan-body\.md$/;

export function planBodyReason(slug: string, pluginRoot: string): string {
  return `AMBICODE: the plan body is written with the Write tool (no shell) to .ambicode/tasks/${slug}/steps/plan-body.md and fixed with Edit after a failed check. Run \`node "${pluginRoot}/scripts/ambicode.mjs" route next --task ${slug}\`: the route saves it as the draft and checks it.`;
}

/** Why `slug`'s plan body may not be written now; `null` when its live route is a plan route. */
export function planBodyRefusal(state: GuardState | undefined, taskDirectory: string, slug: string, pluginRoot: string): string | null {
  const refuse = (why: string): string => `AMBICODE: steps/plan-body.md is written only while the task's live route is a plan route; ${why}. ${planBodyReason(slug, pluginRoot)}`;
  if (!isAbsolute(taskDirectory)) return refuse('the hook gave no absolute path for it');
  const entries = state!.ledger(taskDirectory);
  if (entries === null) return refuse(`the ledger of ${slug} is missing, unreadable or over 1 MiB (looked in ${taskDirectory})`);
  const live = liveHeads(entries).at(-1);
  return live?.['skill'] === 'plan' ? null : refuse(live === undefined ? `no route is live on ${slug}` : `its live route is ${String(live['skill'])}, not plan`);
}
