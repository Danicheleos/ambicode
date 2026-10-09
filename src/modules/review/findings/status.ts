import type { ReviewResult } from '#types/modules/review';

/** What the status needs of a bundle; `review record` has only the persisted result, so it counts gaps from that. */
export interface StatusInput {
  result: ReviewResult;
  /** Applicable policy diagnostics that could not be resolved. */
  policyGaps: number;
  /** Checks still waiting for a human. */
  waiting: number;
}

/**
 * A failed or skipped check narrows what was verified (`partial`) but does not
 * stop the model; only unusable reviewer output makes the review an error.
 */
export function applyStatus(bundle: StatusInput, reviewerOk: boolean, dropped: string | null = null): void {
  if (!reviewerOk) {
    bundle.result.status = 'error';
    bundle.result.statusReason =
        bundle.result.reviewer?.detail ??
      'The independent reviewer did not produce a validated result, so no finding list was produced. This is not a clean review.';
    return;
  }

  // A check configured as null says the project has nothing to run there; a declined or failed one is still a gap.
  const unverified = bundle.result.checks.filter(
    (check) => check.adapter !== 'unconfigured' && (check.status !== 'passed' || !check.selectionComplete),
  );
  const policyGaps = bundle.policyGaps;
  const gaps = [
    ...(policyGaps > 0 ? [`${policyGaps} applicable policy diagnostic(s) could not be resolved`] : []),
    ...(unverified.length > 0
      ? [`${unverified.length} check(s) did not pass or could not establish what they covered`]
      : []),
    ...(bundle.waiting > 0
      ? [`${bundle.waiting} check(s) are waiting for authorization`]
      : []),
    ...(dropped !== null ? [dropped] : (bundle.result.reviewer?.rejections.length ?? 0) > 0
      ? ['some reviewer output was rejected as unverifiable']
      : []),
  ];

  if (gaps.length === 0) {
    const narrowed = bundle.result.omissions.some((line) => line.startsWith('This review was narrowed on request'));
    bundle.result.status = 'complete';
    bundle.result.statusReason = narrowed
      ? 'Complete for the paths reviewed only: --only or --exclude left part of the change unexamined (see section 4).'
      : null;
    return;
  }
  bundle.result.status = 'partial';
  bundle.result.statusReason = gaps.length === 1 && gaps[0] === dropped ? dropped : `The review ran, with gaps: ${gaps.join('; ')}.`;
}

