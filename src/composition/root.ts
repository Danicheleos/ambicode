import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '../contracts/config.ts';
import { loadConfig } from '../config/load.ts';
import { Git } from '../git/git.ts';
import { systemClock, type Clock } from '../ports/clock.ts';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';
import { systemIds, type IdSource } from '../ports/ids.ts';
import { NodeProcessRunner } from '../ports/node-process-runner.ts';
import type { ProcessRunner } from '../ports/process.ts';
import { processStandardInput, type StandardInput } from '../ports/stdin.ts';
import { loadPacksForProject } from '../policy/load.ts';
import { GitHubProvider } from '../providers/github/provider.ts';
import { GitLabProvider } from '../providers/gitlab/provider.ts';
import { ProviderRegistry } from '../providers/registry.ts';
import { resolvePolicy } from '../policy/resolve.ts';
import type { Activity } from '../contracts/primitives.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import { AmbicodeError } from '../util/errors.ts';
import { mostSpecificRoot, normalizeRelative } from '../util/paths.ts';
import { builtinPoliciesDirectory, resolvePluginRoot } from '../util/plugin-root.ts';

/**
 * The single composition root: processes, filesystem, clock, identifiers and
 * plugin root are constructed here. Nothing deeper reaches for `node:fs`,
 * `process`, `Date` or `crypto` on its own (doc 02).
 */
export interface Runtime {
  runner: ProcessRunner;
  fs: FileSystem;
  clock: Clock;
  ids: IdSource;
  cwd: string;
  pluginRoot: string;
  /** Bounded standard input; `--evidence -` and the hook payload are its readers. */
  stdin: StandardInput;
  /** Read once here; nothing below this root touches `process.env` (doc 02). */
  env: Readonly<Record<string, string | undefined>>;
  /**
   * Every remote host AMBICODE knows, registered once. Review, reporting and
   * the later selection page ask this for a provider; none of them imports a
   * GitLab or GitHub module (doc 02).
   */
  providers: ProviderRegistry;
}

export interface RuntimeOverrides {
  runner?: ProcessRunner;
  fs?: FileSystem;
  clock?: Clock;
  ids?: IdSource;
  cwd?: string;
  pluginRoot?: string;
  stdin?: StandardInput;
  env?: Readonly<Record<string, string | undefined>>;
  providers?: ProviderRegistry;
}

export async function createRuntime(overrides: RuntimeOverrides = {}): Promise<Runtime> {
  const fs = overrides.fs ?? nodeFileSystem;
  const env = overrides.env ?? process.env;
  const runner = overrides.runner ?? new NodeProcessRunner(env);
  const cwd = overrides.cwd ?? process.cwd();
  return {
    runner,
    fs,
    clock: overrides.clock ?? systemClock,
    ids: overrides.ids ?? systemIds,
    cwd,
    pluginRoot: overrides.pluginRoot ?? (await resolvePluginRoot(fs, env)),
    stdin: overrides.stdin ?? processStandardInput,
    env,
    providers: overrides.providers ?? defaultProviders(runner, cwd),
  };
}

/**
 * The registration list. Adding a host is one entry here plus its own module;
 * nothing else in the codebase names a provider (doc 10, cleanliness check 5).
 */
export function defaultProviders(runner: ProcessRunner, cwd: string): ProviderRegistry {
  return new ProviderRegistry([new GitLabProvider({ runner, cwd }), new GitHubProvider()]);
}

export interface Workspace {
  runtime: Runtime;
  git: Git;
  repositoryRoot: string;
  config: AmbicodeConfig;
  configPath: string;
}

/** The repository the command is about, without any configuration yet. */
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

export async function openWorkspace(runtime: Runtime): Promise<Workspace> {
  const { git, repositoryRoot } = await openRepository(runtime);
  const loaded = await loadConfig(runtime.fs, repositoryRoot);
  return { runtime, git, repositoryRoot, config: loaded.config, configPath: loaded.filePath };
}

/**
 * The project that owns a path, by most-specific configured root. Returns null
 * rather than falling back to the first project: a path nobody claims is a fact
 * worth reporting, not a default.
 */
export function projectForPath(config: AmbicodeConfig, repositoryRelativePath: string): ProjectConfig | null {
  return mostSpecificRoot(config.projects, repositoryRelativePath);
}

export function projectById(config: AmbicodeConfig, id: string): ProjectConfig {
  const project = config.projects.find((candidate) => candidate.id === id);
  if (project === undefined) {
    throw new AmbicodeError('unknown-project', `No project "${id}" is configured.`, {
      field: 'projects',
      details: [`Configured projects: ${config.projects.map((candidate) => candidate.id).join(', ')}.`],
    });
  }
  return project;
}

export interface ResolvePolicyOptions {
  workspace: Workspace;
  project: ProjectConfig;
  activity: Activity;
  /** Repository-relative paths; empty means activity-level content only. */
  paths: readonly string[];
}

/** One way in for every caller that needs policy, so scope is never re-derived. */
export async function resolvePolicyFor(options: ResolvePolicyOptions): Promise<ResolvedPolicy> {
  const loaded = await loadPacksForProject({
    fs: options.workspace.runtime.fs,
    project: options.project,
    builtinDirectory: builtinPoliciesDirectory(options.workspace.runtime.pluginRoot),
    repositoryRoot: options.workspace.repositoryRoot,
  });

  return resolvePolicy({
    activity: options.activity,
    project: options.project,
    packs: loaded.packs,
    paths: options.paths,
    diagnostics: loaded.diagnostics,
  });
}

/**
 * Repository-relative form of a path the user typed, wherever they typed it
 * from. Resolves through realpath when the target exists, because
 * `repositoryRoot` is git's own realpath'd top level (`git rev-parse
 * --show-toplevel`): on a host where `cwd` reaches the repository through a
 * symlinked prefix (macOS's `/tmp` and `/var` are themselves symlinks), a
 * purely lexical `path.relative` against the two would produce a nonsense
 * `../../..` path and every path-derived decision downstream of it — project
 * resolution among them — would silently fail. A target that does not exist
 * yet falls back to the lexical form, which is what deleted/renamed diff
 * paths already need.
 */
export async function toRepositoryRelative(workspace: Workspace, value: string): Promise<string> {
  const absolute = path.isAbsolute(value) ? value : path.resolve(workspace.runtime.cwd, value);
  const resolved = await realpathIfExists(workspace.runtime.fs, absolute);
  return normalizeRelative(path.relative(workspace.repositoryRoot, resolved));
}

async function realpathIfExists(fs: FileSystem, absolute: string): Promise<string> {
  try {
    return await fs.realpath(absolute);
  } catch {
    return absolute;
  }
}
