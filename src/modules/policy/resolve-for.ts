import { loadPacksForProject } from './packs/load.ts';
import { resolvePolicy } from './packs/resolve.ts';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import type { Activity } from '#types/primitives';
import type { ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import type { Workspace } from '#types/composition';

interface ResolvePolicyOptions {
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
