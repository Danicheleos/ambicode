import { openWorkspace } from '#modules/config/workspace';
import type { ProjectConfig } from '#types/modules/config';
import { literalPathspec } from '#platform/git/git';
import { normalizeRelative } from '#util/paths';
import { declarationsOf } from './harvest.ts';
import type { Runtime } from '#types/composition';
import type { RefsResult } from '#types/modules/search';

/** Characters of a hit line printed: a display clip kept as a selection. Unclipped, one hit could print a 63,530-char svg line (FE: 1,261 tracked lines over 1,000; k12 longest 2,944); Claude Code spills CLI output over 30,000 chars to a file (DECISIONS #86/#87). 100 itself is unmeasured. */
const SNIPPET = 100;
/** A term found in more than this share of the files describes the project (`src`, a company name), not a boundary; the minimum keeps tiny projects out of the rule. .6 and 5: unmeasured, no sweep records them. */
const TOO_BROAD_SHARE = 0.6;
const TOO_BROAD_MIN_FILES = 5;

/** The limitation line for a term matching most of the files (so it ranks nothing), or null when it is selective enough. */
export const tooBroad = (term: string, matched: number, total: number): string | null =>
  matched >= TOO_BROAD_MIN_FILES && matched > total * TOO_BROAD_SHARE ? `"${term}" matched ${matched} of ${total} files; ignored` : null;

/** Lines using each whole word, or with `declarations` where each is declared; a name in more than one file collides. */
export async function refs(runtime: Runtime, names: readonly string[], options: { project: ProjectConfig; declarations?: boolean }): Promise<RefsResult> {
  const { git } = await openWorkspace(runtime);
  const root = normalizeRelative(options.project.root);
  const pathspec = root === '' ? null : literalPathspec(root);
  const total = (await git.listFiles(pathspec)).length;
  const limitations: string[] = [];
  const kept: string[] = [];
  for (const name of names) {
    const matched = (await git.grepWords([name], pathspec)).length;
    const broad = tooBroad(name, matched, total);
    if (broad !== null) limitations.push(broad);
    else kept.push(name);
  }
  const declared = kept.length === 0 ? [] : await declarationsOf(git, runtime.fs, kept, pathspec);
  const rows: string[] = [];
  const summary: RefsResult['names'] = [];
  for (const name of kept) {
    const lines = options.declarations === true ? [] : await git.grepWordLines(name, pathspec);
    const found = declared.filter((declaration) => declaration.name === name);
    const declarations = new Set(found.map((declaration) => declaration.path)).size;
    const collides = declarations >= 2;
    const files = new Set(lines.map((line) => line.path)).size;
    summary.push({ name, hits: lines.length, files, declarations, collides });
    rows.push(`${name}: ${options.declarations === true ? '' : `${lines.length} hits in ${files} files; `}declarations: ${declarations}${collides ? `; collides: declared in ${[...new Set(found.map((declaration) => declaration.path))].join(', ')}; check each hit's import` : ''}`);
    if (options.declarations === true) for (const declaration of found) rows.push(`  ${declaration.kind} ${declaration.path}:${declaration.line}`);
    for (const line of lines) rows.push(`  ${line.path}:${line.line}: ${line.text.trim().slice(0, SNIPPET)}`);
  }
  const text = [...rows, ...(limitations.length === 0 ? [] : ['limitations:', ...limitations.map((line) => `  ${line}`)])].join('\n');
  return { names: summary, hits: summary.reduce((total_, row) => total_ + row.hits, 0), limitations, text, bytes: Buffer.byteLength(text) };
}
