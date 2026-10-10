import path from 'node:path';
import { openRepository } from '#platform/git/open';
import { AmbicodeError } from '#util/errors';
import { mostSpecificRoot, normalizeRelative } from '#util/paths';
import { loadConfig } from './load.ts';
import type { AmbicodeConfig, ProjectConfig } from '#types/modules/config';
import type { Runtime, Workspace } from '#types/composition';
import type { FileSystem } from '#types/platform/ports';

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
