import path from 'node:path';
import type { SubmissionRecord } from '#types/modules/publication';
import type { ReviewResult, SelectionRecord } from '#types/modules/review';
import type { FileSystem } from '#types/platform/ports';
import type { ParsedSubmission, PageModel } from '../types/page.ts';

export const METRICS_FILE = 'metrics.jsonl';
const RESULT = 'result.json';
const POSTED = new Set(['published', 'already-published']);

export interface SelectionRow { at: string; reviewId: string; findingId: string; rule: string | null; offered: boolean; selected: boolean; edited: boolean; posted: boolean }

/** One row per finding of the review; `model` is the page as offered before this submit's drafts were saved (08-M2). */
export function selectionRows(input: { at: string; result: ReviewResult; model: PageModel; submission: ParsedSubmission; outcome: SubmissionRecord }): SelectionRow[] {
  const cards = new Map(input.model.findings.map((card) => [card.id, card]));
  const outcomes = new Map(input.outcome.outcomes.map((outcome) => [outcome.findingId, outcome.state]));
  return input.result.findings.map((finding) => {
    const card = cards.get(finding.id);
    const body = input.submission.drafts.get(finding.id);
    return {
      at: input.at,
      reviewId: input.result.reviewId,
      findingId: finding.id,
      rule: finding.ruleRefs[0] ?? null,
      offered: card?.publishable ?? false,
      selected: input.submission.selected.has(finding.id),
      edited: body !== undefined && body !== (card?.draft ?? finding.suggestedComment),
      posted: POSTED.has(outcomes.get(finding.id) ?? ''),
    };
  });
}

/** The nearest ancestor named `.ambicode`, or null for a review directory outside one. */
function ambicodeRoot(reviewDirectory: string): string | null {
  for (let at = path.resolve(reviewDirectory); ; at = path.dirname(at)) {
    if (path.basename(at) === '.ambicode') return at;
    if (path.dirname(at) === at) return null;
  }
}

/** Appends the rows to `<.ambicode>/metrics.jsonl` and one `selection` element to `result.json`, temp-then-rename (08-M3). */
export async function recordSelection(fs: FileSystem, reviewDirectory: string, rows: SelectionRow[]): Promise<void> {
  if (rows.length === 0) return;
  const root = ambicodeRoot(reviewDirectory);
  if (root !== null) await fs.appendText(path.join(root, METRICS_FILE), rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
  const destination = path.join(reviewDirectory, RESULT);
  const result = JSON.parse(await fs.readText(destination)) as { selection?: SelectionRecord[] };
  const element: SelectionRecord = {
    submittedAt: rows[0]!.at,
    rows: rows.map(({ findingId, offered, selected, edited, posted }) => ({ findingId, offered, selected, edited, posted })),
  };
  result.selection = [...(result.selection ?? []), element];
  const temporary = `${destination}.writing`;
  await fs.writeText(temporary, `${JSON.stringify(result, null, 2)}\n`);
  await fs.rename(temporary, destination);
}
