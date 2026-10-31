import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ProjectConfig } from '#types/modules/config';
import { PolicyPack, type PackConstraints } from '#types/modules/policy';
import { AmbicodeError } from '#util/errors';
import type { FileSystem } from '#types/platform/ports';

interface BuiltinPackFile {
  id: string;
  filePath: string;
}

/** Built-in packs sit at the policies root or one folder below it (the folder is not part of the id), so ids must be
 * unique across all of them. */
export async function listBuiltinPackFiles(fs: FileSystem, builtinDirectory: string): Promise<BuiltinPackFile[]> {
  const found: BuiltinPackFile[] = [];
  const collect = async (directory: string, descend: boolean): Promise<void> => {
    for (const entry of await fs.readdir(directory)) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory() && descend) await collect(filePath, false);
      else if (entry.isFile() && entry.name.endsWith('.yaml')) found.push({ id: entry.name.slice(0, -'.yaml'.length), filePath });
    }
  };
  await collect(builtinDirectory, true);
  const seen = new Map<string, string>();
  for (const file of found) {
    const first = seen.get(file.id);
    if (first !== undefined) throw new AmbicodeError('builtin-pack-duplicate', `Two built-in packs share the id "${file.id}": ${first} and ${file.filePath}.`);
    seen.set(file.id, file.filePath);
  }
  return found.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The constraints one project's packs are validated under; every `validatePack` caller builds them here so none forgets the built-ins' own commands. */
export async function packConstraints(fs: FileSystem, builtinDirectory: string, project: ProjectConfig | null): Promise<PackConstraints> {
  // Parsing every built-in pack cost 7.3 ms per policy load, and only a `replaces` copy reads the result.
  let cached: Promise<Map<string, Set<string>>> | undefined;
  const builtinCommands = (): Promise<Map<string, Set<string>>> => (cached ??= (async () => {
    const found = new Map<string, Set<string>>();
    for (const file of project === null ? [] : await listBuiltinPackFiles(fs, builtinDirectory)) {
      const parsed = PolicyPack.safeParse(parseYaml(await fs.readText(file.filePath)));
      if (!parsed.success) continue;
      found.set(file.id, new Set([...parsed.data.commandPolicy.map((decision) => decision.command), ...parsed.data.rules.flatMap((rule) => (rule.check.kind === 'command' ? [rule.check.command] : []))]));
    }
    return found;
  })());
  return project === null ? { commands: null, projectId: null, builtinCommands } : { commands: { ...project.commands, ...project.checks }, projectId: project.id, builtinCommands };
}
