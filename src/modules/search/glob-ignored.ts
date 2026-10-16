import path from 'node:path';
import { mostSpecificRoot, normalizeRelative } from '#util/paths';

export interface GlobResponse {
  filenames: string[];
  numFiles?: number;
  totalMatches?: number;
  [key: string]: unknown;
}

export interface IgnoredProject {
  root: string;
  ignored: readonly string[];
}

const posix = (value: string): string => value.split(path.sep).join('/');

/**
 * Drops Glob results under a git-ignored entry of the project that owns them (longest root wins).
 * An entry the call itself names (in its pattern or path) is kept: the model asked for it, so hiding it would read as an empty directory.
 */
export function dropIgnoredGlobResults(
  response: GlobResponse,
  options: { cwd: string; repositoryRoot: string; projects: readonly IgnoredProject[]; pattern?: string; searchPath?: string },
): GlobResponse | null {
  const named = posix(`${options.pattern ?? ''}\n${options.searchPath ?? ''}`);
  const projects = options.projects
    .map((project) => ({ root: normalizeRelative(project.root), entries: project.ignored.filter((entry) => !named.includes(entry.replace(/\/$/, ''))) }))
    .filter((project) => project.entries.length > 0);
  if (projects.length === 0) return null;
  const owner = (relative: string) => normalizeRelative(mostSpecificRoot(options.projects, relative)?.root ?? '');
  const kept = response.filenames.filter((filename) => {
    const relative = posix(path.relative(options.repositoryRoot, path.resolve(options.cwd, filename)));
    const root = owner(relative);
    const project = projects.find((candidate) => candidate.root === root);
    if (project === undefined) return true;
    const inside = root === '' ? relative : relative.slice(root.length + 1);
    return !project.entries.some((entry) => (entry.endsWith('/') ? inside.startsWith(entry) : inside === entry));
  });
  const removed = response.filenames.length - kept.length;
  if (removed === 0) return null;
  return {
    ...response,
    filenames: kept,
    numFiles: kept.length,
    ...(typeof response.totalMatches === 'number' ? { totalMatches: Math.max(0, response.totalMatches - removed) } : {}),
  };
}
