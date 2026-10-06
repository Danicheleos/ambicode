import path from 'node:path';
import { Document, isMap, isSeq, parseDocument, Scalar, visit, type YAMLMap, type YAMLSeq } from 'yaml';
import type { AmbicodeConfig, SearchProfile, SetPair } from '#types/config';
import { normalizeRelative } from '#util/paths';
import { CONFIG_FILE, DEFAULTS, SEARCH_LAYER_DEFAULTS, TEST_EXCLUDES } from '#types/defaults';
import { sourceGlob } from '#modules/search/declarations/profile';
import { suggestedPacks } from './detect.ts';
import { projectOfKey } from './init-sets.ts';
import { parseConfig } from '../load.ts';
import { GENERIC_PROFILE } from '#modules/types/search';
import type { FileSystem } from '#types/ports';
import type { DetectedProject, PlanInitOptions } from '../types/init.ts';

interface PreservedFlowSeq { node: YAMLSeq; originalText: string; snapshot: string }

/** Every flow sequence present before any mutation, with its exact source bytes and value, found by walking the tree (not by pattern-matching text). */
function collectPreservedFlowSeqs(document: Document, existingRaw: string): PreservedFlowSeq[] {
  const found: PreservedFlowSeq[] = [];
  visit(document, {
    Seq(_key, node) {
      if (node.flow === true && Array.isArray(node.range)) {
        found.push({ node: node as YAMLSeq, originalText: existingRaw.slice(node.range[0], node.range[1]), snapshot: JSON.stringify(node.toJSON()) });
      }
    },
  });
  return found;
}

/** Stringifies with every untouched flow sequence put back as its own source bytes, each at its own node (09-C3/C4). */
function stringifyPreserving(document: Document, preserved: readonly PreservedFlowSeq[], existingRaw: string): string {
  const original = new Map(preserved.filter((entry) => JSON.stringify(entry.node.toJSON()) === entry.snapshot).map((entry) => [entry.node, entry.originalText]));
  let salt = 0;
  while (existingRaw.includes(`ambicode-seq-${salt}-`)) salt += 1;
  const tokens = new Map<string, string>();
  visit(document, {
    Seq(_key, node) {
      const text = original.get(node as YAMLSeq);
      if (text === undefined || node.tag !== undefined) return undefined;
      const token = `ambicode-seq-${salt}-${tokens.size}`;
      tokens.set(token, text);
      const scalar = new Scalar(token);
      scalar.commentBefore = node.commentBefore;
      scalar.comment = node.comment;
      if (node.anchor !== undefined) scalar.anchor = node.anchor;
      return scalar;
    },
  });
  // Anchors inside a placeholder come back with its source text, before any alias that follows it.
  let text = document.toString({ lineWidth: 0, verifyAliasOrder: false });
  for (const [token, source] of tokens) text = text.replace(token, () => source);
  return text;
}

export interface InitPlan {
  yaml: string | null;
  created: boolean;
  changes: string[];
  notices: string[];
  ruleSources: string[];
  config: AmbicodeConfig;
}

export async function planInit(options: PlanInitOptions): Promise<InitPlan> {
  const filePath = path.join(options.repositoryRoot, CONFIG_FILE);
  let existingRaw: string | null = null;
  try {
    existingRaw = await options.fs.readText(filePath);
  } catch {
    existingRaw = null;
  }

  const plan = existingRaw === null || options.regenerate === true ? createFresh(options) : updateExisting(existingRaw, options);
  plan.ruleSources = await detectRuleSources(options.fs, options.repositoryRoot);
  if (plan.ruleSources.length > 0) plan.notices.push(ruleSourceNotice(plan.ruleSources));
  return plan;
}

/**
 * Checked with `exists` only: deciding what counts as a rule is a judgement for
 * `/ambicode:rules` with a human present, not for a detector run on every init.
 */
const RULE_SOURCE_CANDIDATES = [
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'docs',
  '.cursor/rules',
  '.github/instructions',
  '.github/copilot-instructions.md',
] as const;

export async function detectRuleSources(fs: FileSystem, repositoryRoot: string): Promise<string[]> {
  const found: string[] = [];
  for (const candidate of RULE_SOURCE_CANDIDATES) {
    if (await fs.exists(path.join(repositoryRoot, candidate))) found.push(candidate);
  }
  return found;
}

function ruleSourceNotice(sources: readonly string[]): string {
  return [
    `This repository has files that usually hold written rules: ${sources.join(', ')}.`,
    'AMBICODE resolves policy only from YAML packs, so none of this is in effect. Run',
    '/ambicode:rules to turn the rules those documents state into scoped packs under',
    '.ambicode/policies/, once, with you confirming what carries over and what does not.',
    'Nothing above was read, classified, or migrated by init.',
  ].join('\n');
}

const MCP_BINDING_NOTICE =
  'requirements.mcpServer is null: no Jira/Confluence MCP server is bound. Requirement-based review needs one named here. If more than one compatible server is connected, choose which of them this repository uses and write its name.';

/** `search.layers` as written: the defaults, plus the index layers when an index is configured (09-P4). */
function layersFor(index: string): { prompt: string[]; context: string[] } {
  const extra = index !== 'none';
  return { prompt: [...SEARCH_LAYER_DEFAULTS.prompt, ...(extra ? ['index.find'] : [])], context: [...SEARCH_LAYER_DEFAULTS.context, ...(extra ? ['index.relates'] : [])] };
}

const REMOVED_FIELDS = [['requirements', 'lsp'], ['task', 'lspPlugins'], ['search', 'exactMaxFiles']] as const;

const overrideOf = (options: PlanInitOptions, key: string): SetPair | undefined => options.overrides?.find((pair) => pair.key === key);

function createFresh(options: PlanInitOptions): InitPlan {
  const changes: string[] = [];
  const notices: string[] = [options.baselineNotice, MCP_BINDING_NOTICE];

  const projects = options.detected.map((detected) => {
    notices.push(...detected.notices.map((notice) => `${detected.id}: ${notice}`));
    return projectNode(detected, changes, notices, options.profiles?.get(normalizeRelative(detected.root)));
  });

  if (projects.length === 0) {
    projects.push({
      id: 'app',
      root: '.',
      ecosystem: 'typescript',
      packs: suggestedPacks('typescript'),
      policyFiles: [],
      shortlist: shortlistDefaults(options.profiles?.get('')),
      ...profileEntry(options.profiles?.get('')),
      commands: { lint: null, unit: null, e2e: null, format: null },
      checks: { lint: null, unit: null, e2e: null },
    });
    notices.push(
      'No package.json or pyproject.toml was found, so one project covering the repository root was written with every command null.',
    );
  }

  const index = String(overrideOf(options, 'search.index')?.value ?? 'none');
  const document = new Document({
    schemaVersion: DEFAULTS.schemaVersion,
    baseline: options.baseline,
    review: { ...DEFAULTS.review },
    checks: { ...DEFAULTS.checks },
    page: { ...DEFAULTS.page },
    requirements: { mcpServer: null, acceptanceField: DEFAULTS.requirements.acceptanceField },
    search: { index, layers: layersFor(index) },
    workers: { approved: [] },
    guard: { askOutsideMap: false },
    projects,
    remoteChecks: { image: null },
    authoring: { ...DEFAULTS.authoring },
  });
  document.commentBefore = HEADER_COMMENT;
  applyOverrides(document, options, changes, false);

  const yaml = document.toString({ lineWidth: 100 });
  return { yaml, created: true, changes, notices, ruleSources: [], config: parseConfig(yaml) };
}

/** Schema 1/2 → 3 through the document API: removed fields deleted and named, missing v3 slots added (09-C3). */
function migrate(document: Document, changes: string[], notices: string[]): void {
  const declared = document.get('schemaVersion');
  if (declared !== DEFAULTS.schemaVersion) {
    document.set('schemaVersion', DEFAULTS.schemaVersion);
    changes.push(`Set "schemaVersion: ${DEFAULTS.schemaVersion}" (was ${String(declared)}).`);
  }
  for (const [section, field] of REMOVED_FIELDS) {
    if (!document.hasIn([section, field])) continue;
    document.deleteIn([section, field]);
    const parent = document.get(section);
    if (section === 'task' && isMap(parent) && parent.items.length === 0) document.delete(section);
    notices.push(`config-field-removed: ${section}.${field}`);
    changes.push(`Removed "${section}.${field}" (no longer read).`);
  }
  const added: [readonly string[], unknown][] = [
    [['review', 'onInvalid'], DEFAULTS.review.onInvalid],
    [['requirements', 'acceptanceField'], DEFAULTS.requirements.acceptanceField],
    [['search', 'index'], 'none'],
    [['workers', 'approved'], []],
    [['guard', 'askOutsideMap'], false],
  ];
  for (const [where, value] of added) {
    if (document.hasIn(where)) continue;
    document.setIn(where, document.createNode(value));
    changes.push(`Added "${where.join('.')}: ${JSON.stringify(value)}".`);
  }
  const layers = layersFor(String(document.getIn(['search', 'index']) ?? 'none'));
  for (const mode of ['prompt', 'context'] as const) {
    if (document.hasIn(['search', 'layers', mode])) continue;
    document.setIn(['search', 'layers', mode], document.createNode(layers[mode]));
    changes.push(`Added "search.layers.${mode}: [${layers[mode].join(', ')}]".`);
  }
}

/** Accepted values override their slots; an index change adds or removes the two index layers only (09-P4, D17). */
function applyOverrides(document: Document, options: PlanInitOptions, changes: string[], existing: boolean): void {
  for (const pair of options.overrides ?? []) {
    const project = projectOfKey(pair.key);
    if (project !== null) {
      const node = ((document.get('projects') as YAMLSeq | undefined)?.items as YAMLMap[] | undefined)?.find((item) => item.get('id') === project);
      if (node === undefined) continue;
      const slot = pair.key.split('.').at(-1)!;
      node.setIn(['commands', slot], pair.value === null ? null : document.createNode({ argv: pair.value }));
    } else {
      const where = pair.key.split('.');
      const before = document.getIn(where);
      document.setIn(where, pair.value);
      if (pair.key === 'search.index' && existing && before !== pair.value) syncIndexLayers(document, String(pair.value));
    }
    changes.push(`Set "${pair.key}" to ${JSON.stringify(pair.value)} (accepted).`);
  }
}

function syncIndexLayers(document: Document, index: string): void {
  for (const [mode, layer] of [['prompt', 'index.find'], ['context', 'index.relates']] as const) {
    const node = document.getIn(['search', 'layers', mode]);
    if (!isSeq(node)) continue;
    const at = node.items.findIndex((item) => (typeof item === 'object' && item !== null && 'value' in item ? item.value : item) === layer);
    if (index === 'none' && at !== -1) node.delete(at);
    if (index !== 'none' && at === -1) node.add(layer);
  }
}

function updateExisting(existingRaw: string, options: PlanInitOptions): InitPlan {
  // A document, not plain data, so the user's comments and formatting survive.
  const document = parseDocument(existingRaw);
  const preservedFlowSeqs = collectPreservedFlowSeqs(document, existingRaw);
  const changes: string[] = [];
  const notices: string[] = [];

  const requirementsNode = document.get('requirements') as YAMLMap | undefined;
  if (requirementsNode === undefined || requirementsNode.get('mcpServer') == null) {
    notices.push(MCP_BINDING_NOTICE);
  }

  if (document.get('authoring') === undefined) {
    document.set('authoring', document.createNode({ ...DEFAULTS.authoring }));
    changes.push(`Added "authoring.editReminders: ${DEFAULTS.authoring.editReminders}" (the documented default).`);
  }

  migrate(document, changes, notices);

  if (document.getIn(['page', 'port']) === undefined) {
    document.setIn(['page', 'port'], DEFAULTS.page.port);
    changes.push(`Added "page.port: ${DEFAULTS.page.port}" (the documented default).`);
  }

  const projectsNode = document.get('projects') as YAMLSeq | undefined;
  const existingRoots = new Map<string, YAMLMap>();
  if (projectsNode !== undefined && Array.isArray(projectsNode.items)) {
    for (const item of projectsNode.items as YAMLMap[]) {
      const root = item.get('root');
      if (typeof root === 'string') existingRoots.set(normalizeRelative(root), item);
    }
  }

  for (const detected of options.detected) {
    const root = normalizeRelative(detected.root);
    const existing = existingRoots.get(root);
    if (existing === undefined) {
      projectsNode?.add(document.createNode(projectNode(detected, changes, notices, options.profiles?.get(root))));
      changes.push(`Added project "${detected.id}" for root "${detected.root}".`);
      continue;
    }
    addMissingCommands(document, existing, detected, changes, notices);
    addMissingFrameworkPacks(document, existing, detected, changes);
    if (existing.get('shortlist') === undefined) {
      existing.set('shortlist', document.createNode(shortlistDefaults(options.profiles?.get(root))));
      changes.push(`Added "shortlist" for project "${detected.id}": the files prepare may list, source only. Edit it to widen or narrow.`);
    }
  }
  for (const [root, existing] of existingRoots) {
    const profile = options.profiles?.get(root);
    if (profile === undefined || (existing.get('profile') !== undefined && options.refreshProfile !== true)) continue;
    const replaced = existing.get('profile') !== undefined;
    existing.set('profile', document.createNode(profile));
    changes.push(`${replaced ? 'Replaced' : 'Added'} the search profile for root "${root || '.'}" (measured at ${profile.stamp.commit.slice(0, 12) || 'no commit'}).`);
  }

  applyOverrides(document, options, changes, true);

  if (changes.length === 0) {
    notices.push('Everything detected is already described in the configuration; nothing was changed.');
    return { yaml: null, created: false, changes, notices, ruleSources: [], config: parseConfig(existingRaw) };
  }

  const yaml = stringifyPreserving(document, preservedFlowSeqs, existingRaw);
  return { yaml, created: false, changes, notices, ruleSources: [], config: parseConfig(yaml) };
}

/** Treated like a missing command slot, so a pack the user deliberately removed does come back. */
function addMissingFrameworkPacks(
  document: Document,
  projectNodeMap: YAMLMap,
  detected: DetectedProject,
  changes: string[],
): void {
  const packs = projectNodeMap.get('packs');
  const enabled = new Set<unknown>(isSeq(packs) ? packs.toJSON() : []);
  const missing = detected.frameworkPacks.filter((reference) => !enabled.has(reference));
  if (missing.length === 0) return;
  if (isSeq(packs)) {
    for (const reference of missing) packs.add(reference);
  } else {
    projectNodeMap.set('packs', document.createNode([...missing]));
  }
  changes.push(`Enabled ${missing.join(', ')} for project "${detected.id}": its dependencies call for them.`);
}

/** A value the user set, including an explicit null, is left exactly as it is. */
function addMissingCommands(
  document: Document,
  projectNodeMap: YAMLMap,
  detected: DetectedProject,
  changes: string[],
  notices: string[],
): void {
  let commands = projectNodeMap.get('commands') as YAMLMap | undefined;
  if (commands === undefined) {
    commands = document.createNode({}) as YAMLMap;
    projectNodeMap.set('commands', commands);
  }
  let checks = projectNodeMap.get('checks') as YAMLMap | undefined;
  if (checks === undefined) {
    checks = document.createNode({}) as YAMLMap;
    projectNodeMap.set('checks', checks);
  }
  if (!commands.has('format')) {
    commands.set('format', detected.format?.argv == null ? document.createNode(null) : document.createNode({ argv: detected.format.argv }));
    changes.push(detected.format?.argv == null ? `Added a null "format" command slot to project "${detected.id}".` : `Added a "format" command to project "${detected.id}" (${detected.format.notice}).`);
  }

  for (const slot of ['lint', 'unit', 'e2e'] as const) {
    const candidate = detected[slot];
    if (commands.has(slot)) {
      const current = commands.get(slot);
      if (candidate?.argv != null && current === null) {
        notices.push(
          `${detected.id}: "${slot}" is null but ${candidate.notice}. Set its argv yourself if you want it enabled; init does not overwrite your value.`,
        );
      }
      continue;
    }
    commands.set(slot, candidate?.argv == null ? document.createNode(null) : document.createNode({ argv: candidate.argv }));
    changes.push(
      candidate?.argv == null
        ? `Added a null "${slot}" command slot to project "${detected.id}".`
        : `Added a "${slot}" command to project "${detected.id}" (${candidate.notice}).`,
    );
    if (!checks.has(slot)) {
      const check = candidate?.argv == null ? null : checkFor(slot, detected);
      checks.set(slot, check === null ? document.createNode(null) : document.createNode(check));
      if (candidate?.argv != null && check === null) notices.push(mappingNotice(slot, detected));
    }
  }
}

function projectNode(
  detected: DetectedProject,
  changes: string[],
  notices: string[],
  profile?: SearchProfile,
): Record<string, unknown> {
  const commands: Record<string, unknown> = {};
  const checks: Record<string, unknown> = {};

  for (const slot of ['lint', 'unit', 'e2e'] as const) {
    const candidate = detected[slot];
    if (candidate?.argv == null) {
      commands[slot] = null;
      checks[slot] = null;
      notices.push(
        candidate === null || candidate === undefined
          ? `${detected.id}: no ${slot} tool was detected, so the slot is null.`
          : `${detected.id}: ${slot} left null — ${candidate.notice}.`,
      );
      continue;
    }
    commands[slot] = { argv: candidate.argv };
    const check = checkFor(slot, detected);
    checks[slot] = check;
    changes.push(`Configured "${slot}" for project "${detected.id}" (${candidate.notice}).`);
    if (check === null) notices.push(mappingNotice(slot, detected));
  }

  commands['format'] = detected.format?.argv == null ? null : { argv: detected.format.argv };
  if (detected.format?.argv != null) changes.push(`Configured "format" for project "${detected.id}" (${detected.format.notice}).`);
  else if (detected.format !== null) notices.push(`${detected.id}: format left null — ${detected.format.notice}.`);

  return {
    id: detected.id,
    root: detected.root,
    ecosystem: detected.ecosystem,
    packs: [...suggestedPacks(detected.ecosystem), ...detected.frameworkPacks],
    policyFiles: [],
    shortlist: shortlistDefaults(profile),
    ...profileEntry(profile),
    commands,
    checks,
  };
}

const profileEntry = (profile: SearchProfile | undefined): { profile?: SearchProfile } => (profile === undefined ? {} : { profile });

function shortlistDefaults(profile: SearchProfile | undefined): { include: string[]; exclude: string[] } {
  return { include: [sourceGlob(profile === undefined || profile.sources.length === 0 ? GENERIC_PROFILE.sources : profile.sources)], exclude: [...TEST_EXCLUDES] };
}

function checkFor(slot: 'lint' | 'unit' | 'e2e', detected: DetectedProject): Record<string, unknown> | null {
  const candidate = detected[slot];
  const adapter = candidate?.adapter ?? 'eslint';

  if (slot === 'lint') {
    return {
      command: 'lint',
      adapter,
      include: detected.ecosystem === 'python' ? ['**/*.py'] : ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    };
  }

  // Only Jest and Vitest can say which tests a change affects; an empty mapping
  // would select nothing, so the check is left null and init explains what to add.
  if (adapter !== 'jest' && adapter !== 'vitest') return null;

  return {
    command: slot,
    adapter,
    selector: { kind: 'related', maxFiles: DEFAULTS.checks.maxSelectedTestFiles },
  };
}

function mappingNotice(slot: 'lint' | 'unit' | 'e2e', detected: DetectedProject): string {
  const adapter = detected[slot]?.adapter ?? 'this runner';
  return [
    `${detected.id}: the "${slot}" command is configured, but ${adapter} cannot report which tests a change affects.`,
    `The check is left null until you add a mapping, for example:`,
    `  checks:`,
    `    ${slot}:`,
    `      command: ${slot}`,
    `      adapter: ${detected[slot]?.adapter ?? 'pytest'}`,
    `      selector:`,
    `        kind: mapping`,
    `        mappings:`,
    `          - source: ["src/orders/**/*.py"]`,
    `            tests: ["tests/orders/test_*.py"]`,
  ].join('\n');
}

const HEADER_COMMENT = ` AMBICODE configuration. This file is yours to edit; init --apply adds missing
 entries and rewrites only the values you accepted at its question.

 A null command is intentionally unavailable: its check is skipped with a
 notice rather than replaced by a guess. Commands are an executable plus
 arguments, never a shell string, and "{files}" must be an argument of its own.

 Run \`ambicode config\` to see the effective values, including the limits that
 are not written here.`;
