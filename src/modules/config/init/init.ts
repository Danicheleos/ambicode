import path from 'node:path';
import { Document, isMap, isSeq, parseDocument, Scalar, visit, type YAMLMap, type YAMLSeq } from 'yaml';
import type { AmbicodeConfig, SetPair } from '#types/modules/config';
import { normalizeRelative } from '#util/paths';
import type { Ecosystem } from '#types/primitives';
import { CONFIG_FILE, DEFAULTS, TEST_EXCLUDES } from '#types/defaults';
import { configSlot, projectOfKey } from './init-sets.ts';
import { parseConfig } from '../load.ts';
import type { FileSystem } from '#types/platform/ports';
import type { PlanInitOptions } from '../types/init.ts';
import type { ProposalInput } from '#types/modules/config';

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

interface InitPlan {
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

const REMOVED_FIELDS = [['requirements', 'lsp'], ['task', 'lspPlugins'], ['search', 'exactMaxFiles']] as const;
const ECOSYSTEMS: readonly string[] = ['typescript', 'python'];
/** Only these adapters know how to read a runner's output; any other tool runs as `generic`. */
const ADAPTERS: readonly string[] = ['eslint', 'ruff', 'jest', 'vitest', 'pytest', 'playwright'];

/** The config schema holds three ecosystems; the model's free text outside the first two is `generic`. */
const ecosystemOf = (text: string): Ecosystem => (ECOSYSTEMS.includes(text.toLowerCase()) ? (text.toLowerCase() as Ecosystem) : 'generic');

type ProposedProject = ProposalInput['projects'][number];
const commandOf = (project: ProposedProject, slot: string): readonly string[] | null =>
  (project.commands as Record<string, readonly string[] | null | undefined>)[slot === 'unit' ? 'test' : slot] ?? null;

const overrideOf = (options: PlanInitOptions, key: string): SetPair | undefined => options.overrides?.find((pair) => pair.key === key);

/** Lint needs no selector; a test command gets a check only when its runner's output can be parsed (jest, vitest). */
function checkFor(slot: string, argv: readonly string[], project: ProposedProject): Record<string, unknown> | null {
  const adapter = ADAPTERS.find((name) => argv.some((token) => token.split(/[\\/]/).at(-1)?.replace(/\.(cmd|exe)$/, '') === name)) ?? 'generic';
  if (slot === 'lint') return { command: 'lint', adapter, ...(project.shortlist.length === 0 ? {} : { include: project.shortlist }) };
  // `related` and `command` selectors were cut (Phase 6a); a mapping from any source to the conventional test names is the generic start, edited per project.
  if (slot === 'unit' && (adapter === 'jest' || adapter === 'vitest')) return { command: 'unit', adapter, selector: { kind: 'mapping', maxFiles: DEFAULTS.checks.maxSelectedTestFiles, mappings: [{ source: ['**/*'], tests: ['**/*.{test,spec}.*'] }] } };
  return null;
}

function projectNode(project: ProposedProject): Record<string, unknown> {
  const commands: Record<string, unknown> = {};
  const checks: Record<string, unknown> = {};
  for (const slot of ['lint', 'unit', 'typecheck', 'e2e', 'format']) {
    const argv = commandOf(project, slot);
    commands[slot] = argv === null ? null : { argv: [...argv] };
    if (slot === 'lint' || slot === 'unit') checks[slot] = argv === null ? null : checkFor(slot, argv, project);
  }
  return {
    id: project.id,
    root: project.root,
    ecosystem: ecosystemOf(project.ecosystem),
    packs: [...project.packs],
    policyFiles: [],
    shortlist: { include: [...project.shortlist], exclude: [...TEST_EXCLUDES] },
    commands,
    checks,
  };
}

function createFresh(options: PlanInitOptions): InitPlan {
  const { input } = options;
  const notices = [options.baselineNotice];
  const mcpServer = input.requirements.mcpServer;
  if (mcpServer === null && overrideOf(options, 'requirements.mcpServer') === undefined) notices.push(MCP_BINDING_NOTICE);
  const changes = input.projects.map((project) => `Configured project "${project.id}" (${project.ecosystem}) at "${project.root}".`);
  const document = new Document({
    schemaVersion: DEFAULTS.schemaVersion,
    baseline: options.baseline,
    review: { ...DEFAULTS.review },
    checks: { ...DEFAULTS.checks },
    requirements: { mcpServer, acceptanceField: DEFAULTS.requirements.acceptanceField },
    guard: { askOutsideMap: false },
    projects: input.projects.map(projectNode),
    authoring: { ...DEFAULTS.authoring },
  });
  document.commentBefore = HEADER_COMMENT;
  applyOverrides(document, options, changes);
  const yaml = document.toString({ lineWidth: 100 });
  return { yaml, created: true, changes, notices, ruleSources: [], config: parseConfig(yaml) };
}

/** Schema 1/2 to 3 through the document API: removed fields deleted and named, missing v3 slots added. */
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
    [['guard', 'askOutsideMap'], false],
  ];
  for (const [where, value] of added) {
    if (document.hasIn(where)) continue;
    document.setIn(where, document.createNode(value));
    changes.push(`Added "${where.join('.')}: ${JSON.stringify(value)}".`);
  }
}

/** Accepted values override their slots, set or not. */
function applyOverrides(document: Document, options: PlanInitOptions, changes: string[]): void {
  for (const pair of options.overrides ?? []) {
    const project = projectOfKey(pair.key);
    if (project !== null) {
      const node = ((document.get('projects') as YAMLSeq | undefined)?.items as YAMLMap[] | undefined)?.find((item) => item.get('id') === project);
      if (node === undefined) continue;
      node.setIn(['commands', pair.key.split('.').at(-1)!], pair.value === null ? null : document.createNode({ argv: pair.value }));
    } else document.setIn(pair.key.split('.'), pair.value);
    changes.push(`Set "${pair.key}" to ${JSON.stringify(pair.value)} (accepted).`);
  }
}

function updateExisting(existingRaw: string, options: PlanInitOptions): InitPlan {
  // A document, not plain data, so the user's comments and formatting survive.
  const document = parseDocument(existingRaw);
  const preservedFlowSeqs = collectPreservedFlowSeqs(document, existingRaw);
  const changes: string[] = [];
  const notices: string[] = [];

  if (document.get('authoring') === undefined) {
    document.set('authoring', document.createNode({ ...DEFAULTS.authoring }));
    changes.push(`Added "authoring.editReminders: ${DEFAULTS.authoring.editReminders}" (the documented default).`);
  }
  migrate(document, changes, notices);

  const proposed = options.input.requirements.mcpServer;
  const bound = document.getIn(['requirements', 'mcpServer']);
  if (bound == null && proposed !== null) {
    document.setIn(['requirements', 'mcpServer'], proposed);
    changes.push(`Set "requirements.mcpServer" to "${proposed}".`);
  } else if (bound == null) notices.push(MCP_BINDING_NOTICE);

  const projectsNode = document.get('projects') as YAMLSeq | undefined;
  const existingRoots = new Map<string, YAMLMap>();
  for (const item of (projectsNode?.items ?? []) as YAMLMap[]) {
    const root = item.get('root');
    if (typeof root === 'string') existingRoots.set(normalizeRelative(root), item);
  }
  for (const project of options.input.projects) {
    const existing = existingRoots.get(normalizeRelative(project.root));
    if (existing === undefined) {
      projectsNode?.add(document.createNode(projectNode(project)));
      changes.push(`Added project "${project.id}" for root "${project.root}".`);
      continue;
    }
    addMissing(document, existing, project, changes);
  }
  applyOverrides(document, options, changes);

  if (changes.length === 0) {
    notices.push('The proposal is already described in the configuration; nothing was changed.');
    return { yaml: null, created: false, changes, notices, ruleSources: [], config: parseConfig(existingRaw) };
  }
  const yaml = stringifyPreserving(document, preservedFlowSeqs, existingRaw);
  return { yaml, created: false, changes, notices, ruleSources: [], config: parseConfig(yaml) };
}

/** A value the user set, including an explicit null, stays exactly as it is; only absent slots, packs and shortlist are filled. */
function addMissing(document: Document, existing: YAMLMap, project: ProposedProject, changes: string[]): void {
  const wanted = projectNode(project);
  const commands = (existing.get('commands') ?? existing.set('commands', document.createNode({})) ?? existing.get('commands')) as YAMLMap;
  const checks = (existing.get('checks') ?? existing.set('checks', document.createNode({})) ?? existing.get('checks')) as YAMLMap;
  for (const [slot, value] of Object.entries(wanted['commands'] as Record<string, unknown>)) {
    if (commands.has(slot)) continue;
    commands.set(slot, document.createNode(value));
    changes.push(`Added ${value === null ? 'a null' : 'a'} "${slot}" command to project "${project.id}".`);
    const check = (wanted['checks'] as Record<string, unknown>)[slot];
    if (check !== undefined && !checks.has(slot)) checks.set(slot, document.createNode(check));
  }
  const packs = existing.get('packs');
  const enabled = new Set<unknown>(isSeq(packs) ? packs.toJSON() : []);
  const missing = project.packs.filter((pack) => !enabled.has(pack));
  if (missing.length > 0) {
    if (isSeq(packs)) for (const pack of missing) packs.add(pack);
    else existing.set('packs', document.createNode(missing));
    changes.push(`Enabled ${missing.join(', ')} for project "${project.id}".`);
  }
  if (existing.get('shortlist') === undefined) {
    existing.set('shortlist', document.createNode(wanted['shortlist']));
    changes.push(`Added "shortlist" for project "${project.id}".`);
  }
}

const HEADER_COMMENT = ` AMBICODE configuration. This file is yours to edit; init --apply adds missing
 entries and rewrites only the values you accepted at its question.

 A null command is intentionally unavailable: its check is skipped with a
 notice rather than replaced by a guess. Commands are an executable plus
 arguments, never a shell string, and "{files}" must be an argument of its own.`;
