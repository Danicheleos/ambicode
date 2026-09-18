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

export type ExclusionReason =
  | 'excluded-directory'
  | 'credential-like-name'
  | 'binary-extension'
  | 'binary-content'
  | 'too-large'
  | 'symlink';

export function pathExclusionReason(relativePath: string): ExclusionReason | null {
  if (matchesAnyGlob(relativePath, EXCLUDED_PATH_GLOBS)) return 'excluded-directory';
  if (SECRET_NAME_PATTERNS.some((pattern) => pattern.test(relativePath))) return 'credential-like-name';
  const extension = relativePath.split('.').pop()?.toLowerCase();
  if (extension !== undefined && BINARY_EXTENSIONS.has(extension)) return 'binary-extension';
  return null;
}

/** A NUL byte in the first block is the same heuristic git itself uses. */
export function looksBinary(contents: string): boolean {
  return contents.slice(0, 8000).includes('\0');
}

export function describeExclusion(reason: ExclusionReason): string {
  switch (reason) {
    case 'excluded-directory':
      return 'inside a dependency, build output, or version-control directory';
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
