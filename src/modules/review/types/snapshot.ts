import type { DiffFile } from '#types/git';
import type { ReviewTarget } from '#types/review';

/**
 * A revision is immutable; the working tree is read once at target resolution and
 * held, so mirror, patch and identity describe the same bytes.
 */
export type FileContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary' }
  | { kind: 'symlink' }
  | { kind: 'too-large'; bytes: number };

export interface ContentSource {
  readonly pinning: string;
  readonly digest: string;
  read(relativePath: string): Promise<FileContent | null>;
  list(directoryName: string): Promise<string[]>;
  /**
   * Lets a remote source fetch these together. Never authoritative: `read` still
   * answers every path, so a source that ignores this behaves identically.
   */
  prime?(relativePaths: readonly string[]): Promise<void>;
}

export type ExclusionReason =
  | 'excluded-directory'
  | 'operator-pattern'
  | 'not-selected'
  | 'test-file'
  | 'credential-like-name'
  | 'binary-extension'
  | 'binary-content'
  | 'too-large'
  | 'symlink';

/**
 * `exclude` comes from `--exclude` and `review.excludePaths`; `include` from `--only`.
 * Both empty by default: a review only ever narrows because somebody said to.
 */
export interface OperatorPatterns {
  exclude?: readonly string[];
  include?: readonly string[];
  excludeTests?: boolean;
}

export interface TargetResolution {
  target: ReviewTarget;
  files: DiffFile[];
  patch: string;
  /** The only place downstream code reads reviewed file bytes from. */
  content: ContentSource;
  preImageRevision: string;
}
