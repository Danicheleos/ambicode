import { openRepository, type Runtime } from '../composition/root.ts';
import type { ProjectConfig } from '../contracts/config.ts';
import { literalPathspec } from '../git/git.ts';
import { normalizeRelative } from '../util/paths.ts';
import { harvest, type Declaration } from './harvest.ts';

export const SEARCH_LIMIT_BYTES = 4096;
const MAX_LINES_PER_NAME = 500;
const SNIPPET = 100;

export interface RefsResult {
  names: { name: string; hits: number; files: number; collides: boolean }[];
  hits: number;
  /** Cut to 4,096 bytes with the command that prints the rest. */
  text: string;
  full: string;
  bytes: number;
  truncated: boolean;
}

const pathspecOf = (project: ProjectConfig): string | null => {
  const root = normalizeRelative(project.root);
  return root === '' ? null : literalPathspec(root);
};

function cut(full: string, rest: string): { text: string; truncated: boolean } {
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

/** Lines using each whole word, with a name declared in several files flagged: a hit may be another file's namesake (03-M6). */
export async function refs(runtime: Runtime, names: readonly string[], options: { project: ProjectConfig; show: boolean }): Promise<RefsResult> {
  const { git, repositoryRoot } = await openRepository(runtime);
  const rows: string[] = [];
  const summary: RefsResult['names'] = [];
  for (const name of names) {
    const lines = (await git.grepWordLines(name, pathspecOf(options.project))).slice(0, MAX_LINES_PER_NAME);
    const files = [...new Set(lines.map((line) => line.path))];
    const declared = (await harvest(runtime.fs, repositoryRoot, files, options.project.ecosystem)).filter((declaration) => declaration.name === name);
    const declaredIn = [...new Set(declared.map((declaration) => declaration.path))];
    const collides = declaredIn.length > 1;
    summary.push({ name, hits: lines.length, files: files.length, collides });
    rows.push(`${name}: ${lines.length} hits in ${files.length} files${collides ? `; collides: declared in ${declaredIn.join(', ')}; check each hit's import` : ''}`);
    for (const line of lines) rows.push(`  ${line.path}:${line.line}: ${line.text.trim().slice(0, SNIPPET)}`);
  }
  const full = rows.join('\n');
  const { text, truncated } = cut(full, `<n> more lines: refs ${names.join(' ')} --show`);
  const shown = options.show ? full : text;
  return { names: summary, hits: summary.reduce((total, row) => total + row.hits, 0), text: shown, full, bytes: Buffer.byteLength(shown), truncated: truncated && !options.show };
}

/** Declarations of a name: files holding the whole word, then the patterns run over them. */
export async function find(runtime: Runtime, name: string, options: { project: ProjectConfig; kind: string | null }): Promise<Declaration[]> {
  const { git, repositoryRoot } = await openRepository(runtime);
  const files = await git.grepWords([name], pathspecOf(options.project));
  const declared = (await harvest(runtime.fs, repositoryRoot, files, options.project.ecosystem)).filter((declaration) => declaration.name === name);
  return options.kind === null ? declared : declared.filter((declaration) => declaration.kind === options.kind);
}

export function renderFind(name: string, declarations: readonly Declaration[]): { text: string; truncated: boolean } {
  if (declarations.length === 0) return { text: `${name}: no declaration found (exported declarations in TypeScript; the name may be declared in a form the patterns do not match).`, truncated: false };
  const lines = [`${name}: ${declarations.length} declaration(s) in ${new Set(declarations.map((declaration) => declaration.path)).size} file(s)${declarations[0]!.declarations > 1 ? '; collides: check each hit\'s import' : ''}`, ...declarations.map((declaration) => `  ${declaration.kind} ${declaration.path}:${declaration.line}`)];
  return cut(lines.join('\n'), '<n> more declarations');
}
