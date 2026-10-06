import path from 'node:path';
import { createRuntime, openRepository } from './root.ts';
import type { Runtime } from '#types/composition';

/**
 * The repository the skill is about: the session's own when it carries a configuration, else the one
 * configured repository directly below it. The eval sandbox's home directory is itself a git work
 * tree holding the case's `repo/`, so "the session is inside a repository" alone picks the wrong one.
 */
export async function findSessionRepository(runtime: Runtime, directory: string): Promise<{ repositoryRoot: string; where: string } | string> {
  const { fs } = runtime;
  const isRepository = async (candidate: string): Promise<string | null> => {
    const probe = await createRuntime({ ...runtime, cwd: candidate }).catch(() => null);
    if (probe === null) return null;
    return openRepository(probe).then((opened) => opened.repositoryRoot).catch(() => null);
  };
  const configured = (root: string) => fs.exists(path.join(root, '.ambicode', 'config.yaml'));

  const here = await isRepository(directory);
  if (here !== null && (await configured(here))) return { repositoryRoot: here, where: '.' };

  // Named by directory entry, never by `path.relative`: macOS reaches /tmp through a symlink, and a
  // lexical relative path between /var/... and /private/var/... climbs out of the session directory.
  const below: { root: string; name: string }[] = [];
  for (const entry of await fs.readdir(directory).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const candidate = path.join(directory, entry.name);
    if ((await fs.exists(path.join(candidate, '.git'))) && (await configured(candidate))) below.push({ root: candidate, name: entry.name });
  }
  if (below.length === 1) return { repositoryRoot: below[0]!.root, where: below[0]!.name };
  // Nothing configured to choose: let `prepare` name what is missing in the session's own repository.
  if (below.length === 0 && here !== null) return { repositoryRoot: here, where: '.' };
  const name = path.basename(directory) || directory;
  if (below.length === 0) return `no git repository in ${name} or directly below it`;
  return `${below.length} configured git repositories below ${name}, and no way to tell which one the skill is about`;
}
