/**
 * Hidden HTML-comment marker appended to published comments so a retry can recognize
 * them; it carries only public review ids. Anyone can copy it, so a match also
 * needs the posting identity and the exact pinned position.
 */

const VERSION = 'v1';

/** Deliberately narrow: ids AMBICODE generates, and nothing that ends a comment. */
const FIELD = '[A-Za-z0-9:._-]+';

const PATTERN = new RegExp(
  `<!--\\s*ambicode:${VERSION}\\s+review=(${FIELD})\\s+finding=(${FIELD})\\s+position=(${FIELD})\\s*-->`,
);

interface CommentMarker {
  reviewId: string;
  findingId: string;
  positionDigest: string;
}

export function buildMarker(marker: CommentMarker): string {
  return `<!-- ambicode:${VERSION} review=${marker.reviewId} finding=${marker.findingId} position=${marker.positionDigest} -->`;
}

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

export function markerMatches(found: CommentMarker, expected: CommentMarker): boolean {
  return (
    found.reviewId === expected.reviewId &&
    found.findingId === expected.findingId &&
    found.positionDigest === expected.positionDigest
  );
}
