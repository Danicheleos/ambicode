import type { Runtime } from '../../composition/root.ts';
import { taskSlugFor } from '../../review/review-name.ts';
import { listNotes, MAX_NOTE_BYTES, promotePlan, saveNote, type NoteKind, type NoteRow } from '../../task/notes.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';

export const NOTE_SAVE_OPTIONS = {
  values: ['task', 'kind', 'from', 'iteration'],
  flags: ['json'],
} as const;
export const NOTE_PROMOTE_OPTIONS = { values: ['task'], flags: ['json'] } as const;
export const NOTE_LIST_OPTIONS = { values: ['task'], flags: ['json'] } as const;

const SAVE_KINDS: readonly string[] = ['investigation', 'plan-draft', 'notes', 'plan'];

// Session transport is step 03's: until it lands the CLI binds no session and has no route context (02-D2).
const unbound = (runtime: Runtime) => ({ runtime, session: null, context: null });

function taskOf(command: string, args: ParsedArgs): string {
  const task = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (task === null) throw new AmbicodeError('bad-argument', `"${command}" needs --task <slug>: the requirement id, or a short kebab of the request.`, { field: 'task' });
  return task;
}

export interface NoteSaveOutput {
  command: 'note save';
  task: string;
  kind: NoteKind;
  path: string;
  /** Printed to standard error as well: the 1 MiB ledger warning, the `--kind plan` deprecation. */
  warnings?: string[];
}

/**
 * The CLI names the file and stamps the time, because the model guessed both: saved notes read
 * `T12-00` and `T00-00` in headless runs, and a direct write cannot be told apart from a stray one.
 */
export async function runNoteSave(runtime: Runtime, args: ParsedArgs): Promise<NoteSaveOutput> {
  const kind = args.value('kind');
  if (kind === null || !SAVE_KINDS.includes(kind)) {
    throw new AmbicodeError('bad-argument', '"note save" needs --kind investigation, plan-draft or notes.', { field: 'kind' });
  }
  const task = taskOf('note save', args);
  const iteration = args.value('iteration');
  if (iteration !== null && !/^\d+$/.test(iteration)) throw new AmbicodeError('bad-argument', '--iteration takes an integer of at least 1.', { field: 'iteration' });

  const from = args.value('from');
  const body = from === null ? ((await runtime.stdin.read(MAX_NOTE_BYTES)) ?? null) : null;
  const saved = await saveNote(unbound(runtime), { task, kind: kind as NoteKind, body, from, iteration: iteration === null ? null : Number(iteration) });
  const warnings = [
    ...(kind === 'plan' ? ['"--kind plan" is deprecated: a plan is saved as --kind plan-draft and promoted with "note promote".'] : []),
    ...(saved.warning === null ? [] : [saved.warning]),
  ];
  return { command: 'note save', task, kind: kind as NoteKind, path: saved.path, ...(warnings.length === 0 ? {} : { warnings }) };
}

export function renderNoteSave(output: NoteSaveOutput): string {
  return `Saved ${output.kind} note: ${output.path}`;
}

export interface NotePromoteOutput {
  command: 'note promote';
  task: string;
  outcome: 'promoted' | 'plan-already-promoted' | 'repaired';
  path: string;
  promotedFrom: string;
}

export async function runNotePromote(runtime: Runtime, args: ParsedArgs): Promise<NotePromoteOutput> {
  const task = taskOf('note promote', args);
  return { command: 'note promote', task, ...(await promotePlan(unbound(runtime), task)) };
}

export function renderNotePromote(output: NotePromoteOutput): string {
  const verb = { promoted: 'Promoted the accepted draft to', 'plan-already-promoted': 'Already promoted; nothing changed:', repaired: 'Recorded the missing entry for' }[output.outcome];
  return `${verb} ${output.path}`;
}

export interface NoteListOutput {
  command: 'note list';
  task: string;
  notes: NoteRow[];
}

export async function runNoteList(runtime: Runtime, args: ParsedArgs): Promise<NoteListOutput> {
  const task = taskOf('note list', args);
  return { command: 'note list', task, notes: await listNotes(runtime, task) };
}

export function renderNoteList(output: NoteListOutput): string {
  if (output.notes.length === 0) return `No notes are recorded for task ${output.task}.`;
  return output.notes
    .map((row) => [row.id, row.note, row.path, row.at, row.heading, row.iteration === null ? null : `iteration ${row.iteration}`, row.link].filter((part) => part !== null).join('  '))
    .join('\n');
}
