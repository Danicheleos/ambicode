import path from 'node:path';
import { checkDraft, LAST_ROUND } from '#modules/workers/plan-check';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import type { Handler, HandlerInput, HandlerResult } from '#types/harness';
import type { PlanCheckResult, BadAnchor } from '#types/modules/workers';

/** The revise sections' share of the re-printed plan-write step, which stays within 3,072 bytes (01-contracts §8). */
const INLINE_SECTION_BYTES = 1_400;

const bytes = (text: string): number => Buffer.byteLength(text);

const listed = (bad: readonly BadAnchor[]): string[] => bad.map((anchor) => `${anchor.path}:${anchor.line} ${anchor.reason}${anchor.identifier === undefined ? '' : ` (${anchor.identifier})`}`);

/** The `plan-check` code step: consumes what `plan check` just wrote, else checks the latest draft; a failing check asks for another write (06-P5–P7). */
export async function planCheckStep(input: HandlerInput): Promise<HandlerResult> {
  const window = await input.context.window(input.view, input.raisedBy);
  let worker = window.findLast((entry) => entry.kind === 'worker' && entry['worker'] === 'plan-check' && input.produced.includes(entry.id));
  if (worker === undefined) {
    const draft = window.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan-draft');
    if (draft === undefined) return { state: 'failed', code: 'plan-draft-missing', message: `Task ${input.view.task} has no plan draft to check.`, recoverable: false };
    try {
      worker = (await checkDraft({ runtime: input.runtime, session: input.view.session, context: input.context, ledger: input.ledger }, input.view.task, draft)).worker;
    } catch (error) {
      if (error instanceof AmbicodeError) return { state: 'failed', code: error.code, message: error.message, recoverable: false };
      throw error;
    }
  }
  const summary = worker['summary'] as { failed: boolean; anchorsBad: number; acsUnmapped: number } | undefined;
  if (summary?.failed !== true) return { state: 'ok', payload: null };
  const dir = await resolveTaskDir(input.runtime, input.view.task);
  const result = JSON.parse(await input.runtime.fs.readText(path.join(dir.repositoryRoot, String(worker['artifact'])))) as PlanCheckResult;
  const artifact = String(worker['artifact']);
  const lists: [string, string[], number][] = [['Bad anchors', listed(result.anchors.bad), result.anchors.badTotal], ['Unmapped acceptance units', result.acs.unmapped, result.acs.unmappedTotal]];
  const args: Record<string, string[]> = {};
  // The engine renders each key as `## key\n…` joined by blank lines; the Last round section may follow.
  const pointer = (total: number, kept: number) => `… ${total - kept} more in ${artifact}`;
  const shown = lists.filter(([, , total]) => total > 0);
  let left = INLINE_SECTION_BYTES - bytes(`\n\n## Last round\n${LAST_ROUND}`)
    - shown.reduce((sum, [key, , total]) => sum + bytes(`\n\n## ${key}\n`) + bytes(`\n${pointer(total, 0)}`), 0);
  for (const [key, items, total] of shown) {
    const kept: string[] = [];
    for (const item of items) {
      if (bytes(item) + 1 > left) break;
      kept.push(item);
      left -= bytes(item) + 1;
    }
    args[key] = kept.length < total ? [...kept, pointer(total, kept.length)] : kept;
  }
  return {
    state: 'failed',
    code: 'plan-check-failed',
    message: `plan check: ${summary.anchorsBad} bad anchors, ${summary.acsUnmapped} unmapped acceptance units (${artifact}).`,
    recoverable: true,
    revise: { args, lastRound: LAST_ROUND },
  };
}

export const PLAN_HANDLERS: Readonly<Record<string, Handler>> = {
  'workers.planCheck': planCheckStep,
};
