import { contentHash } from '#util/hash';

const MAX_LENGTH = 48;

/**
 * The caller's text slugified: lowercase, runs of non-alphanumerics to '-', capped. The same words give the same
 * directory; a text with no Latin letters or digits gets a hash.
 */
export function mintTaskSlug(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, MAX_LENGTH).replace(/-+$/, '');
  return slug === '' ? `task-${contentHash(trimmed).slice('sha256:'.length, 'sha256:'.length + 8)}` : slug;
}
