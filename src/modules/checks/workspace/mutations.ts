import path from 'node:path';
import type { Git } from '#platform/git/git';
import { contentHash } from '#util/hash';
import type { FileSystem } from '#types/platform/ports';

/**
 * Commands run in the developer's checkout and can change the code under review. AMBICODE
 * reports what moved and never undoes it.
 */
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

/**
 * Reports what moved between the processes AMBICODE starts. `baseline` is
 * idempotent and `observe` re-baselines, so bracketing every process costs one
 * fingerprint per process that actually ran.
 */
interface WorkspaceWatch {
  baseline(): Promise<void>;
  observe(actor: string): Promise<string[]>;
}

export function watchWorkspace(options: FingerprintOptions): WorkspaceWatch {
  let held: WorkspaceFingerprint | undefined;

  return {
    async baseline(): Promise<void> {
      held ??= await fingerprintWorkspace(options);
    },
    async observe(actor: string): Promise<string[]> {
      if (held === undefined) return [];
      const current = await fingerprintWorkspace(options);
      const mutations = describeMutations(held, current, actor);
      held = current;
      return mutations;
    },
  };
}

/**
 * Reviewed files first: a rewritten file invalidates findings about it. Each
 * line names what ran. The caller adds the disclaimer, once per result.
 */
function describeMutations(
  before: WorkspaceFingerprint,
  after: WorkspaceFingerprint,
  actor: string,
): string[] {
  const mutations: string[] = [];

  for (const [relativePath, previous] of before.fileHashes) {
    const current = after.fileHashes.get(relativePath) ?? null;
    if (current === previous) continue;
    if (previous === null) mutations.push(`${relativePath} was created while ${actor} ran.`);
    else if (current === null) mutations.push(`${relativePath} was removed while ${actor} ran.`);
    else {
      mutations.push(
        `${relativePath} was rewritten while ${actor} ran, so it no longer matches the reviewed revision.`,
      );
    }
  }

  if (before.indexHash !== after.indexHash) {
    mutations.push(`The git index changed while ${actor} ran, so something was staged or unstaged.`);
  }
  if (before.statusHash !== after.statusHash && mutations.length === 0) {
    mutations.push(`The set of modified or untracked files in the repository changed while ${actor} ran.`);
  }

  return mutations;
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
