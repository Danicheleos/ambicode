import path from 'node:path';
import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { openWorkspace } from '#modules/config/workspace';
import type { ProjectConfig, ApplyDeps } from '#types/modules/config';
import { refOf } from '#modules/evidence/ledger-chain';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { blockingProblem, checkDrafts } from './drafts.ts';
import type { DraftsCheck } from '#types/modules/policy';

const LIVE_DIR = '.ambicode/policies';

const unconfirmed = (reason: string): AmbicodeError =>
  new AmbicodeError('rules-apply-unconfirmed', `rules apply needs the user's own "Apply all" answer to the rules table (reason: ${reason}). Nothing was written.`, {
    details: [`reason: ${reason}`, 'Release: answer the rules-table gate in /ambicode:rules; the default is to apply nothing.'],
  });

/** Adds `policyFiles` entries through the document API so every comment and other value stays. */
async function addPolicyFile(fs: { readText(p: string): Promise<string>; writeText(p: string, t: string): Promise<void> }, configPath: string, projectId: string, file: string): Promise<void> {
  const document = parseDocument(await fs.readText(configPath));
  const projects = document.get('projects');
  const index = isSeq(projects) ? projects.items.findIndex((item) => isMap(item) && item.get('id') === projectId) : -1;
  if (index < 0) throw new AmbicodeError('unknown-project', `No project "${projectId}" is configured.`);
  const files = document.getIn(['projects', index, 'policyFiles']);
  if (!(isSeq(files) && files.items.some((item) => isScalar(item) && item.value === file))) document.addIn(['projects', index, 'policyFiles'], file);
  await fs.writeText(configPath, document.toString({ lineWidth: 0 }));
}

export async function applyRules(deps: ApplyDeps, input: { task: string; project: string | null }) {
  const { runtime, session, context } = deps;
  if (session === null) throw new AmbicodeError('session-unbound', `rules apply cannot tell which route it speaks for: task ${input.task} has no single live route.`, { details: ['Start the rules route in /ambicode:rules; rules apply runs inside it.'] });
  const view = context === null ? null : await context.resolve(input.task, session);
  if (context === null || view === null || view.skill !== 'rules') throw unconfirmed('no-rules-route');
  await context.assertOwner(view);
  const consent = await context.consent(view, 'rules-table');
  if (consent.state === 'refused') throw unconfirmed(consent.reason);
  const source = consent.source as unknown as Record<string, unknown>;
  if (source['answer'] !== 'Apply all' || source['unbound'] === true) throw unconfirmed('not-accepted');
  if (!((source['via'] === 'hook' && typeof source['instance'] === 'string') || (source['via'] === 'prompt' && source['trusted'] === true))) throw unconfirmed('acting-needs-human');

  const latest = (await context.window(view, 'draft')).findLast((entry) => entry.kind === 'policy' && entry['stage'] === 'drafts');
  const ref = latest === undefined ? null : refOf(latest, 'policy', 'drafts');
  if (ref === null || consent.object === null || !(['kind', 'value', 'id', 'path', 'contentHash'] as const).every((field) => consent.object![field] === ref[field])) throw unconfirmed('object-changed');

  const workspace = await openWorkspace(runtime);
  const projects = workspace.config.projects;
  const project: ProjectConfig | undefined = input.project === null ? (projects.length === 1 ? projects[0] : undefined) : projects.find((candidate) => candidate.id === input.project);
  if (project === undefined) throw new AmbicodeError('bad-argument', input.project === null ? `This repository configures ${projects.length} projects; pass --project <id>.` : `No project "${input.project}" is configured.`, { field: '--project' });
  const dir = await resolveTaskDir(runtime, input.task);
  const verify = async (): Promise<DraftsCheck> => {
    const check = await checkDrafts(runtime, workspace, { project: project.id });
    if (check.aggregateHash !== ref.contentHash) throw unconfirmed('object-changed');
    return check;
  };
  const check = await verify();

  const root = workspace.repositoryRoot;
  const skipped: { file: string; reason: string }[] = [];
  const plan: { id: string; draft: string; live: string; text: string; rules: number }[] = [];
  for (const file of check.files) {
    const blocking = blockingProblem(check, root, file.path);
    if (file.packId === null || blocking !== undefined) { skipped.push({ file: file.path, reason: blocking?.code ?? 'pack-invalid' }); continue; }
    const text = await runtime.fs.readText(path.join(root, file.path));
    const rules = parseDocument(text).get('rules');
    const count = isSeq(rules) ? rules.items.length : 0;
    if (count === 0) { skipped.push({ file: file.path, reason: 'no rules' }); continue; }
    plan.push({ id: file.packId, draft: file.path, live: `${LIVE_DIR}/${path.posix.basename(file.path)}`, text, rules: count });
  }
  for (const pack of plan) {
    if (await runtime.fs.exists(path.join(root, pack.live))) throw new AmbicodeError('bad-argument', `${pack.live} already exists; a live pack is never overwritten. Rename the draft or remove the live pack first.`, { field: 'rules apply' });
  }

  return withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session, async (ledger) => {
    await context.assertOwner(view);
    await verify();
    for (const pack of plan) {
      await runtime.fs.writeText(path.join(root, pack.live), pack.text);
      await runtime.fs.remove(path.join(root, pack.draft));
      await addPolicyFile(runtime.fs, workspace.configPath, project.id, pack.live);
    }
    const packs = plan.map(({ id, live, rules }) => ({ id, path: live, rules }));
    await ledger.append({ kind: 'policy', route: view.routeId, stage: 'apply', packs });
    const table = [
      '| pack | live file | rules |',
      '|---|---|---|',
      ...packs.map((pack) => `| ${pack.id} | ${pack.path} | ${pack.rules} |`),
      ...skipped.map((entry) => `skipped: ${entry.file} (${entry.reason})`),
    ].join('\n');
    const text = `${table}\n<!-- ambicode rules ${contentHash(table)} -->\n`;
    await runtime.fs.mkdirp(dir.steps);
    await runtime.fs.writeText(path.join(dir.steps, 'rules-apply.md'), text);
    return { packs, skipped, text };
  });
}
