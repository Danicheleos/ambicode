import { Activity } from '#types/primitives';
import { AmbicodeError } from '#util/errors';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';
import { parseArgs } from '#util/args';
import { renderMessage, runRouteStart } from '../route/route.ts';
import { PREPARE_OPTIONS, ROUTE_START_OPTIONS } from '#types/cli';

export const PREPARE_DEPRECATED = 'prepare-deprecated: use route start <skill>';

/** `prepare --activity X` starts route X as an untrusted CLI call; `--evidence` has no route meaning. */
export function prepareAsRouteStart(args: ParsedArgs, activity: Activity = 'investigate'): { argv: string[]; notices: string[] } {
  const request = args.value('task-open') ?? args.all('term').join(' ');
  const text = [request, ...args.positionals].filter((part) => part !== '').join(' ');
  const project = args.value('project');
  const argv = [activity, ...(text === '' ? [] : [text]), ...args.all('requirement').flatMap((url) => ['--requirement', url]), ...(project === null ? [] : ['--project', project])];
  const notices = [PREPARE_DEPRECATED];
  if (args.value('evidence') !== null) notices.push('prepare-deprecated: --evidence is ignored; the route asks for the requirement itself.');
  return { argv, notices };
}

function requireActivity(value: string | null): Activity {
  if (value === null) {
    throw new AmbicodeError('bad-argument', '"prepare" needs --activity <activity>.', {
      field: '--activity',
      details: [`Activities: ${Activity.options.join(', ')}.`],
    });
  }
  const parsed = Activity.safeParse(value);
  if (!parsed.success) {
    throw new AmbicodeError('bad-argument', `Unknown activity "${value}".`, {
      field: '--activity',
      details: [`Activities: ${Activity.options.join(', ')}.`],
    });
  }
  return parsed.data;
}

export const prepareCommand: CliCommand = {
  name: 'prepare',
  options: PREPARE_OPTIONS,
  run: async (runtime, args) => {
    const activity = requireActivity(args.value('activity'));
    const { argv, notices } = prepareAsRouteStart(args, activity);
    for (const notice of notices) process.stderr.write(`${notice}\n`);
    const output = await runRouteStart(runtime, parseArgs('route start', argv, ROUTE_START_OPTIONS));
    return { text: renderMessage(output), data: output };
  },
};
