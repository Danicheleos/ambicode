// Git access: the safe `git` wrapper and the unified-diff parser.

// git.ts: runs git through a ProcessRunner with repository config neutralised; remote and pathspec helpers.
export type { GitOptions } from './git.ts';
/** Git — class over a ProcessRunner and repository root; construct with GitOptions, call its methods for diffs, files, refs and grep. */
export { Git } from './git.ts';
/** literalPathspec(relPath) — `:(literal,top)` pathspec so a file name is never read as a glob; pass to git commands. */
export { literalPathspec } from './git.ts';
/** parseRemoteProject(url) — host and project path of an https/ssh/scp-like remote URL, or null; never leaks credentials. */
export { parseRemoteProject } from './git.ts';
/** splitNul(output) — splits NUL-separated git output into non-empty entries. */
export { splitNul } from './git.ts';
/** parseRawZ(output) — parses `git diff --raw -z` output into RawChange records. */
export { parseRawZ } from './git.ts';

// diff.ts: combine raw changes with a patch into DiffFile hunks and query line addressability.
/** combineDiff(changes, patch) — merges `--raw -z` changes with the unified patch into DiffFile[]; call once per diff. */
export { combineDiff } from './diff.ts';
/** splitPatchSections(patch) — splits a multi-file unified patch into one section per file. */
export { splitPatchSections } from './diff.ts';
/** parseHunks(section) — parses one file's patch section into DiffHunk[]. */
export { parseHunks } from './diff.ts';
/** addressableLines(file, side) — set of line numbers on the old/new side that a comment can be anchored to. */
export { addressableLines } from './diff.ts';
/** lineAt(file, side, line) — the DiffLine at that line on the given side, or null when the diff does not show it. */
export { lineAt } from './diff.ts';
/** totalChangedLines(files) — sum of added and removed lines across the files; used for size estimates. */
export { totalChangedLines } from './diff.ts';
