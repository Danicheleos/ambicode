import type { ReviewConfig } from '#types/modules/config';
import { totalChangedLines } from '#platform/git/diff';
import { AmbicodeError } from '#util/errors';
import { describeExclusion, isExcludedFromReview } from './exclusions.ts';
import type { DiffFile } from '#types/platform/git';
import type { MeasuredInput } from '#types/modules/review';
import type { OperatorPatterns } from '../types/snapshot.ts';

interface ReviewableChange {
  files: DiffFile[];
  excluded: { path: string; reason: string }[];
  /** The patch rebuilt from the included files only. */
  patch: string;
}

/**
 * The excluded part leaves the patch as well as the mirror, so a `.env` cannot
 * reach the model through the diff.
 */
export function partitionChange(
  files: readonly DiffFile[],
  operator: OperatorPatterns = {},
): ReviewableChange {
  const included: DiffFile[] = [];
  const excluded: { path: string; reason: string }[] = [];

  for (const file of files) {
    const reason = isExcludedFromReview(file.oldPath, file.newPath, operator);
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

interface MeasureParts {
  /** Bytes the mirrored tree holds; zero when only the cheap counts are wanted. */
  snapshotBytes?: number;
  requirementBytes?: number;
  /** Set once the canonical prompt exists; it then decides `contextBytes`. */
  promptBytes?: number;
}

export function measureInput(
  files: readonly DiffFile[],
  patch: string,
  parts: MeasureParts = {},
): MeasuredInput {
  const patchBytes = byteLength(patch);
  const snapshotBytes = parts.snapshotBytes ?? 0;
  const requirementBytes = parts.requirementBytes ?? 0;
  const promptBytes = parts.promptBytes ?? 0;
  return {
    changedFiles: files.length,
    changedLines: totalChangedLines(files),
    patchBytes,
    snapshotBytes,
    requirementBytes,
    promptBytes,
    contextBytes:
      promptBytes > 0 ? promptBytes + snapshotBytes : patchBytes + requirementBytes + snapshotBytes,
  };
}

/** Encoded UTF-8 bytes, not UTF-16 code units: that is what a limit in bytes means. */
export function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * The change is never truncated to fit, and neither is a requirement; only
 * unchanged sibling context is discretionary.
 */
export function enforceReviewInputLimits(
  measured: MeasuredInput,
  limits: ReviewConfig,
  /** Listed largest-first when a limit is hit, so the fix is obvious. */
  files: readonly DiffFile[] = [],
): void {
  const exceeded: string[] = [];

  if (limits.maxChangedFiles !== null && measured.changedFiles > limits.maxChangedFiles) {
    exceeded.push(
      `changed files: ${measured.changedFiles}, limit ${limits.maxChangedFiles} (review.maxChangedFiles)`,
    );
  }
  if (limits.maxChangedLines !== null && measured.changedLines > limits.maxChangedLines) {
    exceeded.push(
      `changed lines: ${measured.changedLines}, limit ${limits.maxChangedLines} (review.maxChangedLines)`,
    );
  }
  if (limits.maxContextBytes !== null && measured.contextBytes > limits.maxContextBytes) {
    exceeded.push(
      `model input: ${measured.contextBytes} bytes, limit ${limits.maxContextBytes} (review.maxContextBytes)`,
      ...describeComponents(measured),
    );
  }

  if (exceeded.length === 0) return;

  const largest = [...files]
    .sort((a, b) => b.addedLines + b.removedLines - (a.addedLines + a.removedLines))
    .slice(0, 5)
    .map((file) => `  ${file.newPath ?? file.oldPath ?? '(unnamed)'}: ${file.addedLines + file.removedLines} line(s)`);

  throw new AmbicodeError(
    'input-too-large',
    'This review is larger than the configured input limits, so it was not sent to the reviewer.',
    {
      field: 'review',
      details: [
        ...exceeded,
        ...(largest.length === 0 ? [] : ['largest changed files:', ...largest]),
        'Split the change into reviewable parts, supply fewer or smaller requirements, or raise the limit in .ambicode/config.yaml deliberately.',
        'Or narrow it deliberately: --exclude <glob>, repeatable, also review.excludePaths. Matching paths leave the patch, the mirror and these counts, and the report states the gap.',
        'AMBICODE does not truncate a change or a requirement to fit and then report on the whole.',
      ],
    },
  );
}

function describeComponents(measured: MeasuredInput): string[] {
  const lines =
    measured.promptBytes > 0
      ? [
          `  composed prompt: ${measured.promptBytes} bytes (including ${measured.patchBytes} of patch and ${measured.requirementBytes} of requirement content)`,
          `  mirrored files the reviewer can read: ${measured.snapshotBytes} bytes`,
        ]
      : [
          `  patch: ${measured.patchBytes} bytes`,
          `  requirement content: ${measured.requirementBytes} bytes`,
          `  mirrored files the reviewer can read: ${measured.snapshotBytes} bytes`,
        ];
  return ['measured components:', ...lines];
}
