import { AmbicodeError } from './errors.ts';
import type { FileSystem } from '#types/platform/ports';

/** Same-minute artifacts of one stem get `-2`…`-9` suffixes before the writer gives up. */
export const UNIQUE_FILE_LIMIT = 9;

/**
 * `2026-09-22T14-35` in local time, not UTC: the day the reader remembers. Hyphens
 * stand in for colons, which a Windows path segment cannot hold.
 */
export function localTimestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${date}T${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

/** Writes `<base><extension>`, then `<base>-2<extension>`, … without overwriting; null once the limit is reached. */
export async function writeUniqueFile(fs: Pick<FileSystem, 'createExclusive'>, base: string, extension: string, text: string): Promise<string | null> {
  for (let attempt = 1; attempt <= UNIQUE_FILE_LIMIT; attempt += 1) {
    const file = attempt === 1 ? `${base}${extension}` : `${base}-${attempt}${extension}`;
    if (await fs.createExclusive(file, text)) return file;
  }
  return null;
}

export const uniqueFileExhausted = (what: string): AmbicodeError =>
  new AmbicodeError('artifact-collision', `${UNIQUE_FILE_LIMIT} ${what} artifacts already exist for this minute; wait and run again.`);
