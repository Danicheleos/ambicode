import path from 'node:path';
import { isMap, isScalar, isSeq, parse as parseYaml, parseDocument } from 'yaml';
import { CONFIG_FILE } from '#types/defaults';
import { PolicyPack } from '#types/modules/policy';
import { parseConfig } from '#modules/config/load';
import { listBuiltinPackFiles } from '#modules/policy/packs/builtin';
import { openRepository } from '#platform/git/open';
import { recordInit } from '#modules/evidence/init-entry';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import { AmbicodeError, messageOf } from '#util/errors';
import { mostSpecificRoot, normalizeRelative } from '#util/paths';
import type { FileSystem } from '#types/platform/ports';
import type { ProjectConfig } from '#types/modules/config';
import type { CliCommand } from '../../types/cli.ts';

const LIVE_DIR = '.ambicode/policies';


/** The directory entries of one repository-wide listing that belong to `project`: the deepest project root containing them decides, so a nested project's `dist/` is not also its parent's. */
function ignoredFor(listing: readonly string[], project: ProjectConfig, projects: readonly ProjectConfig[]): string[] {
  const mine = normalizeRelative(project.root);
  return listing
    .filter((entry) => entry.endsWith('/') && mostSpecificRoot(projects, entry) === project)
    .map((entry) => (mine === '' ? entry : entry.slice(mine.length + 1)))
    .filter((entry) => !entry.startsWith('.ambicode/'))
    .sort();
}

type CopyStatus = 'written' | 'kept';
interface PackCopy { pack: string; path: string; status: CopyStatus; note: string | null; listed: boolean }

/** The built-in's own text plus the `replaces` line, so its comments reach the user and the copy takes the built-in's place. */
function copyText(text: string, id: string): string {
  if ((text.match(/^id: /gm) ?? []).length !== 1) throw new Error(`built-in pack "${id}" must have exactly one top-level id line`);
  return text.replace(/^id: .*$/m, (line) => `${line}\nreplaces: builtin/${id}`);
}

/** A listed project pack that is this built-in's copy from an earlier layout: same id or `replaces` it. A second copy would fail as a duplicate id. */
async function listedCopy(fs: FileSystem, repositoryRoot: string, listed: readonly string[], id: string): Promise<string | undefined> {
  for (const file of listed) {
    try {
      const mine = parseYaml(await fs.readText(path.join(repositoryRoot, file))) as { id?: unknown; replaces?: unknown } | null;
      if (mine?.id === id || mine?.replaces === `builtin/${id}`) return file;
    } catch { /* a missing or broken listed file is `policy check`'s to report */ }
  }
  return undefined;
}

/** Writes the copy unless a file is already there (it may hold the user's edits) or a listed pack already stands for the built-in. */
async function copyBuiltin(fs: FileSystem, builtinDirectory: string, repositoryRoot: string, listed: readonly string[], sourcePath: string, id: string): Promise<CopyPackResult> {
  const source = await fs.readText(sourcePath);
  const builtin = PolicyPack.parse(parseYaml(source));
  const relative = `${LIVE_DIR}/${path.relative(builtinDirectory, sourcePath).split(path.sep).join('/')}`;
  const existing = await listedCopy(fs, repositoryRoot, listed, id);
  const where = existing ?? relative;
  const target = path.join(repositoryRoot, where);
  if (existing !== undefined || await fs.exists(target)) {
    const mine = PolicyPack.safeParse(parseYaml(await fs.readText(target)));
    const was = mine.success ? mine.data.source.externalVersion : undefined;
    const now = builtin.source.externalVersion;
    return { path: where, status: 'kept', note: was !== now ? `builtin/${id} is ${now ?? 'unversioned'}, your copy is ${was ?? 'unversioned'}` : null };
  }
  await fs.mkdirp(path.dirname(target));
  await fs.writeText(target, copyText(source, id));
  return { path: relative, status: 'written', note: null };
}
type CopyPackResult = Omit<PackCopy, 'pack' | 'listed'>;

/** Edits through the document API so the config's comments and other values stay. */
export const configPacksCommand: CliCommand = {
  name: 'config packs',
  summary: `Copy packs ${CONFIG_FILE} names into .ambicode/policies/, no overwrite; set git-ignored paths. --list: built-ins.`,
  options: { values: ['task'], flags: ['json', 'list'] },
  run: async (runtime, args) => {
    const { git, repositoryRoot } = await openRepository(runtime);
    const configPath = path.join(repositoryRoot, CONFIG_FILE);
    const raw = await runtime.fs.readText(configPath);
    const config = parseConfig(raw);
    const document = parseDocument(raw);
    const builtinDirectory = builtinPoliciesDirectory(runtime.pluginRoot);
    const builtins = await listBuiltinPackFiles(runtime.fs, builtinDirectory);
    if (args.flag('list')) {
      const packs = await Promise.all(builtins.map(async (file) => {
        const pack = PolicyPack.safeParse(parseYaml(await runtime.fs.readText(file.filePath))).data;
        return { pack: `builtin/${file.id}`, description: pack?.description ?? '' };
      }));
      return { text: packs.map((entry) => `${entry.pack} - ${entry.description}`).join('\n'), data: { packs } };
    }
    // One listing at the repository root: a project root that does not exist yet has no directory to run git in.
    const listing = await git.listIgnored().catch((error: unknown) => messageOf(error));
    const lines: string[] = [];
    const projects: { id: string; enabled: string[]; ignored: string[]; copies: PackCopy[]; skipped: { pack: string; reason: string }[] }[] = [];
    for (const project of config.projects) {
      const node = document.get('projects');
      const index = isSeq(node) ? node.items.findIndex((item) => isMap(item) && item.get('id') === project.id) : -1;
      const unlisted = typeof listing === 'string' ? `git could not list them: ${listing}` : !(await runtime.fs.exists(path.join(repositoryRoot, project.root))) ? `project root ${project.root} does not exist` : null;
      // A listing that failed or a root that is missing says nothing about what is ignored, so the entries already in the config stay.
      const ignored = typeof listing === 'string' || unlisted !== null ? [...project.ignored] : ignoredFor(listing, project, config.projects);
      if (index >= 0 && unlisted === null) document.setIn(['projects', index, 'ignored'], document.createNode(ignored));
      const copies: PackCopy[] = [];
      const skipped: { pack: string; reason: string }[] = [];
      for (const reference of project.packs) {
        const id = reference.slice('builtin/'.length);
        const source = builtins.find((file) => file.id === id);
        if (source === undefined) { skipped.push({ pack: reference, reason: 'not a built-in pack (see `config packs --list`)' }); continue; }
        const copy = await copyBuiltin(runtime.fs, builtinDirectory, repositoryRoot, project.policyFiles, source.filePath, id);
        const listed = index < 0 ? undefined : document.getIn(['projects', index, 'policyFiles']);
        const already = isSeq(listed) && listed.items.some((item) => isScalar(item) && item.value === copy.path);
        copies.push({ pack: reference, ...copy, listed: already || copy.status === 'written' });
        // A kept copy that is not listed was removed on purpose; listing it again would undo that.
        if (index < 0 || already || copy.status !== 'written') continue;
        if (isSeq(listed)) listed.add(copy.path);
        else document.setIn(['projects', index, 'policyFiles'], document.createNode([copy.path]));
      }
      const enabled = [...new Set([...project.packs, ...copies.filter((copy) => copy.listed).map((copy) => copy.pack)])].sort();
      projects.push({ id: project.id, enabled, ignored, copies, skipped });
      lines.push(`${project.id}: ${enabled.join(', ') || 'no packs'}`, `  ignored: ${ignored.join(', ') || 'none'}${unlisted === null ? '' : ` (${unlisted})`}`, ...copies.map((copy) => `  + ${copy.pack}: ${copy.path} ${copy.status === 'written' ? 'written' : copy.listed ? 'kept (edited or existing)' : 'kept, not listed in policyFiles'}${copy.note === null ? '' : `; ${copy.note}`}`), ...skipped.map((entry) => `  - ${entry.pack}: ${entry.reason}`));
    }
    await runtime.fs.writeText(configPath, document.toString({ lineWidth: 0 }));
    const copied = projects.flatMap((project) => project.copies).filter((copy) => copy.status === 'written').length;
    await recordInit(runtime, args.value('task'), 'config packs', `${copied} pack files written, ${projects.reduce((sum, project) => sum + project.skipped.length, 0)} skipped`);
    return { text: lines.join('\n'), data: { projects } };
  },
};
