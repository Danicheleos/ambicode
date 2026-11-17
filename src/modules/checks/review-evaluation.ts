import type { Finding, ReviewResult } from '#types/modules/review';
import type { ReviewEntry } from '#types/modules/checks';

type ReviewEvaluation = { next: 'revise-fix'; findings: string[] } | { next: 'proceed' };

const findingLine = (finding: Finding): string => {
  const where = finding.location.newPath ?? finding.location.oldPath ?? '(no path)';
  const flat = (text: string): string => text.replace(/\s+/g, ' ');
  return `${finding.id} ${where}:${finding.location.line} — ${flat(finding.problem)} | suggested: ${flat(finding.suggestedComment)}`;
};

/** Any finding goes back to `fix`; fix.md fixes a finding outside the brief that the change breaks or blocks (listed under `### Cross Boundary`) and leaves one it does not touch under Gaps, so no gate asks about them. */
export function evaluateReview(review: ReviewEntry, result: ReviewResult | null): ReviewEvaluation {
  if (review['reviewerRan'] === false || result === null || result.findings.length === 0) return { next: 'proceed' };
  return { next: 'revise-fix', findings: result.findings.map(findingLine) };
}
