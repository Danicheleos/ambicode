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

/** Throws rather than defaulting to the first project when the request is ambiguous. */
export function projectForRequest(
  config: AmbicodeConfig,
  requestedId: string | null,
  paths: readonly string[],
): ProjectConfig {
  if (requestedId !== null) return projectById(config, requestedId);

  if (config.projects.length === 0) {
    throw new AmbicodeError('unknown-project', 'No project is configured for this repository.', {
      details: ['Run the AMBICODE init skill first.'],
    });
  }
  if (config.projects.length === 1) return config.projects[0] as ProjectConfig;

  if (paths.length > 0) {
    const resolved = new Set(paths.map((value) => projectForPath(config, value)?.id ?? null));
    if (resolved.size === 1) {
      const [only] = resolved;
      if (only !== null && only !== undefined) return projectById(config, only);
    }
  }

  throw new AmbicodeError(
    'ambiguous-project',
    'This repository configures more than one project, and this request does not identify exactly one.',
    {
      field: '--project',
      details: [
        `Configured projects: ${config.projects.map((project) => project.id).join(', ')}.`,
        'Pass --project <id>, or give one or more paths that all fall inside a single project root.',
      ],
    },
  );
}

export interface ResolvePolicyOptions {
  workspace: Workspace;
  project: ProjectConfig;
  activity: Activity;
  paths: readonly string[];
}

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
 * Realpath first: `repositoryRoot` is git's realpath'd top level, so a symlinked `cwd`
 * (macOS `/tmp`, `/var`) would otherwise yield a bogus `../../..` path. A missing
 * target (deleted/renamed diff paths) falls back to the lexical form.
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
