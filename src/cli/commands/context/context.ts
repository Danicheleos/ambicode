import { loadConfig } from '#modules/config/load';
import { allFolders, buildModuleTree, maxModulesFor, proseFiles, renderFullTree, repoRelativeRoots } from '#modules/context/context';
import { conventionEvidence } from '#modules/context/convention-evidence';
import { buildSearchIndex, repositoryReader, writeSearchIndex } from '#modules/context/search-index';
import { recordInit } from '#modules/evidence/init-entry';
import { openRepository } from '#platform/git/open';
import type { CliCommand } from '../../types/cli.ts';

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

export const contextIndexCommand: CliCommand = {
  name: 'context index',
  summary: 'Build the search index, search/folders.jsonl.',
  options: { repeated: ['root'], values: ['task'], flags: ['json'] },
  run: async (runtime, args) => {
    const { repositoryRoot: root, git } = await openRepository(runtime);
    const { config } = await loadConfig(runtime.fs, root);
    const meta = await writeSearchIndex({ fs: runtime.fs, clock: runtime.clock, git, root }, { roots: repoRelativeRoots(root, args.all('root')), maxModules: maxModulesFor(config.context) });
    // Init's own step: the index used to be built as a side effect of `context write`, which f4eac810 removed with the notes.
    await recordInit(runtime, args.value('task'), 'context index', `${meta.folders} folders, ${meta.files} files indexed`);
    return { text: JSON.stringify(meta), data: meta, json: 'compact' };
  },
};

export const contextEvidenceCommand: CliCommand = {
  name: 'context evidence',
  summary: 'Counts of file name styles, suffixes, declared-name casing and imports between modules.',
  options: { repeated: ['root'], flags: ['json'] },
  run: async (runtime, args) => {
    const { repositoryRoot: root, git } = await openRepository(runtime);
    const { config } = await loadConfig(runtime.fs, root);
    const files = await git.listFiles(null);
    const options = { roots: repoRelativeRoots(root, args.all('root')), maxModules: maxModulesFor(config.context) };
    const { rows } = await buildSearchIndex(files, repositoryReader(runtime.fs, root), options);
    return { text: conventionEvidence(rows, files, options), data: { rows: rows.length } };
  },
};
