import { constants } from 'node:fs';
import {
  access,
  copyFile,
  glob,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** What callers need from a stat; the node object satisfies it directly. */
export interface FileStats {
  readonly size: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface DirectoryEntry {
  readonly name: string;
  isFile(): boolean;
  isDirectory(): boolean;
}

/**
 * Filesystem access as an injected dependency (doc 02). Paths are absolute,
 * directory creation is recursive and removal is forced.
 */
export interface FileSystem {
  readText(absolutePath: string): Promise<string>;
  readBytes(absolutePath: string): Promise<Uint8Array>;
  writeText(absolutePath: string, contents: string): Promise<void>;
  /**
   * Creates a file only if it does not already exist, atomically at the OS
   * level (`O_EXCL`): two callers racing to create the same path can never
   * both succeed. Returns `false` without writing anything when the path is
   * already there. Used for the per-review publication lease (doc 03 P1.7
   * correction C), where the in-memory session lock is not enough because the
   * same review can be opened by two processes.
   */
  createExclusive(absolutePath: string, contents: string): Promise<boolean>;
  /** Same-directory rename, which is atomic; used to replace a file in place. */
  rename(from: string, to: string): Promise<void>;
  mkdirp(absolutePath: string): Promise<void>;
  /** A new directory under the host's temporary location, which the adapter owns. */
  temporaryDirectory(prefix: string): Promise<string>;
  /** Where those directories live, so an owned-only sweep can enumerate them. */
  temporaryRoot(): string;
  remove(absolutePath: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  stat(absolutePath: string): Promise<FileStats>;
  lstat(absolutePath: string): Promise<FileStats>;
  readdir(absolutePath: string): Promise<DirectoryEntry[]>;
  exists(absolutePath: string): Promise<boolean>;
  realpath(absolutePath: string): Promise<string>;
  /** Matches relative to `cwd` and yields `/`-separated relative paths. */
  glob(pattern: string, cwd: string): Promise<string[]>;
  setTimes(absolutePath: string, time: Date): Promise<void>;
}

export const nodeFileSystem: FileSystem = {
  readText: (absolutePath) => readFile(absolutePath, 'utf8'),
  readBytes: (absolutePath) => readFile(absolutePath),
  writeText: (absolutePath, contents) => writeFile(absolutePath, contents, 'utf8'),
  createExclusive: async (absolutePath, contents) => {
    try {
      // `wx` is `O_CREAT | O_EXCL`: the kernel refuses the call outright when
      // the path exists, rather than this adapter checking and then writing.
      await writeFile(absolutePath, contents, { encoding: 'utf8', flag: 'wx' });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  },
  rename: (from, to) => rename(from, to),
  mkdirp: async (absolutePath) => {
    await mkdir(absolutePath, { recursive: true });
  },
  temporaryDirectory: (prefix) => mkdtemp(path.join(tmpdir(), prefix)),
  temporaryRoot: () => tmpdir(),
  remove: (absolutePath) => rm(absolutePath, { recursive: true, force: true }),
  copyFile: (from, to) => copyFile(from, to),
  stat: (absolutePath) => stat(absolutePath),
  lstat: (absolutePath) => lstat(absolutePath),
  readdir: (absolutePath) => readdir(absolutePath, { withFileTypes: true }),
  exists: async (absolutePath) => {
    try {
      await access(absolutePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },
  realpath: (absolutePath) => realpath(absolutePath),
  glob: async (pattern, cwd) => {
    const found: string[] = [];
    for await (const entry of glob(pattern, { cwd })) found.push(entry.split(path.sep).join('/'));
    return found;
  },
  setTimes: (absolutePath, time) => utimes(absolutePath, time, time),
};
