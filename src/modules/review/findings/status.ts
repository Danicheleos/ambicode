import type { ReviewResult } from '#types/modules/review';

/**
 * Two rules. A reviewer that produced no validated answer is an `error`; otherwise any gap makes the result `partial`.
 * A missing check is a gap, not a pass: the model chose not to run one, or forgot, and either way nothing was verified by execution.
 */
export function applyStatus(result: ReviewResult, reviewerOk: boolean): void {
  if (!reviewerOk) {
    result.status = 'error';
    result.statusReason =
      result.reviewer?.detail ?? 'The independent reviewer did not produce a validated result, so no finding list was produced. This is not a clean review.';
    return;
  }

  const policyGaps = result.omissions.filter((line) => /^project ".*" policy: /.test(line)).length;
  const narrowed = result.omissions.some((line) => line.startsWith('This review was narrowed on request'));
  // The newest green run per check decides: an earlier failure the model then fixed is not a gap.
  const latestGreen = new Map(result.checks.filter((check) => check.phase === 'green').map((check) => [check.key, check]));
  const failing = [...latestGreen.values()].filter((check) => check.exit !== 0);
  const gaps = [
    ...(policyGaps > 0 ? [`${policyGaps} applicable policy diagnostic(s) could not be resolved`] : []),
    ...(narrowed ? ['--only or --exclude left part of the change unexamined (see section 4)'] : []),
    ...(result.checks.length === 0 ? ['no check recorded, so nothing was verified by execution'] : []),
    ...(failing.length > 0 ? [`${failing.length} check(s) last ran green with a non-zero exit`] : []),
  ];
  result.status = gaps.length === 0 ? 'complete' : 'partial';
  result.statusReason = gaps.length === 0 ? null : `The review ran, with gaps: ${gaps.join('; ')}.`;
}
