import { systemClock } from '../ports/clock.ts';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';

/**
 * The filesystem and clock `ClaudeReviewer` needs to hand its system prompt
 * over as a file rather than as an argument.
 *
 * The real adapter is used, not a fake: the point of the file is that a real
 * temporary directory is created, written, passed to the child and removed,
 * and a fake that only records calls would not prove any of that. `written`
 * keeps what went into it, because `invoke` deletes the directory before it
 * returns, so a test cannot read the file back afterwards.
 */
export interface ReviewerIo {
  fs: FileSystem;
  clock: typeof systemClock;
  written: Map<string, string>;
}

export function reviewerIo(): ReviewerIo {
  const written = new Map<string, string>();
  const fs: FileSystem = {
    ...nodeFileSystem,
    async writeText(absolutePath, contents) {
      written.set(absolutePath, contents);
      await nodeFileSystem.writeText(absolutePath, contents);
    },
  };
  return { fs, clock: systemClock, written };
}
