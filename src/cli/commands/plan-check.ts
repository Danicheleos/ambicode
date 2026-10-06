import type { Runtime } from '../../composition/root.ts';
import { ledgerRouteContext } from '../../route/context.ts';
import { runCommandTail } from '../../route/command-tail.ts';
import { MAX_NOTE_BYTES } from '../../task/notes.ts';
import { AmbicodeError } from '../../util/errors.ts';
import { runPlanCheck, type PlanCheckResult } from '../../workers/plan-check.ts';
import type { ParsedArgs } from '../args.ts';
import { routeTools, taskOf } from './route.ts';

export const PLAN_CHECK_OPTIONS = { values: ['task', 'from'], flags: ['json'] } as const;

export interface PlanCheckOutput extends PlanCheckResult {
  command: 'plan check';
  task: string;
  draft: string;
  artifact: string;
  failed: boolean;
  /** Set when the lists were shortened to fit; the artifact has them whole. */
  listsCut?: boolean;
  /** Duplicates found, counted before the inline list is shortened. */
  duplicatesTotal: number;
  next?: string;
}

const INLINE_CHARS = 7_900;

/** Saves the plan body as a draft, checks it by code and, inside a route, advances it once (06-P1–P4). Exit 0 for a failing check too. */
export async function runPlanCheckCommand(runtime: Runtime, args: ParsedArgs): Promise<PlanCheckOutput> {
  const task = taskOf('plan check', args);
  const from = args.value('from');
  const body = from === null ? ((await runtime.stdin.read(MAX_NOTE_BYTES)) ?? null) : null;
  if (from === null && (body === null || body.trim() === '')) {
    throw new AmbicodeError('bad-argument', `"plan check" reads the plan from --from steps/plan-body.md or from standard input, up to ${MAX_NOTE_BYTES} bytes; it got neither.`, { field: 'from' });
  }
  const tools = await routeTools(runtime, task);
  const session = tools.binding.state === 'bound' ? tools.binding.session : null;
  const checked = await runPlanCheck({ runtime, session, context: ledgerRouteContext({ runtime, routes: tools.routes }) }, { task, body, from });
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'plan check', session: tools.binding, produced: [checked.draft.id, checked.worker.id] });
  const summary = checked.worker['summary'] as { failed: boolean };
  return fitted({ command: 'plan check', task, draft: String(checked.draft['path']), artifact: checked.artifact, failed: summary.failed, ...checked.result, duplicatesTotal: checked.result.duplicates.length, ...(next === null ? {} : { next: next.text }) });
}

/** CLI output stays inline (≤ 8,000 characters, 01-contracts §8): lists are cut from the longest; totals and the artifact keep the rest. */
function fitted(output: PlanCheckOutput): PlanCheckOutput {
  const out = { ...output, anchors: { ...output.anchors, bad: [...output.anchors.bad] }, acs: { ...output.acs, unmapped: [...output.acs.unmapped] }, duplicates: [...output.duplicates] };
  const lists = (): unknown[][] => [out.anchors.bad, out.acs.unmapped, out.duplicates];
  while (JSON.stringify(out, null, 2).length > INLINE_CHARS) {
    const longest = lists().reduce((a, b) => (b.length > a.length ? b : a));
    if (longest.length === 0) break;
    longest.pop();
    out.listsCut = true;
  }
  return out;
}

export function renderPlanCheck(output: PlanCheckOutput): string {
  const lines = [
    `Saved plan draft: ${output.draft}`,
    `plan check ${output.failed ? 'failed' : 'passed'}: ${output.anchors.checked} anchors checked, ${output.anchors.badTotal} bad; ${output.acs.mapped} acceptance units mapped, ${output.acs.unmappedTotal} unmapped; ${output.duplicatesTotal} new names already declared`,
    `Result: ${output.artifact}`,
    ...(output.duplicatesSkipped === undefined ? [] : [`New names were not looked up: ${output.duplicatesSkipped}`]),
    ...(output.listsCut === true ? [`Inline lists were shortened; see ${output.artifact}.`] : []),
  ];
  return `${lines.join('\n')}${output.next === undefined ? '' : `\n\n${output.next}`}`;
}
