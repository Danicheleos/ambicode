import { AmbicodeError } from '#util/errors';
import { totalChangedLines } from '#platform/git/diff';
import { describeExclusion, isExcludedFromReview } from '#util/path-classes';
import type { AmbicodeConfig } from '#types/modules/config';
import type { DiffFile } from '#types/platform/git';
import type { MeasuredInput } from '#types/modules/review';
import type { OperatorPatterns } from '../types/snapshot.ts';

/** Encoded UTF-8 bytes, not UTF-16 code units: that is what a limit in bytes means. */
export const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8');

/** The excluded part leaves the patch and the file list, so a `.env` cannot reach the model through the diff. */
export function partitionChange(files: readonly DiffFile[], operator: OperatorPatterns = {}): { files: DiffFile[]; excluded: { path: string; reason: string }[]; patch: string } {
  const included: DiffFile[] = [];
  const excluded: { path: string; reason: string }[] = [];
  for (const file of files) {
    const reason = isExcludedFromReview(file.oldPath, file.newPath, operator);
    if (reason === null) included.push(file);
    else excluded.push({ path: file.newPath ?? file.oldPath ?? '(unnamed)', reason: `not reviewed because it is ${describeExclusion(reason)}` });
  }
  const patch = included.map((file) => (file.patchSection.endsWith('\n') ? file.patchSection : `${file.patchSection}\n`)).join('');
  return { files: included, excluded, patch };
}

export function measureInput(files: readonly DiffFile[], patch: string, parts: { requirementBytes?: number } = {}): MeasuredInput {
  const patchBytes = byteLength(patch);
  const requirementBytes = parts.requirementBytes ?? 0;
  return { changedFiles: files.length, changedLines: totalChangedLines(files), patchBytes, requirementBytes, contextBytes: patchBytes + requirementBytes };
}

/** The change is never truncated to fit, and neither is a requirement. */
export function enforceReviewInputLimits(measured: MeasuredInput, limits: AmbicodeConfig['skills']['review'], files: readonly DiffFile[] = []): void {
  const exceeded: string[] = [];
  if (limits.maxChangedFiles !== null && measured.changedFiles > limits.maxChangedFiles) exceeded.push(`changed files: ${measured.changedFiles}, limit ${limits.maxChangedFiles} (skills.review.maxChangedFiles)`);
  if (limits.maxChangedLines !== null && measured.changedLines > limits.maxChangedLines) exceeded.push(`changed lines: ${measured.changedLines}, limit ${limits.maxChangedLines} (skills.review.maxChangedLines)`);
  if (limits.maxContextBytes !== null && measured.contextBytes > limits.maxContextBytes) {
    exceeded.push(
      `model input: ${measured.contextBytes} bytes, limit ${limits.maxContextBytes} (skills.review.maxContextBytes)`,
      'measured components:',
      `  patch: ${measured.patchBytes} bytes`,
      `  requirement content: ${measured.requirementBytes} bytes`,
    );
  }
  if (exceeded.length === 0) return;
  const largest = [...files]
    .sort((a, b) => b.addedLines + b.removedLines - (a.addedLines + a.removedLines))
    .slice(0, 5)
    .map((file) => `  ${file.newPath ?? file.oldPath ?? '(unnamed)'}: ${file.addedLines + file.removedLines} line(s)`);
  throw new AmbicodeError('input-too-large', 'This review is larger than the configured input limits, so it was not sent to the reviewer.', {
    field: 'review',
    details: [
      ...exceeded,
      ...(largest.length === 0 ? [] : ['largest changed files:', ...largest]),
      'Split the change into reviewable parts, supply fewer or smaller requirements, or raise the limit in .ambicode/config.yaml deliberately.',
      'Or narrow it deliberately: --exclude <glob>, repeatable, also skills.review.excludePaths. Matching paths leave the patch, the file list and these counts, and the report states the gap.',
      'AMBICODE does not truncate a change or a requirement to fit and then report on the whole.',
    ],
  });
}
