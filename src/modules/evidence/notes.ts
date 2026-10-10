import path from 'node:path';
import { ownerOf } from '#modules/evidence/ownership';
import { AmbicodeError } from '#util/errors';
import { localTimestamp, UNIQUE_FILE_LIMIT, writeUniqueFile } from '#util/files';
import { contentHash, hash12 } from '#util/hash';
import { ledgerSizeWarning } from '#platform/ledger/ledger';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveFrom, resolveTaskDir } from './task/task-dir.ts';
import type { Runtime } from '#types/composition';
import { MAX_NOTE_BYTES, NOTE_KINDS, SAVE_KINDS, type LedgerEntry, type LockedLedger, type TaskDir, type NoteDeps, type NoteKind, type SaveKind } from '#types/modules/evidence';

/** The label line the note writer stamps on a note: not the author's words. */
export const NOTE_LABELS: readonly string[] = Object.values(NOTE_KINDS).map((kind) => kind.label);

interface SavedNote {
  task: string;
  kind: NoteKind;
  /** As the user reaches it from the session directory. */
  path: string;
  entry: LedgerEntry;
  warning: string | null;
}

const ITERATION_HEADER = /^\s*<!-- ambicode iteration: \d+ done -->[^\n]*\n?/;

const badArgument = (message: string, field: string): AmbicodeError => new AmbicodeError('bad-argument', message, { field });
const relativeTo = (dir: TaskDir, file: string): string => path.relative(dir.repositoryRoot, file).split(path.sep).join('/');
const shown = (dir: TaskDir, relative: string): string => (dir.where === '.' ? relative : `${dir.where}/${relative}`);

const unreadable = (task: string, reason: string): AmbicodeError =>
  new AmbicodeError('ledger-unreadable', `The ledger of task ${task} cannot be read: ${reason}. Nothing was written.`, {
    details: [`Continue under a new task: --task ${task}-2.`],
  });
const noRouteSession = (task: string): AmbicodeError =>
  new AmbicodeError('session-unbound', `Task ${task}: this call has no route owner, so the CLI cannot tell whose plan route it speaks for.`, {
    details: ['Pass --task <slug> of a task with exactly one live route.'],
  });
const notAccepted = (reason: string, why: string): AmbicodeError =>
  new AmbicodeError('plan-not-accepted', `The plan was not promoted: ${why}`, { details: [`reason: ${reason}`] });
const draftMissing = (task: string): AmbicodeError =>
  new AmbicodeError('plan-draft-missing', `Task ${task} has no plan draft to promote.`, {
    details: [`Write the plan to steps/plan-body.md and run route next to save the draft, then ask plan-accept again.`],
  });

/** The route a `plan-draft` is saved for, or `null` for a routeless save; every other state refuses before anything is written. */
export async function owningRoute(ledger: LockedLedger, session: string | null, task: string): Promise<string | null> {
  const read = await ledger.read();
  if (read.state === 'unreadable') throw unreadable(task, read.reason);
  const owner = ownerOf(read.state === 'ok' ? read.entries : [], task);
  if (owner.state === 'none') return null;
  if (owner.state === 'unknown') throw unreadable(task, owner.reason);
  if (session === null) throw noRouteSession(task);
  if (session === owner.session) return owner.routeId;
  if (owner.takenOver.includes(session)) {
    throw new AmbicodeError('route-taken-over', `The plan route of task ${task} now belongs to session ${owner.session}; this session no longer writes its files.`);
  }
  throw new AmbicodeError('route-busy', `Task ${task} has a live plan route owned by session ${owner.session}.`, {
    details: ['Adopt it (--adopt), restart it (--fresh) or continue under another task: --task <slug>-2.'],
  });
}

function render(kind: NoteKind, body: string, iteration: number | null): string {
  const { label } = NOTE_KINDS[kind];
  const content = iteration === null ? body : body.replace(ITERATION_HEADER, '');
  const marker = label.slice(0, label.indexOf('**', 2) + 2);
  const text = `${content.trimStart().startsWith(marker) ? '' : `${label}\n\n`}${content.trimEnd()}\n`;
  return iteration === null ? text : `<!-- ambicode iteration: ${iteration} done -->\n${text}`;
}

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
  input: { task: string; kind: SaveKind; body: string | null; from: string | null; iteration: number | null; route?: string | null },
): Promise<SavedNote> {
  const { runtime, session } = deps;
  const { task, kind, from, iteration } = input;
  if (!SAVE_KINDS.includes(kind)) throw badArgument(`A note is saved as ${SAVE_KINDS.join(', ')}; an accepted plan comes only from "note promote".`, 'kind');
  if (iteration !== null && (kind !== 'notes' || !Number.isInteger(iteration) || iteration < 1)) {
    throw badArgument('--iteration takes an integer of at least 1 and goes with --kind notes only.', 'iteration');
  }
  if (from !== null && kind !== 'plan-draft') throw badArgument('--from goes with --kind plan-draft only.', 'from');
  if (from === null && (input.body === null || input.body.trim() === '')) {
    throw badArgument(`"note save" reads the note from standard input, up to ${MAX_NOTE_BYTES} bytes; it got nothing usable.`, 'stdin');
  }

  const dir = await resolveTaskDir(runtime, task);
  const body = from === null ? input.body! : await runtime.fs.readText(await resolveFrom(runtime.fs, dir, from));
  if (Buffer.byteLength(body) > MAX_NOTE_BYTES) throw badArgument(`The note is over ${MAX_NOTE_BYTES} bytes.`, from === null ? 'stdin' : 'from');
  if (body.trim() === '') throw badArgument(`${from} is empty.`, 'from');
  const text = render(kind, body, iteration);

  const work = async (ledger: LockedLedger): Promise<SavedNote> => {
    const route = kind === 'plan-draft' ? await owningRoute(ledger, session, task) : (input.route ?? null);
    await runtime.fs.mkdirp(dir.root);
    const relative = relativeTo(dir, await writeNote(runtime, dir, kind, text));
    const entry = await ledger.append({
      kind: 'note',
      note: kind,
      path: relative,
      contentHash: contentHash(text),
      ...(iteration === null ? {} : { iteration }),
      ...(from === null ? {} : { from: path.relative(dir.root, dir.planBody).split(path.sep).join('/') }),
      ...(route === null ? {} : { route }),
    });
    return { task, kind, path: shown(dir, relative), entry, warning: await ledgerSizeWarning(runtime.fs, dir.root) };
  };
  return deps.ledger !== undefined ? work(deps.ledger) : withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session ?? runtime.ids.writerId(), work);
}

type PlanNote = LedgerEntry & { note: string; path: string; contentHash: string };
const isNote = (entry: LedgerEntry, note: string): entry is PlanNote =>
  entry.kind === 'note' && entry.note === note && typeof entry.path === 'string' && typeof entry.contentHash === 'string';

/** The predicate of 01-contracts §6: the draft the human accepted, and only that draft, becomes the plan. */
export async function promotePlan(
  deps: NoteDeps,
  task: string,
): Promise<{ outcome: 'promoted' | 'plan-already-promoted' | 'repaired'; path: string; promotedFrom: string }> {
  const { runtime, session, context } = deps;
  if (session === null) throw noRouteSession(task);
  if (context === null) throw new AmbicodeError('internal', 'note promote has no route context to evaluate acceptance against.');
  const dir = await resolveTaskDir(runtime, task);

  const work = async (ledger: LockedLedger) => {
    const view = await context.resolve(task, session);
    if (view === null || view.skill !== 'plan') throw notAccepted('no-plan-route', `task ${task} has no plan route for this session.`);
    await context.assertOwner(view);
    const draft = (await context.window(view, 'plan-check')).filter((entry): entry is PlanNote => isNote(entry, 'plan-draft')).at(-1);
    if (draft === undefined) throw draftMissing(task);

    const consent = await context.consent(view, 'plan-accept');
    if (consent.state === 'refused') throw notAccepted(consent.reason, `plan-accept is not an honoured Accept (${consent.reason}).`);
    const { source, object } = consent;
    const honoured = source.answer === 'Accept' && source.unbound !== true && ((source.via === 'hook' && source.instance !== null) || source.via === 'prompt');
    if (!honoured) throw notAccepted('not-accepted', 'the latest plan-accept answer is not an Accept given by the user.');
    const same =
      object !== null && object.kind === 'note' && object.value === 'plan-draft' && object.id === draft.id && object.path === draft.path && object.contentHash === draft.contentHash;
    if (!same) {
      const accepted = object === null ? 'no draft' : `${object.path} ${hash12(object.contentHash)}`;
      throw notAccepted('object-changed', `the accepted draft is ${accepted}; the latest is ${draft.path} ${hash12(draft.contentHash)}; ask plan-accept again.`);
    }

    const read = await ledger.read();
    if (read.state === 'unreadable') throw unreadable(task, read.reason);
    const promoted = (read.state === 'ok' ? read.entries : []).find((entry) => isNote(entry, 'plan') && entry.promotedFrom === draft.id) as PlanNote | undefined;
    if (promoted !== undefined) return { outcome: 'plan-already-promoted' as const, path: shown(dir, promoted.path), promotedFrom: draft.id };

    await context.assertOwner(view);
    const draftName = path.basename(draft.path);
    const planName = draftName.replace(/^plan-draft_/, 'plan_');
    if (planName === draftName) throw new AmbicodeError('internal', `${draft.path} is not named plan-draft_<timestamp>.md.`);
    const [draftFile, planFile] = [path.join(dir.root, draftName), path.join(dir.root, planName)];
    const bytesMatch = async (file: string): Promise<boolean> => contentHash(await runtime.fs.readBytes(file)) === draft.contentHash;
    let outcome: 'promoted' | 'repaired';
    if (await runtime.fs.exists(draftFile)) {
      if (!(await bytesMatch(draftFile))) throw notAccepted('object-changed', `${draft.path} no longer has the bytes that were accepted.`);
      await runtime.fs.rename(draftFile, planFile);
      outcome = 'promoted';
    } else if (await runtime.fs.exists(planFile)) {
      // A crash between the rename and the entry: record what the rename made, rename nothing.
      if (!(await bytesMatch(planFile))) throw notAccepted('object-changed', `${planName} does not have the bytes that were accepted.`);
      outcome = 'repaired';
    } else {
      throw draftMissing(task);
    }
    const relative = relativeTo(dir, planFile);
    await ledger.append({ kind: 'note', note: 'plan', path: relative, contentHash: draft.contentHash, promotedFrom: draft.id, route: view.routeId });
    return { outcome, path: shown(dir, relative), promotedFrom: draft.id };
  };
  return deps.ledger !== undefined ? work(deps.ledger) : withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session, work);
}
