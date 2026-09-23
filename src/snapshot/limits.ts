import type { ReviewConfig } from '../contracts/config.ts';
import { totalChangedLines, type DiffFile } from '../git/diff.ts';
import { AmbicodeError } from '../util/errors.ts';
import { describeExclusion, isExcludedFromReview, type OperatorPatterns } from './exclusions.ts';

export interface MeasuredInput {
  changedFiles: number;
  changedLines: number;
  /** Bytes of the patch, which the composed prompt carries. */
  patchBytes: number;
  /** Bytes of the files mirrored into the snapshot for the reviewer to read. */
  snapshotBytes: number;
  /** Bytes of retrieved requirement content, which the composed prompt carries. */
  requirementBytes: number;
  /**
   * Bytes of the composed canonical prompt: role and contract prompts, scoped
   * policy and prompt files, requirements, prior discussion evidence, check
   * evidence and the patch. Zero before the prompt has been composed.
   */
  promptBytes: number;
  /**
   * Everything available to the model. Once the prompt exists that is the
   * prompt plus the mirrored tree, and the patch and requirements are inside
   * the prompt rather than counted again. Before then it is the sum of the
   * parts that are already known, which is a lower bound on the same number.
   */
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

export interface MeasureParts {
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

/** Encoded UTF-8 bytes, which is what a limit in bytes means (doc 10). */
export function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * Blocks a review whose input exceeds the configured limits, naming what was
 * measured. The change is never truncated to fit, and neither is a requirement
 * (doc 02); only unchanged sibling context is discretionary.
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

/** Every component of the measurement, so a refusal can be acted on. */
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
