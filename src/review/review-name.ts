import type { ReviewTarget } from '../contracts/review.ts';

/**
 * The name a review's directory gets under `.ambicode/reviews/`.
 *
 * It used to be a bare UUID, which is unique and says nothing: finding the
 * review of merge request !2716 meant opening `result.json` files one at a
 * time. The name now carries what a person actually searches by — which
 * merge request, which ticket, which day — so the directory listing is the
 * index.
 *
 * The name is also the review id (`view --review <name>`), so it has to stay
 * unique, stay a legal path segment on all three platforms, and stay short
 * enough that a deep repository path plus a snapshot file underneath it does
 * not run into Windows' path limit.
 */

/** Windows' limit is the binding one; this leaves room for what goes inside. */
const MAX_NAME_LENGTH = 80;

/** Trailing dots and spaces are not legal at the end of a Windows path segment. */
function sanitize(value: string, maxLength: number): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+/, '')
    .replace(/[-._]+$/, '');
  return cleaned.slice(0, maxLength).replace(/[-._]+$/, '');
}

/**
 * `2026-09-22T14-35` in the clock's own zone: the day and time the reader
 * remembers, not UTC. The time is there because reviewing the same merge
 * request twice in a day is ordinary — a re-run after a failure is exactly
 * that — and it makes the listing sort chronologically within a day. Hyphens
 * stand in for the colons a path segment cannot hold on Windows.
 */
function localTimestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${date}T${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

export interface ReviewNameInput {
  target: ReviewTarget;
  /** Requirement ids in the order supplied; only the first reaches the name. */
  requirementIds: readonly string[];
  now: Date;
}

/**
 * The name before any collision suffix. Reviewing the same merge request twice
 * in one day is ordinary — a re-run after a failure is exactly that — so this
 * is not expected to be unique on its own; `uniqueReviewName` resolves that.
 */
export function reviewNameBase(input: ReviewNameInput): string {
  const { target, requirementIds, now } = input;
  const parts: string[] = [];

  if (target.kind === 'merge-request' && target.remote !== null) {
    // GitLab calls it a merge request and numbers it `!2716`; GitHub calls the
    // same thing a pull request. Use the reader's own word for their host.
    parts.push(target.remote.provider === 'github' ? 'PR' : 'MR', String(target.remote.mergeRequestIid));
  } else if (target.kind === 'branch') {
    parts.push('branch');
    const branch = target.baseRef === null ? '' : sanitize(target.baseRef, 32);
    if (branch !== '') parts.push(branch);
  } else {
    parts.push('local');
  }

  const ticket = requirementIds.length === 0 ? '' : sanitize(requirementIds[0] ?? '', 24);
  if (ticket !== '') parts.push(ticket);

  parts.push(localTimestamp(now));
  return sanitize(parts.join('_'), MAX_NAME_LENGTH);
}

/**
 * `reviewNameBase`, with `_2`, `_3` … appended until the name is not already
 * taken. `taken` is asked in order, so the caller decides what "taken" means
 * (a directory that exists, in practice).
 *
 * After `limit` attempts it gives up and returns a name carrying `fallback` —
 * the unique id source — rather than looping or overwriting somebody's review.
 */
export async function uniqueReviewName(
  input: ReviewNameInput,
  taken: (name: string) => Promise<boolean>,
  fallback: string,
  limit = 50,
): Promise<string> {
  const base = reviewNameBase(input);
  if (!(await taken(base))) return base;
  for (let attempt = 2; attempt <= limit; attempt += 1) {
    const candidate = `${base}_${attempt}`;
    if (!(await taken(candidate))) return candidate;
  }
  return sanitize(`${base}_${fallback}`, MAX_NAME_LENGTH + 40);
}
