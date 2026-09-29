import path from 'node:path';
import { MAX_SNAPSHOT_FILE_BYTES } from '../config/defaults.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { pathExclusionReason } from './exclusions.ts';
import { excludeLines, oversizedFileLines, type OversizedFile } from './snapshot.ts';

/**
 * Paths out of `git status --porcelain -z`, by current name. A rename or copy is followed by
 * its origin as a record of its own; a deleted path is listed and left to the caller's stat.
 */
export function statusPaths(porcelain: string): string[] {
  const records = porcelain.split('\0').filter((record) => record !== '');
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] as string;
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) index += 1;
  }
  return paths;
}

export interface FindOversizedOptions {
  fs: FileSystem;
  repositoryRoot: string;
  paths: readonly string[];
  excludePaths: readonly string[];
}

/**
 * Sizes come from `lstat`, so nothing is read. A path the review would leave out anyway, a
 * symlink, a directory and a path that no longer exists are not the ceiling's concern.
 */
export async function findOversizedFiles(options: FindOversizedOptions): Promise<OversizedFile[]> {
  const oversized: OversizedFile[] = [];
  for (const relativePath of options.paths) {
    if (relativePath === '' || pathExclusionReason(relativePath, { exclude: options.excludePaths }) !== null) continue;
    try {
      const stats = await options.fs.lstat(path.join(options.repositoryRoot, relativePath));
      if (stats.isFile() && stats.size > MAX_SNAPSHOT_FILE_BYTES) {
        oversized.push({ path: relativePath, bytes: stats.size });
      }
    } catch {
      continue;
    }
  }
  return oversized;
}

/** One notice for the run, in the words and `--exclude` lines the review's own refusal uses. */
export function oversizedNotice(oversized: readonly OversizedFile[]): string {
  return [
    oversized.length === 1
      ? 'A file in this preparation would stop `ambicode review`: it does not fit in the review snapshot.'
      : `${oversized.length} files in this preparation would stop \`ambicode review\`: they do not fit in the review snapshot.`,
    ...oversizedFileLines(oversized),
    'This ceiling is not configurable. Leave the path out deliberately when you review:',
    ...excludeLines(oversized),
  ].join('\n');
}
