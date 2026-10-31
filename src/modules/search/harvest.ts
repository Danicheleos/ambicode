import path from 'node:path';
import { DECLARATION_PATTERNS } from '#types/modules/ecosystems';
import { MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import type { Git } from '#platform/git/git';
import type { FileSystem } from '#types/platform/ports';
import { COMMON_NAMES, type Declaration } from '#types/modules/search';

const MIN_NAME = 3;
const MAX_SIGNATURE = 120;
const EXPORT_LINE = /^\s*export\b/;
const HAS_EXPORT = /^\s*export\b/m;
/** Several declarations can share a line (`export const A = 1; export function b() {}`). */
const STATEMENT_END = /[;{}]/;
/** What may stand before a declaration keyword: modifiers and decorators. Anything else (`it(\"... type and ...\"`, ` * the type and`, a prose line) makes the keyword a word in a sentence, whose next word is not a name: 6404 harvested `and` and `that` from spec titles, comments, markdown and JSON text. */
const BEFORE_KEYWORD = /^(?:(?:export|declare|default|abstract|async|public|private|protected|internal|static|final|sealed|open|data|partial|readonly|override|pub|suspend|inline)\s+|@[\w$.]+(?:\([^)]*\))?\s*)*$/;
const KINDS = ['function', 'class', 'interface', 'type', 'enum', 'namespace', 'const', 'let', 'var', 'def', 'fn', 'func'];

function kindOf(line: string): string {
  const keyword = KINDS.find((candidate) => new RegExp(`\\b${candidate}\\b`).test(line));
  return keyword === 'def' || keyword === 'fn' || keyword === 'func' ? 'function' : (keyword ?? 'member');
}

/** The declarations of one file's text, by the rule `harvest` documents; the search index reads files through its own reader. */
export function declarationsInText(file: string, text: string): Omit<Declaration, 'declarations'>[] {
  const patterns = DECLARATION_PATTERNS.map((pattern) => new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`));
  const found: Omit<Declaration, 'declarations'>[] = [];
  const exportOnly = HAS_EXPORT.test(text);
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, index) => {
    if (exportOnly && !EXPORT_LINE.test(line)) return;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        const name = match[1];
        if (!BEFORE_KEYWORD.test(`${line.slice(0, match.index).split(STATEMENT_END).at(-1)} `.trimStart())) continue;
        if (name === undefined || name.length < MIN_NAME || COMMON_NAMES.has(name) || seen.has(`${name}:${index}`)) continue;
        seen.add(`${name}:${index}`);
        found.push({ name, kind: kindOf(line), path: file, line: index + 1, signature: line.trim().slice(0, MAX_SIGNATURE) });
      }
    }
  });
  return found;
}

/**
 * Declarations the shared patterns find in the given files. A file with any `export` line counts its exported
 * declarations only (what another file can reach); a file without one (Python, Go) counts every declaration.
 * `declarations` is the number of files declaring the name, so overloads in one file do not collide.
 */
export async function harvest(fs: FileSystem, root: string, files: readonly string[]): Promise<Declaration[]> {
  const found: Omit<Declaration, 'declarations'>[] = [];
  for (const file of files) {
    try {
      const absolute = path.join(root, file);
      if ((await fs.stat(absolute)).size > MAX_SNAPSHOT_FILE_BYTES) continue;
      found.push(...declarationsInText(file, await fs.readText(absolute)));
    } catch {
      continue;
    }
  }
  const filesPerName = new Map<string, Set<string>>();
  for (const declaration of found) filesPerName.set(declaration.name, (filesPerName.get(declaration.name) ?? new Set()).add(declaration.path));
  return found.map((declaration) => ({ ...declaration, declarations: filesPerName.get(declaration.name)!.size }));
}

/** Project-wide declarations of the names: the files containing each as a whole word, harvested. Used by `refs` and the review bundle. */
export async function declarationsOf(git: Git, fs: FileSystem, names: readonly string[], pathspec: string | null): Promise<Declaration[]> {
  const files = await git.grepWords(names, pathspec);
  return (await harvest(fs, git.options.repositoryRoot, files)).filter((declaration) => names.includes(declaration.name));
}
