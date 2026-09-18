import { AmbicodeError } from '../util/errors.ts';
import type { RawChange, RawChangeKind } from './git.ts';

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
}

/**
 * Pairs the authoritative `--raw -z` change list with the patch body.
 *
 * The patch is split only on `diff --git` boundaries and never parsed for
 * paths, because `diff --git a/x b/y` is ambiguous for paths containing
 * spaces. git emits both listings in the same order, so the two are zipped by
 * position and a length mismatch is an error rather than a silent guess.
 */
export function combineDiff(changes: readonly RawChange[], patch: string): DiffFile[] {
  const sections = splitPatchSections(patch);
  if (sections.length !== changes.length) {
    throw new AmbicodeError(
      'diff-mismatch',
      `git reported ${changes.length} changed files but produced ${sections.length} patch sections.`,
      { details: ['AMBICODE will not guess which patch belongs to which file.'] },
    );
  }

  return changes.map((change, index) => {
    const section = sections[index] ?? '';
    const binary = /^Binary files .* differ$/m.test(section) || /^GIT binary patch$/m.test(section);
    const hunks = binary ? [] : parseHunks(section);
    return {
      oldPath: change.oldPath,
      newPath: change.newPath,
      changeKind: change.changeKind,
      binary,
      addedLines: hunks.reduce((total, hunk) => total + hunk.lines.filter((l) => l.kind === 'added').length, 0),
      removedLines: hunks.reduce((total, hunk) => total + hunk.lines.filter((l) => l.kind === 'removed').length, 0),
      hunks,
    };
  });
}

export function splitPatchSections(patch: string): string[] {
  if (patch.trim() === '') return [];
  const sections: string[] = [];
  let current: string[] | null = null;

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current !== null) sections.push(current.join('\n'));
      current = [line];
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null) sections.push(current.join('\n'));
  return sections;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseHunks(section: string): DiffHunk[] {
  const lines = section.split('\n');
  const hunks: DiffHunk[] = [];
  let hunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let inHunks = false;

  for (const line of lines) {
    const header = HUNK_HEADER.exec(line);
    if (header !== null) {
      inHunks = true;
      hunk = {
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
      };
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      hunks.push(hunk);
      continue;
    }
    if (!inHunks || hunk === null) continue;

    // "\ No newline at end of file" annotates the preceding line; it is not content.
    if (line.startsWith('\\')) continue;

    const marker = line.charAt(0);
    const text = line.slice(1);
    if (marker === '+') {
      hunk.lines.push({ kind: 'added', oldLine: null, newLine, text });
      newLine += 1;
    } else if (marker === '-') {
      hunk.lines.push({ kind: 'removed', oldLine, newLine: null, text });
      oldLine += 1;
    } else if (marker === ' ') {
      hunk.lines.push({ kind: 'context', oldLine, newLine, text });
      oldLine += 1;
      newLine += 1;
    } else if (line === '') {
      // A trailing empty string from the final split is not a diff line.
      continue;
    } else {
      // Anything else ends the hunk body (for example a following file header
      // that survived sectioning); stop consuming rather than misattribute it.
      inHunks = false;
    }
  }
  return hunks;
}

/** Every line number that exists on a side of the post-review diff. */
export function addressableLines(file: DiffFile, side: 'old' | 'new'): Set<number> {
  const lines = new Set<number>();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const number = side === 'old' ? line.oldLine : line.newLine;
      if (number !== null) lines.add(number);
    }
  }
  return lines;
}

/** The diff line at a position, used to build an exact remote comment position. */
export function lineAt(file: DiffFile, side: 'old' | 'new', line: number): DiffLine | null {
  for (const hunk of file.hunks) {
    for (const candidate of hunk.lines) {
      const number = side === 'old' ? candidate.oldLine : candidate.newLine;
      if (number === line) return candidate;
    }
  }
  return null;
}

export function totalChangedLines(files: readonly DiffFile[]): number {
  return files.reduce((total, file) => total + file.addedLines + file.removedLines, 0);
}
