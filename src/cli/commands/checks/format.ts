import { runFormat } from '#modules/checks/run/format';
import { ledgerRouteContext } from '#harness/engine/context';
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
  const session = tools.binding.state === 'bound' ? tools.binding.session : null;
  const entries = await runFormat({ runtime, session, context: ledgerRouteContext({ runtime, routes: tools.routes }), routes: tools.routes }, { task, paths: args.positionals });
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'format', session: tools.binding, produced: entries.map((entry) => entry.id) });
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
  options: FORMAT_OPTIONS,
  run: async (runtime, args) => {
    const output = await runFormatCommand(runtime, args);
    return { text: renderFormat(output), data: output };
  },
};
