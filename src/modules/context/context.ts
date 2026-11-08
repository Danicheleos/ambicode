import path from 'node:path';
import { AmbicodeError } from '#util/errors';
import { isSearchable, isTestPath } from '#util/path-classes';
import { harvest } from '#modules/search/harvest';
import type { FileSystem } from '#types/platform/ports';

const MAX_NAMES_PER_FILE = 8;

/**
 * A file name (last extension dropped) names a module in another module's text only when it is this long and borne by one module.
 * Measured on a 115-module repository against its real import statements (module level): the first segment of the name
 * ("report" of report.service.ts) gave precision 0.13 to 0.23 because common words matched; the full name with length 5 gave
 * 0.78, 8 gave 0.91 (recall 0.90), 12 gave 0.99 (recall 0.83); uniqueness (2 to 100 owners allowed) changed nothing there.
 */
const MIN_REFERENCE_NAME = 8;
/** The real imports average 8.4 modules per module; a cap of 8 kept recall 0.63 at precision 0.95, 6 gave 0.51 and 4 gave 0.37. */
const MAX_DEPENDS = 8;
/** A bullet names the referenced files of one module: the two most mentioned keep it one line, since a bullet per file would multiply the lines the cap of 8 already bounds. */
const MAX_DEPENDS_FILES = 2;

/** Name (file name without its last extension) to the one module whose own files carry it and the file; names under MIN_REFERENCE_NAME or borne by two modules are left out. */
export function referenceOwners(own: ReadonlyMap<string, readonly string[]>): Map<string, { module: string; file: string }> {
  const owners = new Map<string, { module: string; file: string } | null>();
  for (const [module, files] of own) {
    for (const file of files) {
      const name = file.slice(file.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
      if (name.length < MIN_REFERENCE_NAME) continue;
      const seen = owners.get(name);
      owners.set(name, seen === undefined || seen?.module === module ? seen ?? { module, file } : null);
    }
  }
  return new Map([...owners].filter((entry): entry is [string, { module: string; file: string }] => entry[1] !== null));
}

/** Fewer source files than this and a directory is folded into its parent module. Raised automatically when the module cap is hit. */
const MIN_MODULE_FILES = 3;
/** Tokens of maxTotalTokens held back before the module cap: it once sized the three fixed notes, and moving it would change the cap (142 modules at the default 60000) every map and bench was measured with. */
const RESERVED_TOKENS = 3000;
/** Tokens of maxTotalTokens allowed per module in the cap: ts-app-medium averaged 182 per module entry; 400 was the allowance kept. */
const TOKENS_PER_MODULE = 400;

/** Machine-written files and stories/mocks, which companion a component without being it (tests, styles and templates are already out through isTestPath and isSearchable); no shared classifier exists, so only the names the tests exercise. A mock, fixture or stub folder is a companion too: 61 of the Key files of a 137-note context sat in mocks/ folders. */
const GENERATED_PATTERNS: readonly RegExp[] = [/\.(stories|story|mocks?)\.[^/]+$/, /\.min\.[a-z]+$/, /\.generated\.[a-z]+$/, /\.config\.[^/]+$/, /\.d\.ts$/, /\.pb\.go$/, /_pb2\.py$/, /\.g\.dart$/, /(^|\/)__generated__\//, /(^|\/)(mocks?|__mocks__|fixtures?|__fixtures__|stubs?)\//];

export const isModuleSource = (file: string): boolean => isSearchable(file) && !isTestPath(file) && !GENERATED_PATTERNS.some((pattern) => pattern.test(file));

export const maxModulesFor = (limits: { maxTotalTokens: number }): number => Math.max(1, Math.floor((limits.maxTotalTokens - RESERVED_TOKENS) / TOKENS_PER_MODULE));

interface TreeModule {
  /** Directory relative to the repository root. */
  path: string;
  depth: number;
  parent: string | null;
  children: string[];
  /** Source files in the module's whole subtree, folded directories included. */
  subtreeFiles: number;
}

interface TreeResult {
  sourceFiles: number;
  minFiles: number;
  maxModules: number;
  /** The cap was still exceeded at the largest fold: only top-level modules remain. */
  overCap: boolean;
  deepestSourceDirectory: number;
  modules: TreeModule[];
}


interface Node { path: string; files: number; children: Map<string, Node>; count: number }

function buildDirectoryTree(files: readonly string[]): Node {
  const root: Node = { path: '', files: 0, children: new Map(), count: 0 };
  for (const file of files) {
    let node = root;
    node.count += 1;
    for (const part of file.split('/').slice(0, -1)) {
      let next = node.children.get(part);
      if (next === undefined) { next = { path: node.path === '' ? part : `${node.path}/${part}`, files: 0, children: new Map(), count: 0 }; node.children.set(part, next); }
      node = next;
      node.count += 1;
    }
    node.files += 1;
  }
  return root;
}

function modulesAt(root: Node, min: number): TreeModule[] {
  const out: TreeModule[] = [];
  // A directory is a module when it holds files itself or branches into two directories that do; a chain with neither
  // is skipped, so the deepest directory of the chain carries the note. The repository root is never a module.
  const visit = (node: Node, parent: TreeModule | null): void => {
    const branches = [...node.children.values()].filter((child) => child.count > 0).length;
    const isModule = node.path !== '' && (node.files > 0 || branches >= 2) && (parent === null || node.count >= min);
    let owner = parent;
    if (isModule) {
      owner = { path: node.path, depth: node.path.split('/').length, parent: parent?.path ?? null, children: [], subtreeFiles: node.count };
      parent?.children.push(node.path);
      out.push(owner);
    }
    for (const child of [...node.children.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) visit(child, owner);
  };
  visit(root, null);
  return out;
}

/**
 * Modules of the source files under `roots` ('' or '.' = whole repository), full depth. Directories under `min` files
 * fold into the nearest module above; `min` rises until at most `maxModules` remain.
 */
export function buildModuleTree(allFiles: readonly string[], options: { roots: readonly string[]; maxModules: number; minFiles?: number }): TreeResult {
  const roots = options.roots.map((root) => root.replace(/^\.\/?|\/+$/g, '')).filter((root, i, all) => all.indexOf(root) === i);
  const inRoots = (file: string): boolean => roots.length === 0 || roots.some((root) => root === '' || file.startsWith(`${root}/`));
  const files = allFiles.filter((file) => inRoots(file) && isModuleSource(file)).sort();
  const root = buildDirectoryTree(files);
  let min = options.minFiles ?? MIN_MODULE_FILES;
  let modules = modulesAt(root, min);
  while (modules.length > options.maxModules && min <= files.length) modules = modulesAt(root, ++min);
  const deepest = files.reduce((depth, file) => Math.max(depth, file.split('/').length - 1), 0);
  return { sourceFiles: files.length, minFiles: min, maxModules: options.maxModules, overCap: modules.length > options.maxModules, deepestSourceDirectory: deepest, modules };
}

export function renderTree(result: TreeResult): string {
  const head = `source files ${result.sourceFiles}, modules ${result.modules.length} (cap ${result.maxModules}, directories under ${result.minFiles} files fold into the parent), deepest source directory ${result.deepestSourceDirectory}${result.overCap ? ', OVER CAP' : ''}`;
  const lines = result.modules.map((module) => `dir ${module.path}  depth ${module.depth}  files ${module.subtreeFiles}${module.children.length === 0 ? '' : `  submodules: ${module.children.join(' ')}`}`);
  return [head, ...lines].join('\n');
}

/** The file name with every suffix after its first dot stripped (`a.b.c.ts` -> `a`, `.eslintrc.js` -> `.eslintrc`). */
export const baseNameOf = (file: string): string => /^\.?[^.]*/.exec(file.slice(file.lastIndexOf('/') + 1))![0];

interface LevelFile { base: string; names: string[] }
interface LevelFolder { module: TreeModule; level: number; files: LevelFile[] }

/** The module's files grouped by path inside the module plus base name, each with the entity names its files declare. */
function groupByBase(modulePath: string, files: readonly string[], names: ReadonlyMap<string, string[]>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const inside = file.slice(modulePath.length + 1);
    const key = `${inside.slice(0, inside.lastIndexOf('/') + 1)}${baseNameOf(inside)}`;
    const list = groups.get(key) ?? [];
    for (const name of names.get(file) ?? []) if (!list.includes(name)) list.push(name);
    groups.set(key, list);
  }
  return groups;
}

/** Module source files by the deepest module directory that contains them. */
function ownedFiles(moduleDirs: ReadonlySet<string>, sourceFiles: readonly string[]): Map<string, string[]> {
  const owned = new Map<string, string[]>();
  for (const file of sourceFiles.filter(isModuleSource)) {
    const parts = file.split('/').slice(0, -1);
    for (let depth = parts.length; depth > 0; depth -= 1) {
      const dir = parts.slice(0, depth).join('/');
      if (moduleDirs.has(dir)) { owned.set(dir, [...owned.get(dir) ?? [], file]); break; }
    }
  }
  return owned;
}

/**
 * Every module of the tree with its level, the base names of the files it owns and the entities they declare. A file in a folded
 * directory below the module is keyed with its path inside the module, so a base name is unique per folder. Companions are out
 * through isModuleSource.
 */
export async function allFolders(fs: FileSystem, root: string, result: TreeResult, sourceFiles: readonly string[]): Promise<LevelFolder[]> {
  const byPath = new Map(result.modules.map((module) => [module.path, module]));
  const levelOf = (module: TreeModule): number => (module.parent === null ? 1 : levelOf(byPath.get(module.parent)!) + 1);
  const owned = ownedFiles(new Set(result.modules.map((module) => module.path)), sourceFiles);
  const names = new Map<string, string[]>();
  for (const declaration of await harvest(fs, root, [...owned.values()].flat())) {
    const list = names.get(declaration.path) ?? [];
    if (!list.includes(declaration.name)) list.push(declaration.name);
    names.set(declaration.path, list);
  }
  return result.modules.map((module) => {
    const groups = groupByBase(module.path, owned.get(module.path) ?? [], names);
    return { module, level: levelOf(module), files: [...groups].sort(([a], [b]) => (a < b ? -1 : 1)).map(([base, list]) => ({ base, names: list })) };
  });
}

const folderHead = (module: TreeModule, level: number): string => `${'  '.repeat(level - 1)}- ${module.path}`;

const folderLines = ({ module, level, files }: LevelFolder): string[] => [
  folderHead(module, level),
  ...files.map(({ base, names }) => `${'  '.repeat(level)}- ${base}${names.length === 0 ? '' : `: ${names.slice(0, MAX_NAMES_PER_FILE).join(', ')}${names.length > MAX_NAMES_PER_FILE ? `, +${names.length - MAX_NAMES_PER_FILE}` : ''}`}`),
];

/** One bullet per folder (indented by level) and one per base name below it. */
export function renderLevel(folders: readonly LevelFolder[], level: number): string {
  const lines = folders.flatMap(folderLines);
  return [`level ${level}: ${folders.length} folders, ${folders.reduce((sum, folder) => sum + folder.files.length, 0)} base names`, ...lines].join('\n');
}

/** Roots as the tree matches them: relative to the repository. A model may pass an absolute path; one outside the repository is an error. */
export function repoRelativeRoots(repositoryRoot: string, roots: readonly string[]): string[] {
  return roots.map((given) => {
    const relative = path.relative(repositoryRoot, path.resolve(repositoryRoot, given));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new AmbicodeError('bad-argument', `--root ${given} is outside the repository`, { field: 'root' });
    return relative.split(path.sep).join('/');
  });
}

const PROSE_FILE = /\.(md|mdx|markdown|rst|adoc|asciidoc|org|txt)$/i;
/** 15 lines is ~1 KB of tree output; past that the list stops telling the scout which doc is worth a read. Shallowest, then largest, are kept. */
const MAX_PROSE_FILES = 15;

interface ProseFile { path: string; bytes: number }

/** Documentation by type, wherever it sits: tracked markup and plain-text files that are not tests or generated, with their sizes. */
export async function proseFiles(fs: FileSystem, root: string, files: readonly string[]): Promise<ProseFile[]> {
  const found: ProseFile[] = [];
  for (const file of files.filter((candidate) => PROSE_FILE.test(candidate) && !isTestPath(candidate) && !GENERATED_PATTERNS.some((pattern) => pattern.test(candidate)))) {
    const stats = await fs.stat(path.join(root, file)).catch(() => null);
    if (stats !== null && stats.isFile()) found.push({ path: file, bytes: stats.size });
  }
  const depth = (file: ProseFile): number => file.path.split('/').length;
  return found.sort((a, b) => depth(a) - depth(b) || b.bytes - a.bytes || (a.path < b.path ? -1 : 1)).slice(0, MAX_PROSE_FILES);
}

/** The module list, the guidance docs as a plain fact, then every level with its file lines: all a scout needs from one call. */
export function renderFullTree(result: TreeResult, folders: readonly LevelFolder[], docs: readonly ProseFile[]): string {
  const levels = [...new Set(folders.map((folder) => folder.level))].sort((a, b) => a - b);
  return [renderTree(result), ...(docs.length === 0 ? [] : [`documentation files (path, bytes): ${docs.map((doc) => `${doc.path} ${doc.bytes}`).join(', ')}`]), ...levels.map((level) => renderLevel(folders.filter((folder) => folder.level === level), level))].join('\n');
}
