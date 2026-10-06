export interface DiffLine {
  kind: 'context' | 'added' | 'removed';
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string | null;
  newPath: string | null;
  changeKind: RawChangeKind;
  binary: boolean;
  addedLines: number;
  removedLines: number;
  hunks: DiffHunk[];
  patchSection: string;
}

export type RawChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';

export interface RawChange {
  oldPath: string | null;
  newPath: string | null;
  changeKind: RawChangeKind;
  oldMode: string;
  newMode: string;
}
