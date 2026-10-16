import { contentHash } from '#util/hash';

const MAX_LENGTH = 48;

/** `.ambicode/tasks/<slug>` in a path or a request word. */
export const TASK_PATH = /(?:^|[\\/])\.ambicode[\\/]tasks[\\/]([^\\/\s]+)/;

/** `iteration N` anywhere in a task request. */
export const NAMED_ITERATION = /\biteration\s+(\d+)\b/i;

/** A Jira key such as VS-6735; a ticket link carries one, and the key alone names the task. */
const ISSUE_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;

/**
 * The task name for a request: its issue key lowercased, else the text slugified (lowercase, runs of
 * non-alphanumerics to '-', capped). The same words give the same directory; a text with no Latin letters or digits
 * gets a hash.
 */
export function mintTaskSlug(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const key = ISSUE_KEY.exec(trimmed)?.[0];
  if (key !== undefined) return key.toLowerCase();
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, MAX_LENGTH).replace(/-+$/, '');
  return slug === '' ? `task-${contentHash(trimmed).slice('sha256:'.length, 'sha256:'.length + 8)}` : slug;
}
