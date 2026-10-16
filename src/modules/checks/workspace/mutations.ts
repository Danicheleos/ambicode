import path from 'node:path';
import type { Git } from '#platform/git/git';
import { contentHash } from '#util/hash';
import type { FileSystem } from '#types/platform/ports';

/** What the baseline records: the index, the status and the hashes of the named paths. */
interface WorkspaceFingerprint {
  indexHash: string | null;
  statusHash: string;
  fileHashes: ReadonlyMap<string, string | null>;
}

interface FingerprintOptions {
  fs: FileSystem;
  git: Git;
  repositoryRoot: string;
  paths: readonly string[];
}

export async function fingerprintWorkspace(options: FingerprintOptions): Promise<WorkspaceFingerprint> {
  const fileHashes = new Map<string, string | null>();
  for (const relativePath of options.paths) {
    fileHashes.set(relativePath, await hashFile(options.fs, path.join(options.repositoryRoot, relativePath)));
  }

  return {
    indexHash: await hashFile(options.fs, path.join(await options.git.gitDir(), 'index')),
    statusHash: contentHash(await options.git.status()),
    fileHashes,
  };
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
