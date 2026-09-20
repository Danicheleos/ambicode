import path from 'node:path';
import { MAX_SNAPSHOT_FILE_BYTES, MAX_SNAPSHOT_TOTAL_BYTES } from '../config/defaults.ts';
import type { DiffFile } from '../git/diff.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { AmbicodeError } from '../util/errors.ts';
import { uniqueDirectories, type ContentSource } from './content.ts';
import {
  describeExclusion,
  isUselessAsContext,
  looksBinary,
  pathExclusionReason,
  type ExclusionReason,
} from './exclusions.ts';

/**
 * A disposable directory holding exactly what the reviewer may read: paths
 * mirrored under `files/`, outside the checkout and without `.git` (doc 02).
 * Every byte comes from the pinned `ContentSource`, never from the checkout.
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

/** One mirrored file, decided and read but not yet written. */
export interface SnapshotEntry {
  path: string;
  text: string;
  bytes: number;
}

/**
 * Everything the snapshot would contain, before any of it exists on disk, so
 * the whole input can be measured against the configured limits first. The
 * mirrored files are reviewer context as much as the patch is (doc 05).
 */
export interface SnapshotPlan {
  entries: SnapshotEntry[];
  /** Post-image paths of the change, in the order the diff listed them. */
  changedPaths: string[];
  omissions: string[];
  /** Bytes the mirrored tree will occupy. */
  totalBytes: number;
}

/**
 * A changed file that will not fit stops the review: omitting it would hand the
 * reviewer a change it cannot see all of (doc 02).
 */
function tooLargeToReview(
  relativePath: string,
  measuredBytes: number,
  ceilingBytes: number,
  ceiling: 'file' | 'total',
): AmbicodeError {
  return new AmbicodeError(
    'snapshot-too-large',
    'A changed file does not fit in the review snapshot, so the change was not reviewed.',
    {
      details: [
        ceiling === 'file'
          ? `${relativePath} is ${measuredBytes} bytes, above the ${ceilingBytes}-byte per-file snapshot ceiling.`
          : `${relativePath} would take the snapshot to ${measuredBytes} bytes, above the ${ceilingBytes}-byte total ceiling.`,
        'This ceiling is not configurable: raising review.maxContextBytes will not change it.',
        'Split the change so each part fits, or exclude generated content from the review.',
        'AMBICODE does not review part of a change and report it as a whole.',
      ],
    },
  );
}

export interface PlanSnapshotOptions {
  files: readonly DiffFile[];
  /** Pinned content for the reviewed revision; see `content.ts`. */
  content: ContentSource;
  /** Include unchanged files sitting beside a changed one as review context. */
  includeSiblingContext?: boolean;
  /**
   * Absolute ceiling on `totalBytes` at which unchanged sibling context stops
   * being added. Changed files are mirrored regardless of it.
   */
  contextBudgetBytes?: number;
}

export async function planSnapshot(options: PlanSnapshotOptions): Promise<SnapshotPlan> {
  const entries: SnapshotEntry[] = [];
  const omissions: string[] = [];
  const changedPaths: string[] = [];
  let totalBytes = 0;

  const add = (relativePath: string, text: string): void => {
    const bytes = Buffer.byteLength(text, 'utf8');
    entries.push({ path: relativePath, text, bytes });
    totalBytes += bytes;
  };

  const omit = (relativePath: string, reason: ExclusionReason): void => {
    omissions.push(`${relativePath}: not included because it is ${describeExclusion(reason)}.`);
  };

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

    const contents = await options.content.read(target);
    if (contents === null) {
      omissions.push(`${target}: content could not be read at the reviewed revision.`);
      continue;
    }
    if (contents.kind === 'symlink') {
      omit(target, 'symlink');
      continue;
    }
    if (contents.kind === 'too-large') {
      throw tooLargeToReview(target, contents.bytes, MAX_SNAPSHOT_FILE_BYTES, 'file');
    }
    if (looksBinary(contents.text)) {
      omit(target, 'binary-content');
      continue;
    }
    const size = Buffer.byteLength(contents.text, 'utf8');
    if (size > MAX_SNAPSHOT_FILE_BYTES) {
      throw tooLargeToReview(target, size, MAX_SNAPSHOT_FILE_BYTES, 'file');
    }
    if (totalBytes + size > MAX_SNAPSHOT_TOTAL_BYTES) {
      throw tooLargeToReview(target, totalBytes + size, MAX_SNAPSHOT_TOTAL_BYTES, 'total');
    }
    add(target, contents.text);
  }

  const changedSet = new Set(changedPaths);
  const siblingCeiling = Math.min(
    MAX_SNAPSHOT_TOTAL_BYTES,
    options.contextBudgetBytes ?? Number.POSITIVE_INFINITY,
  );
  let contextCount = 0;
  let contextTrimmed = 0;

  if (options.includeSiblingContext !== false) {
    for (const directoryName of uniqueDirectories(changedPaths)) {
      for (const sibling of await options.content.list(directoryName)) {
        if (changedSet.has(sibling)) continue;
        if (pathExclusionReason(sibling) !== null) continue;
        if (isUselessAsContext(sibling)) continue;
        const contents = await options.content.read(sibling);
        if (contents === null || contents.kind !== 'text') continue;
        if (looksBinary(contents.text)) continue;
        const size = Buffer.byteLength(contents.text, 'utf8');
        if (size > MAX_SNAPSHOT_FILE_BYTES) continue;
        if (totalBytes + size > siblingCeiling) {
          contextTrimmed += 1;
          continue;
        }
        add(sibling, contents.text);
        contextCount += 1;
      }
    }
  }

  omissions.push(
    contextCount === 0
      ? 'Only changed files are present. Unchanged code elsewhere in the repository was not available to the reviewer.'
      : `Besides the changed files, ${contextCount} unchanged file(s) sitting in the same directories were included. The rest of the repository was not available to the reviewer.`,
  );
  if (contextTrimmed > 0) {
    omissions.push(
      `${contextTrimmed} further unchanged file(s) beside the change were left out because including them would put the review over its configured input limit. The change itself is complete; only surrounding context was trimmed.`,
    );
  }

  return { entries, changedPaths, omissions, totalBytes };
}

/** Materializes a plan. Nothing is decided here, so nothing can differ from what was measured. */
export async function writeSnapshot(
  fs: FileSystem,
  plan: SnapshotPlan,
  patch: string,
): Promise<Snapshot> {
  const directory = await fs.temporaryDirectory(SNAPSHOT_PREFIX);
  const filesDirectory = path.join(directory, 'files');
  await fs.mkdirp(filesDirectory);

  for (const entry of plan.entries) {
    const destination = path.join(filesDirectory, entry.path);
    await fs.mkdirp(path.dirname(destination));
    await fs.writeText(destination, entry.text);
  }

  await fs.writeText(path.join(directory, 'changed.diff'), patch);
  await fs.writeText(path.join(directory, 'CHANGED-FILES.txt'), `${plan.changedPaths.join('\n')}\n`);

  return {
    directory,
    filesDirectory,
    included: plan.entries.map((entry) => entry.path),
    omissions: plan.omissions,
    totalBytes: plan.totalBytes,
    dispose: () => fs.remove(directory),
  };
}

export interface BuildSnapshotOptions extends PlanSnapshotOptions {
  fs: FileSystem;
  patch: string;
}

/** Plan and write in one step, for callers with no limit to enforce in between. */
export async function buildSnapshot(options: BuildSnapshotOptions): Promise<Snapshot> {
  return writeSnapshot(options.fs, await planSnapshot(options), options.patch);
}
