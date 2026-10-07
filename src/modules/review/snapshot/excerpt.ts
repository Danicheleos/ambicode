import type { DiffHunk } from '#types/platform/git';

/** Widest first: the first window whose rendering fits is the one used. */
const CONTEXT_LINES = [50, 20, 5, 0] as const;

export interface Excerpt {
  text: string;
  bytes: number;
  contextLines: number;
}

/**
 * The changed hunks of a file too large to mirror, each with lines around it, every kept line prefixed with
 * its number in the file. Null when the hunks alone do not fit, or the diff carries none.
 */
export function excerptOf(text: string, hunks: readonly DiffHunk[], path: string, fileBytes: number, limitBytes: number): Excerpt | null {
  if (hunks.length === 0) return null;
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  for (const contextLines of CONTEXT_LINES) {
    const rendered = render(path, fileBytes, lines, windows(hunks, contextLines, lines.length), contextLines);
    const bytes = Buffer.byteLength(rendered, 'utf8');
    if (bytes <= limitBytes) return { text: rendered, bytes, contextLines };
  }
  return null;
}

function windows(hunks: readonly DiffHunk[], contextLines: number, total: number): [number, number][] {
  const spans = hunks
    .map((hunk): [number, number] => [
      Math.max(1, hunk.newStart - contextLines),
      Math.min(total, hunk.newStart + Math.max(hunk.newLines, 1) - 1 + contextLines),
    ])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  return merged;
}

function render(path: string, fileBytes: number, lines: readonly string[], spans: readonly [number, number][], contextLines: number): string {
  const width = String(lines.length).length;
  const out = [
    `[AMBICODE excerpt of ${path}: the file is ${fileBytes} bytes, above the mirror ceiling. Shown are its changed hunks with ${contextLines} line(s) around each; "N| " is the line number in the file. The patch holds the whole change.]`,
  ];
  let next = 1;
  for (const [from, to] of spans) {
    if (from > next) out.push(`[lines ${next}-${from - 1} not mirrored]`);
    for (let n = from; n <= to; n += 1) out.push(`${String(n).padStart(width)}| ${lines[n - 1] ?? ''}`);
    next = to + 1;
  }
  if (next <= lines.length) out.push(`[lines ${next}-${lines.length} not mirrored]`);
  return `${out.join('\n')}\n`;
}
