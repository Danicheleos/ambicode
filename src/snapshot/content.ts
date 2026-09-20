import path from 'node:path';
import { MAX_SNAPSHOT_FILE_BYTES } from '../config/defaults.ts';
import type { Git } from '../git/git.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { contentHash } from '../util/hash.ts';
import { isBinaryContent } from './exclusions.ts';

/**
 * Where snapshot content comes from, and why it cannot change under the review.
 * A revision is immutable; the working tree is read once at target resolution
 * and held, so mirror, patch and identity describe the same bytes (doc 02).
 */
export type FileContent =
  | { kind: 'text'; text: string }
  | { kind: 'binary' }
  | { kind: 'symlink' }
  | { kind: 'too-large'; bytes: number };

/**
 * Bytes are classified before they are decoded (doc 11): a binary file never
 * becomes a string, and text in an unfamiliar extension stays reviewable.
 */
export async function classifyBytes(bytes: Uint8Array): Promise<FileContent> {
  if (await isBinaryContent(bytes)) return { kind: 'binary' };
  return { kind: 'text', text: new TextDecoder('utf-8').decode(bytes) };
}

export interface ContentSource {
  /** How these bytes are pinned, recorded in the review for the reader. */
  readonly pinning: string;
  /** Identifies the exact bytes this source will serve. */
  readonly digest: string;
  read(relativePath: string): Promise<FileContent | null>;
  list(directoryName: string): Promise<string[]>;
}

/** Content at a committed revision, read through git rather than the checkout. */
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

export interface CaptureOptions {
  fs: FileSystem;
  repositoryRoot: string;
  /** Post-image paths of the change; their directories supply context candidates. */
  changedPaths: readonly string[];
  /** Read unchanged files beside a changed one so they can serve as context. */
  includeSiblings: boolean;
}

export interface CapturedContent extends ContentSource {
  /** Repository-relative paths whose bytes are held, in a stable order. */
  readonly capturedPaths: readonly string[];
  /** Content hash per captured path, used to detect later mutation (doc 03). */
  hashOf(relativePath: string): string | null;
}

/**
 * Reads the working tree once and holds it. Nothing is written: no blob, no
 * index, so a capture leaves the checkout as it was found.
 */
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

  if (options.includeSiblings) {
    for (const directoryName of uniqueDirectories(options.changedPaths)) {
      const names = await listWorkingDirectory(options.fs, options.repositoryRoot, directoryName);
      listings.set(directoryName, names);
      for (const name of names) await capture(name);
    }
  }

  const capturedPaths = [...entries.keys()].sort();
  // The digest covers every byte served, so two captures of different working
  // trees can never share a snapshot identity.
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
    // The size guard runs first, so the read that follows is bounded; the bytes
    // it returns decide text-or-binary before any of them are decoded.
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
