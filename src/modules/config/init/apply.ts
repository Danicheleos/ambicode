import path from 'node:path';
import { openRepository } from '#platform/git/open';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { CONFIG_FILE } from '#types/defaults';
import { contentHash } from '#util/hash';
import { localTimestamp } from '#util/files';
import { runDoctor } from './doctor.ts';
import { loadConfigWithNotices } from '../load.ts';
import { DRAFT_FILE, writeGitignore } from './proposal.ts';
import { APPLY_OPTIONS, type ApplyDeps, type DoctorTable } from '#types/modules/config';

function initUnconfirmed(reason: string, detail?: string): AmbicodeError {
  return new AmbicodeError('init-unconfirmed', `init --apply needs the user's own answer to the init question (reason: ${reason}). Nothing was written.`, {
    details: [`reason: ${reason}`, ...(detail === undefined ? [] : [detail]), 'Release: answer the init question in /ambicode:init.'],
  });
}

/** The checks in order, nothing written before the last passes; an existing config is copied to `.bak-<time>` before it is replaced. */
export async function applyInit(deps: ApplyDeps, input: { task: string }): Promise<{
  configPath: string; created: boolean; backup: string | null; notices: string[]; gitignoreAdded: string[]; doctor: DoctorTable }> {
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
  const shown = (print?.['values'] ?? {}) as { draft?: unknown };
  if (typeof shown.draft !== 'string') throw initUnconfirmed('not-accepted');

  const { repositoryRoot } = await openRepository(runtime);
  const approved = await runtime.fs.readText(path.join(repositoryRoot, DRAFT_FILE)).catch(() => '');
  if (contentHash(approved) !== shown.draft) throw initUnconfirmed('draft-differs', `${DRAFT_FILE} is not the draft the answer was given to. Nothing was written.`);
  const bound = await context.consent(view, 'init-apply', { draft: shown.draft });
  if (bound.state === 'refused') throw initUnconfirmed(bound.reason);

  const configPath = path.join(repositoryRoot, CONFIG_FILE);
  const existing = await runtime.fs.readText(configPath).catch(() => null);
  const backup = existing === null ? null : `${CONFIG_FILE}.bak-${localTimestamp(runtime.clock.now())}`;
  if (existing !== null) await runtime.fs.createExclusive(path.join(repositoryRoot, backup!), existing);
  await runtime.fs.mkdirp(path.dirname(configPath));
  await runtime.fs.writeText(configPath, approved);
  const gitignoreAdded = await writeGitignore(runtime.fs, repositoryRoot);
  await runtime.fs.remove(path.join(repositoryRoot, DRAFT_FILE));
  const loaded = await loadConfigWithNotices(runtime.fs, repositoryRoot);
  const doctor = await runDoctor(runtime, repositoryRoot, loaded.config, deps.doctor);
  const dir = await resolveTaskDir(runtime, input.task);
  await runtime.fs.mkdirp(dir.steps);
  await runtime.fs.writeText(path.join(dir.steps, 'doctor.md'), doctor.text);
  return { configPath, created: existing === null, backup, notices: loaded.notices, gitignoreAdded, doctor };
}
