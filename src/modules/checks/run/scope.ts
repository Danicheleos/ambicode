import path from 'node:path';
import { openWorkspace, projectForPath } from '#modules/config/workspace';
import { decisionFor } from '#modules/policy/packs/resolve';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import type { ProjectConfig } from '#types/modules/config';
import { AmbicodeError } from '#util/errors';
import { baselineOf, touchedSet } from '../workspace/baseline.ts';
import { authorizeKey, runCheckOnly, routedOf, runnableKeys } from './check-command.ts';
import { checkApprovalKey } from '../selection/authorize.ts';
import type { ResolvedPolicy } from '#types/modules/policy';
import type { CheckDeps } from '#types/modules/checks';

/**
 * Runs every runnable check by the scope of what the task changed: a key with a file form on the changed files of its
 * project, a key without one in its all form, once. A key with a file form runs unasked; one without runs only when `full`
 * (the user said run to `checks-offer`). A `propose` key is never consented by the route: the ones without an answer are
 * collected in `waiting` and nothing else runs, so the question's answer re-runs this step without running a key twice.
 * A forbidden key still refuses. `only` limits the run to the keys that were red (the re-run after a fix).
 */
export async function runScopeChecks(deps: CheckDeps, input: { task: string; only: ReadonlySet<string> | null; full: boolean; waiting: { key: string; files: string[] }[] }): Promise<{ ran: number }> {
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
  const selected: { project: ProjectConfig; key: string; files: string[]; policy: ResolvedPolicy; propose: boolean }[] = [];
  for (const { project, files } of [...groups.values()].sort((a, b) => a.project.id.localeCompare(b.project.id))) {
    for (const entry of runnableKeys(project)) {
      if (!entry.file && !input.full) continue;
      if (input.only !== null && !input.only.has(`${project.id}/${entry.key}`)) continue;
      const scoped = entry.file ? files : [];
      const policy = await resolvePolicyFor({ workspace, project, activity: 'task', paths: scoped });
      selected.push({ project, key: entry.key, files: scoped, policy, propose: decisionFor(policy, entry.key).action === 'propose' });
    }
  }
  // Every propose key is asked about before any key runs: a key approved earlier would run again on the re-entry after the next answer.
  for (const { project, key, files, policy } of selected.filter((entry) => entry.propose)) {
    const approvalKey = checkApprovalKey(project.id, key);
    try {
      if (await authorizeKey(deps, routed, { policy, commandId: key, key: approvalKey, form: files.length > 0 ? 'file' : 'all', files, approve: [], decline: [], raise: false }) === 'waiting') input.waiting.push({ key: approvalKey, files });
    } catch (error) {
      if (!(error instanceof AmbicodeError)) throw error;
    }
  }
  if (input.waiting.length > 0) return { ran: 0 };
  let ran = 0;
  for (const { project, key, files } of selected) {
    try {
      const outcome = await runCheckOnly(deps, { task: input.task, name: key, project: project.id, files, phase: 'green', approve: [], decline: [], raise: false, consented: true });
      if (outcome.outcome === 'ran') ran += 1;
    } catch (error) {
      // A forbidden or over-limit key is already a recorded limit entry, and so a Not verified line; the other keys still run.
      if (!(error instanceof AmbicodeError)) throw error;
    }
  }
  return { ran };
}
