import path from 'node:path';
import { onGatePrint } from '#harness/gates/gates';
import { ITERATION_HEADING } from '#modules/evidence/task/iterations';

interface CheckSummary { failed: boolean; anchorsBad: number; anchors?: string[]; policyMissing?: string[] }

/** The `## Iteration N:` headings, exact; the plan body never reaches the chat from here. */
const titlesOf = (plan: string): string[] => [...plan.matchAll(ITERATION_HEADING)].map((heading) => `${heading[1]}. ${heading[0].replace(/^##\s+Iteration\s+\d+\s*[:.\-–]?\s*/i, '').trim()}`);

/**
 * The route sends a failed check back to draft once; a failure that remains prints here and stays offered to Accept as
 * not verified. A user-set headless run takes its draft as it is, so Revise is not offered, since nobody is there to ask for one.
 * The details go to the chat before the question: the path alone on the first line, so the terminal makes it clickable.
 */
onGatePrint('plan-accept', async ({ runtime, dir, chain }) => {
  const worker = chain.findLast((entry) => entry.kind === 'worker' && entry['worker'] === 'plan-check');
  const summary = worker?.['summary'] as CheckSummary | undefined;
  const head = chain.find((entry) => entry.kind === 'route');
  const headless = head?.['mode'] === 'headless' && head['trusted'] === true;
  const failed = summary?.failed !== true ? null : [`Plan check FAILED: ${summary.anchorsBad} bad anchors${summary.policyMissing === undefined ? '' : `, ${summary.policyMissing.length} policy rules not cited`}.`, ...(summary.anchors ?? []), ...(summary.policyMissing ?? []).map((id) => `${id}: not cited`)].join('\n');
  const titles = titlesOf(await runtime.fs.readText(dir.plan).catch(() => ''));
  const details = [path.resolve(dir.plan), ...titles, ...(failed === null ? [] : [failed, 'Accepting lists them as not verified.'])].join('\n');
  if (headless) return { details: `${details}\nHeadless: this draft is accepted or rejected as it is, never revised.`, offered: ['Accept', 'Reject'] };
  return { details };
});
