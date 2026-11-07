import path from 'node:path';
import { onGatePrint } from '#harness/gates/gates';
import { ITERATION_HEADING } from '#modules/evidence/task/iterations';

interface CheckSummary { failed: boolean; anchorsBad: number; anchors?: string[]; requirementsBad?: number; requirementsChecked?: boolean; requirementsReason?: string; requirements?: string[] }

/** The `## Iteration N:` headings, exact; the plan body never reaches the chat from here. */
const titlesOf = (plan: string): string[] => [...plan.matchAll(ITERATION_HEADING)].map((heading) => `${heading[1]}. ${heading[0].replace(/^##\s+Iteration\s+\d+\s*[:.\-–]?\s*/i, '').trim()}`);

/**
 * A failed check is recorded, never sent back: it prints here, before the question, and stays offered to Accept as
 * not verified. A user-set headless run takes its draft as it is, so Revise is not offered, since nobody is there to ask for one.
 * The details go to the chat before the question: the path alone on the first line, so the terminal makes it clickable.
 */
onGatePrint('plan-accept', async ({ runtime, dir, chain }) => {
  const worker = chain.findLast((entry) => entry.kind === 'worker' && entry['worker'] === 'plan-check');
  const summary = worker?.['summary'] as CheckSummary | undefined;
  const head = chain.find((entry) => entry.kind === 'route');
  const headless = head?.['mode'] === 'headless' && head['trusted'] === true;
  const requirementsBad = summary?.requirementsBad ?? 0;
  const counts = summary?.failed !== true ? [] : [...(summary.anchorsBad > 0 ? [`${summary.anchorsBad} bad anchors`] : []), ...(requirementsBad > 0 ? [`${requirementsBad} requirements not word for word`] : [])];
  const failed = summary?.failed !== true ? null : [`Plan check FAILED: ${counts.length === 0 ? 'no plan body' : counts.join(', ')}.`, ...(summary.anchors ?? []), ...(summary.requirements ?? [])].join('\n');
  const titles = titlesOf(await runtime.fs.readText(dir.plan).catch(() => ''));
  const details = [path.resolve(dir.plan), ...titles, ...(summary?.requirementsChecked === false ? [`requirements not checked: ${summary.requirementsReason ?? 'no reason recorded'}`] : []), ...(failed === null ? [] : [failed, 'Accepting lists them as not verified.'])].join('\n');
  if (headless) return { details: `${details}\nHeadless: this draft is accepted or rejected as it is, never revised.`, offered: ['Accept', 'Reject'] };
  return { details };
});
