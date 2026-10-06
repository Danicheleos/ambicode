import type { ReviewTarget } from '#types/review';

/**
 * The directory name is also the review id (`view --review <name>`), so it must stay
 * unique, a legal path segment on every platform, and short enough for Windows' path limit.
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
 * `2026-09-22T14-35` in local time, not UTC: the day the reader remembers. Hyphens
 * stand in for colons, which a Windows path segment cannot hold.
 */
export function localTimestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${date}T${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

export interface ReviewNameInput {
  target: ReviewTarget;
  /** Requirement ids in the order supplied; only the first reaches the name. */
  requirementIds: readonly string[];
  now: Date;
  /** The task folder already carries the ticket, so the name leaves it out. */
  insideTask?: boolean;
}

/** The task directory under `TASKS_DIR`, or `null` when the run has no task identity. */
export function taskSlugFor(input: {
  requirementIds: readonly string[];
  task: string | null;
}): string | null {
  const explicit = input.task === null ? "" : sanitize(input.task, 60);
  if (explicit !== "") return explicit;
  const ticket = sanitize(input.requirementIds[0] ?? "", 24);
  return ticket === "" ? null : ticket;
}

/** The name before any collision suffix; not unique on its own, see `uniqueReviewName`. */
export function reviewNameBase(input: ReviewNameInput): string {
  const { target, requirementIds, now } = input;
  const parts: string[] = [];

  if (target.kind === 'merge-request' && target.remote !== null) {
    parts.push(target.remote.provider === 'github' ? 'PR' : 'MR', String(target.remote.mergeRequestIid));
  } else if (target.kind === 'branch') {
    parts.push('branch');
    const branch = target.baseRef === null ? '' : sanitize(target.baseRef, 32);
    if (branch !== '') parts.push(branch);
  } else {
    parts.push('local');
  }

  const ticket =
    input.insideTask === true || requirementIds.length === 0
      ? ''
      : sanitize(requirementIds[0] ?? '', 24);
  if (ticket !== '') parts.push(ticket);

  parts.push(localTimestamp(now));
  return sanitize(parts.join('_'), MAX_NAME_LENGTH);
}

/**
 * After `limit` taken names it returns one carrying `fallback`, rather than
 * looping or overwriting somebody's review.
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
