import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import { contentHash } from '../util/hash.ts';

/** Bounds the inspection: a command that filled the workspace is reported, not walked. */
export const MAX_WORKSPACE_ENTRIES = 5_000;
export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
export const MAX_REPORTED_MUTATIONS = 50;

export interface TreeEntry {
  kind: 'file' | 'symlink' | 'directory' | 'other';
  hash: string | null;
  /** The only mode bit git tracks, and the only one a check can meaningfully flip. */
  executable: boolean;
  bytes: number;
}

export type TreeScan =
  | { kind: 'ok'; entries: Map<string, TreeEntry> }
  | { kind: 'unavailable'; reason: string };

/** Symlinks are recorded, never followed, so a link planted in the workspace cannot make the scan read the host tree. */
export async function scanTree(fs: FileSystem, root: string): Promise<TreeScan> {
  const entries = new Map<string, TreeEntry>();
  let totalBytes = 0;

  const walk = async (absolute: string, relative: string): Promise<string | null> => {
    const listing = await fs.readdir(absolute);
    for (const child of listing) {
      const childAbsolute = path.join(absolute, child.name);
      const childRelative = relative === '' ? child.name : `${relative}/${child.name}`;
      if (entries.size >= MAX_WORKSPACE_ENTRIES) {
        return `the workspace holds more than ${MAX_WORKSPACE_ENTRIES} entries`;
      }

      const stats = await fs.lstat(childAbsolute);
      if (stats.isSymbolicLink()) {
        entries.set(childRelative, { kind: 'symlink', hash: null, executable: false, bytes: 0 });
        continue;
      }
      if (stats.isDirectory()) {
        entries.set(childRelative, { kind: 'directory', hash: null, executable: false, bytes: 0 });
        const failure = await walk(childAbsolute, childRelative);
        if (failure !== null) return failure;
        continue;
      }
      if (!stats.isFile()) {
        entries.set(childRelative, { kind: 'other', hash: null, executable: false, bytes: 0 });
        continue;
      }

      totalBytes += stats.size;
      if (totalBytes > MAX_WORKSPACE_BYTES) {
        return `the workspace holds more than ${MAX_WORKSPACE_BYTES} bytes`;
      }
      const bytes = await fs.readBytes(childAbsolute);
      entries.set(childRelative, {
        kind: 'file',
        hash: contentHash(bytes),
        executable: isExecutable(stats),
        bytes: stats.size,
      });
    }
    return null;
  };

  try {
    const failure = await walk(root, '');
    if (failure !== null) return { kind: 'unavailable', reason: failure };
  } catch (error) {
    return {
      kind: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  return { kind: 'ok', entries };
}

function isExecutable(stats: unknown): boolean {
  const mode = (stats as { mode?: unknown }).mode;
  return typeof mode === 'number' && (mode & 0o111) !== 0;
}

/**
 * Stable order. Directories are compared only for existence: a command that made a directory
 * and nothing else has still changed the tree.
 */
export function compareTrees(
  baseline: ReadonlyMap<string, TreeEntry>,
  after: ReadonlyMap<string, TreeEntry>,
): string[] {
  const mutations: string[] = [];
  const paths = [...new Set([...baseline.keys(), ...after.keys()])].sort();

  for (const relative of paths) {
    const before = baseline.get(relative);
    const now = after.get(relative);
    if (before === undefined && now !== undefined) {
      mutations.push(`created ${relative} (${now.kind})`);
      continue;
    }
    if (before !== undefined && now === undefined) {
      mutations.push(`deleted ${relative} (${before.kind})`);
      continue;
    }
    if (before === undefined || now === undefined) continue;
    if (before.kind !== now.kind) {
      mutations.push(`type changed ${relative} (${before.kind} → ${now.kind})`);
      continue;
    }
    if (before.kind === 'file' && before.hash !== now.hash) {
      mutations.push(`modified ${relative}`);
      continue;
    }
    if (before.kind === 'file' && before.executable !== now.executable) {
      mutations.push(`mode changed ${relative} (${now.executable ? 'made executable' : 'made non-executable'})`);
    }
  }
  return mutations;
}

export function summarizeMutations(mutations: readonly string[]): string[] {
  if (mutations.length <= MAX_REPORTED_MUTATIONS) return [...mutations];
  return [
    ...mutations.slice(0, MAX_REPORTED_MUTATIONS),
    `… and ${mutations.length - MAX_REPORTED_MUTATIONS} further change(s) in the disposable container workspace.`,
  ];
}
