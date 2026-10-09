import path from 'node:path';
import { parse, parseDocument } from 'yaml';
import { openRepository } from '#platform/git/open';
import { ProposalInput, type SetPair, type InitProposal } from '#types/modules/config';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { CONFIG_FILE, GITIGNORE_ENTRIES } from '#types/defaults';
import { planInit } from './init.ts';
import { canonicalSets } from './init-sets.ts';
import { builtinPackIds, isRunnable } from './scan.ts';
import { parseConfigWithNotices } from '../load.ts';
import type { Runtime } from '#types/composition';
import type { FileSystem } from '#types/platform/ports';
import type { PlanInitOptions } from '../types/init.ts';

export const DRAFT_FILE = '.ambicode/config.draft.yaml';

export function applyLineFor(runtime: Runtime, task: string): string {
  return `node "${runtime.pluginRoot}/scripts/ambicode.mjs" init --apply --task ${task}`;
}

const planOptions = (repositoryRoot: string, proposal: InitProposal, overrides: readonly SetPair[], fs: FileSystem): PlanInitOptions => ({
  fs,
  repositoryRoot,
  input: proposal.input,
  baseline: proposal.baseline,
  baselineNotice: proposal.baselineNotice,
  overrides,
  ...(proposal.configState === 'unparsable-backed-up' ? { regenerate: true } : {}),
});

/** The config text the proposal would write with these overrides ('' when nothing changes). */
export async function planDraft(fs: FileSystem, repositoryRoot: string, proposal: InitProposal, overrides: readonly SetPair[]): Promise<{ yaml: string; created: boolean; changes: string[] }> {
  const plan = await planInit(planOptions(repositoryRoot, proposal, overrides, fs));
  return { yaml: plan.yaml ?? '', created: plan.created, changes: plan.changes };
}

/** `.gitignore` lines `init --apply` would add; `/x/` and `x/` are one rule to git. */
async function gitignoreState(fs: FileSystem, repositoryRoot: string): Promise<{ missing: string[]; present: string[] }> {
  const text = await fs.readText(path.join(repositoryRoot, '.gitignore')).catch(() => '');
  const anchored = (entry: string): string => entry.replace(/^\//, '');
  const lines = new Set(text.split('\n').map((line) => anchored(line.trim())));
  return { missing: GITIGNORE_ENTRIES.filter((entry) => !lines.has(anchored(entry))), present: GITIGNORE_ENTRIES.filter((entry) => lines.has(anchored(entry))) };
}

/** Whether the file exists and whether YAML can parse it; schema problems are left to the loader. */
export async function configFileState(fs: FileSystem, repositoryRoot: string): Promise<{ raw: string | null; parses: boolean }> {
  const raw = await fs.readText(path.join(repositoryRoot, CONFIG_FILE)).catch(() => null);
  return { raw, parses: raw === null || parseDocument(raw).errors.length === 0 };
}

export const configUnparsable = (): AmbicodeError =>
  new AmbicodeError('config-unparsable', `${CONFIG_FILE} is not valid YAML.`, {
    field: CONFIG_FILE,
    details: ['In /ambicode:init, answer the config-unparsable question: back it up and regenerate, or stop and fix the file.'],
  });

const invalid = (field: string, message: string): AmbicodeError =>
  new AmbicodeError('init-proposal-invalid', `${field}: ${message}`, { field, details: ['Fix that field in the YAML and run `init propose` again.'] });

/** The model's YAML (a ```yaml fence around it is tolerated) read through the proposal schema; the first bad field is named. */
export function parseProposal(text: string): ProposalInput {
  const body = /```ya?ml\s*\n([\s\S]*?)```/.exec(text)?.[1] ?? text;
  let raw: unknown;
  try {
    raw = parse(body);
  } catch (error) {
    throw invalid('yaml', error instanceof Error ? error.message.split('\n')[0]! : 'not valid YAML');
  }
  const result = ProposalInput.safeParse(raw);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  throw invalid(issue.path.join('.') || 'proposal', issue.message);
}

/** What the schema cannot see: pack ids, roots on disk, commands that start. Each problem names its field. */
export async function validateProposal(runtime: Runtime, repositoryRoot: string, input: ProposalInput): Promise<void> {
  const packs = new Set(await builtinPackIds(runtime));
  const ids = new Set<string>();
  for (const [at, project] of input.projects.entries()) {
    const field = `projects.${at}`;
    if (ids.has(project.id)) throw invalid(`${field}.id`, `"${project.id}" is used twice`);
    ids.add(project.id);
    if (!(await runtime.fs.exists(path.join(repositoryRoot, project.root)))) throw invalid(`${field}.root`, `"${project.root}" does not exist in the repository`);
    for (const pack of project.packs) if (!packs.has(pack)) throw invalid(`${field}.packs`, `unknown pack "${pack}"; the built-in ids are: ${[...packs].join(', ')}`);
    for (const [slot, argv] of Object.entries(project.commands)) {
      if (argv != null && !(await isRunnable(runtime, repositoryRoot, project.root, argv[0]!))) throw invalid(`${field}.commands.${slot}`, `"${argv[0]}" is not on PATH or in node_modules/.bin; use null if the tool is not installed`);
    }
  }
}

/** The proposal the gate is asked about: the model's validated input plus what the repository says about the file, baseline and ignore lines. */
export async function buildProposal(runtime: Runtime, repositoryRoot: string, input: ProposalInput, overrides: readonly SetPair[], options: { task?: string; regenerate?: boolean } = {}): Promise<InitProposal> {
  const { git } = await openRepository({ ...runtime, cwd: repositoryRoot });
  const file = await configFileState(runtime.fs, repositoryRoot);
  if (!file.parses && options.regenerate !== true) throw configUnparsable();
  if (file.raw !== null && file.parses) parseConfigWithNotices(file.raw);
  const declared = file.raw === null || !file.parses ? null : (parseDocument(file.raw).get('schemaVersion') as unknown);
  const originHead = await git.originHead();
  const proposal: InitProposal = {
    command: 'init',
    mode: 'dry-run',
    configPath: path.join(repositoryRoot, CONFIG_FILE),
    configState: file.raw === null ? 'missing' : !file.parses ? 'unparsable-backed-up' : declared === 3 ? 'current' : 'legacy',
    input,
    baseline: originHead ?? '',
    baselineNotice: originHead === null ? 'No local refs/remotes/origin/HEAD was found, so no baseline was recorded. Branch review needs --base until you set one.' : `baseline taken from refs/remotes/origin/HEAD (${originHead})`,
    ruleSources: [],
    gitignore: await gitignoreState(runtime.fs, repositoryRoot),
    changes: [],
    notices: [],
    values: canonicalSets(overrides),
    applyLine: applyLineFor(runtime, options.task ?? `init-${runtime.clock.now().toISOString().slice(0, 10)}`),
  };
  const plan = await planInit(planOptions(repositoryRoot, proposal, overrides, runtime.fs));
  const ids = plan.config.projects.map((project) => project.id);
  const stray = overrides.map((pair) => /^projects\.([^.]+)\./.exec(pair.key)?.[1]).find((id) => id !== undefined && !ids.includes(id));
  if (stray !== undefined) throw new AmbicodeError('bad-argument', `--set names no project "${stray}".`, { field: '--set', details: [`Projects: ${ids.join(', ')}.`] });
  const { changes, notices, ruleSources } = plan;
  return { ...proposal, changes, notices, ruleSources };
}

/** Pure writer: no consent check. Only `applyInit` after its checks, fixtures and test setup call it. */
export async function writeConfig(
  fs: FileSystem,
  repositoryRoot: string,
  proposal: InitProposal,
  overrides: readonly SetPair[],
  approvedYaml?: string,
): Promise<{ created: boolean; changes: string[]; gitignoreAdded: string[] }> {
  const plan = await planInit(planOptions(repositoryRoot, proposal, overrides, fs));
  const yaml = plan.yaml === null ? null : (approvedYaml ?? plan.yaml);
  if (yaml !== null) {
    await fs.mkdirp(path.join(repositoryRoot, path.dirname(CONFIG_FILE)));
    await fs.writeText(path.join(repositoryRoot, CONFIG_FILE), yaml);
  }
  const ignore = await gitignoreState(fs, repositoryRoot);
  if (ignore.missing.length > 0) {
    const file = path.join(repositoryRoot, '.gitignore');
    const existing = await fs.readText(file).catch(() => '');
    await fs.writeText(file, `${existing}${existing === '' || existing.endsWith('\n') ? '' : '\n'}${ignore.missing.join('\n')}\n`);
  }
  return { created: plan.created, changes: plan.changes, gitignoreAdded: ignore.missing };
}

export type { SetPair };

/** Plans the draft for these overrides and saves it as the draft file; the hash is what an answer is pinned to. */
export async function saveDraft(fs: FileSystem, repositoryRoot: string, proposal: InitProposal, overrides: readonly SetPair[]): Promise<{ yaml: string; hash: string }> {
  const { yaml } = await planDraft(fs, repositoryRoot, proposal, overrides);
  const file = path.join(repositoryRoot, DRAFT_FILE);
  if (yaml === '') await fs.remove(file).catch(() => undefined);
  else {
    await fs.mkdirp(path.dirname(file));
    await fs.writeText(file, yaml);
  }
  return { yaml, hash: contentHash(yaml) };
}
