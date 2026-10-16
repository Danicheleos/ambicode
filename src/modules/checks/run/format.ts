import path from 'node:path';
import { MAX_COMMAND_OUTPUT_BYTES } from '#types/defaults';
import { openWorkspace, projectForPath } from '#modules/config/workspace';
import type { ProjectConfig } from '#types/modules/config';
import { normalizeRelative } from '#util/paths';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import { authorizeCommand } from '../selection/authorize.ts';
import { authorizeKey, commandFor, FORMAT_CHECK, projectRelative, routedOf, withLedger } from './check-command.ts';
import { shellArgv } from './run.ts';
import { fingerprintWorkspace } from '../workspace/mutations.ts';
import { baselineOf, touchedSet } from '../workspace/baseline.ts';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import type { CheckDeps, FormatEntry } from '#types/modules/checks';

/** One `format` entry per project in the touched set (07-F1 … 07-F3). */
export async function runFormat(deps: CheckDeps, input: { task: string; waiting: { key: string; files: string[] }[] }): Promise<FormatEntry[]> {
  const workspace = await openWorkspace(deps.runtime);
  const routed = await routedOf(deps, input.task);
  const baseline = await baselineOf(deps, input.task, routed?.view.chainIds ?? null);
  const { touched } = await touchedSet(deps.runtime, baseline ?? { head: null, dirty: [] });
  const groups = new Map<string, { project: ProjectConfig; files: string[] }>();
  for (const file of touched) {
    const project = projectForPath(workspace.config, file);
    if (project === null) continue;
    const group = groups.get(project.id) ?? { project, files: [] };
    group.files.push(file);
    groups.set(project.id, group);
  }

  const dir = routed?.dir ?? (await resolveTaskDir(deps.runtime, input.task));
  const route = routed === null ? {} : { route: routed.view.routeId };
  const append = (fields: Omit<FormatEntry, 'id' | 'at' | 'kind' | 'route' | 'session'>) =>
    withLedger(deps, dir, (ledger) => ledger.append({ kind: 'format', ...route, ...fields, ...(deps.session === null ? {} : { session: deps.session }) })) as Promise<FormatEntry>;
  const entries: FormatEntry[] = [];
  for (const { project, files } of [...groups.values()].sort((a, b) => a.project.id.localeCompare(b.project.id))) {
    const key = `${project.id}/format`;
    const template = project.checks[FORMAT_CHECK]?.file ?? null;
    if (template === null) {
      entries.push(await append({ key, files: [], exit: null, outcome: 'unconfigured' }));
      continue;
    }
    const policy = await resolvePolicyFor({ workspace, project, activity: 'task', paths: files });
    if (authorizeCommand({ policy, commandId: FORMAT_CHECK, approvalKey: key, approvals: new Set() }).kind === 'refused') {
      entries.push(await append({ key, files: [], exit: null, outcome: 'refused' }));
      continue;
    }
    // The task route's code step prints the gate through the engine, so the questions are collected, not raised here.
    const decision = await authorizeKey(deps, routed, { policy, commandId: FORMAT_CHECK, key, files, approve: [], decline: [], raise: false });
    if (decision === 'waiting') {
      input.waiting.push({ key, files });
      continue;
    }
    if (decision === 'declined') {
      entries.push(await append({ key, files: [], exit: null, outcome: 'refused' }));
      continue;
    }
    const relative = files.map((file) => projectRelative(project, file));
    const hashes = () => fingerprintWorkspace({ fs: deps.runtime.fs, git: workspace.git, repositoryRoot: workspace.repositoryRoot, paths: files }).then((print) => print.fileHashes);
    const before = await hashes();
    const outcome = await deps.runtime.runner.run({
      argv: shellArgv(commandFor(template, relative)),
      cwd: path.join(workspace.repositoryRoot, normalizeRelative(project.root)),
      timeoutMs: workspace.config.skills.task.checkTimeoutSeconds * 1000,
      maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES,
      env: { kind: 'inherited' },
    });
    const after = await hashes();
    const changed = files.filter((file) => before.get(file) !== after.get(file));
    entries.push(await append({ key, files: changed, exit: outcome.exitCode, outcome: outcome.exitCode === 0 ? 'formatted' : 'failed' }));
  }
  return entries;
}
