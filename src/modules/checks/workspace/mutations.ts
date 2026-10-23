import path from 'node:path';
import { contentHash } from '#util/hash';
import type { FileSystem } from '#types/platform/ports';

/** The content hash of each named path; a missing path or a directory is null. */
export async function hashFiles(fs: FileSystem, repositoryRoot: string, paths: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
  const hashes = new Map<string, string | null>();
  for (const relativePath of paths) hashes.set(relativePath, await hashFile(fs, path.join(repositoryRoot, relativePath)));
  return hashes;
}

async function hashFile(fs: FileSystem, absolutePath: string): Promise<string | null> {
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) return null;
    return contentHash(await fs.readBytes(absolutePath));
  } catch {
    return null;
  }
}
