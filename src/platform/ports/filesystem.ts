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
import type { FileSystem } from '#types/ports';

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
  isExecutable: async (absolutePath) => {
    try {
      if (!(await stat(absolutePath)).isFile()) return false;
      await access(absolutePath, constants.X_OK);
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
