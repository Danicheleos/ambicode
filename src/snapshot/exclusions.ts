import { isBinaryFile } from 'isbinaryfile';
import { matchesAnyGlob } from '../util/glob.ts';

/**
 * Content kept out of model snapshots (doc 02). Dependency manifests and
 * lockfiles are deliberately absent from this list: their textual changes are
 * reviewable evidence and are included within the size limits.
 */
const EXCLUDED_PATH_GLOBS = [
  '**/.git/**',
  '**/.hg/**',
  '**/.svn/**',
  '**/node_modules/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/.tox/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.gradle/**',
  '**/target/**',
  '**/vendor/**',
  '**/.ambicode/reviews/**',
  '**/.ambicode/task/**',
];

/** Names that usually hold credentials rather than reviewable source. */
const SECRET_NAME_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pypirc$/,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
  /\.(pem|key|p12|pfx|jks|keystore|asc|gpg|ppk)$/i,
  /(^|\/)(credentials|secrets?)(\.[A-Za-z0-9]+)?$/i,
  /(^|\/)service-account.*\.json$/i,
  /(^|\/)\.aws\//,
  /(^|\/)\.ssh\//,
];

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'avif', 'tif', 'tiff',
  'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', 'zst', '7z', 'rar', 'jar', 'war',
  'mp3', 'mp4', 'mov', 'avi', 'mkv', 'wav', 'flac', 'ogg', 'webm',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'so', 'dylib', 'dll', 'exe', 'bin', 'o', 'a', 'class', 'pyc', 'wasm',
  'sqlite', 'db', 'parquet',
]);

/**
 * Worth reviewing when changed, worthless as surrounding context. A lockfile
 * the change touches is still reviewed; an unchanged one would occupy a third
 * of the context budget for nothing.
 */
const GENERATED_CONTEXT_NAMES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'Cargo.lock',
  'composer.lock',
  'Gemfile.lock',
  'poetry.lock',
  'Pipfile.lock',
  'uv.lock',
  'go.sum',
]);

/** Whether an unchanged neighbour is worth mirroring purely as context. */
export function isUselessAsContext(relativePath: string): boolean {
  return GENERATED_CONTEXT_NAMES.has(relativePath.split('/').pop() ?? '');
}

export type ExclusionReason =
  | 'excluded-directory'
  | 'operator-pattern'
  | 'not-selected'
  | 'credential-like-name'
  | 'binary-extension'
  | 'binary-content'
  | 'too-large'
  | 'symlink';

/**
 * The globs the operator named for this run. `exclude` comes from `--exclude`
 * and `review.excludePaths`; `include` from `--only`, which reviews nothing
 * else. Both empty by default: nothing project-specific ships, and a review
 * only ever narrows because somebody said to.
 */
export interface OperatorPatterns {
  exclude?: readonly string[];
  include?: readonly string[];
}

export function pathExclusionReason(
  relativePath: string,
  operator: OperatorPatterns = {},
): ExclusionReason | null {
  if (matchesAnyGlob(relativePath, EXCLUDED_PATH_GLOBS)) return 'excluded-directory';
  const exclude = operator.exclude ?? [];
  if (exclude.length > 0 && matchesAnyGlob(relativePath, exclude)) return 'operator-pattern';
  if (SECRET_NAME_PATTERNS.some((pattern) => pattern.test(relativePath))) return 'credential-like-name';
  const extension = relativePath.split('.').pop()?.toLowerCase();
  if (extension !== undefined && BINARY_EXTENSIONS.has(extension)) return 'binary-extension';
  return null;
}

/**
 * Content classification on bytes, before anything is decoded (doc 11). The
 * extension list above is an early optimization; this is the decision, so text
 * carrying an unfamiliar extension stays reviewable.
 */
export async function isBinaryContent(bytes: Uint8Array): Promise<boolean> {
  return await isBinaryFile(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

export function describeExclusion(reason: ExclusionReason): string {
  switch (reason) {
    case 'excluded-directory':
      return 'inside a dependency, build output, or version-control directory';
    case 'operator-pattern':
      return 'excluded by a path pattern this run was given (--exclude or review.excludePaths)';
    case 'not-selected':
      return 'outside the paths this run was told to review (--only)';
    case 'credential-like-name':
      return 'the name matches a credential or private-key pattern';
    case 'binary-extension':
      return 'a binary file extension';
    case 'binary-content':
      return 'the contents are binary';
    case 'too-large':
      return 'larger than the configured snapshot budget';
    case 'symlink':
      return 'a symbolic link, which AMBICODE reports but does not follow';
  }
}

/**
 * Kept out of the reviewable material entirely: not mirrored, not measured, not
 * in the patch. Both names are tested, since a rename out of an excluded
 * directory still carries that content in its diff.
 */
export function isExcludedFromReview(
  oldPath: string | null,
  newPath: string | null,
  operator: OperatorPatterns = {},
): ExclusionReason | null {
  const names = [newPath, oldPath].filter((name): name is string => name !== null);

  // `--only` is answered across both names at once, not per name: a file
  // renamed *into* the selection is in it, even though the path it came from
  // was not. Exclusion is the opposite and stays per name below, so a rename
  // out of node_modules cannot carry that content in on its new name.
  const include = operator.include ?? [];
  if (include.length > 0 && !names.some((name) => matchesAnyGlob(name, include))) {
    return 'not-selected';
  }

  for (const candidate of names) {
    const reason = pathExclusionReason(candidate, operator);
    if (reason !== null) return reason;
  }
  return null;
}
