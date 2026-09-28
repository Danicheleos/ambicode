import type { RemotePosition, RemoteTarget } from '../contracts/provider.ts';
import type { FindingLocation } from '../contracts/review.ts';
import { lineAt, type DiffFile } from '../git/diff.ts';

/**
 * SHAs come from the pinned diff version, never GitLab's current head, so a comment lands on the
 * reviewed code. A location that maps to no single line shape is refused, not approximated.
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
      // Without both numbers GitLab attaches a context line to the wrong side of the diff.
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
