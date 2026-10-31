import path from 'node:path';
import { AmbicodeError } from '#util/errors';
import { localTimestamp, UNIQUE_FILE_LIMIT, writeUniqueFile } from '#util/files';
import { contentHash } from '#util/hash';
import { ledgerSizeWarning } from '#platform/ledger/ledger';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveTaskDir } from './task/task-dir.ts';
import type { Runtime } from '#types/composition';
import { MAX_NOTE_BYTES, NOTE_KINDS, SAVE_KINDS, type LedgerEntry, type LockedLedger, type TaskDir, type NoteDeps, type NoteKind, type SaveKind } from '#types/modules/evidence';

interface SavedNote {
  task: string;
  kind: NoteKind;
  /** As the user reaches it from the session directory. */
  path: string;
  entry: LedgerEntry;
  warning: string | null;
}

const badArgument = (message: string, field: string): AmbicodeError => new AmbicodeError('bad-argument', message, { field });
const relativeTo = (dir: TaskDir, file: string): string => path.relative(dir.repositoryRoot, file).split(path.sep).join('/');
const shown = (dir: TaskDir, relative: string): string => (dir.where === '.' ? relative : `${dir.where}/${relative}`);

const notAccepted = (reason: string, why: string): AmbicodeError =>
  new AmbicodeError('plan-not-accepted', `The plan was not accepted: ${why}`, { details: [`reason: ${reason}`] });
const planMissing = (task: string): AmbicodeError =>
  new AmbicodeError('plan-draft-missing', `Task ${task} has no plan.md to accept.`, {
    details: [`Write the plan to .ambicode/tasks/${task}/plan.md and run route next to check it, then ask plan-accept again.`],
  });

async function writeNote(runtime: Runtime, dir: TaskDir, kind: NoteKind, text: string): Promise<string> {
  const { stem, stamped } = NOTE_KINDS[kind];
  if (!stamped) {
    const file = path.join(dir.root, `${stem}.md`);
    await runtime.fs.writeText(file, text);
    return file;
  }
  const file = await writeUniqueFile(runtime.fs, path.join(dir.root, `${stem}_${localTimestamp(runtime.clock.now())}`), '.md', text);
  if (file === null) throw badArgument(`${UNIQUE_FILE_LIMIT} notes of this kind already exist for this minute; wait and save again.`, 'task');
  return file;
}

export async function saveNote(
  deps: NoteDeps,
  input: { task: string; kind: SaveKind; body: string | null; route?: string | null },
): Promise<SavedNote> {
  const { runtime, session } = deps;
  const { task, kind } = input;
  if (!SAVE_KINDS.includes(kind)) throw badArgument(`A note is saved as ${SAVE_KINDS.join(', ')}; an accepted plan comes only from the plan route.`, 'kind');
  if (input.body === null || input.body.trim() === '') {
    throw badArgument(`"note save" reads the note from standard input, up to ${MAX_NOTE_BYTES} bytes; it got nothing usable.`, 'stdin');
  }

  const dir = await resolveTaskDir(runtime, task);
  const { body } = input;
  if (Buffer.byteLength(body) > MAX_NOTE_BYTES) throw badArgument(`The note is over ${MAX_NOTE_BYTES} bytes.`, 'stdin');
  const text = `${body.trimEnd()}\n`;

  const work = async (ledger: LockedLedger): Promise<SavedNote> => {
    const route = input.route ?? null;
    const relative = relativeTo(dir, await writeNote(runtime, dir, kind, text));
    const entry = await ledger.append({
      kind: 'note',
      note: kind,
      path: relative,
      contentHash: contentHash(text),
      ...(route === null ? {} : { route }),
    });
    return { task, kind, path: shown(dir, relative), entry, warning: await ledgerSizeWarning(runtime.fs, dir.root) };
  };
  return deps.ledger !== undefined ? work(deps.ledger) : withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), work);
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const STATUS_LINE = /^status:[ \t]*(\S+)[ \t]*$/m;

/** The `status:` of a plan file's frontmatter, or null when it has none. */
export const planStatusOf = (text: string): string | null => STATUS_LINE.exec(FRONTMATTER.exec(text)?.[1] ?? '')?.[1] ?? null;

function withStatus(text: string, status: string): string {
  const front = FRONTMATTER.exec(text);
  if (front === null) return `---\nstatus: ${status}\n---\n\n${text}`;
  const inner = STATUS_LINE.test(front[1]!) ? front[1]!.replace(STATUS_LINE, `status: ${status}`) : `${front[1]}\nstatus: ${status}`;
  return `---\n${inner}\n---\n${text.slice(front[0].length)}`;
}

/**
 * The predicate of 01-contracts §6: an Accept the user gave turns the plan file, as it is now, into the accepted plan
 * (`status: accepted`) and records its hash. The file is not bound to what the gate printed, so the user's own edits stand.
 */
export async function acceptPlan(deps: NoteDeps, task: string, anchorsBad: number, policyMissing = 0): Promise<void> {
  const { runtime, session, context } = deps;
  if (session === null) throw notAccepted('no-plan-route', `task ${task} has no live plan route.`);
  if (context === null) throw new AmbicodeError('internal', 'The plan acceptance has no route context to evaluate acceptance against.');
  const dir = await resolveTaskDir(runtime, task);

  const work = async (ledger: LockedLedger): Promise<void> => {
    const view = await context.open(task, session);
    if (view === null || view.skill !== 'plan') throw notAccepted('no-plan-route', `task ${task} has no plan route for this session.`);
    const consent = await context.consent(view, 'plan-accept');
    if (consent.state === 'refused') throw notAccepted(consent.reason, `plan-accept is not an honoured Accept (${consent.reason}).`);
    const { source } = consent;
    const honoured = source.answer === 'Accept' && source.unbound !== true && ((source.via === 'hook' && source.instance !== null) || source.via === 'prompt');
    if (!honoured) throw notAccepted('not-accepted', 'the latest plan-accept answer is not an Accept given by the user.');

    const text = await runtime.fs.readText(dir.plan).catch(() => null);
    if (text === null || text.trim() === '') throw planMissing(task);
    const accepted = withStatus(text, 'accepted');
    await runtime.fs.writeText(dir.plan, accepted);
    await ledger.append({ kind: 'note', note: 'plan', path: relativeTo(dir, dir.plan), contentHash: contentHash(accepted), anchorsBad, ...(policyMissing > 0 ? { policyMissing } : {}), route: view.routeId });
  };
  return deps.ledger !== undefined ? work(deps.ledger) : withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), work);
}
