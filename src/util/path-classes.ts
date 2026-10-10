import { matchesAnyGlob } from '#util/glob';
import type { OperatorPatterns, ExclusionReason } from '#types/util';

/**
 * Dependency manifests and lockfiles are deliberately absent: their textual
 * changes are reviewable evidence.
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
  '**/.ambicode/tasks/**',
];

/**
 * Deliberately narrow: `fixtures/`, `testdata/` or a `test` directory can hold shipped
 * code. A file must say it is a test in its own name, or sit in a directory whose name
 * is a test convention and nothing else. Off by default: a local review sees its tests.
 */
export const TEST_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)[^/]+\.(spec|test|cy)\.[^/]+$/,
  /(^|\/)[^/]+_(test|spec)\.[^/]+$/,
  /(^|\/)test_[^/]+\.py$/,
  /(^|\/)conftest\.py$/,
  /(^|\/)(__tests__|__mocks__|tests|test|spec|e2e|cypress)\//,
];

/** Prose, data, markup and style files: they mention names without using them, so a name search skips them. */
const NON_CODE_EXTENSIONS = new Set(['md', 'mdx', 'txt', 'rst', 'adoc', 'json', 'yaml', 'yml', 'toml', 'lock', 'csv', 'xml', 'svg', 'html', 'htm', 'css', 'scss', 'sass', 'less']);

/** A file a name search may list: not a test, not prose, data, markup or style, and nothing `pathExclusionReason` rejects. */
export function isSearchable(relativePath: string): boolean {
  return pathExclusionReason(relativePath, { excludeTests: true }) === null && !NON_CODE_EXTENSIONS.has(relativePath.split('.').pop()?.toLowerCase() ?? '');
}

export function isTestPath(relativePath: string): boolean {
  return TEST_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
}

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

export function pathExclusionReason(
  relativePath: string,
  operator: OperatorPatterns = {},
): ExclusionReason | null {
  if (matchesAnyGlob(relativePath, EXCLUDED_PATH_GLOBS)) return 'excluded-directory';
  const exclude = operator.exclude ?? [];
  if (exclude.length > 0 && matchesAnyGlob(relativePath, exclude)) return 'operator-pattern';
  if (operator.excludeTests === true && isTestPath(relativePath)) return 'test-file';
  if (SECRET_NAME_PATTERNS.some((pattern) => pattern.test(relativePath))) return 'credential-like-name';
  const extension = relativePath.split('.').pop()?.toLowerCase();
  if (extension !== undefined && BINARY_EXTENSIONS.has(extension)) return 'binary-extension';
  return null;
}

export function describeExclusion(reason: ExclusionReason): string {
  switch (reason) {
    case 'excluded-directory':
      return 'inside a dependency, build output, or version-control directory';
    case 'operator-pattern':
      return 'excluded by a path pattern this run was given (--exclude or review.excludePaths)';
    case 'not-selected':
      return 'outside the paths this run was told to review (--only)';
    case 'test-file':
      return 'test code, which merge-request review leaves out unless --with-tests is passed';
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
 * Not mirrored, not measured, not in the patch. Both names are tested, since a
 * rename out of an excluded directory still carries that content in its diff.
 */
export function isExcludedFromReview(
  oldPath: string | null,
  newPath: string | null,
  operator: OperatorPatterns = {},
): ExclusionReason | null {
  const names = [newPath, oldPath].filter((name): name is string => name !== null);

  // `--only` matches either name, so a file renamed into the selection is in it.
  // Exclusion stays per name below, so a rename out of node_modules cannot carry it in.
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
