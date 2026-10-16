import type { Finding, ReviewResult } from '#types/modules/review';
import type { ReviewEntry } from '#types/modules/checks';

type ReviewEvaluation = { next: 'revise-fix'; findings: string[] } | { next: 'proceed' };

const findingLine = (finding: Finding): string => {
  const where = finding.location.newPath ?? finding.location.oldPath ?? '(no path)';
  return `${finding.id} ${where}:${finding.location.line} — ${finding.explanation.replace(/\s+/g, ' ').slice(0, 140)}`;
};

/** Any finding goes back to `fix`; fix.md sends the ones outside the brief to Remaining, so no gate asks about them. */
export function evaluateReview(review: ReviewEntry, result: ReviewResult | null): ReviewEvaluation {
  if (review['reviewerRan'] === false || result === null || result.findings.length === 0) return { next: 'proceed' };
  return { next: 'revise-fix', findings: result.findings.map(findingLine) };
}
