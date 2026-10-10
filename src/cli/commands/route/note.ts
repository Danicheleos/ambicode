import { taskSlugFor } from '#modules/review/bundle/review-name';
import { COMMAND_SPECS } from '#skills/plan/commands';
import { runCommandTail } from '#harness/engine/engine';
import { promotePlan, saveNote } from '#modules/evidence/notes';
import { AmbicodeError } from '#util/errors';
import { routeTools } from './route.ts';
import type { Runtime } from '#types/composition';
import { MAX_NOTE_BYTES, SAVE_KINDS, type SaveKind } from '#types/modules/evidence';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const NOTE_SAVE_OPTIONS = {
  values: ['task', 'kind', 'from', 'iteration'],
  flags: ['json'],
} as const;

export const NOTE_PROMOTE_OPTIONS = { values: ['task'], flags: ['json'] } as const;

function taskOf(command: string, args: ParsedArgs): string {
  const task = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (task === null) throw new AmbicodeError('bad-argument', `"${command}" needs --task <slug>: the requirement id, or a short kebab of the request.`, { field: 'task' });
  return task;
}

interface NoteSaveOutput {
  command: 'note save';
  task: string;
  kind: SaveKind;
  path: string;
  /** Printed to standard error as well: the 1 MiB ledger warning. */
  warnings?: string[];
  /** The next step of the task's route, printed by the command tail. */
  next?: string;
}

/**
 * The CLI names the file and stamps the time, because the model guessed both: saved notes read
 * `T12-00` and `T00-00` in headless runs, and a direct write cannot be told apart from a stray one.
 */
export async function runNoteSave(runtime: Runtime, args: ParsedArgs): Promise<NoteSaveOutput> {
  const kind = args.value('kind');
  if (kind === null || !(SAVE_KINDS as readonly string[]).includes(kind)) {
    throw new AmbicodeError('bad-argument', '"note save" needs --kind investigation, plan-draft or notes.', { field: 'kind' });
  }
  const task = taskOf('note save', args);
  const iteration = args.value('iteration');
  if (iteration !== null && !/^\d+$/.test(iteration)) throw new AmbicodeError('bad-argument', '--iteration takes an integer of at least 1.', { field: 'iteration' });

  const from = args.value('from');
  const body = from === null ? ((await runtime.stdin.read(MAX_NOTE_BYTES)) ?? null) : null;
  const tools = await routeTools(runtime, task);
  const { saved, binding } = await tools.engine.command(COMMAND_SPECS.noteSave, { task }, async ({ session, context, view, binding }) => ({
    binding,
    saved: await saveNote({ runtime, session, context }, { task, kind: kind as SaveKind, body, from, iteration: iteration === null ? null : Number(iteration), route: view?.routeId ?? null }),
  }));
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'note save', session: binding });
  const warnings = saved.warning === null ? [] : [saved.warning];
  return { command: 'note save', task, kind: kind as SaveKind, path: saved.path, ...(warnings.length === 0 ? {} : { warnings }), ...(next === null ? {} : { next: next.text }) };
}

export function renderNoteSave(output: NoteSaveOutput): string {
  return `Saved ${output.kind} note: ${output.path}${output.next === undefined ? '' : `\n\n${output.next}`}`;
}

interface NotePromoteOutput {
  command: 'note promote';
  task: string;
  outcome: 'promoted' | 'plan-already-promoted';
  path: string;
  promotedFrom: string;
  next?: string;
}

export async function runNotePromote(runtime: Runtime, args: ParsedArgs): Promise<NotePromoteOutput> {
  const task = taskOf('note promote', args);
  const tools = await routeTools(runtime, task);
  const { promoted, binding } = await tools.engine.command(COMMAND_SPECS.notePromote, { task }, async ({ session, context, binding }) => ({
    binding,
    promoted: await promotePlan({ runtime, session, context }, task),
  }));
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'note promote', session: binding });
  return { command: 'note promote', task, ...promoted, ...(next === null ? {} : { next: next.text }) };
}

export function renderNotePromote(output: NotePromoteOutput): string {
  const verb = { promoted: 'Promoted the accepted draft to', 'plan-already-promoted': 'Already promoted; nothing changed:' }[output.outcome];
  return `${verb} ${output.path}${output.next === undefined ? '' : `\n\n${output.next}`}`;
}

export const noteSaveCommand: CliCommand = {
  name: 'note save',
  summary: "Save a skill's note from standard input (--kind investigation|plan-draft|notes).",
  options: NOTE_SAVE_OPTIONS,
  run: async (runtime, args) => {
    const output = await runNoteSave(runtime, args);
    return { text: renderNoteSave(output), data: output, warnings: output.warnings ?? [] };
  },
};

export const notePromoteCommand: CliCommand = {
  name: 'note promote',
  summary: 'Turn the accepted plan draft into the plan (--task).',
  options: NOTE_PROMOTE_OPTIONS,
  run: async (runtime, args) => {
    const output = await runNotePromote(runtime, args);
    return { text: renderNotePromote(output), data: output };
  },
};
