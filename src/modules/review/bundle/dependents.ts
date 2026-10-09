import type { ProjectConfig } from '#types/modules/config';
import type { Git } from '#platform/git/git';
import { isTestPath } from '#util/path-classes';
import { literalPathspec } from '#platform/git/git';
import { normalizeRelative } from '#util/paths';
import { isSearchable } from '#util/path-classes';
import { DECLARATION_PATTERNS } from '#types/modules/ecosystems';
import { MAX_DEPENDENTS, COMMON_NAMES, type Dependent } from '#types/modules/search';
import { declarationsOf } from '#modules/search/harvest';
import type { DiffFile } from '#types/platform/git';
import type { FileSystem } from '#types/platform/ports';

/**
 * Twelve terms at most; a removal outranks an addition because a caller of something
 * that is gone fails, while a caller of something new does not exist yet.
 */
const MAX_DEPENDENT_TERMS = 12;

/**
 * Modules take at most half the terms: the refactor behind this deleted 40 modules, and their names
 * (twenty of them specs) filled all twelve slots while every changed declaration went unasked.
 */
const MAX_MODULE_TERMS = 6;

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

interface Dependents {
  terms: string[];
  dependents: Dependent[];
  limitations: string[];
}

/** A term in this share of the project's files names the project, not a dependency. */
const TOO_BROAD_SHARE = 0.6;
const TOO_BROAD_MIN_FILES = 5;

/**
 * Unchanged source files that mention what the change adds, removes or renames, the files naming most terms first.
 * A name match is a hypothesis, not a reference: LSP `findReferences` is the precise form and the review skill uses it.
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
    const root = normalizeRelative(project.root);
    const pathspec = root === '' ? null : literalPathspec(root);
    const total = (await options.git.listFiles(pathspec)).length;
    for (const term of terms) {
      const files = (await options.git.grepFiles(term, pathspec)).filter((file) => !changed.has(file) && isSearchable(file));
      if (files.length >= TOO_BROAD_MIN_FILES && files.length > total * TOO_BROAD_SHARE) {
        limitations.push(`"${term}" matched ${files.length} of the project's ${total} files, which is not a shortlist, so it was ignored.`);
        continue;
      }
      for (const file of files) found.set(file, { path: file, reasons: [...(found.get(file)?.reasons ?? []), `contains "${term}"`] });
    }
  }
  const ranked = [...found.values()].sort((a, b) => b.reasons.length - a.reasons.length || a.path.localeCompare(b.path));
  return { terms, dependents: ranked.slice(0, MAX_DEPENDENTS), limitations };
}

/** A dependent found by a name another file also declares may import a different one (08-D3); flagged, never resolved. */
export async function flagCollisions(git: Git, fs: FileSystem, projects: readonly ProjectConfig[], dependents: Dependent[]): Promise<Dependent[]> {
  const termsOf = (entry: Dependent): string[] => entry.reasons.flatMap((reason) => /^contains "([^"]+)"/.exec(reason)?.[1] ?? []);
  const terms = [...new Set(dependents.flatMap(termsOf))];
  if (terms.length === 0) return dependents;
  const colliding = new Set<string>();
  for (const project of projects) {
    const root = normalizeRelative(project.root);
    for (const declaration of await declarationsOf(git, fs, terms, root === '' ? null : literalPathspec(root))) if (declaration.declarations >= 2) colliding.add(declaration.name);
  }
  return dependents.map((entry) => {
    const flagged = termsOf(entry).filter((term) => colliding.has(term)).map((term) => `verify import: ${term} is declared in more than one file`);
    return flagged.length === 0 ? entry : { ...entry, reasons: [...entry.reasons, ...flagged] };
  });
}
