import path from 'node:path';
import { MAX_EXCERPT_SOURCE_BYTES, MAX_SNAPSHOT_FILE_BYTES, MAX_SNAPSHOT_TOTAL_BYTES } from '#types/defaults';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { totalChangedLines } from '#platform/git/diff';
import { isBinaryContent } from '#platform/ports/binary';
import { describeExclusion, isExcludedFromReview, isUselessAsContext, pathExclusionReason } from '#util/path-classes';
import type { Git } from '#platform/git/git';
import type { ReviewConfig } from '#types/modules/config';
import type { DiffFile, DiffHunk } from '#types/platform/git';
import type { FileSystem } from '#types/platform/ports';
import type { SnapshotPlan, SnapshotEntry, Snapshot, MeasuredInput } from '#types/modules/review';
import type { ContentSource, FileContent, ExclusionReason, OperatorPatterns } from '../types/snapshot.ts';

/** Encoded UTF-8 bytes, not UTF-16 code units: that is what a limit in bytes means. */
export const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8');

/** Remote reads in flight at once: each is a `glab` subprocess (~1.5 s), too slow serially. */
const CONTENT_READ_CONCURRENCY = 8;
/** Counts, not seconds: a wall-clock budget would make the same review produce different context on a slower network. */
const MAX_CONTEXT_DIRECTORY_LISTS = 25;
const MAX_CONTEXT_FILE_READS = 100;
const CONTEXT_LINES = [50, 20, 5, 0] as const;
const SNAPSHOT_PREFIX = 'ambicode-snapshot-';

/** The excluded part leaves the patch as well as the mirror, so a `.env` cannot reach the model through the diff. */
export function partitionChange(files: readonly DiffFile[], operator: OperatorPatterns = {}): { files: DiffFile[]; excluded: { path: string; reason: string }[]; patch: string } {
  const included: DiffFile[] = [];
  const excluded: { path: string; reason: string }[] = [];
  for (const file of files) {
    const reason = isExcludedFromReview(file.oldPath, file.newPath, operator);
    if (reason === null) included.push(file);
    else excluded.push({ path: file.newPath ?? file.oldPath ?? '(unnamed)', reason: `not reviewed because it is ${describeExclusion(reason)}` });
  }
  const patch = included.map((file) => (file.patchSection.endsWith('\n') ? file.patchSection : `${file.patchSection}\n`)).join('');
  return { files: included, excluded, patch };
}

export function measureInput(files: readonly DiffFile[], patch: string, parts: { snapshotBytes?: number; requirementBytes?: number } = {}): MeasuredInput {
  const patchBytes = byteLength(patch);
  const snapshotBytes = parts.snapshotBytes ?? 0;
  const requirementBytes = parts.requirementBytes ?? 0;
  return { changedFiles: files.length, changedLines: totalChangedLines(files), patchBytes, snapshotBytes, requirementBytes, contextBytes: patchBytes + requirementBytes + snapshotBytes };
}

/** The change is never truncated to fit, and neither is a requirement; only unchanged sibling context is discretionary. */
export function enforceReviewInputLimits(measured: MeasuredInput, limits: ReviewConfig, files: readonly DiffFile[] = []): void {
  const exceeded: string[] = [];
  if (limits.maxChangedFiles !== null && measured.changedFiles > limits.maxChangedFiles) exceeded.push(`changed files: ${measured.changedFiles}, limit ${limits.maxChangedFiles} (review.maxChangedFiles)`);
  if (limits.maxChangedLines !== null && measured.changedLines > limits.maxChangedLines) exceeded.push(`changed lines: ${measured.changedLines}, limit ${limits.maxChangedLines} (review.maxChangedLines)`);
  if (limits.maxContextBytes !== null && measured.contextBytes > limits.maxContextBytes) {
    exceeded.push(
      `model input: ${measured.contextBytes} bytes, limit ${limits.maxContextBytes} (review.maxContextBytes)`,
      'measured components:',
      `  patch: ${measured.patchBytes} bytes`,
      `  requirement content: ${measured.requirementBytes} bytes`,
      `  mirrored files the reviewer can read: ${measured.snapshotBytes} bytes`,
    );
  }
  if (exceeded.length === 0) return;
  const largest = [...files]
    .sort((a, b) => b.addedLines + b.removedLines - (a.addedLines + a.removedLines))
    .slice(0, 5)
    .map((file) => `  ${file.newPath ?? file.oldPath ?? '(unnamed)'}: ${file.addedLines + file.removedLines} line(s)`);
  throw new AmbicodeError('input-too-large', 'This review is larger than the configured input limits, so it was not sent to the reviewer.', {
    field: 'review',
    details: [
      ...exceeded,
      ...(largest.length === 0 ? [] : ['largest changed files:', ...largest]),
      'Split the change into reviewable parts, supply fewer or smaller requirements, or raise the limit in .ambicode/config.yaml deliberately.',
      'Or narrow it deliberately: --exclude <glob>, repeatable, also review.excludePaths. Matching paths leave the patch, the mirror and these counts, and the report states the gap.',
      'AMBICODE does not truncate a change or a requirement to fit and then report on the whole.',
    ],
  });
}

/** Changed hunks with lines around them, each kept line numbered; the widest window that fits `limitBytes`, else null. */
export function excerptOf(text: string, hunks: readonly DiffHunk[], filePath: string, fileBytes: number, limitBytes: number): { text: string; bytes: number; contextLines: number } | null {
  if (hunks.length === 0) return null;
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  for (const contextLines of CONTEXT_LINES) {
    const spans: [number, number][] = [];
    const windows = hunks.map((hunk): [number, number] => [Math.max(1, hunk.newStart - contextLines), Math.min(lines.length, hunk.newStart + Math.max(hunk.newLines, 1) - 1 + contextLines)]);
    for (const [from, to] of windows.sort((a, b) => a[0] - b[0])) {
      const last = spans[spans.length - 1];
      if (last !== undefined && from <= last[1] + 1) last[1] = Math.max(last[1], to);
      else spans.push([from, to]);
    }
    const width = String(lines.length).length;
    const out = [`[AMBICODE excerpt of ${filePath}: the file is ${fileBytes} bytes, above the mirror ceiling. Shown are its changed hunks with ${contextLines} line(s) around each; "N| " is the line number in the file. The patch holds the whole change.]`];
    let next = 1;
    for (const [from, to] of spans) {
      if (from > next) out.push(`[lines ${next}-${from - 1} not mirrored]`);
      for (let n = from; n <= to; n += 1) out.push(`${String(n).padStart(width)}| ${lines[n - 1] ?? ''}`);
      next = to + 1;
    }
    if (next <= lines.length) out.push(`[lines ${next}-${lines.length} not mirrored]`);
    const rendered = `${out.join('\n')}\n`;
    const bytes = byteLength(rendered);
    if (bytes <= limitBytes) return { text: rendered, bytes, contextLines };
  }
  return null;
}

/** Bytes are classified before they are decoded: a binary file never becomes a string. `excerptable` keeps the text of an oversized file. */
async function classify(bytes: Uint8Array, excerptable: boolean): Promise<FileContent> {
  const binary = await isBinaryContent(bytes);
  if (bytes.length > MAX_SNAPSHOT_FILE_BYTES) {
    const keep = excerptable && bytes.length <= MAX_EXCERPT_SOURCE_BYTES && !binary;
    return { kind: 'too-large', bytes: bytes.length, ...(keep ? { text: new TextDecoder('utf-8').decode(bytes) } : {}) };
  }
  return binary ? { kind: 'binary' } : { kind: 'text', text: new TextDecoder('utf-8').decode(bytes) };
}

const joinDir = (directory: string, name: string): string => (directory === '' ? name : `${directory}/${name}`);

export function revisionContent(git: Git, revision: string): ContentSource {
  return {
    pinning: `Read from git at revision ${revision.slice(0, 12)}, so it cannot change while the review runs.`,
    digest: revision,
    async read(relativePath) {
      const text = await git.showFile(revision, relativePath);
      return text === null ? null : classify(Buffer.from(text, 'utf8'), true);
    },
    async list(directory) {
      return (await git.listTree(revision, directory)).map((name) => joinDir(directory, name));
    },
  };
}

function uniqueDirectories(paths: readonly string[]): string[] {
  return [...new Set(paths.map((value) => (path.posix.dirname(value) === '.' ? '' : path.posix.dirname(value))))].sort();
}

/** Nothing is written, no blob and no index, so a capture leaves the checkout as found. */
export async function captureWorkingTree(options: { fs: FileSystem; repositoryRoot: string; changedPaths: readonly string[]; includeSiblings: boolean; extraPaths?: readonly string[] }): Promise<ContentSource> {
  const { fs, repositoryRoot } = options;
  const entries = new Map<string, FileContent>();
  const listings = new Map<string, string[]>();
  const hashes = new Map<string, string>();
  const changed = new Set(options.changedPaths);
  const capture = async (relativePath: string): Promise<void> => {
    if (entries.has(relativePath)) return;
    const absolute = path.join(repositoryRoot, relativePath);
    try {
      // lstat, not stat: a symlink is reported and never followed out of the tree.
      const stats = await fs.lstat(absolute);
      if (stats.isSymbolicLink()) entries.set(relativePath, { kind: 'symlink' });
      else if (stats.isFile()) {
        // The size guard runs first, so the read that follows is bounded.
        const unread = stats.size > MAX_SNAPSHOT_FILE_BYTES && (!changed.has(relativePath) || stats.size > MAX_EXCERPT_SOURCE_BYTES);
        const content: FileContent = unread ? { kind: 'too-large', bytes: stats.size } : await classify(await fs.readBytes(absolute), changed.has(relativePath));
        entries.set(relativePath, content);
        if (content.kind === 'text') hashes.set(relativePath, contentHash(content.text));
      }
    } catch {
      // Unreadable: the path is absent from the capture, which the plan reports.
    }
  };
  for (const relativePath of [...options.changedPaths, ...(options.extraPaths ?? [])]) await capture(relativePath);
  if (options.includeSiblings) {
    for (const directory of uniqueDirectories(options.changedPaths)) {
      const found = await fs.readdir(path.join(repositoryRoot, directory)).catch(() => []);
      const names = found.filter((entry) => entry.isFile()).map((entry) => joinDir(directory, entry.name));
      listings.set(directory, names);
      for (const name of names) await capture(name);
    }
  }
  // Covers every byte served, so captures of different working trees never share an identity.
  const digest = contentHash([...entries].sort(([a], [b]) => a.localeCompare(b)).map(([name, content]) => `${name}\n${hashes.get(name) ?? content.kind}`).join('\n'));
  return {
    digest,
    pinning: 'Read from the working tree once, when the review target was resolved; later edits are not part of this review.',
    read: async (relativePath) => entries.get(relativePath) ?? null,
    list: async (directory) => listings.get(directory) ?? [],
  };
}

function oversizedRefusal(oversized: readonly { path: string; bytes: number }[]): AmbicodeError {
  const many = oversized.length > 1;
  return new AmbicodeError('snapshot-too-large', many ? `${oversized.length} changed files do not fit in the review snapshot, so the change was not reviewed.` : 'A changed file does not fit in the review snapshot, so the change was not reviewed.', {
    details: [
      ...oversized.map((entry) => `${entry.path} is ${entry.bytes} bytes, above the ${MAX_SNAPSHOT_FILE_BYTES}-byte per-file snapshot ceiling.`),
      'This ceiling is not configurable: raising review.maxContextBytes will not change it.',
      many ? 'Split the change so each part fits, or leave these paths out deliberately:' : 'Split the change so each part fits, or leave this path out deliberately:',
      ...oversized.map((entry) => `  --exclude "${entry.path}"`),
      '(--exclude is repeatable; review.excludePaths makes it permanent.)',
      'An excluded path is not reviewed and the report says so, which is why it has to be asked for.',
      'AMBICODE does not review part of a change and report it as a whole.',
    ],
  });
}

const totalTooLarge = (relativePath: string, measuredBytes: number): AmbicodeError =>
  new AmbicodeError('snapshot-too-large', 'The change does not fit in the review snapshot, so it was not reviewed.', {
    details: [
      `${relativePath} would take the snapshot to ${measuredBytes} bytes, above the ${MAX_SNAPSHOT_TOTAL_BYTES}-byte total ceiling.`,
      'This ceiling is not configurable: raising review.maxContextBytes will not change it.',
      'Split the change into parts that each fit, or exclude generated paths with --exclude <glob>.',
      'AMBICODE does not review part of a change and report it as a whole.',
    ],
  });

async function readAll(content: ContentSource, paths: readonly string[]): Promise<Map<string, FileContent | null>> {
  const found = new Map<string, FileContent | null>();
  for (let start = 0; start < paths.length; start += CONTENT_READ_CONCURRENCY) {
    const read = await Promise.all(paths.slice(start, start + CONTENT_READ_CONCURRENCY).map(async (relativePath) => [relativePath, await content.read(relativePath)] as const));
    for (const [relativePath, value] of read) found.set(relativePath, value);
  }
  return found;
}

interface PlanSnapshotOptions {
  files: readonly DiffFile[];
  content: ContentSource;
  includeSiblingContext?: boolean;
  /** Context is filtered through these too: a file kept out of the review does not come back in beside it. */
  operator?: OperatorPatterns;
  /** Past this `totalBytes` sibling context stops being added; changed files are mirrored regardless. */
  contextBudgetBytes?: number;
  /** Unchanged files that rely on the change; read before the directory neighbours, which are trimmed first. */
  dependentPaths?: readonly string[];
}

export async function planSnapshot(options: PlanSnapshotOptions): Promise<SnapshotPlan> {
  const entries: SnapshotEntry[] = [];
  const omissions: string[] = [];
  const changedPaths: string[] = [];
  let totalBytes = 0;
  const add = (relativePath: string, text: string): void => {
    const bytes = byteLength(text);
    entries.push({ path: relativePath, text, bytes });
    totalBytes += bytes;
  };
  const omit = (relativePath: string, reason: ExclusionReason): void => {
    omissions.push(`${relativePath}: not included because it is ${describeExclusion(reason)}.`);
  };
  const excerpted: { target: string; fileBytes: number; contextLines: number }[] = [];
  // A changed file over the ceiling is mirrored as its changed hunks; false when there is no text or the hunks alone do not fit.
  const mirrorExcerpt = (file: DiffFile, target: string, fileBytes: number, text: string | undefined): boolean => {
    const excerpt = text === undefined ? null : excerptOf(text, file.hunks, target, fileBytes, MAX_SNAPSHOT_FILE_BYTES);
    if (excerpt === null) return false;
    if (totalBytes + excerpt.bytes > MAX_SNAPSHOT_TOTAL_BYTES) throw totalTooLarge(target, totalBytes + excerpt.bytes);
    add(target, excerpt.text);
    excerpted.push({ target, fileBytes, contextLines: excerpt.contextLines });
    return true;
  };

  // What needs reading is decided before anything is read, so the reads run in parallel and the decisions stay in diff order.
  const needed: string[] = [];
  for (const file of options.files) {
    if (file.newPath === null) continue;
    changedPaths.push(file.newPath);
    if (!file.binary && pathExclusionReason(file.newPath) === null) needed.push(file.newPath);
  }
  const changedContent = await readAll(options.content, needed);
  const oversized: { path: string; bytes: number }[] = [];
  for (const file of options.files) {
    const target = file.newPath;
    if (target === null) continue;
    const pathReason = file.binary ? 'binary-content' : pathExclusionReason(target);
    if (pathReason !== null) {
      omit(target, pathReason);
      continue;
    }
    const contents = changedContent.get(target) ?? null;
    if (contents === null) omissions.push(`${target}: content could not be read at the reviewed revision.`);
    else if (contents.kind === 'symlink') omit(target, 'symlink');
    else if (contents.kind === 'binary') omit(target, 'binary-content');
    else if (contents.kind === 'too-large') {
      if (!mirrorExcerpt(file, target, contents.bytes, contents.text)) oversized.push({ path: target, bytes: contents.bytes });
    } else {
      const size = byteLength(contents.text);
      if (size > MAX_SNAPSHOT_FILE_BYTES) {
        if (!mirrorExcerpt(file, target, size, contents.text)) oversized.push({ path: target, bytes: size });
      } else if (totalBytes + size > MAX_SNAPSHOT_TOTAL_BYTES) throw totalTooLarge(target, totalBytes + size);
      else add(target, contents.text);
    }
  }
  if (oversized.length > 0) throw oversizedRefusal(oversized);

  const changedSet = new Set(changedPaths);
  const siblingCeiling = Math.min(MAX_SNAPSHOT_TOTAL_BYTES, options.contextBudgetBytes ?? Number.POSITIVE_INFINITY);
  const operator = options.operator ?? {};
  let contextCount = 0;
  let contextTrimmed = 0;
  let contextCapped = false;
  const dependentPaths: string[] = [];
  const dependentsLeftOut: string[] = [];
  const dependentsWanted = (options.dependentPaths ?? []).filter((candidate) => !changedSet.has(candidate));
  const dependentsRead = await readAll(options.content, dependentsWanted);
  for (const dependent of dependentsWanted) {
    const contents = dependentsRead.get(dependent) ?? null;
    const size = contents?.kind === 'text' ? byteLength(contents.text) : 0;
    if (contents?.kind !== 'text' || pathExclusionReason(dependent, operator) !== null || size > MAX_SNAPSHOT_FILE_BYTES || totalBytes + size > siblingCeiling) {
      dependentsLeftOut.push(dependent);
      continue;
    }
    add(dependent, contents.text);
    dependentPaths.push(dependent);
  }

  // The listing still happens when the budget is full: what was left out has to be reported. Only the reads are skipped.
  if (options.includeSiblingContext !== false) {
    const directories = uniqueDirectories(changedPaths);
    const listed = directories.slice(0, MAX_CONTEXT_DIRECTORY_LISTS);
    contextCapped = listed.length < directories.length;
    const candidates: string[] = [];
    for (const directory of listed) {
      for (const sibling of await options.content.list(directory)) {
        if (!changedSet.has(sibling) && !dependentPaths.includes(sibling) && pathExclusionReason(sibling, operator) === null && !isUselessAsContext(sibling)) candidates.push(sibling);
      }
    }
    if (candidates.length > MAX_CONTEXT_FILE_READS) contextCapped = true;
    const wanted = candidates.slice(0, MAX_CONTEXT_FILE_READS);
    // In batches, so a full budget stops the reads instead of paying for every candidate.
    for (let start = 0; start < wanted.length; start += CONTENT_READ_CONCURRENCY) {
      if (totalBytes >= siblingCeiling) {
        contextTrimmed += wanted.length - start;
        break;
      }
      const batch = wanted.slice(start, start + CONTENT_READ_CONCURRENCY);
      const read = await readAll(options.content, batch);
      for (const sibling of batch) {
        const contents = read.get(sibling) ?? null;
        if (contents?.kind !== 'text') continue;
        const size = byteLength(contents.text);
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

  // One line for all of them: a line per file made part 4 of the report long enough that the model abbreviated it and the Stop check blocked.
  for (const contextLines of [...new Set(excerpted.map((file) => file.contextLines))]) {
    const group = excerpted.filter((file) => file.contextLines === contextLines);
    omissions.push(`${group.length} changed file(s) above the ${MAX_SNAPSHOT_FILE_BYTES}-byte per-file ceiling were mirrored as their changed hunks with ${contextLines} line(s) around each; the patch holds the whole change: ${group.map((file) => `${file.target} (${file.fileBytes} bytes)`).join(', ')}.`);
  }
  if (dependentPaths.length > 0) {
    omissions.push(`${dependentPaths.length} unchanged file(s) that mention names this change adds, removes or renames were included so the reviewer could check them: ${dependentPaths.join(', ')}. They were found by name, not by type: a caller that reaches the code another way is not among them.`);
  }
  if (dependentsLeftOut.length > 0) {
    omissions.push(`${dependentsLeftOut.length} unchanged file(s) that mention names this change touches could not be included (unreadable, excluded, or over the input limit): ${dependentsLeftOut.join(', ')}. Whether the change breaks them was not checked.`);
  }
  omissions.push(
    contextCount === 0
      ? dependentPaths.length === 0
        ? 'Only changed files are present. Unchanged code elsewhere in the repository was not available to the reviewer.'
        : 'Besides the changed files and the files that rely on them, no unchanged code was available to the reviewer.'
      : `Besides the changed files, ${contextCount} unchanged file(s) sitting in the same directories were included. The rest of the repository was not available to the reviewer.`,
  );
  if (contextTrimmed > 0) {
    omissions.push(`${contextTrimmed} further unchanged file(s) beside the change were left out because including them would put the review over its configured input limit. The change itself is complete; only surrounding context was trimmed.`);
  }
  if (contextCapped) {
    omissions.push(`Unchanged context was gathered from at most ${MAX_CONTEXT_DIRECTORY_LISTS} of the change's directories and at most ${MAX_CONTEXT_FILE_READS} neighbouring files. On a change this wide the rest was not read at all, so absence of context here says nothing about those files. The change itself is complete.`);
  }
  return { entries, changedPaths, omissions, totalBytes, dependentPaths };
}

/** Materializes a plan. Nothing is decided here, so nothing can differ from what was measured. */
export async function writeSnapshot(fs: FileSystem, plan: SnapshotPlan, patch: string): Promise<Snapshot> {
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
  return { directory, filesDirectory, included: plan.entries.map((entry) => entry.path), omissions: plan.omissions, totalBytes: plan.totalBytes, dispose: () => fs.remove(directory) };
}
