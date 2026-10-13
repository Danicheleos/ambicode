import type { LedgerEntry } from '#types/modules/evidence';

/** Where the SubagentStop hook leaves the reviewer's final message, beside the review's result; `review record` reads it. */
export const REVIEWER_ANSWER_FILE = 'reviewer-answer.txt';

/** The reviewer subagent as Claude Code names it in `agent_type`; a plugin agent is namespaced, a local copy is not. */
export const REVIEWER_AGENT_TYPE = /^(?:ambicode:)?reviewer$/;

/** One review has a pending entry and, once recorded, a later recorded one: only the newest per id says where it stands. */
export function pendingReview(entries: readonly LedgerEntry[], wanted: string | null): LedgerEntry | undefined {
  const newest = new Map(entries.filter((entry) => entry.kind === 'review').map((entry) => [String(entry['reviewId']), entry]));
  const entry = wanted === null ? [...newest.values()].findLast((candidate) => candidate['stage'] === 'pending') : newest.get(wanted);
  return entry?.['stage'] === 'pending' ? entry : undefined;
}
