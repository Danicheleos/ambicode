import { onGatePrint } from '#harness/gates/gates';

interface CheckSummary { failed: boolean; anchorsBad: number; anchors?: string[] }

/**
 * The route sends a failed check back to design once; a failure that remains prints here and stays offered to Accept as
 * not verified. A user-set headless run takes its draft as it is, so Revise is not offered, since nobody is there to ask for one.
 */
onGatePrint('plan-accept', async ({ chain }) => {
  const draft = chain.findLastIndex((entry) => entry.kind === 'note' && entry['note'] === 'plan-draft');
  const worker = chain.slice(draft + 1).findLast((entry) => entry.kind === 'worker' && entry['worker'] === 'plan-check');
  const summary = worker?.['summary'] as CheckSummary | undefined;
  const head = chain.find((entry) => entry.kind === 'route');
  const headless = head?.['mode'] === 'headless' && head['trusted'] === true;
  const failed = summary?.failed !== true ? null : [`Plan check FAILED: ${summary.anchorsBad} bad anchors.`, ...(summary.anchors ?? [])].join('\n');
  if (headless) return { line: `${failed === null ? '' : `${failed}\n`}Headless: this draft is accepted or rejected as it is, never revised.`, offered: ['Accept', 'Reject'] };
  return failed === null ? null : { line: `${failed}\nAccepting lists them as not verified.` };
});
