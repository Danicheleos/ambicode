import { COMMAND_SPECS } from '#skills/plan/commands';
import { runCommandTail } from '#harness/engine/engine';
import { saveNote } from '#modules/evidence/notes';
import { AmbicodeError } from '#util/errors';
import { delegatedAt, routeTools, taskOf } from './route.ts';
import type { Runtime } from '#types/composition';
import { SAVE_KINDS, type SaveKind } from '#types/modules/evidence';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const NOTE_SAVE_OPTIONS = {
  values: ['task', 'kind'],
  flags: ['json'],
} as const;

interface NoteSaveOutput {
  command: 'note save';
  task: string;
  kind: SaveKind;
  path: string;
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
    throw new AmbicodeError('bad-argument', `"note save" needs --kind ${SAVE_KINDS.join(', ')}.`, { field: 'kind' });
  }
  const task = taskOf('note save', args);
  const body = (await runtime.stdin.read()) ?? null;
  const tools = await routeTools(runtime);
  const { saved, delegated } = await tools.engine.command(COMMAND_SPECS.noteSave, { task }, async ({ session, context, view }) => ({
    delegated: delegatedAt(tools, view, await context.entries(task)),
    saved: await saveNote({ runtime, session, context }, { task, kind: kind as SaveKind, body, route: view?.routeId ?? null }),
  }));
  // The implementer saves the closing report while its step is in flight: the hooks hand main the pointer and close the route, so this save does not advance it.
  const next = delegated ? null : await runCommandTail({ engine: tools.engine }, { task, cause: 'note save' });
  return { command: 'note save', task, kind: kind as SaveKind, path: saved.path, ...(next === null ? {} : { next: next.text }) };
}

function renderNoteSave(output: NoteSaveOutput): string {
  return `Saved ${output.kind} note: ${output.path}${output.next === undefined ? '' : `\n\n${output.next}`}`;
}

export const noteSaveCommand: CliCommand = {
  name: 'note save',
  summary: "Save a skill's note from stdin (--kind investigation|notes|result|report).",
  options: NOTE_SAVE_OPTIONS,
  run: async (runtime, args) => {
    const output = await runNoteSave(runtime, args);
    return { text: renderNoteSave(output), data: output };
  },
};
