import type { ProjectConfig } from '../contracts/config.ts';
import type { DiffFile } from '../git/diff.ts';
import type { Git } from '../git/git.ts';
import { DECLARATION_PATTERNS } from '../config/ecosystems.ts';
import { isTestPath } from '../snapshot/exclusions.ts';
import { locate } from './locate.ts';

/**
 * Terms are locate's twelve at most; a removal outranks an addition because a caller of something
 * that is gone fails, while a caller of something new does not exist yet.
 */
const MAX_DEPENDENT_TERMS = 12;

/**
 * Modules take at most half the terms: the refactor behind this deleted 40 modules, and their names
 * (twenty of them specs) filled all twelve slots while every changed declaration went unasked.
 */
const MAX_MODULE_TERMS = 6;

/** The reviewer reads these on top of the change; eight keeps a wide change inside the input limit. */
export const MAX_DEPENDENTS = 8;

/** Names that mean nothing on their own: matching them finds the whole project. */
export const COMMON_NAMES = new Set(['constructor', 'index', 'default', 'main', 'get', 'set', 'run', 'init', 'test', 'it', 'describe', 'props', 'state']);

const DECLARATIONS = DECLARATION_PATTERNS;

function declaredNames(text: string): string[] {
  const names: string[] = [];
  for (const pattern of DECLARATIONS) {
    const name = pattern.exec(text)?.[1];
    if (name !== undefined && name.length >= 3 && !COMMON_NAMES.has(name)) names.push(name);
  }
  return names;
}

/** A barrel or package entry is imported by its directory; alone its name matches every such file. */
const ENTRY_STEMS = new Set(['index', 'mod', 'main', '__init__']);

/**
 * `save-table-views.command.ts` is imported as `./save-table-views.command`. An entry file keeps two
 * directories: a deleted `delete/index.ts` as `index` matched 3 unrelated files in a 57-file review,
 * and as `delete/index` still matched another feature's own `delete/index`.
 */
function moduleName(filePath: string): string {
  const segments = filePath.split('/');
  const base = segments.pop() ?? filePath;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return ENTRY_STEMS.has(stem) && segments.length > 0 ? `${segments.slice(-2).join('/')}/${stem}` : stem;
}

/**
 * The names other code would use to reach this change, in the order a break is most likely:
 * a deleted or renamed module, a name that left the code, then a name that was added or altered.
 */
export function changeTerms(files: readonly DiffFile[]): string[] {
  const gone = new Set<string>();
  // Declared with a visibility keyword first: those are the names other files can reach.
  const removed: string[][] = [[], []];
  const present: string[][] = [[], []];

  for (const file of files) {
    if (file.binary) continue;
    // Nothing imports a test, so its module name finds only itself.
    if (file.oldPath !== null && file.oldPath !== file.newPath && !isTestPath(file.oldPath)) gone.add(moduleName(file.oldPath));
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === 'context') continue;
        const tier = /\b(?:export|public|pub|protected)\b/.test(line.text) ? 0 : 1;
        for (const name of declaredNames(line.text)) (line.kind === 'removed' ? removed : present)[tier]!.push(name);
      }
    }
  }

  const modules = [...gone].slice(0, MAX_MODULE_TERMS);
  const stillPresent = new Set(present.flat());
  const ordered = [...modules, ...removed.flat().filter((name) => !stillPresent.has(name)), ...present.flat()];
  return [...new Set(ordered)].slice(0, MAX_DEPENDENT_TERMS);
}

export interface Dependent {
  path: string;
  reasons: string[];
}

export interface Dependents {
  terms: string[];
  dependents: Dependent[];
  limitations: string[];
}

/**
 * Unchanged source files that mention what the change adds, removes or renames. A name match is a
 * hypothesis, not a reference: LSP `findReferences` is the precise form and the review skill uses it.
 */
export async function findDependents(options: {
  git: Git;
  projects: readonly ProjectConfig[];
  files: readonly DiffFile[];
}): Promise<Dependents> {
  const changed = new Set(options.files.flatMap((file) => [file.oldPath, file.newPath].filter((path): path is string => path !== null)));
  const terms = changeTerms(options.files);
  if (terms.length === 0) return { terms, dependents: [], limitations: ['The change declares no name another file could rely on.'] };

  const found = new Map<string, Dependent>();
  const limitations: string[] = [];
  for (const project of options.projects) {
    const shortlist = await locate({ git: options.git, project, terms, limit: MAX_DEPENDENTS * 3 });
    limitations.push(...shortlist.limitations.filter((line) => /not listed|matched .* files, which is not a shortlist/.test(line)));
    for (const candidate of shortlist.candidates) {
      if (changed.has(candidate.path)) continue;
      // Co-change is a habit, not a dependency: only a file that mentions a name counts.
      const mentions = candidate.reasons.filter((reason) => reason.startsWith('contains'));
      if (mentions.length === 0 || found.has(candidate.path)) continue;
      found.set(candidate.path, { path: candidate.path, reasons: mentions });
    }
  }
  return { terms, dependents: [...found.values()].slice(0, MAX_DEPENDENTS), limitations };
}
