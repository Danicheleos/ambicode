import { constants } from 'node:fs';
import {
  access,
  appendFile,
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

export interface FileSystem {
  readText(absolutePath: string): Promise<string>;
  readBytes(absolutePath: string): Promise<Uint8Array>;
  writeText(absolutePath: string, contents: string): Promise<void>;
  /** Atomic (`O_EXCL`): of two processes racing for the per-review publication lease, only one wins. */
  createExclusive(absolutePath: string, contents: string): Promise<boolean>;
  /** One `O_APPEND` write, so lines under the pipe buffer size from two processes do not interleave. */
  appendText(absolutePath: string, contents: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdirp(absolutePath: string): Promise<void>;
  temporaryDirectory(prefix: string): Promise<string>;
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
      await writeFile(absolutePath, contents, { encoding: 'utf8', flag: 'wx' });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw error;
    }
  },
  appendText: (absolutePath, contents) => appendFile(absolutePath, contents, 'utf8'),
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
