import path from 'node:path';
import { CONTEXT_DIR } from '#types/defaults';
import { AmbicodeError } from '#util/errors';
import { isSearchable, isTestPath } from '#util/path-classes';
import type { FileSystem } from '#types/platform/ports';

export interface ContextLimits { maxTotalTokens: number; maxFileTokens: number }
export interface ContextProblem { kind: string; message: string; file?: string }
export interface ContextFile { path: string; title: string; tokens: number }
export interface WriteOutcome { written: string[]; removed: string[]; check: { problems: ContextProblem[] } }

const ALLOWED = /^(overview|navigation|conventions|modules\/([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+)\.md$/;
/** A note mirrors a directory, so a segment may be anything a directory name is except a traversal. */
const isAllowedPath = (name: string): boolean => ALLOWED.test(name) && !name.split('/').some((segment) => segment === '.' || segment === '..');
const HEADER = /^=== (\S.*?)\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** chars / 4, rounded up: the same estimate the limits in config.context are written against. */
export const tokensOf = (text: string): number => Math.ceil(text.length / 4);

export function parseBundle(text: string): Map<string, string> {
  const files = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    const header = HEADER.exec(line);
    if (header !== null) {
      if (files.has(header[1]!)) throw new AmbicodeError('bad-argument', `duplicate path in bundle: ${header[1]}`, { field: 'bundle' });
      current = [];
      files.set(header[1]!, current);
    } else if (current !== null) current.push(line);
    else if (line.trim() !== '') throw new AmbicodeError('bad-argument', "bundle must start with a '=== <path>' line", { field: 'bundle' });
  }
  if (files.size === 0) throw new AmbicodeError('bad-argument', "empty bundle: no '=== <path>' sections", { field: 'bundle' });
  return new Map([...files].map(([name, lines]) => [name, `${lines.join('\n').trim()}\n`]));
}

const headings = (text: string, level: number): string[] =>
  text.split('\n').filter((line) => line.startsWith(`${'#'.repeat(level)} `)).map((line) => line.slice(level + 1).trim());

/** Problems in `files` as they would stand on disk; `existing` is what the bundle leaves in place. */
export function checkContext(files: ReadonlyMap<string, string>, limits: ContextLimits, existing: ReadonlyMap<string, string> = new Map()): ContextProblem[] {
  const problems: ContextProblem[] = [];
  const bad = (kind: string, message: string, file?: string): number => problems.push({ kind, message, ...(file === undefined ? {} : { file }) });
  const h1Owner = new Map<string, string>();
  let total = 0;
  for (const [name, text] of [...existing, ...files]) {
    total += tokensOf(text);
    if (!files.has(name)) { const h1 = headings(text, 1)[0]; if (h1 !== undefined) h1Owner.set(h1, name); }
  }
  for (const [name, text] of files) {
    if (!isAllowedPath(name)) { bad('path', 'only overview.md, navigation.md, conventions.md and modules/<directory path>.md (segments of letters, digits, . _ -) are accepted', name); continue; }
    const tokens = tokensOf(text);
    if (tokens > limits.maxFileTokens) bad('file-too-large', `~${tokens} tokens > maxFileTokens ${limits.maxFileTokens}`, name);
    if (text.split('\n').some((line) => FENCE.test(line))) bad('code-fence', 'code fences are not allowed; write a signature as one line in a bullet', name);
    const h1s = headings(text, 1);
    if (h1s.length !== 1) bad('h1', `needs exactly one H1 (the file's purpose), found ${h1s.length}`, name);
    else if (h1Owner.has(h1s[0]!)) bad('duplicate-h1', `H1 "${h1s[0]}" is also the H1 of ${h1Owner.get(h1s[0]!)}`, name);
    else h1Owner.set(h1s[0]!, name);
    const seen = new Set<string>();
    for (const h2 of headings(text, 2)) { if (seen.has(h2)) bad('duplicate-h2', `H2 "${h2}" appears twice`, name); seen.add(h2); }
  }
  if (total > limits.maxTotalTokens) bad('total-too-large', `~${total} tokens > maxTotalTokens ${limits.maxTotalTokens}`);
  return problems;
}

async function readAll(fs: FileSystem, dir: string, prefix = ''): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const entry of await fs.readdir(path.join(dir, prefix)).catch(() => [])) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) for (const [name, text] of await readAll(fs, dir, rel)) out.set(name, text);
    else if (entry.name.endsWith('.md')) out.set(rel, await fs.readText(path.join(dir, rel)));
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)));
}

export async function writeContext(fs: FileSystem, root: string, bundleText: string, limits: ContextLimits, replace: boolean): Promise<WriteOutcome> {
  const dir = path.join(root, CONTEXT_DIR);
  const bundle = parseBundle(bundleText);
  const onDisk = await readAll(fs, dir);
  const kept = new Map([...onDisk].filter(([name]) => !bundle.has(name) && !replace));
  const problems = checkContext(bundle, limits, kept);
  const written = [...bundle.keys()].sort();
  if (problems.length > 0) return { written: [], removed: [], check: { problems } };
  const removed = replace ? [...onDisk.keys()].filter((name) => !bundle.has(name)) : [];
  for (const name of removed) await fs.remove(path.join(dir, name));
  for (const [name, text] of bundle) {
    const target = path.join(dir, name);
    await fs.mkdirp(path.dirname(target));
    await fs.writeText(`${target}.tmp`, text);
    await fs.rename(`${target}.tmp`, target);
  }
  return { written, removed, check: { problems: [] } };
}

export async function listContext(fs: FileSystem, root: string): Promise<ContextFile[]> {
  return [...await readAll(fs, path.join(root, CONTEXT_DIR))].map(([name, text]) => ({ path: name, title: headings(text, 1)[0] ?? '', tokens: tokensOf(text) }));
}

/**
 * Deepest levels listed while at most this many lines result; notes below are counted on their ancestor, whose
 * Submodules section names them. 20 lines is ~1.6 KB: the flat listings of the repositories measured were 9-13 notes (0.4-0.6 KB).
 */
const LISTED_LINES = 20;

const stem = (file: ContextFile): string[] => file.path.replace(/\.md$/, '').split('/');
const isInside = (inner: string[], outer: string[]): boolean => inner.length > outer.length && outer.every((segment, i) => inner[i] === segment);

export function renderListing(files: readonly ContextFile[], limits: ContextLimits): string {
  if (files.length === 0) return 'no context: run /ambicode:init';
  const total = files.reduce((sum, file) => sum + file.tokens, 0);
  const ordered = files.map((file) => ({ file, parts: stem(file) })).sort((a, b) => {
    for (let i = 0; i < Math.min(a.parts.length, b.parts.length); i += 1) if (a.parts[i] !== b.parts[i]) return a.parts[i]! < b.parts[i]! ? -1 : 1;
    return a.parts.length - b.parts.length;
  });
  const entries = ordered.map((entry) => ({ ...entry, ancestors: ordered.filter((other) => isInside(entry.parts, other.parts)) }));
  const nested = entries.some((entry) => entry.ancestors.length > 0);
  const depth = Math.max(...entries.map((entry) => entry.ancestors.length)) + 1;
  let levels = 1;
  while (levels < depth && entries.filter((entry) => entry.ancestors.length <= levels).length <= LISTED_LINES) levels += 1;
  const below = new Map<string, number>();
  for (const entry of entries) {
    const anchor = entry.ancestors[levels - 1];
    if (anchor !== undefined) below.set(anchor.file.path, (below.get(anchor.file.path) ?? 0) + 1);
  }
  const lines = entries.filter((entry) => entry.ancestors.length < levels).map((entry) => {
    const more = below.get(entry.file.path);
    return `${nested ? '  '.repeat(entry.ancestors.length) : ''}${entry.file.path}  ${entry.file.title}  ~${entry.file.tokens} tokens${more === undefined ? '' : `  (+${more} notes below)`}`;
  });
  const hidden = below.size === 0 ? [] : ['notes below are named in the Submodules section of the note above them'];
  return [...lines, ...hidden, `total ~${total} of ${limits.maxTotalTokens} tokens`].join('\n');
}

/** Fewer source files than this and a directory is described by its parent's note. Raised automatically when the module cap is hit. */
export const MIN_MODULE_FILES = 3;
/** Tokens the three fixed notes (overview, navigation, conventions) may take of maxTotalTokens: measured 545 on ts-app-medium, 3000 leaves room for a larger repository. */
const FIXED_NOTES_TOKENS = 3000;
/** Tokens per module note: ts-app-medium averages 182; 400 allows a full Key files list (8 names) and a Submodules list. */
const NOTE_TOKENS = 400;

/** Machine-written files; no shared classifier exists, so only the names the tests exercise. */
const GENERATED_PATTERNS: readonly RegExp[] = [/\.min\.[a-z]+$/, /\.generated\.[a-z]+$/, /\.d\.ts$/, /\.pb\.go$/, /_pb2\.py$/, /\.g\.dart$/, /(^|\/)__generated__\//];

export const maxModulesFor = (limits: ContextLimits): number => Math.max(1, Math.floor((limits.maxTotalTokens - FIXED_NOTES_TOKENS) / NOTE_TOKENS));

export interface TreeModule {
  /** Directory relative to the repository root. */
  path: string;
  depth: number;
  parent: string | null;
  children: string[];
  /** Note path under .ambicode/context/ that mirrors the directory. */
  note: string;
  /** Source files in the module's whole subtree, folded directories included. */
  subtreeFiles: number;
}

export interface TreeResult {
  sourceFiles: number;
  minFiles: number;
  maxModules: number;
  /** The cap was still exceeded at the largest fold: only top-level modules remain. */
  overCap: boolean;
  deepestSourceDirectory: number;
  modules: TreeModule[];
}

/** The note path for a module directory; characters the context path rule refuses become `_`. */
export const noteOf = (directory: string): string => `modules/${directory.split('/').map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, '_')).join('/')}.md`;

interface Node { path: string; files: number; children: Map<string, Node>; count: number }

function build(files: readonly string[]): Node {
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
      owner = { path: node.path, depth: node.path.split('/').length, parent: parent?.path ?? null, children: [], note: noteOf(node.path), subtreeFiles: node.count };
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
  const files = allFiles.filter((file) => inRoots(file) && isSearchable(file) && !isTestPath(file) && !GENERATED_PATTERNS.some((pattern) => pattern.test(file))).sort();
  const root = build(files);
  let min = options.minFiles ?? MIN_MODULE_FILES;
  let modules = modulesAt(root, min);
  while (modules.length > options.maxModules && min <= files.length) modules = modulesAt(root, ++min);
  const deepest = files.reduce((depth, file) => Math.max(depth, file.split('/').length - 1), 0);
  return { sourceFiles: files.length, minFiles: min, maxModules: options.maxModules, overCap: modules.length > options.maxModules, deepestSourceDirectory: deepest, modules };
}

export function renderTree(result: TreeResult): string {
  const head = `source files ${result.sourceFiles}, modules ${result.modules.length} (cap ${result.maxModules}, directories under ${result.minFiles} files fold into the parent), deepest source directory ${result.deepestSourceDirectory}${result.overCap ? ', OVER CAP' : ''}`;
  const lines = result.modules.map((module) => `${module.note}  dir ${module.path}  depth ${module.depth}  files ${module.subtreeFiles}${module.children.length === 0 ? '' : `  submodules: ${module.children.map(noteOf).join(' ')}`}`);
  return [head, ...lines].join('\n');
}
