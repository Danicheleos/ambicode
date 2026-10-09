import { runFormat } from '#modules/checks/run/format';
import { COMMAND_SPECS } from '#skills/task/commands';
import { runCommandTail } from '#harness/engine/command-tail';
import { routeTools, taskOf } from '../route/route.ts';
import type { FormatEntry } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const FORMAT_OPTIONS = { values: ['task'], flags: ['json'], positionals: true } as const;

interface FormatOutput { command: 'format'; task: string; entries: FormatEntry[]; next?: string }

export async function runFormatCommand(runtime: Runtime, args: ParsedArgs): Promise<FormatOutput> {
  const task = taskOf('format', args);
  const tools = await routeTools(runtime, task);
  const { entries, binding } = await tools.engine.command(COMMAND_SPECS.format, { task }, async ({ session, context, binding }) => ({
    binding,
    entries: await runFormat({ runtime, session, context }, { task, paths: args.positionals }),
  }));
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'format', session: binding, produced: entries.map((entry) => entry.id) });
  return { command: 'format', task, entries, ...(next === null ? {} : { next: next.text }) };
}

export function renderFormat(output: FormatOutput): string {
  const lines = output.entries.map((entry) => {
    if (entry.outcome === 'unconfigured') return `format-unconfigured: ${entry.key} has no format command; nothing was formatted.`;
    if (entry.outcome === 'formatted') return `${entry.key}: formatted ${entry.files.length === 0 ? 'nothing changed' : entry.files.join(', ')}`;
    return `${entry.key}: not formatted (${entry.outcome}${entry.exit === null ? '' : `, exit ${entry.exit}`})`;
  });
  const text = lines.length === 0 ? 'format: no touched file to format, or a format run waits for the user.' : lines.join('\n');
  return output.next === undefined ? text : `${text}\n\n${output.next}`;
}

export const formatCommand: CliCommand = {
  name: 'format',
  summary: "Run each project's format command on the files this task touched.",
  options: FORMAT_OPTIONS,
  run: async (runtime, args) => {
    const output = await runFormatCommand(runtime, args);
    return { text: renderFormat(output), data: output };
  },
};
