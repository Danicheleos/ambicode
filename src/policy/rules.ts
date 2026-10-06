import path from 'node:path';
import { isMap, isScalar, isSeq, parse as parseYaml, parseDocument } from 'yaml';
import { openRepository, openWorkspace, type Runtime, type Workspace } from '../composition/root.ts';
import { detectRuleSources } from '../config/init.ts';
import type { ApplyDeps } from '../config/apply.ts';
import { loadConfigWithNotices } from '../config/load.ts';
import type { ProjectConfig } from '../contracts/config.ts';
import { refOf } from '../route/context.ts';
import { classifySource, requirementsTemplate } from '../requirements/template.ts';
import { resolveTaskDir } from '../task/task-dir.ts';
import { withLedgerLock } from '../task/ledger-lock.ts';
import { AmbicodeError } from '../util/errors.ts';
import { matchesAnyGlob } from '../util/glob.ts';
import { contentHash } from '../util/hash.ts';
import { normalizeRelative } from '../util/paths.ts';
import { builtinPoliciesDirectory } from '../util/plugin-root.ts';
import { pathExclusionReason } from '../snapshot/exclusions.ts';
import { blockingProblem, checkDrafts, DRAFTS_DIR, type DraftsCheck } from './drafts.ts';
import { loadPacksForProject, type PackWithPrompts } from './load.ts';
import { resolvePolicy } from './resolve.ts';

const LIVE_DIR = '.ambicode/policies';

export interface RulesDiscovery { candidates: string[]; named: string[]; missing: string[]; urls: string[]; fetch: string | null; text: string }
export interface AppliedPack { id: string; path: string; rules: number }
export interface PackProbe { pack: string; covered: { path: string; ok: boolean } | null; uncovered: { path: string; ok: boolean } | 'n/a' | null }
export interface RulesApplied { packs: AppliedPack[]; skipped: { file: string; reason: string }[]; notMigrated: { rule: string; reason: string }[]; probes: PackProbe[]; text: string; hash: string }

const badArgument = (message: string, field: string): AmbicodeError => new AmbicodeError('bad-argument', message, { field });

export function rulesUnconfirmed(reason: string): AmbicodeError {
  return new AmbicodeError('rules-apply-unconfirmed', `rules apply needs the user's own "Apply all" answer to the rules table (reason: ${reason}). Nothing was written.`, {
    details: [`reason: ${reason}`, 'Release: answer the rules-table gate in /ambicode:rules; the default is to apply nothing.'],
  });
}

export async function discoverRules(runtime: Runtime, args: readonly string[], options: { task?: string; project?: string | null } = {}): Promise<RulesDiscovery> {
  const { repositoryRoot } = await openRepository(runtime);
  const scope = options.project == null ? null : normalizeRelative(projectFor(await openWorkspace(runtime), options.project).root);
  const candidates = scope === null
    ? await detectRuleSources(runtime.fs, repositoryRoot)
    : (await detectRuleSources(runtime.fs, path.join(repositoryRoot, scope))).map((candidate) => path.posix.join(scope, candidate));
  const urls = args.filter((arg) => arg.startsWith('https://'));
  const named: string[] = [];
  const missing: string[] = [];
  for (const arg of args.filter((value) => !value.startsWith('https://'))) {
    const relative = normalizeRelative(path.relative(repositoryRoot, path.resolve(repositoryRoot, arg)));
    (await runtime.fs.exists(path.join(repositoryRoot, relative)) ? named : missing).push(relative);
  }
  const pages = urls.filter((url) => classifySource(url).kind === 'confluence');
  const config = pages.length === 0 ? null : (await loadConfigWithNotices(runtime.fs, repositoryRoot).catch(() => null))?.config ?? null;
  const fetch = pages.length === 0 ? null : requirementsTemplate({ sources: pages, task: options.task ?? '<task>', mcpServer: config?.requirements.mcpServer ?? null, acceptanceField: config?.requirements.acceptanceField ?? null, observedTools: [], runner: `node "${runtime.pluginRoot}/scripts/ambicode.mjs"` }).text;
  const text = [
    `Rule sources found: ${candidates.join(', ') || 'none'}`,
    ...(named.length === 0 ? [] : [`Named in the request: ${named.join(', ')}`]),
    ...(urls.length === 0 ? [] : [`Pages named in the request: ${urls.join(', ')}`]),
    ...(missing.length === 0 ? [] : [`Not found: ${missing.join(', ')}`]),
    ...(fetch === null ? [] : ['Fetch these pages first; the capture happens on read:', fetch]),
  ].join('\n');
  return { candidates, named, missing, urls, fetch, text };
}

function projectFor(workspace: Workspace, requested: string | null): ProjectConfig {
  const projects = workspace.config.projects;
  const found = requested === null ? (projects.length === 1 ? projects[0] : undefined) : projects.find((project) => project.id === requested);
  if (found === undefined) throw badArgument(requested === null ? `This repository configures ${projects.length} projects; pass --project <id>.` : `No project "${requested}" is configured.`, '--project');
  return found;
}

/** Edits `policyFiles` through the document API so every comment and other value stays. */
async function editPolicyFiles(runtime: Runtime, configPath: string, projectId: string, change: { add?: string; remove?: string }): Promise<void> {
  const document = parseDocument(await runtime.fs.readText(configPath));
  const projects = document.get('projects');
  const index = isSeq(projects) ? projects.items.findIndex((item) => isMap(item) && item.get('id') === projectId) : -1;
  if (index < 0) throw new AmbicodeError('unknown-project', `No project "${projectId}" is configured.`);
  const files = document.getIn(['projects', index, 'policyFiles']);
  const at = isSeq(files) ? files.items.findIndex((item) => isScalar(item) && item.value === (change.add ?? change.remove)) : -1;
  if (change.add !== undefined && at < 0) document.addIn(['projects', index, 'policyFiles'], change.add);
  if (change.remove !== undefined && isSeq(files) && at >= 0) files.delete(at);
  await runtime.fs.writeText(configPath, document.toString({ lineWidth: 0 }));
}

async function probe(runtime: Runtime, workspace: Workspace, project: ProjectConfig, packs: readonly PackWithPrompts[], live: PackWithPrompts): Promise<PackProbe> {
  const root = path.join(workspace.repositoryRoot, project.root);
  const globs = live.pack.appliesTo;
  const files = (await runtime.fs.glob('**/*', root).catch(() => [])).filter((file) => pathExclusionReason(file) === null).sort();
  const isFile = async (file: string): Promise<boolean> => (await runtime.fs.lstat(path.join(root, file)).catch(() => null))?.isFile() === true;
  const applies = async (file: string): Promise<boolean> => resolvePolicy({ activity: live.pack.activities[0]!, project, packs, paths: [path.posix.join(normalizeRelative(project.root), file)] }).packs.some((entry) => entry.id === live.pack.id);
  let covered: string | undefined;
  let uncovered: string | undefined;
  for (const file of files) {
    const matched = matchesAnyGlob(file, globs);
    if ((matched ? covered : uncovered) !== undefined || !(await isFile(file))) continue;
    if (matched) covered = file;
    else uncovered = file;
  }
  return {
    pack: live.pack.id,
    covered: covered === undefined ? null : { path: covered, ok: await applies(covered) },
    uncovered: globs.includes('**/*') ? 'n/a' : uncovered === undefined ? null : { path: uncovered, ok: !(await applies(uncovered)) },
  };
}

const probeCell = (value: PackProbe['covered'] | PackProbe['uncovered']): string => (value === null ? 'no file' : value === 'n/a' ? 'n/a' : `${value.ok ? 'ok' : 'FAILED'} ${value.path}`);

export async function applyRules(deps: ApplyDeps, input: { task: string; project: string | null }): Promise<RulesApplied> {
  const { runtime, session, context } = deps;
  if (session === null) {
    throw new AmbicodeError('session-unbound', `rules apply cannot tell which route it speaks for: task ${input.task} has no single live route.`, { details: ['Start the rules route in /ambicode:rules; rules apply runs inside it.'] });
  }
  const view = context === null ? null : await context.resolve(input.task, session);
  if (context === null || view === null || view.skill !== 'rules') throw rulesUnconfirmed('no-rules-route');
  await context.assertOwner(view);

  const consent = await context.consent(view, 'rules-table');
  if (consent.state === 'refused') throw rulesUnconfirmed(consent.reason);
  const source = consent.source as unknown as Record<string, unknown>;
  if (source['answer'] !== 'Apply all' || source['unbound'] === true) throw rulesUnconfirmed('not-accepted');
  if (!((source['via'] === 'hook' && typeof source['instance'] === 'string') || (source['via'] === 'prompt' && source['trusted'] === true))) throw rulesUnconfirmed('acting-needs-human');

  const latest = (await context.window(view, 'drafts-check')).findLast((entry) => entry.kind === 'policy' && entry['stage'] === 'drafts');
  const ref = latest === undefined ? null : refOf(latest, 'policy', 'drafts');
  const same = ref !== null && consent.object !== null && (['kind', 'value', 'id', 'path', 'contentHash'] as const).every((field) => consent.object![field] === ref[field]);
  if (!same) throw rulesUnconfirmed('object-changed');

  const workspace = await openWorkspace(runtime);
  const project = projectFor(workspace, input.project);
  const dir = await resolveTaskDir(runtime, input.task);
  const verify = async (): Promise<DraftsCheck> => {
    const check = await checkDrafts(runtime, workspace, { project: project.id, taskDir: dir });
    if (check.aggregateHash !== ref.contentHash) throw rulesUnconfirmed('object-changed');
    return check;
  };
  const check = await verify();

  const root = workspace.repositoryRoot;
  const skipped: RulesApplied['skipped'] = [];
  const plan: { id: string; draft: string; live: string; text: string; rules: number }[] = [];
  for (const file of check.files) {
    const blocking = blockingProblem(check, root, file.path);
    if (file.packId === null || blocking !== undefined) {
      skipped.push({ file: file.path, reason: blocking?.code ?? 'pack-invalid' });
      continue;
    }
    const document = parseDocument(await runtime.fs.readText(path.join(root, file.path)));
    const dropped = new Set(check.notMigrated.map((entry) => entry.rule));
    const rules = document.get('rules');
    if (isSeq(rules)) rules.items = rules.items.filter((item) => !(isMap(item) && dropped.has(`${file.packId}/${String(item.get('id'))}`)));
    const left = isSeq(rules) ? rules.items.length : 0;
    if (left === 0) {
      skipped.push({ file: file.path, reason: 'no rules left' });
      continue;
    }
    plan.push({ id: file.packId, draft: file.path, live: `${LIVE_DIR}/${path.posix.basename(file.path)}`, text: document.toString({ lineWidth: 0 }), rules: left });
  }
  for (const pack of plan) {
    if (await runtime.fs.exists(path.join(root, pack.live))) throw badArgument(`${pack.live} already exists; a live pack is never overwritten. Rename the draft or run "rules revert" first.`, 'rules apply');
  }

  return withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session, async (ledger) => {
    await context.assertOwner(view);
    await verify();
    for (const pack of plan) {
      await runtime.fs.writeText(path.join(root, pack.live), pack.text);
      await runtime.fs.remove(path.join(root, pack.draft));
      await editPolicyFiles(runtime, workspace.configPath, project.id, { add: pack.live });
    }
    const updated = { ...project, policyFiles: [...project.policyFiles, ...plan.map((pack) => pack.live)] };
    const loaded = await loadPacksForProject({ fs: runtime.fs, project: updated, builtinDirectory: builtinPoliciesDirectory(runtime.pluginRoot), repositoryRoot: root });
    const probes: PackProbe[] = [];
    for (const pack of plan) {
      const live = loaded.packs.find((candidate) => candidate.reference === pack.live);
      probes.push(live === undefined ? { pack: pack.id, covered: null, uncovered: null } : await probe(runtime, workspace, updated, loaded.packs, live));
    }
    const applied = plan.map(({ id, live, rules }) => ({ id, path: live, rules }));
    await ledger.append({ kind: 'policy', route: view.routeId, stage: 'apply', packs: applied, probes });

    const table = [
      '| pack | live file | rules | covered probe | uncovered probe |',
      '|---|---|---|---|---|',
      ...applied.map((pack, index) => `| ${pack.id} | ${pack.path} | ${pack.rules} | ${probeCell(probes[index]!.covered)} | ${probeCell(probes[index]!.uncovered)} |`),
      ...skipped.map((entry) => `skipped: ${entry.file} (${entry.reason})`),
      ...check.notMigrated.map((entry) => `not migrated: ${entry.rule} (${entry.reason})`),
    ].join('\n');
    const hash = contentHash(table);
    const text = `${table}\n<!-- ambicode rules ${hash} -->\n`;
    await runtime.fs.mkdirp(dir.steps);
    await runtime.fs.writeText(path.join(dir.steps, 'rules-apply.md'), text);
    return { packs: applied, skipped, notMigrated: check.notMigrated, probes, text, hash };
  });
}

/** Unwires one pack that `rules apply` wired and moves it back to the drafts (09-T6). */
export async function revertRule(runtime: Runtime, packId: string, project: string | null): Promise<{ from: string; to: string }> {
  const workspace = await openWorkspace(runtime);
  const projects = project === null ? workspace.config.projects : [projectFor(workspace, project)];
  const wired: { project: ProjectConfig; file: string }[] = [];
  for (const candidate of projects) {
    for (const file of candidate.policyFiles) {
      const raw = await runtime.fs.readText(path.join(workspace.repositoryRoot, file)).catch(() => '');
      if ((parseYaml(raw) as { id?: unknown } | null)?.id === packId) wired.push({ project: candidate, file });
    }
  }
  if (wired.length !== 1) throw badArgument(wired.length === 0 ? `Pack "${packId}" is not wired in ${project === null ? 'any project' : `project ${project}`}.` : `Pack "${packId}" is wired in several projects; pass --project <id>.`, 'rules revert');
  const { project: owner, file } = wired[0]!;
  if (path.posix.dirname(normalizeRelative(file)) !== LIVE_DIR) throw badArgument(`${file} is not under ${LIVE_DIR}/; "rules revert" only undoes "rules apply".`, 'rules revert');
  const sharing = workspace.config.projects.filter((other) => other.id !== owner.id && other.policyFiles.some((wiredFile) => normalizeRelative(wiredFile) === normalizeRelative(file)));
  if (sharing.length > 0) throw badArgument(`${file} is also wired in project ${sharing.map((other) => other.id).join(', ')}; reverting it would leave ${sharing.length === 1 ? 'that project' : 'those projects'} wired to a missing file.`, 'rules revert');
  const to = `${DRAFTS_DIR}/${path.posix.basename(file)}`;
  if (await runtime.fs.exists(path.join(workspace.repositoryRoot, to))) throw badArgument(`${to} already exists; move or remove that draft first.`, 'rules revert');
  await editPolicyFiles(runtime, workspace.configPath, owner.id, { remove: file });
  await runtime.fs.mkdirp(path.join(workspace.repositoryRoot, DRAFTS_DIR));
  await runtime.fs.rename(path.join(workspace.repositoryRoot, file), path.join(workspace.repositoryRoot, to));
  return { from: file, to };
}
