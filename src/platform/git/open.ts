import { AmbicodeError } from '#util/errors';
import { Git } from './git.ts';
import type { Runtime } from '#types/composition';

export async function openRepository(runtime: Runtime): Promise<{ git: Git; repositoryRoot: string }> {
  const probe = new Git({ runner: runtime.runner, repositoryRoot: runtime.cwd });
  if (!(await probe.isRepository())) {
    throw new AmbicodeError('not-a-repository', 'This directory is not inside a git work tree.', {
      details: ['Run AMBICODE from inside the repository you want to review.'],
    });
  }
  const repositoryRoot = await probe.topLevel();
  return { git: new Git({ runner: runtime.runner, repositoryRoot }), repositoryRoot };
}
