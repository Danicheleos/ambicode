import path from 'node:path';

/**
 * POSIX-form glob. A leading-dot segment is not matched by `*` or `**`:
 * `.hidden/a.ts` does not match `**\/*.ts`.
 */
export function matchesGlob(relativePath: string, glob: string): boolean {
  return path.matchesGlob(toPosix(relativePath), toPosix(glob));
}

export function matchesAnyGlob(relativePath: string, globs: readonly string[]): boolean {
  return globs.some((glob) => matchesGlob(relativePath, glob));
}

export function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
