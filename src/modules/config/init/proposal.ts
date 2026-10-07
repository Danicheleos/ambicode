import path from 'node:path';
import { parseDocument } from 'yaml';
import { openRepository } from '#platform/git/open';
import { codeindexCommand, findCodeindex } from '#modules/search/code-index/codeindex';
import { buildProfile } from '#modules/search/declarations/profile';
import type { SearchProfile, SetPair, SetValue, InitProposal } from '#types/modules/config';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { normalizeRelative } from '#util/paths';
import { CONFIG_FILE, GITIGNORE_ENTRIES } from '#types/defaults';
import { detectBaseline, detectProjects, scanCodeindex } from './detect.ts';
import { planInit } from './init.ts';
import { canonicalSets, projectOfKey } from './init-sets.ts';
import { parseConfigWithNotices } from '../load.ts';
import type { Runtime } from '#types/composition';
import type { FileSystem } from '#types/platform/ports';
import type { PlanInitOptions } from '../types/init.ts';

export const MAX_PROPOSAL_BYTES = 6144;

interface ProposalOptions {
  task?: string;
  refreshProfile?: boolean;
  /** The unparsable file was backed up under an honoured `config-unparsable` answer: regenerate from detection. */
  regenerate?: boolean;
  /** The 5-I outcome the dispatch recorded; until it is decided the proposed index is `none` (09-P3). */
  decision5I?: string;
}

/** Detection results a proposal was built from, so the writer plans the same document; never serialized. */
const PLANNED = new WeakMap<InitProposal, Omit<PlanInitOptions, 'fs' | 'overrides'>>();

const initTaskFor = (runtime: Runtime): string => `init-${runtime.clock.now().toISOString().slice(0, 10)}`;

export const DRAFT_FILE = '.ambicode/config.draft.yaml';

export function applyLineFor(runtime: Runtime, task: string): string {
  return `node "${runtime.pluginRoot}/scripts/ambicode.mjs" init --apply --task ${task}`;
}

/** The config text the proposal would write with these overrides ('' when nothing changes), planned from the proposal's own detection. */
export async function planDraft(fs: FileSystem, proposal: InitProposal, overrides: readonly SetPair[]): Promise<{ yaml: string; created: boolean; changes: string[] }> {
  const planned = PLANNED.get(proposal);
  if (planned === undefined) throw new AmbicodeError('internal', 'planDraft needs a proposal built by buildProposal in this process.');
  const plan = await planInit({ ...planned, fs, overrides });
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

/** The dry run (09-P1…P5): reads, detects and plans; writes nothing. */
export async function buildProposal(runtime: Runtime, repositoryRoot: string, overrides: readonly SetPair[], options: ProposalOptions = {}): Promise<InitProposal> {
  const { fs } = runtime;
  const { git } = await openRepository({ ...runtime, cwd: repositoryRoot });
  const file = await configFileState(fs, repositoryRoot);
  if (!file.parses && options.regenerate !== true) throw configUnparsable();
  const current = file.raw === null || !file.parses ? null : parseConfigWithNotices(file.raw);
  const declared = file.raw === null || !file.parses ? null : (parseDocument(file.raw).get('schemaVersion') as unknown);

  const detected = await detectProjects(fs, repositoryRoot);
  const baseline = await detectBaseline(repositoryRoot, () => git.originHead());
  const binary = await findCodeindex(runtime, repositoryRoot);
  const profiles = new Map<string, SearchProfile>();
  for (const root of detected.length === 0 ? [''] : detected.map((project) => normalizeRelative(project.root))) {
    const profile = await buildProfile({ ...runtime, cwd: repositoryRoot }, { root: root === '' ? '.' : root });
    const scanned = binary === null ? null : await scanCodeindex(runtime, codeindexCommand(binary), path.join(repositoryRoot, root === '' ? '.' : root));
    profiles.set(root, scanned === null ? profile : { ...profile, index: { tool: 'codeindex', ...scanned } });
  }
  const planned: Omit<PlanInitOptions, 'fs' | 'overrides'> = {
    repositoryRoot,
    detected,
    baseline: baseline.baseline,
    baselineNotice: baseline.notice,
    profiles,
    ...(options.refreshProfile === true ? { refreshProfile: true } : {}),
    ...(options.regenerate === true ? { regenerate: true } : {}),
  };
  const plan = await planInit({ ...planned, fs, overrides });
  const ids = plan.config.projects.map((project) => project.id);
  const stray = overrides.map((pair) => projectOfKey(pair.key)).find((id) => id !== null && !ids.includes(id));
  if (stray !== undefined && stray !== null) {
    throw new AmbicodeError('bad-argument', `--set names no project "${stray}".`, { field: '--set', details: [`Projects: ${ids.join(', ')}.`] });
  }

  const config = plan.config;
  const index = config.search.index;
  const tool = binary === null ? null : 'codeindex';
  const task = options.task ?? initTaskFor(runtime);
  const removedFields = (current?.notices ?? []).filter((notice) => notice.startsWith('config-field-removed: ')).map((notice) => notice.slice('config-field-removed: '.length));
  const proposal: InitProposal = {
    command: 'init',
    mode: 'dry-run',
    configPath: path.join(repositoryRoot, CONFIG_FILE),
    configState: file.raw === null ? 'missing' : !file.parses ? 'unparsable-backed-up' : declared === 3 ? 'current' : 'legacy',
    projects: config.projects.map((project) => ({
      id: project.id,
      root: project.root,
      ecosystem: project.ecosystem,
      commands: Object.fromEntries(Object.entries(project.commands).filter(([slot]) => slot !== 'format').map(([slot, command]) => [slot, command?.argv ?? null])),
      format: project.commands['format']?.argv ?? null,
      packs: project.packs,
      profile: project.profile ?? null,
    })),
    ruleSources: plan.ruleSources,
    gitignore: await gitignoreState(fs, repositoryRoot),
    index: { proposed: index, tool, decision5I: options.decision5I ?? 'pending' },
    searchLayers: { prompt: [...(config.search.layers?.prompt ?? [])], context: [...(config.search.layers?.context ?? [])] },
    acceptanceField: { current: config.requirements.acceptanceField, candidates: config.requirements.acceptanceField === null ? [] : [config.requirements.acceptanceField] },
    removedFields,
    changes: plan.changes,
    notices: plan.notices,
    noticesOmitted: 0,
    values: canonicalSets(overrides),
    applyLine: applyLineFor(runtime, task),
  };
  while (Buffer.byteLength(JSON.stringify(proposal)) > MAX_PROPOSAL_BYTES && proposal.notices.length > 0) {
    proposal.notices.pop();
    proposal.noticesOmitted += 1;
  }
  PLANNED.set(proposal, planned);
  return proposal;
}

/** Pure writer: no consent check. Only `applyInit` after its checks, fixtures and test setup call it (D15). */
export async function writeConfig(
  fs: FileSystem,
  repositoryRoot: string,
  proposal: InitProposal,
  overrides: readonly SetPair[],
  approvedYaml?: string,
): Promise<{ created: boolean; changes: string[]; gitignoreAdded: string[] }> {
  const planned = PLANNED.get(proposal);
  if (planned === undefined) throw new AmbicodeError('internal', 'writeConfig needs a proposal built by buildProposal in this process.');
  const plan = await planInit({ ...planned, fs, overrides });
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

export type { SetPair, SetValue };

/** Plans the draft for these overrides and saves it as the draft file; the hash is what an answer is pinned to. */
export async function saveDraft(fs: FileSystem, repositoryRoot: string, proposal: InitProposal, overrides: readonly SetPair[]): Promise<{ yaml: string; hash: string }> {
  const { yaml } = await planDraft(fs, proposal, overrides);
  const file = path.join(repositoryRoot, DRAFT_FILE);
  if (yaml === '') await fs.remove(file).catch(() => undefined);
  else {
    await fs.mkdirp(path.dirname(file));
    await fs.writeText(file, yaml);
  }
  return { yaml, hash: contentHash(yaml) };
}
