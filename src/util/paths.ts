import path from 'node:path';
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
