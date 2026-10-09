import { COMMAND_SPECS } from '#skills/plan/commands';
import { runCommandTail } from '#harness/engine/command-tail';
import { AmbicodeError } from '#util/errors';
import { runPlanCheck } from '#modules/workers/plan-check';
import { buildChain, exitOf } from '#modules/evidence/ledger-chain';
import { routeTools, taskOf } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import { MAX_NOTE_BYTES } from '#types/modules/evidence';
import type { PlanCheckResult } from '#types/modules/workers';
import type { LedgerEntry } from '#types/modules/evidence';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const PLAN_CHECK_OPTIONS = { values: ['task', 'from'], flags: ['json'] } as const;

interface PlanCheckOutput extends PlanCheckResult {
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

/** The task's latest plan route when it has ended, with the plan it promoted, if any. */
function endedPlanRoute(entries: readonly LedgerEntry[]): { exit: LedgerEntry; plan: LedgerEntry | null } | null {
  const head = entries.findLast((entry) => entry.kind === 'route' && entry['skill'] === 'plan');
  const chain = head === undefined ? null : buildChain(entries, head);
  const exit = chain === null ? null : exitOf(chain);
  if (chain === null || exit === null) return null;
  return { exit, plan: chain.entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan') ?? null };
}

/**
 * Once the plan route has ended, a new draft is a revision only the user can ask for (walk 02_0000: after a headless
 * Accept, both plan sessions fixed anchors and re-ran the check outside the route).
 */
function refuseAfterRoute(task: string, ended: { exit: LedgerEntry; plan: LedgerEntry | null }): never {
  const what = ended.plan === null ? `exit: ${String(ended.exit['reason'])}` : `the accepted plan is ${String(ended.plan['path'])}`;
  throw new AmbicodeError('plan-route-ended', `Task ${task}: the plan route has ended (${what}); nothing was saved or checked.`, {
    details: ['Do not revise the plan: name the check failures in your answer. Only the user can ask for a new draft, by starting /ambicode:plan again.'],
  });
}

/** Saves the plan body as a draft, checks it by code and, inside a route, advances it once (06-P1–P4). Exit 0 for a failing check too. */
export async function runPlanCheckCommand(runtime: Runtime, args: ParsedArgs): Promise<PlanCheckOutput> {
  const task = taskOf('plan check', args);
  const from = args.value('from');
  const body = from === null ? ((await runtime.stdin.read(MAX_NOTE_BYTES)) ?? null) : null;
  if (from === null && (body === null || body.trim() === '')) {
    throw new AmbicodeError('bad-argument', `"plan check" reads the plan from --from steps/plan-body.md or from standard input, up to ${MAX_NOTE_BYTES} bytes; it got neither.`, { field: 'from' });
  }
  const tools = await routeTools(runtime, task);
  const { checked, binding, context } = await tools.engine.command(COMMAND_SPECS.planCheck, { task }, async ({ session, context, binding, view }) => {
    const ended = view === null ? endedPlanRoute(await context.entries(task)) : null;
    if (ended !== null) refuseAfterRoute(task, ended);
    return { binding, context, checked: await runPlanCheck({ runtime, session, context }, { task, body, from }) };
  });
  const tail = await runCommandTail({ engine: tools.engine }, { task, cause: 'plan check', session: binding, produced: [checked.draft.id, checked.worker.id] });
  const summary = checked.worker['summary'] as { failed: boolean };
  const accepted = tail?.position === 'complete' && summary.failed ? endedPlanRoute(await context.entries(task))?.plan ?? null : null;
  const next = tail === null || accepted === null ? tail : { ...tail, text: `${tail.text}\nThis draft was accepted as it is, check failures included: do not revise it. Name the failures in your answer.` };
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

export const planCheckCommand: CliCommand = {
  name: 'plan check',
  options: PLAN_CHECK_OPTIONS,
  run: async (runtime, args) => {
    const output = await runPlanCheckCommand(runtime, args);
    return { text: renderPlanCheck(output), data: output };
  },
};
