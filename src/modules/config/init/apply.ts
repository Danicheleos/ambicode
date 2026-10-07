import path from 'node:path';
import { openRepository } from '#platform/git/open';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { CONFIG_FILE } from '#types/defaults';
import { runDoctor } from './doctor.ts';
import { contentHash } from '#util/hash';
import { lineDiff } from './init-choices.ts';
import { parseSets, setStrings } from './init-sets.ts';
import { loadConfigWithNotices } from '../load.ts';
import { DRAFT_FILE, buildProposal, configFileState, configUnparsable, planDraft, writeConfig } from './proposal.ts';
import { APPLY_OPTIONS, type ApplyDeps, type DoctorTable } from '#types/modules/config';
import type { FileSystem } from '#types/platform/ports';

export { writeConfig } from './proposal.ts';
export const PREVIOUS_DRAFT = 'draft-previous.yaml';

function initUnconfirmed(reason: string, detail?: string): AmbicodeError {
  return new AmbicodeError('init-unconfirmed', `init --apply needs the user's own answer to the init question (reason: ${reason}). Nothing was written.`, {
    details: [`reason: ${reason}`, ...(detail === undefined ? [] : [detail]), 'Release: answer the init question in /ambicode:init; if the draft changed, run route next --task <task> --answer init-apply=Adjust to be asked again.'],
  });
}

/** The newest `.bak-` copy of the config with exactly these bytes, as a repository-relative path. */
export async function backupOf(fs: FileSystem, repositoryRoot: string, raw: string): Promise<string | null> {
  const directory = path.join(repositoryRoot, path.dirname(CONFIG_FILE));
  const prefix = `${path.basename(CONFIG_FILE)}.bak-`;
  const names = (await fs.readdir(directory).catch(() => [])).filter((entry) => entry.isFile() && entry.name.startsWith(prefix)).map((entry) => entry.name).sort().reverse();
  for (const name of names) {
    if ((await fs.readText(path.join(directory, name)).catch(() => null)) === raw) return `${path.dirname(CONFIG_FILE)}/${name}`;
  }
  return null;
}

/** 09-G4's checks in order, nothing written before the last passes; then 09-G5's writes. */
export async function applyInit(deps: ApplyDeps, input: { task: string }): Promise<{
  configPath: string; created: boolean; changes: string[]; notices: string[]; gitignoreAdded: string[]; doctor: DoctorTable }> {
  const { runtime, session, context } = deps;
  if (session === null) {
    throw new AmbicodeError('session-unbound', `init --apply cannot tell which route it speaks for: task ${input.task} has no single live route.`, {
      details: ['Start the init route in /ambicode:init; init --apply runs inside it.'],
    });
  }
  const view = context === null ? null : await context.resolve(input.task, session);
  if (context === null || view === null || view.skill !== 'init') throw initUnconfirmed('no-init-route');
  await context.assertOwner(view);

  const consent = await context.consent(view, 'init-apply');
  if (consent.state === 'refused') throw initUnconfirmed(consent.reason);
  const source = consent.source as unknown as Record<string, unknown>;
  const fromHuman = (source['via'] === 'hook' && typeof source['instance'] === 'string') || (source['via'] === 'prompt' && source['trusted'] === true);
  if (!(APPLY_OPTIONS as readonly string[]).includes(String(source['answer'])) || source['unbound'] === true) throw initUnconfirmed('not-accepted');
  if (!fromHuman) throw initUnconfirmed('acting-needs-human');

  const window = await context.window(view, 'init-apply');
  const print = window.find((entry) => entry.kind === 'gate' && entry.id === source['instance']);
  const shown = (print?.['values'] ?? {}) as { set?: unknown; draft?: unknown };
  if (typeof shown.draft !== 'string' || !Array.isArray(shown.set)) throw initUnconfirmed('not-accepted');
  const pairs = parseSets(shown.set as string[]);

  const { repositoryRoot } = await openRepository(runtime);
  const file = await configFileState(runtime.fs, repositoryRoot);
  if (!file.parses) {
    const backup = await context.consent(view, 'config-unparsable');
    if (backup.state !== 'honoured' || (await backupOf(runtime.fs, repositoryRoot, file.raw!)) === null) throw configUnparsable();
  }

  const approved = await runtime.fs.readText(path.join(repositoryRoot, DRAFT_FILE)).catch(() => '');
  if (contentHash(approved) !== shown.draft) throw initUnconfirmed('draft-differs', `${DRAFT_FILE} is not the draft the answer was given to. Nothing was written.`);

  const proposal = await buildProposal(runtime, repositoryRoot, pairs, { task: input.task, regenerate: !file.parses });
  const fresh = (await planDraft(runtime.fs, proposal, pairs)).yaml;
  if (contentHash(fresh) !== shown.draft) {
    const dir = await resolveTaskDir(runtime, input.task);
    await runtime.fs.mkdirp(dir.steps);
    await runtime.fs.writeText(path.join(dir.steps, PREVIOUS_DRAFT), approved);
    await runtime.fs.writeText(path.join(repositoryRoot, DRAFT_FILE), fresh);
    throw initUnconfirmed('draft-changed', `Detection now differs from what you approved:\n${lineDiff(approved, fresh).slice(0, 40).join('\n')}`);
  }
  const bound = await context.consent(view, 'init-apply', { set: setStrings(pairs), draft: contentHash(fresh) });
  if (bound.state === 'refused') throw initUnconfirmed(bound.reason);
  const written = await writeConfig(runtime.fs, repositoryRoot, proposal, pairs, fresh);
  await runtime.fs.remove(path.join(repositoryRoot, DRAFT_FILE));
  const loaded = await loadConfigWithNotices(runtime.fs, repositoryRoot);
  const doctor = await runDoctor(runtime, repositoryRoot, loaded.config, { ...deps.doctor, buildIndex: true });
  const dir = await resolveTaskDir(runtime, input.task);
  await runtime.fs.mkdirp(dir.steps);
  await runtime.fs.writeText(path.join(dir.steps, 'doctor.md'), doctor.text);
  return { configPath: proposal.configPath, ...written, notices: [...proposal.notices, ...loaded.notices], doctor };
}
