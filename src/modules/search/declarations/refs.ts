import { openWorkspace } from '#composition/root';
import type { ProjectConfig } from '#types/config';
import { literalPathspec, type Git } from '#platform/git/git';
import { normalizeRelative } from '#util/paths';
import { declarationCensus, harvest } from './harvest.ts';
import { formatIndexStatus, indexAdapterFor } from '../code-index/adapter.ts';
import { indexDepsOf } from '../code-index/codeindex.ts';
import { isTooBroad } from '../text/locate.ts';
import { profileOf } from './profile.ts';
import type { Runtime } from '#types/composition';
import type { IndexAdapter, IndexStatus, RefsResult } from '#types/search';

export const SEARCH_LIMIT_BYTES = 4096;
const MAX_LINES_PER_NAME = 500;
const SNIPPET = 100;

export const pathspecOf = (project: ProjectConfig): string | null => {
  const root = normalizeRelative(project.root);
  return root === '' ? null : literalPathspec(root);
};

export function cut(full: string, rest: string): { text: string; truncated: boolean } {
  if (Buffer.byteLength(full) <= SEARCH_LIMIT_BYTES) return { text: full, truncated: false };
  const lines = full.split('\n');
  const kept: string[] = [];
  let size = Buffer.byteLength(rest) + 1;
  for (const line of lines) {
    size += Buffer.byteLength(line) + 1;
    if (size > SEARCH_LIMIT_BYTES) break;
    kept.push(line);
  }
  return { text: `${kept.join('\n')}\n${rest.replace('<n>', String(lines.length - kept.length))}`, truncated: true };
}

/** Terms matching more than 60% of the project's files say nothing; they are dropped and listed (05-L1). */
export async function breadthGuard(git: Git, project: ProjectConfig, terms: readonly string[]): Promise<{ kept: string[]; limitations: string[] }> {
  const total = (await git.listFiles(pathspecOf(project))).length;
  const kept: string[] = [];
  const limitations: string[] = [];
  for (const term of terms) {
    const matched = (await git.grepWords([term], pathspecOf(project))).length;
    if (isTooBroad(matched, total)) limitations.push(`"${term}" matched ${matched} of ${total} files; ignored`);
    else kept.push(term);
  }
  return { kept, limitations };
}

export const withLimitations = (rows: readonly string[], limitations: readonly string[]): string[] => (limitations.length === 0 ? [...rows] : [...rows, 'limitations:', ...limitations.map((line) => `  ${line}`)]);

/** Lines using each whole word; collisions come from the project-wide census, never from the index (05-C3). */
export async function refs(runtime: Runtime, names: readonly string[], options: { project: ProjectConfig; show: boolean }): Promise<RefsResult> {
  const { git } = await openWorkspace(runtime);
  const guard = await breadthGuard(git, options.project, names);
  const { census, limitations } = await declarationCensus(git, runtime.fs, options.project, guard.kept);
  const allLimitations = [...guard.limitations, ...limitations];
  const rows: string[] = [];
  const summary: RefsResult['names'] = [];
  for (const name of guard.kept) {
    const lines = (await git.grepWordLines(name, pathspecOf(options.project))).slice(0, MAX_LINES_PER_NAME);
    const files = new Set(lines.map((line) => line.path)).size;
    const { declarations, files: declaredIn } = census.get(name)!;
    const collides = declarations === null ? null : declarations >= 2;
    summary.push({ name, hits: lines.length, files, declarations, collides });
    rows.push(`${name}: ${lines.length} hits in ${files} files; declarations: ${String(declarations)}${collides === true ? `; collides: declared in ${declaredIn.join(', ')}; check each hit's import` : ''}`);
    for (const line of lines) rows.push(`  ${line.path}:${line.line}: ${line.text.trim().slice(0, SNIPPET)}`);
  }
  const full = withLimitations(rows, allLimitations).join('\n');
  const { text, truncated } = cut(full, `<n> more lines: refs ${names.join(' ')} --show`);
  const shown = options.show ? full : text;
  return { names: summary, hits: summary.reduce((total, row) => total + row.hits, 0), limitations: allLimitations, text: shown, full, bytes: Buffer.byteLength(shown), truncated: truncated && !options.show };
}

export interface FoundDeclaration { name: string; kind: string | null; path: string; line: number | null }
export interface FindResult { name: string; via: 'index' | 'harvest'; declarations: FoundDeclaration[]; collides: boolean | null; index: IndexStatus; limitations: string[] }

/** The index's declarations when it answers, else the census files harvested for kind and line (05-F1). */
export async function find(runtime: Runtime, name: string, options: { project: ProjectConfig; kind: string | null; index?: IndexAdapter }): Promise<FindResult> {
  const { git, repositoryRoot, config } = await openWorkspace(runtime);
  const adapter = options.index ?? indexAdapterFor(indexDepsOf(runtime, git, repositoryRoot, config), options.project);
  const guard = await breadthGuard(git, options.project, [name]);
  if (guard.kept.length === 0) return { name, via: 'harvest', declarations: [], collides: null, index: await adapter.status(options.project), limitations: guard.limitations };
  const answer = await adapter.find(name, options.kind === null ? undefined : { kind: options.kind });
  if (answer.ok) {
    const files = new Set(answer.value.map((row) => row.path)).size;
    return { name, via: 'index', declarations: answer.value, collides: files >= 2, index: answer.status, limitations: guard.limitations };
  }
  const { census, limitations } = await declarationCensus(git, runtime.fs, options.project, [name]);
  const row = census.get(name)!;
  const declared = (await harvest(runtime.fs, repositoryRoot, row.files, profileOf(options.project).exportOnly)).filter((declaration) => declaration.name === name);
  const declarations = (options.kind === null ? declared : declared.filter((declaration) => declaration.kind === options.kind)).map(({ name: found, kind, path, line }) => ({ name: found, kind, path, line }));
  return { name, via: 'harvest', declarations, collides: row.declarations === null ? null : row.declarations >= 2, index: answer.status, limitations: [...guard.limitations, ...limitations] };
}

export function renderFind(result: FindResult): { text: string; truncated: boolean } {
  const via = result.via === 'index' ? `via: index (${result.index.tool} ${result.index.state})` : 'via: harvest';
  const rows =
    result.declarations.length === 0
      ? [`${result.name}: no declaration found (only exported ones when the project profile sets exportOnly; the name may be declared in a form the patterns do not match).`]
      : [
          `${result.name}: ${result.declarations.length} declaration(s) in ${new Set(result.declarations.map((declaration) => declaration.path)).size} file(s)${result.collides === true ? "; collides: check each hit's import" : ''}`,
          ...result.declarations.map((declaration) => `  ${declaration.kind ?? 'declaration'} ${declaration.path}${declaration.line === null ? '' : `:${declaration.line}`}`),
        ];
  const lines = withLimitations([via, formatIndexStatus(result.index), ...rows], result.limitations);
  return cut(lines.join('\n'), '<n> more declarations');
}
