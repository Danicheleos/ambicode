import { type ReviewEstimate, type AssembleOptions } from '#types/modules/review';
import { tokenize } from '#util/text';
import { AmbicodeError } from '#util/errors';
import { assembleBundle } from './bundle.ts';
import type { Runtime } from '#types/composition';
import type { DiffFile } from '#types/platform/git';

const SUGGESTED_EXCLUDES = 3;

/** `--exclude` lines a limit refusal can be passed with (08-E3). */
export function refusalSuggestions(files: readonly DiffFile[]): string[] {
  const pathOf = (file: DiffFile): string => file.newPath ?? file.oldPath ?? '';
  const largest = [...files].sort((a, b) => b.addedLines + b.removedLines - (a.addedLines + a.removedLines)).slice(0, SUGGESTED_EXCLUDES);
  const top = [...new Set(files.map(pathOf).filter((file) => file.includes('/')).map((file) => file.split('/')[0]!))];
  return [...largest.map((file) => `--exclude "${pathOf(file)}"`), ...(top.length >= 2 && top.length <= 3 ? top.map((dir) => `--only "${dir}/**"`) : [])];
}

/** A `narrow` answer: `--only <glob>` / `--exclude <glob>` pairs and nothing else (08-E6). */
export function parseNarrow(text: string): { onlyPaths: string[]; excludePaths: string[] } {
  const tokens = tokenize(text);
  const narrowed = { onlyPaths: [] as string[], excludePaths: [] as string[] };
  for (let index = 0; index < tokens.length; index += 2) {
    const [flag, glob] = [tokens[index], tokens[index + 1]];
    if ((flag !== '--only' && flag !== '--exclude') || glob === undefined || glob.startsWith('--') || glob.trim() === '') {
      throw new AmbicodeError('bad-argument', `A narrowing is --only <glob> or --exclude <glob> tokens; "${flag ?? text}" is not one.`, { field: 'narrow' });
    }
    (flag === '--only' ? narrowed.onlyPaths : narrowed.excludePaths).push(glob);
  }
  if (tokens.length === 0) throw new AmbicodeError('bad-argument', 'A narrowing needs at least one --only or --exclude token.', { field: 'narrow' });
  return narrowed;
}

/** The review measured without writing anything or appending to a ledger (07-E1 … 07-E3). */
export async function estimateReview(runtime: Runtime, options: AssembleOptions): Promise<ReviewEstimate> {
  const dry = await assembleBundle({ ...options, runtime, dryRun: true });
  const target = dry.target.kind === 'branch' ? `branch ${dry.target.baseRef ?? dry.target.baseSha?.slice(0, 12) ?? "base"}..HEAD` : 'working tree';
  return {
    target,
    files: dry.files.length,
    changedLines: dry.files.reduce((total, file) => total + file.addedLines + file.removedLines, 0),
    refusal: dry.refusal === null ? null : { code: 'input-too-large', message: dry.refusal.message, suggestions: refusalSuggestions(dry.files) },
  };
}

const more = (count: number): string => `… ${count} more`;

/** Refusal and its suggestions first; the suggestion list is cut with "… N more" to stay within 2,048 bytes (08-E5). */
export function renderEstimate(estimate: ReviewEstimate): string {
  const refusal = estimate.refusal === null ? [] : [
    `refused before the reviewer: ${estimate.refusal.code}: ${estimate.refusal.message}`.slice(0, 300),
    ...estimate.refusal.suggestions.slice(0, 6).map((line) => `  ${line}`.slice(0, 160)),
    ...(estimate.refusal.suggestions.length > 6 ? [`  ${more(estimate.refusal.suggestions.length - 6)}`] : []),
  ];
  return [...refusal, `Review estimate: ${estimate.target} · ${estimate.files} file(s) · ${estimate.changedLines} changed line(s)`].join('\n');
}
