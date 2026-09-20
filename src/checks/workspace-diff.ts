import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import { contentHash } from '../util/hash.ts';

/**
 * Evidence about what a check wrote inside its disposable container workspace.
 *
 * The baseline is taken from the immutable snapshot that trusted setup copies
 * in, so the copy itself is never reported as a mutation; the comparison after
 * the run is against the workspace as the command left it. When either side
 * cannot be read, the answer is `unavailable` — silence would be indistinct
 * from "the command changed nothing" (doc 03 P1.5 correction 3).
 */

/** Bounds the inspection: a command that filled the workspace is reported, not walked. */
export const MAX_WORKSPACE_ENTRIES = 5_000;
export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024;
/** How many individual mutations are listed before the rest are summarized. */
export const MAX_REPORTED_MUTATIONS = 50;

export interface TreeEntry {
  kind: 'file' | 'symlink' | 'directory' | 'other';
  /** Content digest for a regular file; null for anything without bytes. */
  hash: string | null;
  /** The only mode bit git tracks, and the only one a check can meaningfully flip. */
  executable: boolean;
  bytes: number;
}

export type TreeScan =
  | { kind: 'ok'; entries: Map<string, TreeEntry> }
  | { kind: 'unavailable'; reason: string };

/**
 * Walks a directory into a comparable map. Symlinks are recorded as symlinks
 * and never followed, so a link planted inside the workspace cannot make the
 * scan read the host tree it points at.
 */
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

/** Node's stats carry `mode`; the port's minimal shape does not declare it. */
function isExecutable(stats: unknown): boolean {
  const mode = (stats as { mode?: unknown }).mode;
  return typeof mode === 'number' && (mode & 0o111) !== 0;
}

/**
 * Created, deleted, rewritten, retyped and mode-changed files, in a stable
 * order. Directories are compared only for their existence, because a command
 * that made a directory and nothing else has still changed the tree.
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

/** The list a reader sees, bounded so a runaway command cannot flood the report. */
export function summarizeMutations(mutations: readonly string[]): string[] {
  if (mutations.length <= MAX_REPORTED_MUTATIONS) return [...mutations];
  return [
    ...mutations.slice(0, MAX_REPORTED_MUTATIONS),
    `… and ${mutations.length - MAX_REPORTED_MUTATIONS} further change(s) in the disposable container workspace.`,
  ];
}
