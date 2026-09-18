import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MAX_SNAPSHOT_FILE_BYTES, MAX_SNAPSHOT_TOTAL_BYTES } from '../config/defaults.ts';
import type { DiffFile } from '../git/diff.ts';
import type { Git } from '../git/git.ts';
import { describeExclusion, looksBinary, pathExclusionReason, type ExclusionReason } from './exclusions.ts';

/**
 * A disposable directory holding exactly the content the reviewer may read.
 *
 * It lives outside the product checkout, mirrors repository-relative paths
 * under `files/`, and never contains the working `.git` directory, so the
 * reviewer process cannot reach the developer's repository (doc 02).
 */
export interface Snapshot {
  directory: string;
  /** Directory the reviewer runs in; also the root of the mirrored tree. */
  filesDirectory: string;
  included: string[];
  omissions: string[];
  totalBytes: number;
  dispose(): Promise<void>;
}

export const SNAPSHOT_PREFIX = 'ambicode-snapshot-';

export interface BuildSnapshotOptions {
  git: Git;
  repositoryRoot: string;
  files: readonly DiffFile[];
  patch: string;
  /** Revision the post-image comes from; null reads the working tree. */
  postImageRevision: string | null;
  /** Include unchanged files sitting beside a changed one as review context. */
  includeSiblingContext?: boolean;
}

export async function buildSnapshot(options: BuildSnapshotOptions): Promise<Snapshot> {
  const directory = await mkdtemp(path.join(tmpdir(), SNAPSHOT_PREFIX));
  const filesDirectory = path.join(directory, 'files');
  await mkdir(filesDirectory, { recursive: true });

  const omissions: string[] = [];
  const included: string[] = [];
  let totalBytes = 0;

  const write = async (relativePath: string, contents: string): Promise<void> => {
    const destination = path.join(filesDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents, 'utf8');
    included.push(relativePath);
    totalBytes += Buffer.byteLength(contents, 'utf8');
  };

  const omit = (relativePath: string, reason: ExclusionReason): void => {
    omissions.push(`${relativePath}: not included because it is ${describeExclusion(reason)}.`);
  };

  const changedPaths: string[] = [];

  for (const file of options.files) {
    const target = file.newPath;
    if (target === null) continue; // Deleted: the diff carries the evidence.
    changedPaths.push(target);

    if (file.binary) {
      omit(target, 'binary-content');
      continue;
    }
    const pathReason = pathExclusionReason(target);
    if (pathReason !== null) {
      omit(target, pathReason);
      continue;
    }

    const contents = await readPostImage(options, target);
    if (contents === null) {
      omissions.push(`${target}: content could not be read at the reviewed revision.`);
      continue;
    }
    if (contents.kind === 'symlink') {
      omit(target, 'symlink');
      continue;
    }
    if (looksBinary(contents.text)) {
      omit(target, 'binary-content');
      continue;
    }
    if (Buffer.byteLength(contents.text, 'utf8') > MAX_SNAPSHOT_FILE_BYTES) {
      omit(target, 'too-large');
      continue;
    }
    if (totalBytes + Buffer.byteLength(contents.text, 'utf8') > MAX_SNAPSHOT_TOTAL_BYTES) {
      omissions.push(`${target}: not included because the snapshot budget was already full.`);
      continue;
    }
    await write(target, contents.text);
  }

  const changedSet = new Set(changedPaths);
  let contextCount = 0;

  if (options.includeSiblingContext !== false) {
    for (const directoryName of uniqueDirectories(changedPaths)) {
      for (const sibling of await listSiblings(options, directoryName)) {
        if (changedSet.has(sibling)) continue;
        if (pathExclusionReason(sibling) !== null) continue;
        const contents = await readPostImage(options, sibling);
        if (contents === null || contents.kind === 'symlink') continue;
        if (looksBinary(contents.text)) continue;
        const size = Buffer.byteLength(contents.text, 'utf8');
        if (size > MAX_SNAPSHOT_FILE_BYTES) continue;
        if (totalBytes + size > MAX_SNAPSHOT_TOTAL_BYTES) break;
        await write(sibling, contents.text);
        contextCount += 1;
      }
    }
  }

  await writeFile(path.join(directory, 'changed.diff'), options.patch, 'utf8');
  await writeFile(
    path.join(directory, 'CHANGED-FILES.txt'),
    `${changedPaths.join('\n')}\n`,
    'utf8',
  );

  omissions.push(
    contextCount === 0
      ? 'Only changed files are present. Unchanged code elsewhere in the repository was not available to the reviewer.'
      : `Besides the changed files, ${contextCount} unchanged file(s) sitting in the same directories were included. The rest of the repository was not available to the reviewer.`,
  );

  return {
    directory,
    filesDirectory,
    included,
    omissions,
    totalBytes,
    dispose: async () => {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

type ReadResult = { kind: 'text'; text: string } | { kind: 'symlink' };

async function readPostImage(
  options: BuildSnapshotOptions,
  relativePath: string,
): Promise<ReadResult | null> {
  if (options.postImageRevision !== null) {
    const contents = await options.git.showFile(options.postImageRevision, relativePath);
    return contents === null ? null : { kind: 'text', text: contents };
  }
  const absolute = path.join(options.repositoryRoot, relativePath);
  try {
    // lstat, not stat: a symlink is reported and not followed out of the tree.
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) return { kind: 'symlink' };
    if (!stats.isFile()) return null;
    return { kind: 'text', text: await readFile(absolute, 'utf8') };
  } catch {
    return null;
  }
}

function uniqueDirectories(paths: readonly string[]): string[] {
  const directories = new Set<string>();
  for (const value of paths) {
    const directory = path.posix.dirname(value);
    directories.add(directory === '.' ? '' : directory);
  }
  return [...directories].sort();
}

async function listSiblings(options: BuildSnapshotOptions, directoryName: string): Promise<string[]> {
  if (options.postImageRevision !== null) {
    // Listing a tree needs no working directory, so a remote or committed
    // revision is read the same way a local one is.
    const names = await options.git.listTree(options.postImageRevision, directoryName);
    return names.map((name) => (directoryName === '' ? name : `${directoryName}/${name}`));
  }
  const absolute = path.join(options.repositoryRoot, directoryName);
  try {
    const entries = await readdir(absolute, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => (directoryName === '' ? entry.name : `${directoryName}/${entry.name}`));
  } catch {
    return [];
  }
}
