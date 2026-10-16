import path from 'node:path';
import { loadConfig } from '#modules/config/load';
import { buildModuleTree, listContext, maxModulesFor, renderListing, renderTree, writeContext } from '#modules/context/context';
import { CONTEXT_DIR } from '#types/defaults';
import { openRepository } from '#platform/git/open';
import { MAX_HOOK_INPUT_BYTES } from '#types/hook';
import { AmbicodeError } from '#util/errors';
import type { CliCommand } from '../../types/cli.ts';

const repositoryRoot = async (runtime: Parameters<CliCommand['run']>[0]): Promise<string> => (await openRepository(runtime)).repositoryRoot;

export const contextWriteCommand: CliCommand = {
  name: 'context write',
  summary: 'Write context files from an "=== <path>" bundle on stdin (--replace removes the rest).',
  options: { flags: ['json', 'replace'] },
  run: async (runtime, args) => {
    const root = await repositoryRoot(runtime);
    const { config } = await loadConfig(runtime.fs, root);
    const text = await runtime.stdin.read(MAX_HOOK_INPUT_BYTES);
    if (text === null) throw new AmbicodeError('bad-argument', 'bundle on stdin is too large', { field: 'bundle' });
    const outcome = await writeContext(runtime.fs, root, text, config.context, args.flag('replace'));
    const problems = outcome.check.problems;
    return { text: JSON.stringify(outcome), data: outcome, json: 'compact', ...(problems.length > 0 ? { exitCode: 1 } : {}) };
  },
};

export const contextListCommand: CliCommand = {
  name: 'context list',
  summary: `List the files under ${CONTEXT_DIR}: path, first H1, approximate tokens.`,
  options: { flags: ['json'] },
  run: async (runtime) => {
    const root = await repositoryRoot(runtime);
    const { config } = await loadConfig(runtime.fs, root);
    const files = await listContext(runtime.fs, root);
    return { text: renderListing(files, config.context), data: { files, limits: config.context, dir: path.join(root, CONTEXT_DIR) } };
  },
};

export const contextTreeCommand: CliCommand = {
  name: 'context tree',
  summary: 'Source modules, full depth.',
  options: { repeated: ['root'], flags: ['json'] },
  run: async (runtime, args) => {
    const { repositoryRoot: root, git } = await openRepository(runtime);
    const { config } = await loadConfig(runtime.fs, root);
    const result = buildModuleTree(await git.listFiles(null), { roots: args.all('root'), maxModules: maxModulesFor(config.context) });
    return { text: renderTree(result), data: result };
  },
};
