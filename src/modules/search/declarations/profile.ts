import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { openRepository } from '#composition/root';
import { MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import { DECLARATION_PATTERNS } from '#types/modules/ecosystems';
import type { ProjectConfig, SearchProfile } from '#types/modules/config';
import { literalPathspec } from '#platform/git/git';
import { isTestPath, pathExclusionReason } from '#modules/review/snapshot/exclusions';
import { normalizeRelative } from '#util/paths';
import { GENERIC_PROFILE } from '#types/modules/search';
import type { Runtime } from '#types/composition';

/** One glob for the source extensions; a single extension takes no braces, which would not expand. */
export const sourceGlob = (sources: readonly string[]): string => (sources.length === 1 ? `**/*.${sources[0]!}` : `**/*.{${sources.join(',')}}`);

export const profileOf = (project: ProjectConfig): Omit<SearchProfile, 'stamp'> => project.profile ?? GENERIC_PROFILE;

const SOURCE_MIN_FILES = 5;
const SOURCE_SAMPLE = 50;
const SOURCE_SHARE = 0.3;
const COMPANION_MIN = 20;
const COMPANION_SHARE = 0.5;
const CATALOG_EXTENSIONS = ['json', 'yaml', 'yml', 'po', 'properties', 'arb', 'xlf', 'ftl'];
const CATALOG_MIN_VALUES = 20;
const CATALOG_SHARE = 0.6;
const KIND_MIN_FILES = 10;
const KIND_MIN_FOLDERS = 3;
const KIND_SHARE = 0.3;
const HISTORY = 500;
const EXPORT_SHARE = 0.4;
const EXPORT_LINE = /^export\b/;
const TOP_LEVEL = /^\S/;
const CATALOG_MAX_BYTES = 4 * 1024 * 1024;
const HISTORY_MIN = 50;
/** Data-only name parts, used when the history is too short to measure feature kinds. */
const FALLBACK_KINDS = ['constant', 'constants', 'fixture', 'fixtures', 'mock', 'mocks', 'stub', 'stubs', 'type', 'types'];

const extensionOf = (file: string): string => {
  const name = path.posix.basename(file);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
};
/** `x.component.html` → `x.component`: the name a companion shares. */
const baseOf = (file: string): string => {
  const name = path.posix.basename(file);
  const dot = name.lastIndexOf('.');
  return path.posix.join(path.posix.dirname(file), dot <= 0 ? name : name.slice(0, dot));
};
/** `x.mocks.ts` → `mocks`; `x.ts` → ''. */
const kindOfName = (file: string): string => path.posix.basename(file).split('.').slice(1, -1).join('.');
const stemOfName = (file: string): string => path.posix.basename(file).split('.')[0]!;

/** A catalog file as a key → value tree; null when the format is not one this reads. */
export function readCatalog(text: string, extension: string): unknown {
  if (extension === 'json' || extension === 'arb') return JSON.parse(text) as unknown;
  if (extension === 'yaml' || extension === 'yml') return parseYaml(text) as unknown;
  const out: Record<string, string> = {};
  if (extension === 'po') {
    let id: string | null = null;
    for (const line of text.split(/\r?\n/)) {
      const id_ = /^msgid "(.*)"$/.exec(line);
      const str = /^msgstr "(.*)"$/.exec(line);
      if (id_ !== null) id = id_[1]!;
      else if (str !== null && id !== null && id !== '') out[id] = str[1]!;
    }
    return out;
  }
  if (extension === 'xlf') {
    for (const match of text.matchAll(/<trans-unit[^>]*\bid="([^"]+)"[\s\S]*?<source>([\s\S]*?)<\/source>/g)) out[match[1]!] = match[2]!;
    return out;
  }
  if (extension === 'properties' || extension === 'ftl') {
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([\w.-]+)\s*[=:]\s*(.+)$/.exec(line);
      if (match !== null) out[match[1]!] = match[2]!;
    }
    return out;
  }
  return null;
}

function leaves(value: unknown, key: string, out: { keys: string[]; values: string[] }): void {
  if (typeof value === 'string') {
    out.keys.push(key);
    out.values.push(value);
  } else if (typeof value === 'object' && value !== null) {
    for (const [child, inner] of Object.entries(value)) leaves(inner, child, out);
  }
}

const sample = <T>(items: readonly T[], size: number): T[] => {
  if (items.length <= size) return [...items];
  const step = items.length / size;
  return Array.from({ length: size }, (_, index) => items[Math.floor(index * step)]!);
};

/** Measures the search facts of one project from its tracked files, their contents and recent history (03c-P1…P7). */
export async function buildProfile(runtime: Runtime, project: Pick<ProjectConfig, 'root'>): Promise<SearchProfile> {
  const { git, repositoryRoot } = await openRepository(runtime);
  const root = normalizeRelative(project.root);
  const files = (await git.listFiles(root === '' ? null : literalPathspec(root))).filter((file) => pathExclusionReason(file) === null).sort();
  const read = async (file: string, limit = MAX_SNAPSHOT_FILE_BYTES): Promise<string | null> => {
    try {
      const absolute = path.join(repositoryRoot, file);
      if ((await runtime.fs.stat(absolute)).size > limit) return null;
      return await runtime.fs.readText(absolute);
    } catch {
      return null;
    }
  };
  const byExtension = new Map<string, string[]>();
  for (const file of files) byExtension.set(extensionOf(file), [...(byExtension.get(extensionOf(file)) ?? []), file]);

  const sources: { extension: string; count: number }[] = [];
  let declarationLines = 0;
  let exportLines = 0;
  for (const [extension, group] of byExtension) {
    if (extension === '' || CATALOG_EXTENSIONS.includes(extension) || group.length < SOURCE_MIN_FILES) continue;
    let declaring = 0;
    let declared = 0;
    let exported = 0;
    for (const file of sample(group, SOURCE_SAMPLE)) {
      const lines = (await read(file))?.split(/\r?\n/).filter((line) => DECLARATION_PATTERNS.some((pattern) => pattern.test(line))) ?? [];
      if (lines.length > 0) declaring += 1;
      declared += lines.length;
      const top = lines.filter((line) => TOP_LEVEL.test(line));
      declared -= lines.length - top.length;
      exported += top.filter((line) => EXPORT_LINE.test(line)).length;
    }
    if (declaring / Math.min(group.length, SOURCE_SAMPLE) < SOURCE_SHARE) continue;
    sources.push({ extension, count: group.length });
    declarationLines += declared;
    exportLines += exported;
  }
  sources.sort((a, b) => b.count - a.count || a.extension.localeCompare(b.extension));
  const sourceSet = new Set(sources.map((source) => source.extension));

  const siblings = new Map<string, Set<string>>();
  for (const file of files) siblings.set(baseOf(file), (siblings.get(baseOf(file)) ?? new Set()).add(extensionOf(file)));
  const companions: [string, string][] = [];
  for (const [from, group] of byExtension) {
    if (from === '' || sourceSet.has(from)) continue;
    for (const to of sourceSet) {
      const paired = group.filter((file) => siblings.get(baseOf(file))?.has(to) === true).length;
      if (paired >= COMPANION_MIN && paired / group.length >= COMPANION_SHARE) companions.push([from, to]);
    }
  }

  const catalogFiles: string[] = [];
  for (const extension of CATALOG_EXTENSIONS) {
    for (const file of byExtension.get(extension) ?? []) {
      const text = await read(file, CATALOG_MAX_BYTES);
      if (text === null) continue;
      const found = { keys: [] as string[], values: [] as string[] };
      try {
        leaves(readCatalog(text, extension), '', found);
      } catch {
        continue;
      }
      if (found.values.length >= CATALOG_MIN_VALUES && found.values.filter((value) => /\s/.test(value.trim())).length / found.values.length >= CATALOG_SHARE && !found.keys.some((key) => /\s/.test(key))) catalogFiles.push(file);
    }
  }
  // A qualifying catalog speaks for its folder: translations into unspaced scripts fail the space test themselves.
  const catalogs = catalogFiles.map((file) => {
    const glob = `${path.posix.dirname(file)}/*.${extensionOf(file)}`;
    return (byExtension.get(extensionOf(file)) ?? []).filter((other) => path.posix.dirname(other) === path.posix.dirname(file)).length > 1 ? glob : file;
  });

  const kinds = new Map<string, string[]>();
  for (const file of files) {
    const kind = kindOfName(file);
    if (kind !== '' && !isTestPath(file)) kinds.set(kind, [...(kinds.get(kind) ?? []), file]);
  }
  const candidates = [...kinds].filter(([, group]) => group.length >= KIND_MIN_FILES && new Set(group.map((file) => path.posix.dirname(file))).size >= KIND_MIN_FOLDERS).map(([kind]) => kind);
  const featureKinds: string[] = [];
  const commits = await git.commitsTouching([root === '' ? '.' : root], HISTORY);
  if (commits.length < HISTORY_MIN) featureKinds.push(...FALLBACK_KINDS.filter((kind) => kinds.has(kind)));
  else if (candidates.length > 0) {
    const lists = await git.commitFileLists(commits);
    for (const kind of candidates) {
      let seen = 0;
      let together = 0;
      for (const { paths } of lists) {
        for (const file of paths.filter((entry) => kindOfName(entry) === kind && !isTestPath(entry))) {
          seen += 1;
          if (paths.some((other) => other !== file && path.posix.dirname(other) === path.posix.dirname(file) && stemOfName(other) === stemOfName(file) && kindOfName(other) !== kind && !isTestPath(other))) together += 1;
        }
      }
      if (seen > 0 && together / seen >= KIND_SHARE) featureKinds.push(kind);
    }
  }

  return {
    stamp: { commit: (await git.revParse('HEAD')) ?? '', files: files.length },
    sources: sources.map((source) => source.extension),
    companions,
    catalogs: [...new Set(catalogs)].sort(),
    featureKinds: featureKinds.sort(),
    exportOnly: declarationLines > 0 && exportLines / declarationLines >= EXPORT_SHARE,
  };
}
