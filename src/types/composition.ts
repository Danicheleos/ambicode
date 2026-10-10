import type { Git } from '#platform/git/git';
import type { AmbicodeConfig } from './modules/config.ts';
import type { ProcessRunner, FileSystem, Clock, IdSource, StandardInput } from './platform/ports.ts';

/**
 * The only place that touches `node:fs`, `process`, `process.env`, `Date` or
 * `crypto`; everything deeper gets them from here.
 */
export interface Runtime {
  runner: ProcessRunner;
  fs: FileSystem;
  clock: Clock;
  ids: IdSource;
  cwd: string;
  pluginRoot: string;
  stdin: StandardInput;
  env: Readonly<Record<string, string | undefined>>;
  /** Config notices collected while commands run; the CLI prints them to stderr. */
  notices?: string[];
}

export interface Workspace {
  runtime: Runtime;
  git: Git;
  repositoryRoot: string;
  config: AmbicodeConfig;
  configPath: string;
}
