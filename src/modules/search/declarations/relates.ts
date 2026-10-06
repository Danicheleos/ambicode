import path from 'node:path';
import type { ProjectConfig } from '#types/config';
import { AmbicodeError } from '#util/errors';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import { formatIndexStatus, indexAdapterFor, type IndexDeps } from '../code-index/adapter.ts';
import { breadthGuard, cut, pathspecOf, withLimitations } from './refs.ts';
import type { IndexAdapter, IndexStatus } from '#types/search';

export interface RelatesResult {
  path: string;
  via: 'index' | 'grep-basename';
  /** null without an index: absent, not empty (D7). */
  imports: string[] | null;
  importers: string[];
  index: IndexStatus;
  limitations: string[];
}

/** Repository-relative first, then relative to the working directory; it must be a file inside the project (05-R1). */
async function resolvePath(deps: IndexDeps, project: ProjectConfig, value: string): Promise<string> {
  const isFile = async (relative: string): Promise<boolean> => {
    try {
      return (await deps.runtime.fs.stat(path.join(deps.repositoryRoot, relative))).isFile();
    } catch {
      return false;
    }
  };
  const fromCwd = normalizeRelative(path.relative(deps.repositoryRoot, path.resolve(await deps.runtime.fs.realpath(deps.runtime.cwd).catch(() => deps.runtime.cwd), value)));
  for (const candidate of [normalizeRelative(value), fromCwd]) {
    if (candidate === '' || candidate.startsWith('..') || path.isAbsolute(candidate)) continue;
    if (toProjectRelative(normalizeRelative(project.root), candidate) !== null && (await isFile(candidate))) return candidate;
  }
  throw new AmbicodeError('bad-argument', `"relates" needs an existing file inside project "${project.id}".`, { field: 'path' });
}

/** Imports and importers from the index, else files naming the basename (05-R2). */
export async function relates(deps: IndexDeps, project: ProjectConfig, value: string, options: { index?: IndexAdapter } = {}): Promise<RelatesResult> {
  const file = await resolvePath(deps, project, value);
  const base = path.posix.basename(file);
  const stem = base.lastIndexOf('.') > 0 ? base.slice(0, base.lastIndexOf('.')) : base;
  // The basename guard applies to an index answer too (05-L1).
  const guard = await breadthGuard(deps.git, project, [stem]);
  const adapter = options.index ?? indexAdapterFor(deps, project);
  const answer = await adapter.relates(file);
  if (answer.ok) return { path: file, via: 'index', imports: answer.value.imports, importers: guard.kept.length === 0 ? [] : answer.value.importers, index: answer.status, limitations: guard.limitations };
  const importers = guard.kept.length === 0 ? [] : (await deps.git.grepWords([stem], pathspecOf(project))).filter((other) => other !== file).sort();
  return { path: file, via: 'grep-basename', imports: null, importers, index: answer.status, limitations: [...guard.limitations, 'imports need an index'] };
}

export function renderRelates(result: RelatesResult): { text: string; full: string; truncated: boolean } {
  const rows = [
    `${result.path} — via: ${result.via}`,
    formatIndexStatus(result.index),
    result.imports === null ? 'imports: unknown' : `imports (${result.imports.length}):`,
    ...(result.imports ?? []).map((file) => `  ${file}`),
    `importers (${result.importers.length}):`,
    ...result.importers.map((file) => `  ${file}`),
  ];
  const full = withLimitations(rows, result.limitations).join('\n');
  return { full, ...cut(full, `<n> more lines: relates ${result.path} --show`) };
}
