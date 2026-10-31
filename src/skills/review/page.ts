import path from 'node:path';
import { chainEntries } from '../common.ts';
import { ReviewResult } from '#types/modules/review';
import type { Handler } from '#types/harness';
import type { LedgerEntry } from '#types/modules/evidence';
import type { FileSystem } from '#types/platform/ports';

/** Repository-relative path of the latest recorded review's result.json; its folder holds the review's changed.diff. */
export function recordedResultFile(entries: readonly LedgerEntry[]): string | null {
  const file = entries.findLast((entry) => entry.kind === 'review' && entry['stage'] === 'recorded')?.['result'];
  return typeof file === 'string' ? file : null;
}

/** The latest recorded review's result, or null when none is recorded or its file is unreadable. */
export async function recordedResult(fs: FileSystem, repositoryRoot: string, entries: readonly LedgerEntry[]): Promise<ReviewResult | null> {
  const file = recordedResultFile(entries);
  const parsed = file !== null
    ? await fs.readText(path.join(repositoryRoot, file)).then((text) => ReviewResult.safeParse(JSON.parse(text)), () => null).catch(() => null)
    : null;
  return parsed?.success ? parsed.data : null;
}

const URL_LINE = /^http:\/\/127\.0\.0\.1:\d+\/\S+$/;

/** The page is a detached process because a step's own process ends with the step; the child prints its link and nothing else. */
export const page: Handler = async (input) => {
  const { runtime, dir } = input;
  const result = await recordedResult(runtime.fs, dir.repositoryRoot, await chainEntries(input));
  if (result === null || (result.findings.length === 0 && input.args.target?.mr == null)) return { state: 'ok', payload: null };
  const outcome = await runtime.runner.run({
    argv: [process.execPath, path.join(runtime.pluginRoot, 'scripts', 'ambicode.mjs'), 'review', 'page', '--task', dir.slug],
    cwd: dir.repositoryRoot, timeoutMs: 15_000, maxOutputBytes: 4096, env: { kind: 'inherited' }, detached: true,
  });
  const lines = outcome.stdout.trim().split('\n');
  const line = lines.at(-1) ?? '';
  // A failure is reported as no page, never as an empty link; a line before the link is a note (a fixed port that was taken).
  return { state: 'ok', payload: URL_LINE.test(line) ? `Review page: ${line}${lines.length > 1 ? `\n${lines.slice(0, -1).join('\n')}` : ''}` : `Review page unavailable: ${outcome.failure ?? (outcome.stderr.trim().split('\n')[0] || `the page process ${outcome.kind}`)}` };
};
