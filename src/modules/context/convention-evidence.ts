import path from 'node:path';
import { buildModuleTree } from './context.ts';
import type { FolderRow } from './search-index.ts';

/**
 * Convention evidence for the init scout, counted from the search index rows and the module tree: deterministic, no model.
 * The scout used to open source files to see how names, layers and placement go; counts say it for $0 and let it open
 * only the representative files. A "group" is the module at the shallowest tree level that has two or more modules (a lone
 * `src/` is not a layer), bounded by the module cap the tree already applies; the import summary keeps at most MAX_GROUPS * 4 distinct groups.
 */
const MAX_GROUPS = 12;
/** A suffix borne by fewer files is a coincidence, not a convention: 3 is the least that shows a repeat beyond a pair. */
const MIN_SUFFIX_FILES = 3;
const MAX_SUFFIXES = 12;
const MAX_EDGES = 12;
const MAX_FOLDERS_PER_SUFFIX = 3;

type Style = 'kebab' | 'snake' | 'Pascal' | 'camel' | 'UPPER' | 'other';
const STYLES: readonly Style[] = ['kebab', 'snake', 'Pascal', 'camel', 'UPPER', 'other'];

/** The style of one identifier; a single lowercase word (`item`) is `kebab` and `snake` alike, so it counts as neither: null. */
export function styleOf(name: string): Style | null {
  if (/^[a-z][a-z0-9]*$/.test(name)) return null;
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name)) return 'kebab';
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) return 'snake';
  if (/^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)*$/.test(name)) return 'Pascal';
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(name)) return 'camel';
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name)) return 'UPPER';
  return 'other';
}

const tally = (styles: Iterable<Style | null>): Map<Style, number> => {
  const counts = new Map<Style, number>();
  for (const style of styles) if (style !== null) counts.set(style, (counts.get(style) ?? 0) + 1);
  return counts;
};
const renderTally = (counts: ReadonlyMap<Style, number>): string => STYLES.filter((style) => counts.has(style)).map((style) => `${style} ${counts.get(style)}`).join(', ') || 'none';

/** `a.service.ts` -> `service.ts`; `a.ts` and `a.test.ts`-like names with no middle part have no suffix. */
const suffixOf = (file: string): string | null => {
  const parts = path.posix.basename(file).split('.');
  return parts.length >= 3 ? parts.slice(1).join('.') : null;
};
const stemOf = (file: string): string => path.posix.basename(file).split('.')[0]!;

export function conventionEvidence(rows: readonly FolderRow[], files: readonly string[], options: { roots: readonly string[]; maxModules: number }): string {
  const tree = buildModuleTree(files, options);
  const byPath = new Map(tree.modules.map((module) => [module.path, module]));
  const levelOf = (modulePath: string): number => { const parent = byPath.get(modulePath)?.parent ?? null; return parent === null ? 1 : levelOf(parent) + 1; };
  const levels = [...new Set(tree.modules.map((module) => levelOf(module.path)))].sort((a, b) => a - b);
  const groupLevel = levels.find((level) => tree.modules.filter((module) => levelOf(module.path) === level).length >= 2) ?? levels[0] ?? 1;
  const groupOf = (modulePath: string): string => {
    let at = byPath.get(modulePath);
    while (at !== undefined && levelOf(at.path) > groupLevel) at = at.parent === null ? undefined : byPath.get(at.parent);
    return at?.path ?? modulePath;
  };
  const group = (row: FolderRow): string => (row.module === '' ? row.path : groupOf(row.module));

  const entries = rows.flatMap((row) => row.files.map((file) => ({ file: `${row.path}/${file}`, folder: row.path, group: group(row) })));
  const lines = [`source files ${entries.length} in ${rows.length} folders; groups are the ${groupLevel === 1 ? 'top' : `level ${groupLevel}`} modules`];

  lines.push(`file name styles (words of the name before its first dot): ${renderTally(tally(entries.map((entry) => styleOf(stemOf(entry.file)))))}`);
  const minority = (() => {
    const counts = tally(entries.map((entry) => styleOf(stemOf(entry.file))));
    const top = [...counts].sort(([, a], [, b]) => b - a)[0]?.[0];
    return top === undefined ? [] : entries.filter((entry) => { const style = styleOf(stemOf(entry.file)); return style !== null && style !== top; }).slice(0, 3).map((entry) => entry.file);
  })();
  if (minority.length > 0) lines.push(`  against the majority style, e.g. ${minority.join(', ')}`);

  const bySuffix = new Map<string, typeof entries>();
  for (const entry of entries) { const suffix = suffixOf(entry.file); if (suffix !== null) bySuffix.set(suffix, [...bySuffix.get(suffix) ?? [], entry]); }
  const suffixes = [...bySuffix].filter(([, list]) => list.length >= MIN_SUFFIX_FILES).sort(([a, x], [b, y]) => y.length - x.length || (a < b ? -1 : 1)).slice(0, MAX_SUFFIXES);
  lines.push('file suffixes (count/files in the folder; where they live):');
  for (const [suffix, list] of suffixes) {
    const perFolder = new Map<string, number>();
    for (const entry of list) perFolder.set(entry.folder, (perFolder.get(entry.folder) ?? 0) + 1);
    const where = [...perFolder].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1)).slice(0, MAX_FOLDERS_PER_SUFFIX).map(([folder, count]) => `${folder} ${count}/${rows.find((row) => row.path === folder)!.files.length}`);
    lines.push(`  *.${suffix} ${list.length}: ${where.join(', ')}${perFolder.size > MAX_FOLDERS_PER_SUFFIX ? `, +${perFolder.size - MAX_FOLDERS_PER_SUFFIX} folders` : ''}; e.g. ${list[0]!.file}`);
  }
  if (suffixes.length === 0) lines.push('  none repeated');

  const declared = tally(rows.flatMap((row) => row.names.map(styleOf)));
  lines.push(`declared names (the first ${rows.reduce((sum, row) => sum + row.names.length, 0)} the index keeps per folder): ${renderTally(declared)}`);

  const edges = new Map<string, number>();
  for (const row of rows) for (const target of row.uses) {
    const to = rows.find((other) => other.path === target);
    if (to === undefined) continue;
    const [a, b] = [group(row), group(to)];
    if (a !== b) edges.set(`${a}\u0000${b}`, (edges.get(`${a}\u0000${b}`) ?? 0) + 1);
  }
  lines.push('imports between groups (folder pairs, one per importing folder and imported folder; a folder keeps its 16 most used):');
  const pairs = [...new Set([...edges.keys()].map((key) => key.split('\u0000').sort().join('\u0000')))].sort();
  const shown = pairs.map((pair) => { const [a, b] = pair.split('\u0000') as [string, string]; return { a, b, ab: edges.get(`${a}\u0000${b}`) ?? 0, ba: edges.get(`${b}\u0000${a}`) ?? 0 }; })
    .sort((x, y) => y.ab + y.ba - (x.ab + x.ba) || (x.a < y.a ? -1 : 1)).slice(0, MAX_EDGES);
  for (const { a, b, ab, ba } of shown) lines.push(`  ${a} -> ${b} ${ab}, ${b} -> ${a} ${ba}`);
  if (shown.length === 0) lines.push('  none found');
  const importing = new Set([...edges.keys()].map((key) => key.split('\u0000')[0]!));
  const groups = [...new Set(rows.map(group))].slice(0, MAX_GROUPS * 4).sort();
  const leaves = groups.filter((name) => !importing.has(name));
  if (leaves.length > 0 && groups.length > 1) lines.push(`  import nothing of the other groups: ${leaves.join(', ')}`);
  return lines.join('\n');
}
