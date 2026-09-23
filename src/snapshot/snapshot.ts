import path from 'node:path';
import { MAX_SNAPSHOT_FILE_BYTES, MAX_SNAPSHOT_TOTAL_BYTES } from '../config/defaults.ts';
import type { DiffFile } from '../git/diff.ts';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { markOwned } from '../page/cleanup.ts';
import { AmbicodeError } from '../util/errors.ts';
import { uniqueDirectories, type ContentSource, type FileContent } from './content.ts';
import {
  describeExclusion,
  isUselessAsContext,
  pathExclusionReason,
  type ExclusionReason,
  type OperatorPatterns,
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
 *
 * Every oversized file at once, not the first one. Run `ce05d377` paid 15.7s to
 * be told about one 390 KB translation file and then 385.6s to be told about a
 * 1 MB lockfile, with a question to the operator between them, because the plan
 * threw on the first and a merge-request read costs 1.52s per file.
 */
function oversizedRefusal(oversized: readonly { path: string; bytes: number }[]): AmbicodeError {
  const many = oversized.length > 1;
  return new AmbicodeError(
    'snapshot-too-large',
    many
      ? `${oversized.length} changed files do not fit in the review snapshot, so the change was not reviewed.`
      : 'A changed file does not fit in the review snapshot, so the change was not reviewed.',
    {
      details: [
        ...oversized.map(
          (entry) =>
            `${entry.path} is ${entry.bytes} bytes, above the ${MAX_SNAPSHOT_FILE_BYTES}-byte per-file snapshot ceiling.`,
        ),
        'This ceiling is not configurable: raising review.maxContextBytes will not change it.',
        many
          ? 'Split the change so each part fits, or leave these paths out deliberately:'
          : 'Split the change so each part fits, or leave this path out deliberately:',
        ...oversized.map((entry) => `  --exclude "${entry.path}"`),
        '(--exclude is repeatable; review.excludePaths makes it permanent.)',
        'An excluded path is not reviewed and the report says so, which is why it has to be asked for.',
        'AMBICODE does not review part of a change and report it as a whole.',
      ],
    },
  );
}

/** The cumulative ceiling, which cannot be reported per file. */
function totalTooLarge(relativePath: string, measuredBytes: number): AmbicodeError {
  return new AmbicodeError(
    'snapshot-too-large',
    'The change does not fit in the review snapshot, so it was not reviewed.',
    {
      details: [
        `${relativePath} would take the snapshot to ${measuredBytes} bytes, above the ${MAX_SNAPSHOT_TOTAL_BYTES}-byte total ceiling.`,
        'This ceiling is not configurable: raising review.maxContextBytes will not change it.',
        'Split the change into parts that each fit, or exclude generated paths with --exclude <glob>.',
        'AMBICODE does not review part of a change and report it as a whole.',
      ],
    },
  );
}

/**
 * Remote reads in flight at once. Each one is a `glab` subprocess measured at
 * 1.52s against gitlab.com, and a 299-file merge request needs one per file, so
 * serial reads cost 7.6 minutes before anything else happens. Eight bounds the
 * subprocesses as well as the remote; a local source ignores this, being fast
 * enough that the batching is invisible.
 */
const CONTENT_READ_CONCURRENCY = 8;

/**
 * Ceilings on what unchanged context may cost. MR 2677 listed 181 directories
 * and then read all 606 unchanged siblings in them — 20 minutes of remote calls
 * for files the byte budget had already stopped accepting, because the old loop
 * read each one before testing whether it fit and then `continue`d.
 *
 * Counts, not seconds: a wall-clock budget would make the same review produce
 * different context on a slower network.
 */
const MAX_CONTEXT_DIRECTORY_LISTS = 25;
const MAX_CONTEXT_FILE_READS = 100;

/** Reads in bounded parallel, preserving the caller's order in the result. */
async function readAll(
  content: ContentSource,
  paths: readonly string[],
): Promise<Map<string, FileContent | null>> {
  const found = new Map<string, FileContent | null>();
  for (let start = 0; start < paths.length; start += CONTENT_READ_CONCURRENCY) {
    const batch = paths.slice(start, start + CONTENT_READ_CONCURRENCY);
    const read = await Promise.all(
      batch.map(async (relativePath) => [relativePath, await content.read(relativePath)] as const),
    );
    for (const [relativePath, value] of read) found.set(relativePath, value);
  }
  return found;
}

export interface PlanSnapshotOptions {
  files: readonly DiffFile[];
  /** Pinned content for the reviewed revision; see `content.ts`. */
  content: ContentSource;
  /** Include unchanged files sitting beside a changed one as review context. */
  includeSiblingContext?: boolean;
  /**
   * The patterns that decided what is reviewed. Context is filtered through
   * them too: a merge-request review reported that the change's test code was
   * not reviewed while six of those exact `.spec.ts` files sat in the snapshot
   * as neighbours of a changed file, readable by the reviewer. A file kept out
   * of the review does not come back in beside it.
   */
  operator?: OperatorPatterns;
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

  // What needs reading is decided before anything is read, so the reads can run
  // in parallel while the decisions below stay in diff order.
  const needed: string[] = [];
  for (const file of options.files) {
    const target = file.newPath;
    if (target === null) continue; // Deleted: the diff carries the evidence.
    changedPaths.push(target);
    if (file.binary) continue;
    if (pathExclusionReason(target) !== null) continue;
    needed.push(target);
  }
  // Named all at once before the first read, so a remote source can fetch them
  // in one request instead of one per file. Measured on MR 2677: 47 changed
  // files as 47 `repository/files` calls took ~18s; as one batched query, 1.9s.
  await options.content.prime?.(needed);
  const changedContent = await readAll(options.content, needed);

  // Collected, not thrown on: one pass names every file the operator has to
  // decide about, instead of one run per file.
  const oversized: { path: string; bytes: number }[] = [];

  for (const file of options.files) {
    const target = file.newPath;
    if (target === null) continue;

    if (file.binary) {
      omit(target, 'binary-content');
      continue;
    }
    const pathReason = pathExclusionReason(target);
    if (pathReason !== null) {
      omit(target, pathReason);
      continue;
    }

    const contents = changedContent.get(target) ?? null;
    if (contents === null) {
      omissions.push(`${target}: content could not be read at the reviewed revision.`);
      continue;
    }
    if (contents.kind === 'symlink') {
      omit(target, 'symlink');
      continue;
    }
    if (contents.kind === 'too-large') {
      oversized.push({ path: target, bytes: contents.bytes });
      continue;
    }
    if (contents.kind === 'binary') {
      omit(target, 'binary-content');
      continue;
    }
    const size = Buffer.byteLength(contents.text, 'utf8');
    if (size > MAX_SNAPSHOT_FILE_BYTES) {
      oversized.push({ path: target, bytes: size });
      continue;
    }
    if (totalBytes + size > MAX_SNAPSHOT_TOTAL_BYTES) {
      throw totalTooLarge(target, totalBytes + size);
    }
    add(target, contents.text);
  }

  if (oversized.length > 0) throw oversizedRefusal(oversized);

  const changedSet = new Set(changedPaths);
  const siblingCeiling = Math.min(
    MAX_SNAPSHOT_TOTAL_BYTES,
    options.contextBudgetBytes ?? Number.POSITIVE_INFINITY,
  );
  let contextCount = 0;
  let contextTrimmed = 0;

  let contextCapped = false;

  // The listing still happens when the budget is already full: what was left
  // out has to be reported, and that needs the candidates counted. Only the
  // reads are skipped, and those are what cost.
  if (options.includeSiblingContext !== false) {
    const directories = uniqueDirectories(changedPaths);
    const listed = directories.slice(0, MAX_CONTEXT_DIRECTORY_LISTS);
    if (listed.length < directories.length) contextCapped = true;

    const candidates: string[] = [];
    for (const directoryName of listed) {
      for (const sibling of await options.content.list(directoryName)) {
        if (changedSet.has(sibling)) continue;
        if (pathExclusionReason(sibling, options.operator ?? {}) !== null) continue;
        if (isUselessAsContext(sibling)) continue;
        candidates.push(sibling);
      }
    }
    if (candidates.length > MAX_CONTEXT_FILE_READS) contextCapped = true;
    const wanted = candidates.slice(0, MAX_CONTEXT_FILE_READS);

    // In batches, so a full budget stops the reads instead of paying for every
    // remaining candidate and discarding it.
    for (let start = 0; start < wanted.length; start += CONTENT_READ_CONCURRENCY) {
      if (totalBytes >= siblingCeiling) {
        contextTrimmed += wanted.length - start;
        break;
      }
      const batch = wanted.slice(start, start + CONTENT_READ_CONCURRENCY);
      const read = await readAll(options.content, batch);
      for (const sibling of batch) {
        const contents = read.get(sibling) ?? null;
        if (contents === null || contents.kind !== 'text') continue;
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
  if (contextCapped) {
    omissions.push(
      `Unchanged context was gathered from at most ${MAX_CONTEXT_DIRECTORY_LISTS} of the change's directories and at most ${MAX_CONTEXT_FILE_READS} neighbouring files. On a change this wide the rest was not read at all, so absence of context here says nothing about those files. The change itself is complete.`,
    );
  }

  return { entries, changedPaths, omissions, totalBytes };
}

/** Materializes a plan. Nothing is decided here, so nothing can differ from what was measured. */
export async function writeSnapshot(
  fs: FileSystem,
  plan: SnapshotPlan,
  patch: string,
  clock: Clock,
): Promise<Snapshot> {
  const directory = await fs.temporaryDirectory(SNAPSHOT_PREFIX);
  const filesDirectory = path.join(directory, 'files');
  await fs.mkdirp(filesDirectory);

  for (const entry of plan.entries) {
    const destination = path.join(filesDirectory, entry.path);
    await fs.mkdirp(path.dirname(destination));
    await fs.writeText(destination, entry.text);
  }

  // Marks the directory as AMBICODE's own, so a later sweep can delete it
  // without deleting a temporary directory that belongs to something else.
  await markOwned(fs, directory, 'snapshot', clock, process.pid);
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
  clock: Clock;
}

/** Plan and write in one step, for callers with no limit to enforce in between. */
export async function buildSnapshot(options: BuildSnapshotOptions): Promise<Snapshot> {
  return writeSnapshot(options.fs, await planSnapshot(options), options.patch, options.clock);
}
