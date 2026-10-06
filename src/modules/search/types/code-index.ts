import type { Git } from '#platform/git/git';
import type { Runtime } from '#types/composition';
import type { AmbicodeConfig } from '#types/config';

export interface IndexDeps {
  runtime: Runtime;
  git: Git;
  repositoryRoot: string;
  config: AmbicodeConfig;
  /** Production: `[process.execPath, process.argv[1]]`; the hook and the CLI are the same script. */
  selfArgv: readonly string[];
  /** Set only by the offline recall script. */
  indexDir?: string;
  isAlive?: (pid: number) => boolean;
}
