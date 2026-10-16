import { openWorkspace } from '#modules/config/workspace';
import type { ProjectConfig } from '#types/modules/config';
import { literalPathspec } from '#platform/git/git';
import { normalizeRelative } from '#util/paths';
import { declarationsOf } from './harvest.ts';
import type { Runtime } from '#types/composition';
import type { RefsResult } from '#types/modules/search';

export const REFS_LIMIT_BYTES = 4096;
const MAX_LINES_PER_NAME = 500;
const SNIPPET = 100;
const TOO_BROAD_SHARE = 0.6;
const TOO_BROAD_MIN_FILES = 5;

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
    if (matched >= TOO_BROAD_MIN_FILES && matched > total * TOO_BROAD_SHARE) limitations.push(`"${name}" matched ${matched} of ${total} files; ignored`);
    else kept.push(name);
  }
  const declared = kept.length === 0 ? [] : await declarationsOf(git, runtime.fs, kept, pathspec);
  const rows: string[] = [];
  const summary: RefsResult['names'] = [];
  for (const name of kept) {
    const lines = options.declarations === true ? [] : (await git.grepWordLines(name, pathspec)).slice(0, MAX_LINES_PER_NAME);
    const found = declared.filter((declaration) => declaration.name === name);
    const declarations = new Set(found.map((declaration) => declaration.path)).size;
    const collides = declarations >= 2;
    const files = new Set(lines.map((line) => line.path)).size;
    summary.push({ name, hits: lines.length, files, declarations, collides });
    rows.push(`${name}: ${options.declarations === true ? '' : `${lines.length} hits in ${files} files; `}declarations: ${declarations}${collides ? `; collides: declared in ${[...new Set(found.map((declaration) => declaration.path))].join(', ')}; check each hit's import` : ''}`);
    if (options.declarations === true) for (const declaration of found) rows.push(`  ${declaration.kind} ${declaration.path}:${declaration.line}`);
    for (const line of lines) rows.push(`  ${line.path}:${line.line}: ${line.text.trim().slice(0, SNIPPET)}`);
  }
  const full = [...rows, ...(limitations.length === 0 ? [] : ['limitations:', ...limitations.map((line) => `  ${line}`)])];
  // Cut from the bottom whole lines, with the count, so a 4 KB answer never ends mid-line.
  const kept_: string[] = [];
  let size = 0;
  for (const line of full) {
    size += Buffer.byteLength(line) + 1;
    if (size > REFS_LIMIT_BYTES - 64) break;
    kept_.push(line);
  }
  const truncated = kept_.length < full.length;
  const text = truncated ? `${kept_.join('\n')}\n${full.length - kept_.length} more lines; name fewer words or narrow with --project` : kept_.join('\n');
  return { names: summary, hits: summary.reduce((total_, row) => total_ + row.hits, 0), limitations, text, bytes: Buffer.byteLength(text), truncated };
}
