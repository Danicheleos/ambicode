import type { RemotePosition, RemoteTarget } from '../contracts/provider.ts';
import type { FindingLocation } from '../contracts/review.ts';
import { lineAt, type DiffFile } from '../git/diff.ts';

/**
 * Turns a validated finding location into an explicit diff position (doc 02).
 *
 * The SHAs come from the diff version the review was pinned to, never from the
 * working branch or from GitLab's current head: a comment must land on the code
 * that was reviewed, even if the merge request has moved since.
 *
 * An added line carries `new_line`, a removed line `old_line`, and a context
 * line both. A location that cannot be mapped to exactly one of those shapes is
 * refused rather than approximated.
 */
export type PositionResult =
  | { kind: 'ok'; position: RemotePosition }
  | { kind: 'unmappable'; reason: string };

export function positionForLocation(
  target: RemoteTarget,
  files: readonly DiffFile[],
  location: FindingLocation,
): PositionResult {
  const named = location.side === 'new' ? location.newPath : location.oldPath;
  if (named === null) {
    return { kind: 'unmappable', reason: `the finding names no ${location.side}-side path.` };
  }

  const file = files.find((candidate) =>
    location.side === 'new' ? candidate.newPath === named : candidate.oldPath === named,
  );
  if (file === undefined) {
    return { kind: 'unmappable', reason: `"${named}" is not a file in the pinned diff.` };
  }

  const line = lineAt(file, location.side, location.line);
  if (line === null) {
    return {
      kind: 'unmappable',
      reason: `line ${location.line} is not on the ${location.side} side of "${named}" in the pinned diff.`,
    };
  }

  const shas = { baseSha: target.baseSha, startSha: target.startSha, headSha: target.headSha };

  switch (line.kind) {
    case 'added':
      // An added line exists only after the change, so only new_line is set.
      return {
        kind: 'ok',
        position: {
          ...shas,
          oldPath: file.oldPath ?? file.newPath,
          newPath: file.newPath,
          oldLine: null,
          newLine: line.newLine,
        },
      };
    case 'removed':
      // A removed line exists only before the change, so only old_line is set.
      return {
        kind: 'ok',
        position: {
          ...shas,
          oldPath: file.oldPath,
          newPath: file.newPath ?? file.oldPath,
          oldLine: line.oldLine,
          newLine: null,
        },
      };
    case 'context':
      // A context line exists on both sides and must carry both numbers, or
      // GitLab attaches it to the wrong side of the diff.
      return {
        kind: 'ok',
        position: {
          ...shas,
          oldPath: file.oldPath,
          newPath: file.newPath,
          oldLine: line.oldLine,
          newLine: line.newLine,
        },
      };
  }
}

/** The wire shape GitLab's discussions API expects for a text position. */
export function toGitLabPositionFields(position: RemotePosition): Record<string, string | number> {
  const fields: Record<string, string | number> = {
    position_type: 'text',
    base_sha: position.baseSha,
    start_sha: position.startSha,
    head_sha: position.headSha,
  };
  if (position.oldPath !== null) fields.old_path = position.oldPath;
  if (position.newPath !== null) fields.new_path = position.newPath;
  if (position.oldLine !== null) fields.old_line = position.oldLine;
  if (position.newLine !== null) fields.new_line = position.newLine;
  return fields;
}
