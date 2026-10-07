import path from 'node:path';
import { MAX_COMMAND_OUTPUT_BYTES } from '#types/defaults';
import { openWorkspace, projectForPath } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import type { ProjectConfig } from '#types/modules/config';
import { normalizeRelative } from '#util/paths';
import { authorizeCommand } from '../selection/authorize.ts';
import { authorizeKey, projectRelative, routedOf, withLedger } from './check-command.ts';
import { fingerprintWorkspace } from '../workspace/mutations.ts';
import { expandFiles } from '../selection/select.ts';
import { touchedSet } from '../workspace/baseline.ts';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import type { CheckDeps, BaselineEntryFields, FormatEntry } from '#types/modules/checks';
const FORMAT_COMMAND = 'format';

/** The task's baseline in this route's chain (or the latest one standalone); none → everything changed against HEAD. */
export async function baselineOf(deps: CheckDeps, task: string, chainIds: readonly string[] | null): Promise<(BaselineEntryFields & { id: string }) | null> {
  const entry = (await deps.context!.entries(task)).findLast((candidate) => candidate.kind === 'baseline' && (chainIds === null || chainIds.includes(String(candidate['route']))));
  return entry === undefined ? null : { id: entry.id, head: (entry['head'] as string | null) ?? null, dirty: (entry['dirty'] as BaselineEntryFields['dirty']) ?? [] };
}

/** One `format` entry per project in the touched set (07-F1 … 07-F3); a `propose` project waiting on its gate writes none. */
export async function runFormat(deps: CheckDeps, input: { task: string; paths: string[] }): Promise<FormatEntry[]> {
  const workspace = await openWorkspace(deps.runtime);
  const routed = await routedOf(deps, input.task);
  const baseline = await baselineOf(deps, input.task, routed?.view.chainIds ?? null);
  const { touched } = await touchedSet(deps.runtime, baseline ?? { head: null, dirty: [] });
  const narrowed = input.paths.length === 0 ? touched : touched.filter((file) => input.paths.map(normalizeRelative).some((prefix) => file === prefix || file.startsWith(`${prefix.replace(/\/$/, '')}/`)));
  const groups = new Map<string, { project: ProjectConfig; files: string[] }>();
  for (const file of narrowed) {
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
    const command = project.commands[FORMAT_COMMAND];
    if (command === undefined || command === null) {
      entries.push(await append({ key, files: [], exit: null, via: 'model', outcome: 'unconfigured' }));
      continue;
    }
    const policy = await resolvePolicyFor({ workspace, project, activity: 'task', paths: files });
    if (authorizeCommand({ policy, commandId: FORMAT_COMMAND, approvalKey: key, approvals: new Set() }).kind === 'refused') {
      entries.push(await append({ key, files: [], exit: null, via: 'model', outcome: 'refused' }));
      continue;
    }
    const decision = await authorizeKey(deps, routed, { policy, commandId: FORMAT_COMMAND, key, files, approve: [], decline: [] });
    if (decision === 'waiting') continue;
    if (decision === 'declined') {
      entries.push(await append({ key, files: [], exit: null, via: 'model', outcome: 'refused' }));
      continue;
    }
    const relative = files.map((file) => projectRelative(project, file));
    const argv = command.argv.includes('{files}') ? expandFiles(command.argv, relative) : [...command.argv, ...relative];
    const hashes = () => fingerprintWorkspace({ fs: deps.runtime.fs, git: workspace.git, repositoryRoot: workspace.repositoryRoot, paths: files }).then((print) => print.fileHashes);
    const before = await hashes();
    const outcome = await deps.runtime.runner.run({
      argv,
      cwd: path.join(workspace.repositoryRoot, normalizeRelative(project.root), command.cwd ?? ''),
      timeoutMs: (command.timeoutSeconds ?? workspace.config.checks.timeoutSeconds) * 1000,
      maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES,
      env: { kind: 'inherited' },
      purpose: 'format',
    });
    const after = await hashes();
    const changed = files.filter((file) => before.get(file) !== after.get(file));
    entries.push(await append({ key, files: changed, exit: outcome.exitCode, via: 'model', outcome: outcome.exitCode === 0 ? 'formatted' : 'failed' }));
  }
  return entries;
}
