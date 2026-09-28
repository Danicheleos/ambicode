import { systemClock } from '../ports/clock.ts';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';

/**
 * The real adapter, not a fake: the point is that a real temporary directory is created,
 * written, passed to the child and removed. `written` keeps what went into it, because
 * `invoke` deletes the directory before it returns.
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
