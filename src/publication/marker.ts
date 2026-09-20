/**
 * The hidden marker AMBICODE appends to every comment it publishes.
 *
 * It exists so a retry can recognize a comment it already posted (doc 02,
 * "Reconciliation"). It is an HTML comment, which GitLab's markdown renderer
 * hides, and it carries only identifiers that are already public in the review
 * directory: no capability, no session, no token.
 *
 * Reading a marker proves nothing on its own. A match counts only when the
 * posting identity and the exact pinned position agree as well, because anyone
 * who can read a merge request can copy the text of a comment.
 */

const VERSION = 'v1';

/** Deliberately narrow: ids AMBICODE generates, and nothing that ends a comment. */
const FIELD = '[A-Za-z0-9:._-]+';

const PATTERN = new RegExp(
  `<!--\\s*ambicode:${VERSION}\\s+review=(${FIELD})\\s+finding=(${FIELD})\\s+position=(${FIELD})\\s*-->`,
);

export interface CommentMarker {
  reviewId: string;
  findingId: string;
  positionDigest: string;
}

export function buildMarker(marker: CommentMarker): string {
  return `<!-- ambicode:${VERSION} review=${marker.reviewId} finding=${marker.findingId} position=${marker.positionDigest} -->`;
}

/**
 * The human's text, verbatim, followed by the marker. The visible body is never
 * rewritten, reflowed or trimmed: what they wrote is what is published.
 */
export function appendMarker(body: string, marker: CommentMarker): string {
  return `${body}\n\n${buildMarker(marker)}`;
}

export function findMarker(body: string): CommentMarker | null {
  const match = PATTERN.exec(body);
  if (match === null) return null;
  return {
    reviewId: match[1] as string,
    findingId: match[2] as string,
    positionDigest: match[3] as string,
  };
}

/** Whether every marker field a comment carries is the one expected here. */
export function markerMatches(found: CommentMarker, expected: CommentMarker): boolean {
  return (
    found.reviewId === expected.reviewId &&
    found.findingId === expected.findingId &&
    found.positionDigest === expected.positionDigest
  );
}
