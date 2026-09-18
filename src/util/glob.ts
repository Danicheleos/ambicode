import path from 'node:path';

/**
 * Glob matching for `appliesTo`, `include`, and mapping selectors.
 *
 * Backed by `node:path.matchesGlob` so the plugin carries no matcher
 * dependency. Two semantics callers must know about, also stated in the user
 * guide: paths are matched in POSIX form, and a leading-dot segment is not
 * matched by `*` or `**` (`.hidden/a.ts` does not match `**\/*.ts`).
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
