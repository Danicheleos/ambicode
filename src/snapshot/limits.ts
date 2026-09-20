import type { ReviewConfig } from '../contracts/config.ts';
import { totalChangedLines, type DiffFile } from '../git/diff.ts';
import { AmbicodeError } from '../util/errors.ts';
import { describeExclusion, isExcludedFromReview } from './exclusions.ts';

export interface MeasuredInput {
  changedFiles: number;
  changedLines: number;
  /** Bytes of the patch. */
  patchBytes: number;
  /** Bytes of the files mirrored into the snapshot for the reviewer to read. */
  snapshotBytes: number;
  /** The patch and the mirrored tree together: everything the reviewer gets. */
  contextBytes: number;
}

export interface ReviewableChange {
  /** Files that enter the review: mirrored, measured, and present in the patch. */
  files: DiffFile[];
  /** Files kept out, with the reason, so their absence is visible not silent. */
  excluded: { path: string; reason: string }[];
  /** The patch rebuilt from the included files only. */
  patch: string;
}

/**
 * Splits a change into what the review may see and what it may not. The
 * excluded part leaves the patch as well as the mirror, so a `.env` cannot
 * reach the model through the diff.
 */
export function partitionChange(files: readonly DiffFile[]): ReviewableChange {
  const included: DiffFile[] = [];
  const excluded: { path: string; reason: string }[] = [];

  for (const file of files) {
    const reason = isExcludedFromReview(file.oldPath, file.newPath);
    if (reason === null) {
      included.push(file);
      continue;
    }
    excluded.push({
      path: file.newPath ?? file.oldPath ?? '(unnamed)',
      reason: `not reviewed because it is ${describeExclusion(reason)}`,
    });
  }

  // Sections are stored without a guaranteed trailing newline; normalizing one
  // keeps the rebuilt patch parseable by anything that reads it back.
  const patch = included
    .map((file) => (file.patchSection.endsWith('\n') ? file.patchSection : `${file.patchSection}\n`))
    .join('');

  return { files: included, excluded, patch };
}

export function measureInput(
  files: readonly DiffFile[],
  patch: string,
  /** Bytes the snapshot will hold; zero when only the cheap counts are wanted. */
  snapshotBytes = 0,
): MeasuredInput {
  const patchBytes = Buffer.byteLength(patch, 'utf8');
  return {
    changedFiles: files.length,
    changedLines: totalChangedLines(files),
    patchBytes,
    snapshotBytes,
    contextBytes: patchBytes + snapshotBytes,
  };
}

/**
 * Blocks a review whose input exceeds the configured limits, naming what was
 * measured. The change is never truncated to fit (doc 02).
 */
export function enforceReviewInputLimits(
  measured: MeasuredInput,
  limits: ReviewConfig,
  /** Listed largest-first when a limit is hit, so the fix is obvious. */
  files: readonly DiffFile[] = [],
): void {
  const exceeded: string[] = [];

  if (measured.changedFiles > limits.maxChangedFiles) {
    exceeded.push(
      `changed files: ${measured.changedFiles}, limit ${limits.maxChangedFiles} (review.maxChangedFiles)`,
    );
  }
  if (measured.changedLines > limits.maxChangedLines) {
    exceeded.push(
      `changed lines: ${measured.changedLines}, limit ${limits.maxChangedLines} (review.maxChangedLines)`,
    );
  }
  if (measured.contextBytes > limits.maxContextBytes) {
    exceeded.push(
      `initial context: ${measured.contextBytes} bytes ` +
        `(${measured.patchBytes} in the patch, ${measured.snapshotBytes} in the mirrored files), ` +
        `limit ${limits.maxContextBytes} (review.maxContextBytes)`,
    );
  }

  if (exceeded.length === 0) return;

  const largest = [...files]
    .sort((a, b) => b.addedLines + b.removedLines - (a.addedLines + a.removedLines))
    .slice(0, 5)
    .map((file) => `  ${file.newPath ?? file.oldPath ?? '(unnamed)'}: ${file.addedLines + file.removedLines} line(s)`);

  throw new AmbicodeError(
    'input-too-large',
    'This change is larger than the configured review input limits, so it was not sent for review.',
    {
      field: 'review',
      details: [
        ...exceeded,
        ...(largest.length === 0 ? [] : ['largest contributors:', ...largest]),
        'Split the change into reviewable parts, or raise the limit in .ambicode/config.yaml deliberately.',
        'AMBICODE does not review part of a change and report it as a whole.',
      ],
    },
  );
}
