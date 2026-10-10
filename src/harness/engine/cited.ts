import path from 'node:path';
import type { Runtime } from '#types/composition';

export interface CitedInput { root: string; files: () => Promise<readonly string[]> }

const CITATION = /(?<![\w:/])((?:\/|[\w.-]+\/)?[\w./-]*[\w-]\.[A-Za-z][A-Za-z0-9]*):(\d+)(?:-(\d+))?/g;
/** A path with a directory part, or a bare file name with a line: what an answer cites. */
const CITED_PATH = /(?<![\w:/@])((?:[\w.-]+\/)+[\w.-]*[\w-]\.[A-Za-z][A-Za-z0-9]*|[\w-][\w.-]*\.[A-Za-z][A-Za-z0-9]*(?=:\d))/g;

/**
 * The repository file a cited path names: as written from the root, else the one file whose path ends with it (a bare
 * name, or a path relative to a feature directory); `ambiguous` when several do.
 */
async function locateCited(cited: string, input: CitedInput, runtime: Runtime): Promise<string | 'ambiguous' | null> {
  const file = path.isAbsolute(cited) ? cited : path.join(input.root, cited);
  if (await runtime.fs.exists(file)) return file;
  if (path.isAbsolute(cited)) return null;
  const tail = cited.replace(/^\.\//, '');
  const named = (await input.files()).filter((candidate) => candidate === tail || candidate.endsWith(`/${tail}`));
  if (named.length > 1) return 'ambiguous';
  return named.length === 1 ? path.join(input.root, named[0]!) : null;
}

/** An answer is report-shaped when it cites at least one file that exists in the repository. */
export async function citesRepository(text: string, input: CitedInput, runtime: Runtime): Promise<boolean> {
  for (const match of text.matchAll(CITED_PATH)) {
    if (match.index > 0 && text.slice(Math.max(0, match.index - 3), match.index).includes('//')) continue;
    const found = await locateCited(match[1]!, input, runtime);
    if (found !== null && found !== 'ambiguous' && !path.relative(input.root, found).startsWith('..')) return true;
  }
  return false;
}

/** Each `path:line` the text cites must exist; `rangeStart` judges a range by its start, since an answer's range only overshoots. */
export async function citationProblems(text: string, input: CitedInput, runtime: Runtime, rangeStart: boolean): Promise<string[]> {
  const problems: string[] = [];
  const { root } = input;
  for (const match of text.matchAll(CITATION)) {
    if (match[0].includes('://')) continue;
    const found = await locateCited(match[1]!, input, runtime);
    if (found === 'ambiguous') continue;
    const file = found ?? (path.isAbsolute(match[1]!) ? match[1]! : path.join(root, match[1]!));
    if (path.relative(root, file).startsWith('..')) continue;
    const last = Number(rangeStart ? match[2] : (match[3] ?? match[2]));
    try {
      const content = await runtime.fs.readText(file);
      const lines = content.split('\n').length - (/\n$/.test(content) ? 1 : 0);
      if (last > lines) problems.push(`${match[0]}: ${path.relative(root, file)} has ${lines} lines.`);
    } catch {
      problems.push(`${match[0]}: ${path.relative(root, file)} does not exist.`);
    }
  }
  return problems;
}
