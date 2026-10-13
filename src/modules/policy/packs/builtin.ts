import path from 'node:path';
import { AmbicodeError } from '#util/errors';
import type { FileSystem } from '#types/platform/ports';

export interface BuiltinPackFile {
  id: string;
  filePath: string;
}

/**
 * Built-in packs sit at the policies root or one folder below it (folders group by ecosystem and are
 * not part of the id), so ids must be unique across all of them.
 */
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
