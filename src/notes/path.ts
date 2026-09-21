import path from 'node:path';
import { NOTES_DIR } from '../config/defaults.ts';
import { AmbicodeError } from '../util/errors.ts';
import { isInside } from '../util/paths.ts';

/**
 * The one directory an investigation note may live in (doc 04 P2.1). Task and
 * plan notes will get their own sibling directory under `NOTES_DIR` when
 * those skills exist; this boundary is specific to investigations.
 */
export const INVESTIGATION_NOTES_DIR = `${NOTES_DIR}/investigations`;

/**
 * Resolves a candidate note filename against `INVESTIGATION_NOTES_DIR` and
 * refuses anything that would escape it — an absolute path, or a `..` segment
 * that lexically climbs back out. The same shape of check
 * `resolveInsideBoundary` applies to pack/prompt paths (doc 05), sized for a
 * note file that need not exist yet, so this never touches the filesystem.
 */
export function resolveInvestigationNotePath(repositoryRoot: string, requested: string): string {
  const trimmed = requested.trim();
  if (trimmed === '') {
    throw new AmbicodeError('note-path-invalid', 'A note needs a filename.');
  }
  if (path.isAbsolute(trimmed)) {
    throw new AmbicodeError(
      'note-path-escape',
      'A note path must be relative to the repository, not absolute.',
      { field: trimmed },
    );
  }
  const boundary = path.join(repositoryRoot, INVESTIGATION_NOTES_DIR);
  const candidate = path.resolve(boundary, trimmed);
  if (!isInside(boundary, candidate)) {
    throw new AmbicodeError(
      'note-path-escape',
      `An investigation note must stay inside ${INVESTIGATION_NOTES_DIR}/.`,
      { field: trimmed },
    );
  }
  return candidate;
}
