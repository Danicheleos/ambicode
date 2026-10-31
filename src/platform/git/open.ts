import { AmbicodeError } from '#util/errors';
import { Git } from './git.ts';
import type { Runtime } from '#types/composition';

type Opened = { git: Git; repositoryRoot: string };

/** Asking git for the same directory's work tree again costs 2 spawns per call: 2,384 of 4,430 spawns in the task route tests. Keyed by runner and cwd, since runtimes are spread-copied per command; only a success is kept, so a directory that becomes a repository later is found. */
const opened = new WeakMap<object, Map<string, Opened>>();

export async function openRepository(runtime: Runtime): Promise<Opened> {
  const known = opened.get(runtime.runner)?.get(runtime.cwd);
  if (known !== undefined) return known;
  const probe = new Git({ runner: runtime.runner, repositoryRoot: runtime.cwd });
  if (!(await probe.isRepository())) {
    throw new AmbicodeError('not-a-repository', 'This directory is not inside a git work tree.', {
      details: ['Run AMBICODE from inside the repository you want to review.'],
    });
  }
  const repositoryRoot = await probe.topLevel();
  const result = { git: new Git({ runner: runtime.runner, repositoryRoot }), repositoryRoot };
  const byCwd = opened.get(runtime.runner) ?? new Map<string, Opened>();
  byCwd.set(runtime.cwd, result);
  opened.set(runtime.runner, byCwd);
  return result;
}
