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
  mkdirp(absolutePath: string): Promise<void>;
  /** A new directory under the host's temporary location, which the adapter owns. */
  temporaryDirectory(prefix: string): Promise<string>;
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
  mkdirp: async (absolutePath) => {
    await mkdir(absolutePath, { recursive: true });
  },
  temporaryDirectory: (prefix) => mkdtemp(path.join(tmpdir(), prefix)),
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
