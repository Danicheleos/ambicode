import path from 'node:path';
import { MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import type { Git } from '#platform/git/git';
import { contentHash } from '#util/hash';
import { isBinaryContent } from '#platform/ports/binary';
import type { FileSystem } from '#types/platform/ports';
import type { FileContent, ContentSource } from '../types/snapshot.ts';

/**
 * Bytes are classified before they are decoded: a binary file never becomes a
 * string, and text in an unfamiliar extension stays reviewable.
 */
async function classifyBytes(bytes: Uint8Array): Promise<FileContent> {
  if (await isBinaryContent(bytes)) return { kind: 'binary' };
  return { kind: 'text', text: new TextDecoder('utf-8').decode(bytes) };
}

export function revisionContent(git: Git, revision: string): ContentSource {
  return {
    pinning: `Read from git at revision ${revision.slice(0, 12)}, so it cannot change while the review runs.`,
    digest: revision,
    async read(relativePath: string): Promise<FileContent | null> {
      const text = await git.showFile(revision, relativePath);
      if (text === null) return null;
      const bytes = Buffer.from(text, 'utf8');
      if (bytes.length > MAX_SNAPSHOT_FILE_BYTES) return { kind: 'too-large', bytes: bytes.length };
      return await classifyBytes(bytes);
    },
    async list(directoryName: string): Promise<string[]> {
      const names = await git.listTree(revision, directoryName);
      return names.map((name) => (directoryName === '' ? name : `${directoryName}/${name}`));
    },
  };
}

interface CaptureOptions {
  fs: FileSystem;
  repositoryRoot: string;
  /** Post-image paths of the change; their directories supply context candidates. */
  changedPaths: readonly string[];
  includeSiblings: boolean;
  /** Unchanged files wanted beside the change; read now, because the capture is the only read. */
  extraPaths?: readonly string[];
}

interface CapturedContent extends ContentSource {
  readonly capturedPaths: readonly string[];
  /** Content hash per captured path, used to detect later mutation. */
  hashOf(relativePath: string): string | null;
}

/** Nothing is written, no blob and no index, so a capture leaves the checkout as found. */
export async function captureWorkingTree(options: CaptureOptions): Promise<CapturedContent> {
  const entries = new Map<string, FileContent>();
  const hashes = new Map<string, string>();
  const listings = new Map<string, string[]>();

  const capture = async (relativePath: string): Promise<void> => {
    if (entries.has(relativePath)) return;
    const content = await readWorkingFile(options.fs, options.repositoryRoot, relativePath);
    if (content === null) return;
    entries.set(relativePath, content);
    if (content.kind === 'text') hashes.set(relativePath, contentHash(content.text));
  };

  for (const relativePath of options.changedPaths) await capture(relativePath);
  for (const relativePath of options.extraPaths ?? []) await capture(relativePath);

  if (options.includeSiblings) {
    for (const directoryName of uniqueDirectories(options.changedPaths)) {
      const names = await listWorkingDirectory(options.fs, options.repositoryRoot, directoryName);
      listings.set(directoryName, names);
      for (const name of names) await capture(name);
    }
  }

  const capturedPaths = [...entries.keys()].sort();
  // Covers every byte served, so captures of different working trees never share an identity.
  const digest = contentHash(
    capturedPaths.map((value) => `${value}\n${hashes.get(value) ?? describeKind(entries.get(value))}`).join('\n'),
  );

  return {
    pinning: 'Read from the working tree once, when the review target was resolved; later edits are not part of this review.',
    digest,
    capturedPaths,
    hashOf: (relativePath: string) => hashes.get(relativePath) ?? null,
    async read(relativePath: string): Promise<FileContent | null> {
      return entries.get(relativePath) ?? null;
    },
    async list(directoryName: string): Promise<string[]> {
      return listings.get(directoryName) ?? [];
    },
  };
}

function describeKind(content: FileContent | undefined): string {
  if (content === undefined) return 'absent';
  return content.kind === 'text' ? 'text' : content.kind;
}

async function readWorkingFile(
  fs: FileSystem,
  repositoryRoot: string,
  relativePath: string,
): Promise<FileContent | null> {
  const absolute = path.join(repositoryRoot, relativePath);
  try {
    // lstat, not stat: a symlink is reported and never followed out of the tree.
    const stats = await fs.lstat(absolute);
    if (stats.isSymbolicLink()) return { kind: 'symlink' };
    if (!stats.isFile()) return null;
    // The size guard runs first, so the read that follows is bounded.
    if (stats.size > MAX_SNAPSHOT_FILE_BYTES) return { kind: 'too-large', bytes: stats.size };
    return await classifyBytes(await fs.readBytes(absolute));
  } catch {
    return null;
  }
}

async function listWorkingDirectory(
  fs: FileSystem,
  repositoryRoot: string,
  directoryName: string,
): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(repositoryRoot, directoryName));
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => (directoryName === '' ? entry.name : `${directoryName}/${entry.name}`));
  } catch {
    return [];
  }
}

export function uniqueDirectories(paths: readonly string[]): string[] {
  const directories = new Set<string>();
  for (const value of paths) {
    const directory = path.posix.dirname(value);
    directories.add(directory === '.' ? '' : directory);
  }
  return [...directories].sort();
}
