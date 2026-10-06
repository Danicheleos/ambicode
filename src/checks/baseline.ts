import { openRepository, type Runtime } from '../composition/root.ts';
import { splitNul } from '../git/git.ts';
import { fingerprintWorkspace } from './mutations.ts';

export interface BaselineEntryFields {
  head: string | null;
  dirty: { path: string; hash: string | null }[];
}

/** Porcelain `-z` puts a rename or copy's origin in the next NUL field; both sides count as changed. */
async function changedPaths(runtime: Runtime): Promise<{ paths: string[]; head: string | null; hashes: ReadonlyMap<string, string | null> }> {
  const { git, repositoryRoot } = await openRepository(runtime);
  const fields = splitNul(await git.status());
  const found = new Set<string>();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index] ?? '';
    found.add(field.slice(3));
    if (field[0] === 'R' || field[0] === 'C' || field[1] === 'R' || field[1] === 'C') {
      index += 1;
      found.add(fields[index] ?? '');
    }
  }
  found.delete('');
  const paths = [...found].sort();
  const { fileHashes } = await fingerprintWorkspace({ fs: runtime.fs, git, repositoryRoot, paths });
  return { paths, head: await git.revParse('HEAD'), hashes: fileHashes };
}

export async function captureBaseline(runtime: Runtime): Promise<BaselineEntryFields> {
  const { paths, head, hashes } = await changedPaths(runtime);
  return { head, dirty: paths.map((path) => ({ path, hash: hashes.get(path) ?? null })) };
}

export async function touchedSet(
  runtime: Runtime,
  baseline: BaselineEntryFields,
): Promise<{ touched: string[]; preexisting: string[]; headMoved: boolean }> {
  const now = await changedPaths(runtime);
  const before = new Map(baseline.dirty.map((entry) => [entry.path, entry.hash]));
  const touched = new Set<string>();
  const preexisting: string[] = [];
  for (const path of now.paths) {
    if (before.has(path) && before.get(path) === (now.hashes.get(path) ?? null)) preexisting.push(path);
    else touched.add(path);
  }
  if (before.size > 0) {
    const { git, repositoryRoot } = await openRepository(runtime);
    const { fileHashes } = await fingerprintWorkspace({ fs: runtime.fs, git, repositoryRoot, paths: [...before.keys()] });
    for (const [path, hash] of before) if (fileHashes.get(path) !== hash) touched.add(path);
  }
  return { touched: [...touched].sort(), preexisting: preexisting.sort(), headMoved: now.head !== baseline.head };
}
