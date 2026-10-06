import type { Finding, ReviewResult } from '#types/modules/review';
import { isBoundAnswer } from '#harness/engine/fold';
import type { ReviewEntry } from '#types/modules/checks';
import type { LedgerEntry } from '#types/modules/evidence';
import type { RouteView } from '#types/harness';
type ReviewEvaluation =
  | { next: 'waiting'; keys: string[]; raisedBy: string }
  | { next: 'scope'; findings: string[]; more: number }
  | { next: 'revise-fix'; findings: string[] }
  | { next: 'proceed' };

const SCOPE_SHOWN = 3;
const ANSWERS = new Set(['acceptance', 'declined', 'default-taken']);

const findingLine = (finding: Finding): string => {
  const where = finding.location.newPath ?? finding.location.oldPath ?? '(no path)';
  const line = finding.location.line === null ? '' : `:${finding.location.line}`;
  return `${finding.id} ${where}${line} — ${finding.explanation.replace(/\s+/g, ' ').slice(0, 140)}`;
};

/** The step the model was in when it ran the review: `fix` once a fix round was delivered, else `review-run`. */
function raisedByOf(chain: readonly LedgerEntry[], review: LedgerEntry): string {
  const before = chain.slice(0, chain.indexOf(review));
  return before.some((entry) => entry.kind === 'step' && entry['step'] === 'fix' && entry['status'] === 'delivered') ? 'fix' : 'review-run';
}

/**
 * 07-V1, first match wins: unanswered waiting keys, out-of-scope findings with no scope answer, in-scope (or included)
 * findings, else proceed. Pure: `chain` is the route's chain in file order and must contain `review`.
 */
export function evaluateReview(
  view: RouteView,
  review: ReviewEntry,
  result: ReviewResult | null,
  touched: readonly string[],
  chain: readonly LedgerEntry[],
): ReviewEvaluation {
  const after = chain.slice(chain.indexOf(review) + 1).filter((entry) => ANSWERS.has(entry.kind) && view.chainIds.includes(String(entry['route'])));
  const printKeys = (instance: unknown): readonly unknown[] => {
    const print = chain.find((entry) => entry.id === instance);
    const keys = (print?.['values'] as { key?: unknown } | undefined)?.key;
    return Array.isArray(keys) ? keys : [];
  };
  const answered = (key: string): boolean =>
    after.some((entry) => entry['gate'] === 'check-only-unauthorized' && isBoundAnswer(entry) && (entry['key'] === key || printKeys(entry['instance']).includes(key)));
  const waiting = (Array.isArray(review['waiting']) ? (review['waiting'] as string[]) : []).filter((key) => !answered(key));
  if (waiting.length > 0) return { next: 'waiting', keys: waiting, raisedBy: raisedByOf(chain, review) };
  if (review['reviewerRan'] === false || result === null) return { next: 'proceed' };

  const inside = new Set(touched);
  const outside = (finding: Finding): boolean => !inside.has(finding.location.newPath ?? finding.location.oldPath ?? '');
  const scope = after.findLast((entry) => entry['gate'] === 'scope-expanding' && isBoundAnswer(entry));
  const outOfScope = result.findings.filter(outside);
  if (outOfScope.length > 0 && scope === undefined) {
    return { next: 'scope', findings: outOfScope.slice(0, SCOPE_SHOWN).map(findingLine), more: Math.max(0, outOfScope.length - SCOPE_SHOWN) };
  }
  const included = scope !== undefined && scope.kind === 'acceptance' && scope['answer'] === 'include';
  const toFix = result.findings.filter((finding) => !outside(finding) || included);
  return toFix.length > 0 ? { next: 'revise-fix', findings: toFix.map(findingLine) } : { next: 'proceed' };
}
