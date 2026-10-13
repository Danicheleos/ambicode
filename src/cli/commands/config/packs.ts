import path from 'node:path';
import { isMap, isScalar, isSeq, parse as parseYaml, parseDocument } from 'yaml';
import { CONFIG_FILE } from '#types/defaults';
import { PolicyPack } from '#types/modules/policy';
import { parseConfig } from '#modules/config/load';
import { listBuiltinPackFiles } from '#modules/policy/packs/builtin';
import { selectPacks } from '#modules/policy/packs/select';
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
async function copyBuiltin(fs: FileSystem, builtinDirectory: string, repositoryRoot: string, listed: readonly string[], id: string): Promise<CopyPackResult> {
  const sourcePath = (await listBuiltinPackFiles(fs, builtinDirectory)).find((file) => file.id === id)!.filePath;
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
  summary: `Copy the built-in packs this repository matches into .ambicode/policies/ and list them in ${CONFIG_FILE}; never overwrites a copy.`,
  options: { flags: ['json'] },
  run: async (runtime) => {
    const { repositoryRoot, git } = await openRepository(runtime);
    const configPath = path.join(repositoryRoot, CONFIG_FILE);
    const raw = await runtime.fs.readText(configPath);
    const config = parseConfig(raw);
    const document = parseDocument(raw);
    const files = await git.listFiles(null);
    const builtinDirectory = builtinPoliciesDirectory(runtime.pluginRoot);
    const lines: string[] = [];
    const projects: { id: string; enabled: string[]; copies: PackCopy[]; skipped: { pack: string; reason: string }[] }[] = [];
    for (const project of config.projects) {
      const choices = await selectPacks({ fs: runtime.fs, builtinDirectory, repositoryRoot, project, files });
      const node = document.get('projects');
      const index = isSeq(node) ? node.items.findIndex((item) => isMap(item) && item.get('id') === project.id) : -1;
      const copies: PackCopy[] = [];
      for (const choice of choices.filter((candidate) => candidate.enabled)) {
        const id = choice.reference.slice('builtin/'.length);
        const copy = await copyBuiltin(runtime.fs, builtinDirectory, repositoryRoot, project.policyFiles, id);
        const listed = index < 0 ? undefined : document.getIn(['projects', index, 'policyFiles']);
        const already = isSeq(listed) && listed.items.some((item) => isScalar(item) && item.value === copy.path);
        copies.push({ pack: choice.reference, ...copy, listed: already || copy.status === 'written' });
        // A kept copy that is not listed was removed on purpose; listing it again would undo that.
        if (index < 0 || already || copy.status !== 'written') continue;
        if (isSeq(listed)) listed.add(copy.path);
        else document.setIn(['projects', index, 'policyFiles'], document.createNode([copy.path]));
      }
      const enabled = [...new Set([...project.packs, ...copies.filter((copy) => copy.listed).map((copy) => copy.pack)])].sort();
      const skipped = choices.filter((choice) => !choice.enabled && !project.packs.includes(choice.reference)).map((choice) => ({ pack: choice.reference, reason: choice.reason }));
      projects.push({ id: project.id, enabled, copies, skipped });
      lines.push(`${project.id}: ${enabled.join(', ') || 'no packs'}`, ...copies.map((copy) => `  + ${copy.pack}: ${copy.path} ${copy.status === 'written' ? 'written' : copy.listed ? 'kept (edited or existing)' : 'kept, not listed in policyFiles'}${copy.note === null ? '' : `; ${copy.note}`}`), ...skipped.map((entry) => `  - ${entry.pack}: ${entry.reason}`));
    }
    await runtime.fs.writeText(configPath, document.toString({ lineWidth: 0 }));
    return { text: lines.join('\n'), data: { projects } };
  },
};
