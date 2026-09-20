import path from 'node:path';
import type { Git } from '../git/git.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { contentHash } from '../util/hash.ts';

/**
 * Project commands run in the developer's checkout, so a formatter or a
 * selector script can change the code under review. AMBICODE reports what moved
 * and never undoes it (doc 03, P1.3 item 5).
 */
export interface WorkspaceFingerprint {
  /** Identity of `.git/index`; a command that staged something changes this. */
  indexHash: string | null;
  /** Identity of porcelain status, which notices new and removed files. */
  statusHash: string;
  /** Content identity per watched path; null when the path is absent. */
  fileHashes: ReadonlyMap<string, string | null>;
}

export interface FingerprintOptions {
  fs: FileSystem;
  git: Git;
  repositoryRoot: string;
  /** Repository-relative paths to watch byte-for-byte: those under review. */
  paths: readonly string[];
}

export const MUTATION_DISCLAIMER =
  'AMBICODE reports this and does not undo it; the change is yours to keep or revert.';

export async function fingerprintWorkspace(options: FingerprintOptions): Promise<WorkspaceFingerprint> {
  const fileHashes = new Map<string, string | null>();
  for (const relativePath of options.paths) {
    fileHashes.set(relativePath, await hashFile(options.fs, path.join(options.repositoryRoot, relativePath)));
  }

  return {
    indexHash: await hashFile(options.fs, path.join(await options.git.gitCommonDir(), 'index')),
    statusHash: contentHash(await options.git.status()),
    fileHashes,
  };
}

/**
 * Reports what moved between the processes AMBICODE starts. `baseline` is
 * idempotent and `observe` re-baselines, so bracketing every process costs one
 * fingerprint per process that actually ran.
 */
export interface WorkspaceWatch {
  /** Records the current state unless one is already held. */
  baseline(): Promise<void>;
  /** Changes since the last baseline; empty when no baseline was taken. */
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
export function describeMutations(
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
    // Only worth saying when no specific file explains it; otherwise it repeats
    // what the file lines already said.
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
