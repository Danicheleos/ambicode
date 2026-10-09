import { checkDraft } from '#modules/workers/plan-check';
import { onGatePrint } from '#harness/gates/gates';
import { AmbicodeError } from '#util/errors';
import type { Handler, HandlerInput, HandlerResult } from '#types/harness';

/** The `plan-check` code step: consumes what `plan check` just wrote, else checks the latest draft; a failing check is recorded and the plan-accept gate shows it (06-P5–P7). */
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
  return { state: 'ok', payload: null, record: { checkFailed: true } };
}

/**
 * A user-set headless run takes its first draft as it is: Accept stays offered when the check failed, and Revise is
 * not, since nobody is there to ask for one. With a user present, a failed check withholds Accept and the draft stays.
 */
onGatePrint('plan-accept', async ({ chain }) => {
  const draft = chain.findLastIndex((entry) => entry.kind === 'note' && entry['note'] === 'plan-draft');
  const worker = chain.slice(draft + 1).findLast((entry) => entry.kind === 'worker' && entry['worker'] === 'plan-check');
  const summary = worker?.['summary'] as { failed: boolean; anchorsBad: number; acsUnmapped: number } | undefined;
  const head = chain.find((entry) => entry.kind === 'route');
  const headless = head?.['mode'] === 'headless' && head['trusted'] === true;
  const failed = summary?.failed !== true ? null : `Plan check FAILED: ${summary.anchorsBad} bad anchors, ${summary.acsUnmapped} unmapped acceptance units (${String(worker?.['artifact'])}).`;
  if (headless) return { line: `${failed === null ? '' : `${failed} `}Headless: this draft is accepted or rejected as it is, never revised.`, offered: ['Accept', 'Reject'] };
  if (failed === null) return null;
  return { line: `${failed} Accept is not offered for this draft.`, offered: ['Revise', 'Reject'] };
});

export const PLAN_HANDLERS: Readonly<Record<string, Handler>> = {
  'workers.planCheck': planCheckStep,
};
