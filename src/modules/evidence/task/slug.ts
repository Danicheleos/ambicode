import { contentHash } from '#util/hash';
import { findIssueKey } from '#util/issue-key';

const MAX_LENGTH = 48;

/** `.ambicode/tasks/<slug>` in a path or a request word. */
export const TASK_PATH = /(?:^|[\\/])\.ambicode[\\/]tasks[\\/]([^\\/\s]+)/;

const NAMED_ITERATION = /\biteration\s+(\d+)\b/i;

/**
 * The task name for a request: its issue key lowercased, else the text slugified (lowercase, runs of
 * non-alphanumerics to '-', capped). The same words give the same directory; a text with no Latin letters or digits
 * gets a hash.
 */
export function mintTaskSlug(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const key = findIssueKey(trimmed);
  if (key !== null) return key.toLowerCase();
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, MAX_LENGTH).replace(/-+$/, '');
  return slug === '' ? `task-${contentHash(trimmed).slice('sha256:'.length, 'sha256:'.length + 8)}` : slug;
}

/** `iteration N` anywhere; a bare number only when it is all that follows the task word (`ORD-17 2`) or all of the text. */
export function iterationOf(text: string, slug: string): number | null {
  const named = NAMED_ITERATION.exec(text);
  if (named !== null) return Number(named[1]);
  const words = text.trim().split(/\s+/);
  const at = words.findIndex((word) => (TASK_PATH.exec(word)?.[1] ?? mintTaskSlug(word)) === slug);
  const rest = words.slice(at + 1);
  return rest.length === 1 && /^\d+$/.test(rest[0]!) ? Number(rest[0]) : null;
}
