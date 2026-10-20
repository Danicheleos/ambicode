import { onGatePrint } from '#harness/gates/gates';

interface CheckSummary { failed: boolean; anchorsBad: number; anchors?: string[]; uncoded?: string[] }

/**
 * A failed check does not loop back: its failures print here and stay offered to Accept as not verified. A user-set
 * headless run takes its first draft as it is, so Revise is not offered, since nobody is there to ask for one.
 */
onGatePrint('plan-accept', async ({ chain }) => {
  const draft = chain.findLastIndex((entry) => entry.kind === 'note' && entry['note'] === 'plan-draft');
  const worker = chain.slice(draft + 1).findLast((entry) => entry.kind === 'worker' && entry['worker'] === 'plan-check');
  const summary = worker?.['summary'] as CheckSummary | undefined;
  const head = chain.find((entry) => entry.kind === 'route');
  const headless = head?.['mode'] === 'headless' && head['trusted'] === true;
  const failed = summary?.failed !== true ? null : [`Plan check FAILED: ${summary.anchorsBad} bad anchors.`, ...(summary.anchors ?? []), ...(summary.uncoded === undefined ? [] : ['Coverage rows without code:', ...summary.uncoded])].join('\n');
  if (headless) return { line: `${failed === null ? '' : `${failed}\n`}Headless: this draft is accepted or rejected as it is, never revised.`, offered: ['Accept', 'Reject'] };
  return failed === null ? null : { line: `${failed}\nAccepting lists them as not verified.` };
});
