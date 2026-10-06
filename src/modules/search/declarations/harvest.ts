import path from 'node:path';
import { DECLARATION_PATTERNS } from '#modules/types/ecosystems';
import { MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import type { ProjectConfig } from '#types/config';
import { literalPathspec, type Git } from '#platform/git/git';
import { matchesAnyGlob } from '#util/glob';
import { normalizeRelative } from '#util/paths';
import { profileOf, sourceGlob } from './profile.ts';
import type { FileSystem } from '#types/ports';
import { COMMON_NAMES, type Declaration } from '../types/declarations.ts';

const MIN_NAME = 3;
const EXPORT_LINE = /^\s*export\b/;
const KINDS = ['function', 'class', 'interface', 'type', 'enum', 'namespace', 'const', 'let', 'var', 'def', 'fn', 'func'];

function kindOf(line: string): string {
  const keyword = KINDS.find((candidate) => new RegExp(`\\b${candidate}\\b`).test(line));
  return keyword === 'def' || keyword === 'fn' || keyword === 'func' ? 'function' : (keyword ?? 'member');
}

/**
 * Every declaration the shared patterns find, all matches on all lines. With `exportOnly` (a profile fact) a line must
 * be an export to count as reachable from another file. A name declared in more than one of the given files collides.
 */
export async function harvest(fs: FileSystem, root: string, files: readonly string[], exportOnly: boolean): Promise<Declaration[]> {
  const patterns = DECLARATION_PATTERNS.map((pattern) => new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`));
  const found: Omit<Declaration, 'declarations'>[] = [];
  for (const file of files) {
    let text: string;
    try {
      const absolute = path.join(root, file);
      if ((await fs.stat(absolute)).size > MAX_SNAPSHOT_FILE_BYTES) continue;
      text = await fs.readText(absolute);
    } catch {
      continue;
    }
    const seen = new Set<string>();
    text.split(/\r?\n/).forEach((line, index) => {
      if (exportOnly && !EXPORT_LINE.test(line)) return;
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          const name = match[1];
          if (name === undefined || name.length < MIN_NAME || COMMON_NAMES.has(name)) continue;
          const key = `${name}:${index}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ name, kind: kindOf(line), path: file, line: index + 1 });
        }
      }
    });
  }
  const filesPerName = new Map<string, Set<string>>();
  for (const declaration of found) filesPerName.set(declaration.name, (filesPerName.get(declaration.name) ?? new Set()).add(declaration.path));
  return found.map((declaration) => ({ ...declaration, declarations: filesPerName.get(declaration.name)!.size }));
}

export interface CensusRow { declarations: number | null; files: string[] }

/** Files declaring each name, every match of every pattern; one file counts once, so overloads do not collide (05-C1). */
export function countDeclarations(
  texts: ReadonlyMap<string, string>,
  names: readonly string[],
  options: { exportOnly: boolean; patterns?: readonly RegExp[] },
): Map<string, CensusRow> {
  const sources = options.patterns ?? DECLARATION_PATTERNS;
  const census = new Map<string, CensusRow>(names.map((name) => [name, { declarations: sources.length === 0 ? null : 0, files: [] }]));
  if (sources.length === 0) return census;
  const patterns = sources.map((pattern) => new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`));
  for (const [file, text] of texts) {
    const declared = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      if (options.exportOnly && !EXPORT_LINE.test(line)) continue;
      for (const pattern of patterns) {
        for (const match of line.matchAll(pattern)) if (match[1] !== undefined && match[1].length >= MIN_NAME && !COMMON_NAMES.has(match[1])) declared.add(match[1]);
      }
    }
    for (const name of names) {
      const row = census.get(name)!;
      if (declared.has(name) && !row.files.includes(file)) row.files.push(file);
    }
  }
  for (const row of census.values()) row.declarations = row.files.length;
  return census;
}

/** Project-wide: the whole-word grep hits among the profile's source files, read and counted (05-C2). */
export async function declarationCensus(git: Git, fs: FileSystem, project: ProjectConfig, names: readonly string[]): Promise<{ census: Map<string, CensusRow>; limitations: string[] }> {
  const { sources, exportOnly } = profileOf(project);
  if (sources.length === 0) return { census: countDeclarations(new Map(), names, { exportOnly, patterns: [] }), limitations: ['no declaration patterns for a project without source extensions in its profile; collisions not computed'] };
  const root = normalizeRelative(project.root);
  const texts = new Map<string, string>();
  let skipped = 0;
  for (const file of (await git.grepWords(names, root === '' ? null : literalPathspec(root))).filter((hit) => matchesAnyGlob(hit, [sourceGlob(sources)]))) {
    const absolute = path.join(git.options.repositoryRoot, file);
    const size = await fs.stat(absolute).then((stats) => stats.size, () => null);
    if (size !== null && size > MAX_SNAPSHOT_FILE_BYTES) skipped += 1;
    else if (size !== null) texts.set(file, await fs.readText(absolute));
  }
  return { census: countDeclarations(texts, names, { exportOnly }), limitations: skipped === 0 ? [] : [`${skipped} file(s) over ${MAX_SNAPSHOT_FILE_BYTES} bytes not read for declarations`] };
}
