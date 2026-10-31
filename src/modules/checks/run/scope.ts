import path from 'node:path';
import { openWorkspace, projectForPath } from '#modules/config/workspace';
import type { ProjectConfig } from '#types/modules/config';
import { AmbicodeError } from '#util/errors';
import { baselineOf, touchedSet } from '../workspace/baseline.ts';
import { runCheckOnly, routedOf, runnableKeys } from './check-command.ts';
import type { CheckDeps } from '#types/modules/checks';

/**
 * Runs every runnable check by the scope of what the task changed: a key with a file form on the changed files of its
 * project, a key without one in its all form, once. The route's own start is the consent, so nothing is asked here;
 * a forbidden key still refuses. `full` is false when a key that covers the whole project was offered and declined. `only` limits the run to the keys that were red (the re-run after a fix).
 */
export async function runScopeChecks(deps: CheckDeps, input: { task: string; only: ReadonlySet<string> | null; full: boolean }): Promise<{ ran: number }> {
  const workspace = await openWorkspace(deps.runtime);
  const routed = await routedOf(deps, input.task);
  const baseline = await baselineOf(deps, input.task, routed?.view.chainIds ?? null);
  const { touched } = await touchedSet(deps.runtime, baseline ?? { head: null, dirty: [] });
  const groups = new Map<string, { project: ProjectConfig; files: string[] }>();
  for (const file of touched) {
    // A deleted file has nothing to check, and a runner given its path fails on the path, not on the code.
    if (!(await deps.runtime.fs.exists(path.join(workspace.repositoryRoot, file)))) continue;
    const project = projectForPath(workspace.config, file);
    if (project === null) continue;
    const group = groups.get(project.id) ?? { project, files: [] };
    group.files.push(file);
    groups.set(project.id, group);
  }
  let ran = 0;
  for (const { project, files } of [...groups.values()].sort((a, b) => a.project.id.localeCompare(b.project.id))) {
    for (const entry of runnableKeys(project)) {
      if (!entry.file && !input.full) continue;
      if (input.only !== null && !input.only.has(`${project.id}/${entry.key}`)) continue;
      try {
        const outcome = await runCheckOnly(deps, { task: input.task, name: entry.key, project: project.id, files: entry.file ? files : [], phase: 'green', approve: [], decline: [], raise: false, consented: true });
        if (outcome.outcome === 'ran') ran += 1;
      } catch (error) {
        // A forbidden or over-limit key is already a recorded limit entry, and so a Not verified line; the other keys still run.
        if (!(error instanceof AmbicodeError)) throw error;
      }
    }
  }
  return { ran };
}
