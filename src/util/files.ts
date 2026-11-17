import type { FileSystem } from '#types/platform/ports';

/**
 * `2026-09-22T14-35` in local time, not UTC: the day the reader remembers. Hyphens
 * stand in for colons, which a Windows path segment cannot hold.
 */
export function localTimestamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${date}T${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

/** Writes `<base><extension>`, then `<base>-2<extension>`, … without overwriting, until a name is free; `createExclusive` throws on any error but an existing file. */
export async function writeUniqueFile(fs: Pick<FileSystem, 'createExclusive'>, base: string, extension: string, text: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const file = attempt === 1 ? `${base}${extension}` : `${base}-${attempt}${extension}`;
    if (await fs.createExclusive(file, text)) return file;
  }
}
