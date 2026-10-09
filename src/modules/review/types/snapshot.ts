import type { DiffFile } from '#types/platform/git';
import type { ReviewTarget } from '#types/modules/review';

/**
 * A revision is immutable; the working tree is read once at target resolution and
 * held, so mirror, patch and identity describe the same bytes.
 */
export type FileContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary' }
  | { kind: 'symlink' }
  | { kind: 'too-large'; bytes: number; text?: string };

export interface ContentSource {
  readonly pinning: string;
  readonly digest: string;
  read(relativePath: string): Promise<FileContent | null>;
  list(directoryName: string): Promise<string[]>;
}

export type { ExclusionReason, OperatorPatterns } from '#types/util';

export interface TargetResolution {
  target: ReviewTarget;
  files: DiffFile[];
  patch: string;
  /** The only place downstream code reads reviewed file bytes from. */
  content: ContentSource;
  preImageRevision: string;
}
