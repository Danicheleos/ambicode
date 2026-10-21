import path from 'node:path';
import { loadConfig } from '#modules/config/load';
import { allFolders, buildModuleTree, listContext, maxModulesFor, proseFiles, renderFullTree, repoRelativeRoots, renderListing, writeContext } from '#modules/context/context';
import { CONTEXT_DIR } from '#types/defaults';
import { openRepository } from '#platform/git/open';
import { recordInit } from '#modules/evidence/init-entry';
import { MAX_HOOK_INPUT_BYTES } from '#types/hook';
import { AmbicodeError } from '#util/errors';
import type { CliCommand } from '../../types/cli.ts';

const repositoryRoot = async (runtime: Parameters<CliCommand['run']>[0]): Promise<string> => (await openRepository(runtime)).repositoryRoot;

export const contextWriteCommand: CliCommand = {
  name: 'context write',
  summary: 'Write context files from an "=== <path>" bundle on stdin (--replace removes the rest).',
  options: { repeated: ['root'], values: ['task'], flags: ['json', 'replace'] },
  run: async (runtime, args) => {
    const { repositoryRoot: root, git } = await openRepository(runtime);
    const { config } = await loadConfig(runtime.fs, root);
    const text = await runtime.stdin.read(MAX_HOOK_INPUT_BYTES);
    if (text === null) throw new AmbicodeError('bad-argument', 'bundle on stdin is too large', { field: 'bundle' });
    const outcome = await writeContext(runtime.fs, root, text, config.context, args.flag('replace'), await git.listFiles(null), repoRelativeRoots(root, args.all('root')));
    const problems = outcome.check.problems;
    await recordInit(runtime, args.value('task'), 'context write', `${outcome.written.length} files written, ${problems.length} problems`);
    return { text: JSON.stringify(outcome), data: outcome, json: 'compact', ...(problems.length > 0 ? { exitCode: 1 } : {}) };
  },
};

export const contextListCommand: CliCommand = {
  name: 'context list',
  summary: `List ${CONTEXT_DIR} files: path, first H1, approximate tokens.`,
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
  summary: 'Modules of the source roots with every level\'s file lines, plus the documentation files.',
  options: { repeated: ['root'], flags: ['json'] },
  run: async (runtime, args) => {
    const { repositoryRoot: root, git } = await openRepository(runtime);
    const { config } = await loadConfig(runtime.fs, root);
    const files = await git.listFiles(null);
    const result = buildModuleTree(files, { roots: repoRelativeRoots(root, args.all('root')), maxModules: maxModulesFor(config.context) });
    const folders = await allFolders(runtime.fs, root, result, files);
    const docs = await proseFiles(runtime.fs, root, files);
    return { text: renderFullTree(result, folders, docs), data: { ...result, folders, docs } };
  },
};
