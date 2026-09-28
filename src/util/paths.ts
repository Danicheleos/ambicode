import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import { AmbicodeError } from './errors.ts';
import { toPosix } from './glob.ts';

/** Repository-relative POSIX path, with no `.`/`..` segments and no leading slash. */
export function normalizeRelative(value: string): string {
  const normalized = toPosix(path.posix.normalize(toPosix(value)));
  const trimmed = normalized.replace(/^\.\//, '').replace(/\/+$/, '');
  return trimmed === '.' ? '' : trimmed;
}

/** The path relative to `projectRoot` (`''` is the repository root), or null when outside it. */
export function toProjectRelative(projectRoot: string, repositoryRelativePath: string): string | null {
  const value = normalizeRelative(repositoryRelativePath);
  if (projectRoot === '') return value;
  if (value === projectRoot) return '';
  return value.startsWith(`${projectRoot}/`) ? value.slice(projectRoot.length + 1) : null;
}

export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Resolve a path that a pack or configuration file pointed at, and prove it is
 * still inside `boundary` after symlinks are followed.
 */
export async function resolveInsideBoundary(
  fs: FileSystem,
  boundary: string,
  declaredPath: string,
  what: string,
): Promise<string> {
  const candidate = path.resolve(boundary, declaredPath);
  if (!isInside(boundary, candidate)) {
    throw new AmbicodeError('path-escape', `${what} points outside ${boundary}`, {
      field: declaredPath,
    });
  }
  const realBoundary = await fs.realpath(boundary);
  let realCandidate: string;
  try {
    realCandidate = await fs.realpath(candidate);
  } catch (cause) {
    throw new AmbicodeError('path-missing', `${what} does not exist`, {
      field: declaredPath,
      cause,
    });
  }
  if (!isInside(realBoundary, realCandidate)) {
    throw new AmbicodeError('path-escape', `${what} resolves outside ${boundary} through a link`, {
      field: declaredPath,
    });
  }
  return realCandidate;
}

/** The project whose root is the longest prefix of `filePath`. */
export function mostSpecificRoot<T extends { root: string }>(
  projects: readonly T[],
  relativeFilePath: string,
): T | null {
  const file = normalizeRelative(relativeFilePath);
  let best: T | null = null;
  let bestLength = -1;
  for (const project of projects) {
    const root = normalizeRelative(project.root);
    if (toProjectRelative(root, file) !== null && root.length > bestLength) {
      best = project;
      bestLength = root.length;
    }
  }
  return best;
}
