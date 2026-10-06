import type { ReviewResult } from '../contracts/review.ts';
import { renderReport } from './report.ts';

const PART_4 = '4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE';

/** Part 4 of the printed report, verbatim: it reads only the result, so the other report inputs are placeholders (08-C2). */
export function notCoveredBlock(result: ReviewResult): string {
  const lines = renderReport({ result, snapshotDirectory: '', resultPath: '', pendingApprovals: [] }).split('\n');
  return lines.slice(lines.lastIndexOf(PART_4)).join('\n');
}

/** Trimmed lines, empty ones dropped, inner whitespace runs collapsed to one space. */
export function normalizeBlock(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, ' ')).filter((line) => line !== '');
}

/** Whether `block` appears as one contiguous run of normalized lines inside `message`. */
export function containsBlock(message: string, block: string): boolean {
  const want = normalizeBlock(block);
  const have = normalizeBlock(message);
  if (want.length === 0) return true;
  for (let at = 0; at + want.length <= have.length; at += 1) {
    if (want.every((line, offset) => have[at + offset] === line)) return true;
  }
  return false;
}
