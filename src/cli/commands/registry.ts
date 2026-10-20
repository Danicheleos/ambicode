import type { Runtime } from '#types/composition';
import { configValidateCommand } from './config/validate.ts';
import { configPacksCommand } from './config/packs.ts';
import { initRecordCommand } from './init/record.ts';
import { contextListCommand, contextTreeCommand, contextWriteCommand } from './context/context.ts';
import { rulesApplyCommand } from './policy/rules.ts';
import { checkCommand } from './checks/check.ts';
import { policyCheckCommand } from './policy/policy-check.ts';
import { noteSaveCommand } from './route/note.ts';
import { reportCommand } from './route/report.ts';
import { mapCommand, refsCommand } from './search/search.ts';
import { requirementsNormalizeCommand } from './requirements/requirements.ts';
import { routeNextCommand, routeStartCommand, routeStopCommand } from './route/route.ts';
import { reviewCommand } from './review/review.ts';
import type { CliCommand } from '../types/cli.ts';

const VERSION_OPTIONS = { flags: ['json'] } as const;

const versionCommand: CliCommand = {
  name: 'version',
  summary: 'Print the helper and git versions.',
  options: VERSION_OPTIONS,
  run: async (runtime) => {
    const output = await versionOutput(runtime);
    return { text: `${output.plugin}\n${output.git}\n${output.node}`, data: output };
  },
};

export const COMMANDS: ReadonlyMap<string, CliCommand> = new Map([
  configValidateCommand, configPacksCommand, initRecordCommand, rulesApplyCommand, policyCheckCommand, noteSaveCommand,
  checkCommand, reportCommand, routeStartCommand, routeNextCommand, routeStopCommand, mapCommand, refsCommand,
  requirementsNormalizeCommand, reviewCommand, versionCommand, contextListCommand, contextWriteCommand, contextTreeCommand,
].map((entry) => [entry.name, entry]));

/** Generated from `COMMANDS`, so a command cannot be registered and missing from the usage text, or the reverse. */
export const USAGE = `ambicode <command> [options]
Every command takes --json: structured output instead of text.

${[...COMMANDS.values()].map((entry) => `  ${entry.name.padEnd(23)}${entry.summary}`).join('\n')}
`;

async function versionOutput(runtime: Runtime): Promise<{ plugin: string; git: string; node: string }> {
  const { Git } = await import('#platform/git/git');
  const git = new Git({ runner: runtime.runner, repositoryRoot: runtime.cwd });
  let gitVersion: string;
  try {
    gitVersion = await git.version();
  } catch {
    gitVersion = 'git: not available';
  }
  return {
    plugin: `ambicode plugin root: ${runtime.pluginRoot}`,
    git: gitVersion,
    node: `node ${process.versions.node}`,
  };
}
