import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '../contracts/config.ts';
import { loadConfig } from '../config/load.ts';
import { Git } from '../git/git.ts';
import { systemClock, type Clock } from '../ports/clock.ts';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';
import { systemIds, type IdSource } from '../ports/ids.ts';
import { NodeProcessRunner } from '../ports/node-process-runner.ts';
import type { ProcessRunner } from '../ports/process.ts';
import { loadPacksForProject } from '../policy/load.ts';
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
}

export interface RuntimeOverrides {
  runner?: ProcessRunner;
  fs?: FileSystem;
  clock?: Clock;
  ids?: IdSource;
  cwd?: string;
  pluginRoot?: string;
}

export async function createRuntime(overrides: RuntimeOverrides = {}): Promise<Runtime> {
  const fs = overrides.fs ?? nodeFileSystem;
  return {
    runner: overrides.runner ?? new NodeProcessRunner(),
    fs,
    clock: overrides.clock ?? systemClock,
    ids: overrides.ids ?? systemIds,
    cwd: overrides.cwd ?? process.cwd(),
    pluginRoot: overrides.pluginRoot ?? (await resolvePluginRoot(fs)),
  };
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

/** Repository-relative form of a path the user typed, wherever they typed it from. */
export function toRepositoryRelative(workspace: Workspace, value: string): string {
  const absolute = path.isAbsolute(value) ? value : path.resolve(workspace.runtime.cwd, value);
  return normalizeRelative(path.relative(workspace.repositoryRoot, absolute));
}
