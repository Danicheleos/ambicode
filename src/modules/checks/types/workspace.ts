export const MUTATION_DISCLAIMER =
  'AMBICODE reports this and does not undo it; the change is yours to keep or revert.';

export interface TreeEntry {
  kind: 'file' | 'symlink' | 'directory' | 'other';
  hash: string | null;
  /** The only mode bit git tracks, and the only one a check can meaningfully flip. */
  executable: boolean;
  bytes: number;
}
