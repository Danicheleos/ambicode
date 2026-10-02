import { contentHash } from '../util/hash.ts';

const TICKET_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
const FILLER = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'is', 'it', 'this', 'that', 'with', 'how', 'does', 'do', 'what', 'why', 'which', 'i', 'we', 'my', 'me', 'please', 'can', 'you', 'would', 'should']);
const WORDS = 5;
const MAX_LENGTH = 40;

/**
 * The model chose the slug itself, so an investigation saved under a kebab of the question and a plan for the
 * same ticket under its id (2026-10-02 runs). A function of the request makes the same words give the same
 * directory. A ticket key wins over prose; a request with no Latin words (nothing survives the split) gets a hash.
 */
export function mintTaskSlug(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const ticket = TICKET_KEY.exec(trimmed);
  if (ticket !== null) return ticket[0];
  const words = trimmed.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word !== '' && !FILLER.has(word));
  const slug = words.slice(0, WORDS).join('-').slice(0, MAX_LENGTH).replace(/-+$/, '');
  return slug === '' ? `task-${contentHash(trimmed).slice('sha256:'.length, 'sha256:'.length + 8)}` : slug;
}
