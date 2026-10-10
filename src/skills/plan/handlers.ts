import { onGatePrint } from '#harness/gates/gates';

interface CheckSummary { failed: boolean; anchorsBad: number; anchors?: string[] }

/**
 * A user-set headless run takes its first draft as it is: Accept stays offered when the check failed, and Revise is
 * not, since nobody is there to ask for one. With a user present, a failed check withholds Accept and the draft stays.
 */
onGatePrint('plan-accept', async ({ chain }) => {
  const draft = chain.findLastIndex((entry) => entry.kind === 'note' && entry['note'] === 'plan-draft');
  const worker = chain.slice(draft + 1).findLast((entry) => entry.kind === 'worker' && entry['worker'] === 'plan-check');
  const summary = worker?.['summary'] as CheckSummary | undefined;
  const head = chain.find((entry) => entry.kind === 'route');
  const headless = head?.['mode'] === 'headless' && head['trusted'] === true;
  const failed = summary?.failed !== true ? null : [`Plan check FAILED: ${summary.anchorsBad} bad anchors.`, ...(summary.anchors ?? [])].join('\n');
  if (headless) return { line: `${failed === null ? '' : `${failed}\n`}Headless: this draft is accepted or rejected as it is, never revised.`, offered: ['Accept', 'Reject'] };
  if (failed === null) return null;
  return { line: `${failed}\nAccept is not offered for this draft.`, offered: ['Revise', 'Reject'] };
});
