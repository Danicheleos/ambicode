import path from 'node:path';
import { openRepository, type Runtime } from '../../composition/root.ts';
import { findSessionRepository } from '../../composition/session-repository.ts';
import { TASKS_DIR } from '../../config/defaults.ts';
import { localTimestamp, taskSlugFor } from '../../review/review-name.ts';
import { appendLedger } from '../../task/ledger.ts';
import { AmbicodeError } from '../../util/errors.ts';
import { contentHash } from '../../util/hash.ts';
import type { ParsedArgs } from '../args.ts';

export const NOTE_SAVE_OPTIONS = {
  values: ['task', 'kind'],
  flags: ['json'],
} as const;

const MAX_NOTE_BYTES = 262_144;
const COLLISION_LIMIT = 9;

const KINDS = {
  investigation: { stem: 'investigation', stamped: true, label: '**investigation note** — not an accepted plan, not a task, not a decision record.' },
  plan: { stem: 'plan', stamped: true, label: '**plan** — accepted' },
  notes: { stem: 'notes', stamped: false, label: '**task note**' },
} as const;

type NoteKind = keyof typeof KINDS;

export interface NoteSaveOutput {
  command: 'note save';
  task: string;
  kind: NoteKind;
  path: string;
}

/**
 * The CLI names the file and stamps the time, because the model guessed both: saved notes read
 * `T12-00` and `T00-00` in headless runs, and a direct write cannot be told apart from a stray one.
 */
export async function runNoteSave(runtime: Runtime, args: ParsedArgs): Promise<NoteSaveOutput> {
  const kind = args.value('kind');
  if (kind === null || !Object.hasOwn(KINDS, kind)) {
    throw new AmbicodeError('bad-argument', '"note save" needs --kind investigation, plan or notes.', { field: 'kind' });
  }
  const spec = KINDS[kind as NoteKind];
  const task = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (task === null) {
    throw new AmbicodeError('bad-argument', '"note save" needs --task <slug>: the requirement id, or a short kebab of the request.', { field: 'task' });
  }

  const body = (await runtime.stdin.read(MAX_NOTE_BYTES)) ?? null;
  if (body === null || body.trim() === '') {
    throw new AmbicodeError('bad-argument', `"note save" reads the note from standard input, up to ${MAX_NOTE_BYTES} bytes; it got nothing usable.`, { field: 'stdin' });
  }

  // The hook prepares for the configured repository below the session directory; the note must land there too.
  const found = await findSessionRepository(runtime, runtime.cwd);
  const { repositoryRoot, where } = typeof found === 'string' ? { ...(await openRepository(runtime)), where: '.' } : found;
  const directory = path.join(repositoryRoot, TASKS_DIR, task);
  await runtime.fs.mkdirp(directory);

  const marker = spec.label.slice(0, spec.label.indexOf('**', 2) + 2);
  const text = `${body.trimStart().startsWith(marker) ? '' : `${spec.label}\n\n`}${body.trimEnd()}\n`;

  let file = path.join(directory, spec.stamped ? `${spec.stem}_${localTimestamp(runtime.clock.now())}.md` : `${spec.stem}.md`);
  if (!spec.stamped) {
    await runtime.fs.writeText(file, text);
  } else {
    const base = file.slice(0, -'.md'.length);
    let attempt = 1;
    while (!(await runtime.fs.createExclusive(file, text))) {
      attempt += 1;
      if (attempt > COLLISION_LIMIT) {
        throw new AmbicodeError('bad-argument', `${COLLISION_LIMIT} notes of this kind already exist for this minute; wait and save again.`, { field: 'task' });
      }
      file = `${base}-${attempt}.md`;
    }
  }
  const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
  await appendLedger(runtime.fs, directory, runtime.clock.now(), { kind: 'note', note: kind, path: relative, contentHash: contentHash(text) });
  return { command: 'note save', task, kind: kind as NoteKind, path: where === '.' ? relative : `${where}/${relative}` };
}

export function renderNoteSave(output: NoteSaveOutput): string {
  return `Saved ${output.kind} note: ${output.path}`;
}
