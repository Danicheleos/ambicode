import type { DiffFile } from '#types/git';

export interface ChangedPath {
  newPath: string | null;
  oldPath: string | null;
  changeKind: DiffFile['changeKind'];
}
