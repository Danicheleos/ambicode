import path from 'node:path';
import { isMap, isScalar, isSeq, parse as parseYaml, parseDocument } from 'yaml';
import { CONFIG_FILE } from '#types/defaults';
import { PolicyPack } from '#types/modules/policy';
import { parseConfig } from '#modules/config/load';
import { listBuiltinPackFiles } from '#modules/policy/packs/builtin';
import { openRepository } from '#platform/git/open';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import type { FileSystem } from '#types/platform/ports';
import type { CliCommand } from '../../types/cli.ts';

const LIVE_DIR = '.ambicode/policies';

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
  summary: `Copy the built-in packs each project names in ${CONFIG_FILE} into .ambicode/policies/ and list them there; never overwrites a copy. --list shows the built-ins.`,
  options: { flags: ['json', 'list'] },
  run: async (runtime, args) => {
    const { repositoryRoot } = await openRepository(runtime);
    const configPath = path.join(repositoryRoot, CONFIG_FILE);
    const raw = await runtime.fs.readText(configPath);
    const config = parseConfig(raw);
    const document = parseDocument(raw);
    const builtinDirectory = builtinPoliciesDirectory(runtime.pluginRoot);
    const builtins = await listBuiltinPackFiles(runtime.fs, builtinDirectory);
    if (args.flag('list')) {
      const packs = await Promise.all(builtins.map(async (file) => ({ pack: `builtin/${file.id}`, description: PolicyPack.safeParse(parseYaml(await runtime.fs.readText(file.filePath))).data?.description ?? '' })));
      return { text: packs.map((entry) => `${entry.pack} - ${entry.description}`).join('\n'), data: { packs } };
    }
    const lines: string[] = [];
    const projects: { id: string; enabled: string[]; copies: PackCopy[]; skipped: { pack: string; reason: string }[] }[] = [];
    for (const project of config.projects) {
      const node = document.get('projects');
      const index = isSeq(node) ? node.items.findIndex((item) => isMap(item) && item.get('id') === project.id) : -1;
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
      projects.push({ id: project.id, enabled, copies, skipped });
      lines.push(`${project.id}: ${enabled.join(', ') || 'no packs'}`, ...copies.map((copy) => `  + ${copy.pack}: ${copy.path} ${copy.status === 'written' ? 'written' : copy.listed ? 'kept (edited or existing)' : 'kept, not listed in policyFiles'}${copy.note === null ? '' : `; ${copy.note}`}`), ...skipped.map((entry) => `  - ${entry.pack}: ${entry.reason}`));
    }
    await runtime.fs.writeText(configPath, document.toString({ lineWidth: 0 }));
    return { text: lines.join('\n'), data: { projects } };
  },
};
