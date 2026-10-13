import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ProjectConfig } from '#types/modules/config';
import { listBuiltinPackFiles } from './builtin.ts';
import { PolicyPack } from '#types/modules/policy';
import { matchesAnyGlob } from '#util/glob';
import { pathExclusionReason } from '#util/path-classes';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import type { FileSystem } from '#types/platform/ports';

export interface PackChoice {
  reference: string;
  enabled: boolean;
  /** What decided it: the marker or glob that matched, or the missing command or marker. */
  reason: string;
}

/** A manifest sits at the project root or one package below it; deeper hits are vendored copies. */
const MARKER_DEPTH = 2;

/**
 * The built-in packs that belong to a project, decided from what the repository shows: a pack's own
 * `detect` marker (when it has one) and a file its `appliesTo` globs match. A command the project
 * does not declare is unavailable, like one declared null; it never keeps a pack out.
 */
export async function selectPacks(options: { fs: FileSystem; builtinDirectory: string; repositoryRoot: string; project: ProjectConfig; files: readonly string[] }): Promise<PackChoice[]> {
  const { fs, project } = options;
  const root = normalizeRelative(project.root);
  const files = options.files.filter((file) => pathExclusionReason(file) === null).flatMap((file) => toProjectRelative(root, file) ?? []);
  const choices: PackChoice[] = [];
  for (const file of await listBuiltinPackFiles(fs, options.builtinDirectory)) {
    const reference = `builtin/${file.id}`;
    const parsed = PolicyPack.safeParse(parseYaml(await fs.readText(file.filePath)));
    if (!parsed.success) { choices.push({ reference, enabled: false, reason: 'not a valid pack' }); continue; }
    const pack = parsed.data;
    let marker: string | null = null;
    for (const candidate of pack.detect ?? []) {
      for (const file of files.filter((entry) => path.posix.basename(entry) === candidate.file && entry.split('/').length <= MARKER_DEPTH + 1)) {
        const text = candidate.contains === undefined ? '' : await fs.readText(path.join(options.repositoryRoot, root, file)).catch(() => '');
        if (candidate.contains === undefined || text.includes(candidate.contains)) { marker = `${file}${candidate.contains === undefined ? '' : ` has ${candidate.contains}`}`; break; }
      }
      if (marker !== null) break;
    }
    if (pack.detect !== undefined && marker === null) { choices.push({ reference, enabled: false, reason: `no marker: ${pack.detect.map((entry) => entry.file + (entry.contains === undefined ? '' : ` with ${entry.contains}`)).join(' or ')}` }); continue; }
    const glob = pack.appliesTo.find((candidate) => files.some((file) => matchesAnyGlob(file, [candidate])));
    if (glob === undefined) { choices.push({ reference, enabled: false, reason: `no file matches ${pack.appliesTo.join(', ')}` }); continue; }
    choices.push({ reference, enabled: true, reason: marker === null ? `a file matches ${glob}` : `${marker}; a file matches ${glob}` });
  }
  return choices;
}
