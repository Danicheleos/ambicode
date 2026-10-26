import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONTEXT_DIR, MAX_EVIDENCE_BYTES, MAX_SNAPSHOT_FILE_BYTES, AMBICODE_DIR } from '#types/defaults';
import { isTestPath, pathExclusionReason } from '#util/path-classes';
import { declarationsInText } from '#modules/search/harvest';
import { MIN_TERM_LENGTH, stem, wordsOf } from '#modules/search/words';
import type { Git } from '#platform/git/git';
import type { Clock, FileSystem } from '#types/platform/ports';
import { baseNameOf, buildModuleTree, isModuleSource, referenceOwners } from './context.ts';

/** The machine layer of the search: one row per source folder, read by `map`'s retrieve layer and never sent to a model. */
export const SEARCH_INDEX_FILE = `${CONTEXT_DIR}/search/folders.jsonl`;
const VERSION = 1;
/** A rebuild at map time is worth its wait only below this; a slower repository keeps a stale index and says so. */
const REBUILD_UNDER_MS = 5000;
const MAX_NAMES = 24;
const MAX_LABELS = 24;
const MAX_EDGES = 16;
const CATALOG_SEGMENT = /^(?:i18n|locales?|lang|translations|messages)$/i;
const CATALOG_FILE = /\.(?:json|ya?ml)$/i;
/** The default-language catalog is named after it: `en.json`, `en-US.yaml`. */
const DEFAULT_LANGUAGE = /^en(?:[-_.][^/]*)?\.[^.]+$/i;
/** Markup carries labels and component uses but stays out of the candidates (isSearchable drops html). */
const MARKUP = /\.(?:html?|vue|svelte|jsx)$/i;
/** A quoted dotted word: how code and markup name a catalog key. */
const DOTTED_LITERAL = /(['"`])([A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+)+)\1/g;
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\1/g;
const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

interface SearchIndexMeta { kind: 'meta'; head: string | null; roots: string[]; folders: number; files: number; builtAt: string; buildMs: number; version: number }

export interface FolderRow {
  kind: 'folder';
  path: string;
  /** The deepest module directory of the context tree holding the folder; '' when none does. */
  module: string;
  depth: number;
  /** Path words, split and stemmed as the query's words are. */
  words: string[];
  files: string[];
  names: string[];
  labels: string[];
  keys: string[];
  uses: string[];
  usedBy: string[];
}

type Reader = (file: string, maxBytes: number) => Promise<string | null>;

const dirOf = (file: string): string => path.posix.dirname(file);
const topCounted = (counts: ReadonlyMap<string, number>, limit: number): string[] => [...counts].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)).slice(0, limit).map(([key]) => key);
const bump = (counts: Map<string, number>, key: string): void => void counts.set(key, (counts.get(key) ?? 0) + 1);

/** Dotted keys of a catalog object with their text; a key without a dot (`save`) is too common a literal to place a folder. */
function flatten(value: unknown, prefix: string, out: Map<string, string>): void {
  if (typeof value === 'string') { if (prefix.includes('.')) out.set(prefix, value.replace(/\s+/g, ' ').trim()); return; }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, inner] of Object.entries(value)) flatten(inner, prefix === '' ? key : `${prefix}.${key}`, out);
}

/** The default-language catalog of each catalog directory, merged: the file named `en*` (the shortest such name first), else the largest. */
async function catalogLabels(files: readonly string[], read: Reader): Promise<Map<string, string>> {
  const byDir = new Map<string, string[]>();
  for (const file of files) {
    if (!CATALOG_FILE.test(file) || pathExclusionReason(file) !== null || !dirOf(file).split('/').some((segment) => CATALOG_SEGMENT.test(segment))) continue;
    byDir.set(dirOf(file), [...byDir.get(dirOf(file)) ?? [], file]);
  }
  const labels = new Map<string, string>();
  for (const candidates of byDir.values()) {
    const texts = new Map<string, string>();
    for (const file of candidates) { const text = await read(file, MAX_EVIDENCE_BYTES); if (text !== null) texts.set(file, text); }
    const named = [...texts.keys()].filter((file) => DEFAULT_LANGUAGE.test(path.posix.basename(file))).sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    const chosen = named[0] ?? [...texts].sort(([a, x], [b, y]) => y.length - x.length || (a < b ? -1 : 1))[0]?.[0];
    if (chosen === undefined) continue;
    try {
      flatten(/\.json$/i.test(chosen) ? JSON.parse(texts.get(chosen)!) : parseYaml(texts.get(chosen)!), '', labels);
    } catch { /* not a catalog after all */ }
  }
  return labels;
}

/** The tracked file a relative import names, tried with the usual source suffixes; null when none is tracked. */
function resolveImport(from: string, specifier: string, tracked: ReadonlySet<string>): string | null {
  const base = path.posix.normalize(path.posix.join(dirOf(from), specifier));
  return RESOLVE_SUFFIXES.map((suffix) => `${base}${suffix}`).find((candidate) => tracked.has(candidate)) ?? null;
}

/**
 * The folder rows of the search index from the tracked files and a reader. Rows are the folders holding a module source
 * file (tests, stories, mocks and generated files are not); names come from the shared declaration patterns; a folder
 * gets a catalog key when its source or markup quotes it; `uses` counts relative imports that resolve to a tracked file
 * and mentions of a name of 8+ characters that one folder owns (referenceOwners: file names, base names, declarations),
 * a custom element tag counting for the base name it ends with.
 */
export async function buildSearchIndex(files: readonly string[], read: Reader, options: { roots: readonly string[]; maxModules: number }): Promise<{ rows: FolderRow[]; files: number }> {
  const roots = options.roots.map((root) => root.replace(/^\.\/?|\/+$/g, '')).filter((root) => root !== '');
  const inRoots = (file: string): boolean => roots.length === 0 || roots.some((root) => file.startsWith(`${root}/`));
  const rootOf = (folder: string): string => roots.find((root) => folder === root || folder.startsWith(`${root}/`)) ?? '';
  const tracked = new Set(files);
  // AMBICODE's own directory is tool state, never the repository's code, even where it is not gitignored.
  const sources = files.filter((file) => inRoots(file) && isModuleSource(file) && file.includes('/') && !file.startsWith(`${AMBICODE_DIR}/`));
  const sourceSet = new Set(sources);
  const own = new Map<string, string[]>();
  for (const file of sources) own.set(dirOf(file), [...own.get(dirOf(file)) ?? [], file]);
  const markup = files.filter((file) => MARKUP.test(file) && own.has(dirOf(file)) && !isTestPath(file) && pathExclusionReason(file) === null && !sourceSet.has(file));
  const modules = buildModuleTree(files, { roots, maxModules: options.maxModules }).modules.map((module) => module.path).sort((a, b) => b.length - a.length);
  const texts = new Map<string, string>();
  for (const file of [...sources, ...markup]) { const text = await read(file, MAX_SNAPSHOT_FILE_BYTES); if (text !== null) texts.set(file, text); }

  const names = new Map<string, string[]>();
  for (const [folder, list] of own) {
    const found: string[] = [];
    for (const file of list) for (const declaration of declarationsInText(file, texts.get(file) ?? '')) if (!found.includes(declaration.name)) found.push(declaration.name);
    names.set(folder, found);
  }
  // Base names and declared names go through referenceOwners as extension-less entries, so one rule (8+ characters, one owner) decides every name.
  const owners = referenceOwners(new Map([...own].map(([folder, list]) => [folder, [...list, ...list.map(baseNameOf), ...names.get(folder)!]])));
  const catalog = await catalogLabels(files, read);
  const keyCounts = new Map<string, Map<string, number>>();
  const uses = new Map<string, Map<string, number>>();
  for (const file of [...sources, ...markup]) {
    const text = texts.get(file);
    if (text === undefined) continue;
    const folder = dirOf(file);
    const keys = keyCounts.get(folder) ?? keyCounts.set(folder, new Map()).get(folder)!;
    if (catalog.size > 0) for (const match of text.matchAll(DOTTED_LITERAL)) if (catalog.has(match[2]!)) bump(keys, match[2]!);
    const edges = uses.get(folder) ?? uses.set(folder, new Map()).get(folder)!;
    const use = (target: string | undefined): void => { if (target !== undefined && target !== folder && own.has(target)) bump(edges, target); };
    for (const match of text.matchAll(RELATIVE_IMPORT)) { const target = resolveImport(file, match[2]!, tracked); use(target === null ? undefined : dirOf(target)); }
    for (const match of text.matchAll(/[A-Za-z0-9_.-]{8,}/g)) {
      const token = match[0];
      const owner = owners.get(token) ?? token.split('.').map((part) => owners.get(part)).find((found) => found !== undefined)
        ?? [...token.matchAll(/-/g)].map((dash) => owners.get(token.slice(dash.index + 1))).find((found) => found !== undefined);
      use(owner?.module);
    }
  }
  const usedBy = new Map<string, Map<string, number>>();
  for (const [folder, edges] of uses) for (const [target, count] of edges) { const back = usedBy.get(target) ?? usedBy.set(target, new Map()).get(target)!; back.set(folder, count); }

  const rows = [...own.keys()].sort().map((folder): FolderRow => {
    const segments = folder.slice(rootOf(folder).length).split('/').filter((segment) => segment !== '');
    const keys = topCounted(keyCounts.get(folder) ?? new Map(), MAX_LABELS);
    return {
      kind: 'folder', path: folder, module: modules.find((module) => folder === module || folder.startsWith(`${module}/`)) ?? '', depth: folder.split('/').length,
      words: [...new Set(segments.flatMap(wordsOf).map(stem).filter((word) => word.length >= MIN_TERM_LENGTH))],
      files: own.get(folder)!.map((file) => path.posix.basename(file)).sort(),
      names: names.get(folder)!.slice(0, MAX_NAMES),
      labels: [...new Set(keys.map((key) => catalog.get(key)!).filter((label) => label !== ''))],
      keys,
      uses: topCounted(uses.get(folder) ?? new Map(), MAX_EDGES),
      usedBy: topCounted(usedBy.get(folder) ?? new Map(), MAX_EDGES),
    };
  });
  return { rows, files: sources.length };
}

/** A reader over the repository that skips what it cannot read or what exceeds the cap. */
const repositoryReader = (fs: FileSystem, root: string): Reader => async (file, maxBytes) => {
  try {
    const absolute = path.join(root, file);
    if ((await fs.stat(absolute)).size > maxBytes) return null;
    return await fs.readText(absolute);
  } catch {
    return null;
  }
};

interface IndexDeps { fs: FileSystem; clock: Clock; git: Git; root: string }

/** Builds the index from `git ls-files` and writes it atomically; the meta row records the HEAD it describes and how long it took. */
export async function writeSearchIndex(deps: IndexDeps, options: { roots: readonly string[]; maxModules: number }): Promise<SearchIndexMeta> {
  const started = deps.clock.elapsed();
  const files = await deps.git.listFiles(null);
  const head = await deps.git.revParse('HEAD');
  const { rows, files: indexed } = await buildSearchIndex(files, repositoryReader(deps.fs, deps.root), options);
  const meta: SearchIndexMeta = { kind: 'meta', head, roots: [...options.roots], folders: rows.length, files: indexed, builtAt: deps.clock.now().toISOString(), buildMs: Math.max(0, Math.round(deps.clock.elapsed() - started)), version: VERSION };
  const target = path.join(deps.root, SEARCH_INDEX_FILE);
  await deps.fs.mkdirp(path.dirname(target));
  await deps.fs.writeText(`${target}.tmp`, `${[meta, ...rows].map((row) => JSON.stringify(row)).join('\n')}\n`);
  await deps.fs.rename(`${target}.tmp`, target);
  return meta;
}

async function readSearchIndex(fs: FileSystem, root: string): Promise<{ meta: SearchIndexMeta; rows: FolderRow[] } | null> {
  let text: string;
  try {
    text = await fs.readText(path.join(root, SEARCH_INDEX_FILE));
  } catch {
    return null;
  }
  const [meta, ...rows] = text.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as SearchIndexMeta | FolderRow);
  return meta?.kind === 'meta' && meta.version === VERSION ? { meta, rows: rows.filter((row): row is FolderRow => row.kind === 'folder') } : null;
}

/**
 * The index `map` should use, kept fresh: absent is built when the repository has an AMBICODE directory; built at another
 * HEAD is rebuilt when the last build took under REBUILD_UNDER_MS, else used with a limitation naming both shas.
 */
export async function searchIndexFor(deps: IndexDeps, options: { roots: readonly string[]; maxModules: number }): Promise<{ rows: FolderRow[] | null; limitation: string | null }> {
  const stored = await readSearchIndex(deps.fs, deps.root);
  if (stored === null) {
    if (!(await deps.fs.exists(path.join(deps.root, AMBICODE_DIR)))) return { rows: null, limitation: 'search index absent: run context index' };
    const meta = await writeSearchIndex(deps, options);
    return { rows: (await readSearchIndex(deps.fs, deps.root))?.rows ?? null, limitation: `search index built now, ${meta.buildMs} ms` };
  }
  const head = await deps.git.revParse('HEAD');
  if (stored.meta.head === head) return { rows: stored.rows, limitation: null };
  if (stored.meta.buildMs < REBUILD_UNDER_MS) {
    await writeSearchIndex(deps, { ...options, roots: stored.meta.roots });
    return { rows: (await readSearchIndex(deps.fs, deps.root))?.rows ?? null, limitation: null };
  }
  return { rows: stored.rows, limitation: `search index built at ${stored.meta.head ?? 'no commit'}, HEAD is ${head ?? 'no commit'}` };
}
