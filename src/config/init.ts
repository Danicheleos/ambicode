import type { FileSystem } from '../ports/filesystem.ts';
import path from 'node:path';
import { Document, isMap, isSeq, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml';
import type { AmbicodeConfig } from '../contracts/config.ts';
import { AmbicodeError } from '../util/errors.ts';
import { normalizeRelative } from '../util/paths.ts';
import { CONFIG_FILE, DEFAULTS } from './defaults.ts';
import { suggestedPacks, type DetectedProject } from './detect.ts';
import { parseConfig } from './load.ts';

export interface InitPlan {
  yaml: string | null;
  created: boolean;
  changes: string[];
  notices: string[];
  ruleSources: string[];
  config: AmbicodeConfig;
}

export interface PlanInitOptions {
  fs: FileSystem;
  repositoryRoot: string;
  detected: readonly DetectedProject[];
  baseline: string;
  baselineNotice: string;
  /** `--mcp-server`: the server to pin `requirements.mcpServer` to; null or absent leaves it alone. */
  mcpServer?: string | null;
}

export async function planInit(options: PlanInitOptions): Promise<InitPlan> {
  if (options.mcpServer != null) requireServerName(options.mcpServer);
  const filePath = path.join(options.repositoryRoot, CONFIG_FILE);
  let existingRaw: string | null = null;
  try {
    existingRaw = await options.fs.readText(filePath);
  } catch {
    existingRaw = null;
  }

  const plan = existingRaw === null ? createFresh(options) : updateExisting(existingRaw, options);
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

/** The binding is compared as an exact string, so a name that only differs by padding would never match. */
function requireServerName(name: string): void {
  if (name.trim() !== '' && name === name.trim()) return;
  throw new AmbicodeError('bad-argument', '"--mcp-server" needs the exact name of the MCP server.', {
    field: '--mcp-server',
    details: [
      'Give the server name as the session shows it, with no leading or trailing whitespace.',
      'The name is compared to what a requirement envelope declares, character for character.',
    ],
  });
}

function pinnedChange(name: string): string {
  return `Set "requirements.mcpServer: ${name}".`;
}

function createFresh(options: PlanInitOptions): InitPlan {
  const changes: string[] = [];
  const pinned = options.mcpServer ?? null;
  const notices: string[] = [options.baselineNotice];
  if (pinned === null) notices.push(MCP_BINDING_NOTICE);
  else changes.push(pinnedChange(pinned));

  const projects = options.detected.map((detected) => {
    notices.push(...detected.notices.map((notice) => `${detected.id}: ${notice}`));
    return projectNode(detected, changes, notices);
  });

  if (projects.length === 0) {
    projects.push({
      id: 'app',
      root: '.',
      ecosystem: 'typescript',
      packs: suggestedPacks('typescript'),
      policyFiles: [],
      commands: { lint: null, unit: null, e2e: null },
      checks: { lint: null, unit: null, e2e: null },
    });
    notices.push(
      'No package.json or pyproject.toml was found, so one project covering the repository root was written with every command null.',
    );
  }

  const document = new Document({
    schemaVersion: DEFAULTS.schemaVersion,
    baseline: options.baseline,
    review: { ...DEFAULTS.review },
    checks: { ...DEFAULTS.checks },
    page: { ...DEFAULTS.page },
    requirements: { mcpServer: pinned },
    projects,
    remoteChecks: { image: null },
    authoring: { ...DEFAULTS.authoring },
  });
  document.commentBefore = HEADER_COMMENT;

  const yaml = document.toString({ lineWidth: 100 });
  return { yaml, created: true, changes, notices, ruleSources: [], config: parseConfig(yaml) };
}

function updateExisting(existingRaw: string, options: PlanInitOptions): InitPlan {
  // A document, not plain data, so the user's comments and formatting survive.
  const document = parseDocument(existingRaw);
  const changes: string[] = [];
  const notices: string[] = [];

  pinMcpServer(document, options.mcpServer ?? null, changes, notices);

  if (document.get('authoring') === undefined) {
    document.set('authoring', document.createNode({ ...DEFAULTS.authoring }));
    changes.push(`Added "authoring.editReminders: ${DEFAULTS.authoring.editReminders}" (the documented default).`);
  }

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
      projectsNode?.add(document.createNode(projectNode(detected, changes, notices)));
      changes.push(`Added project "${detected.id}" for root "${detected.root}".`);
      continue;
    }
    addMissingCommands(document, existing, detected, changes, notices);
    addMissingFrameworkPacks(document, existing, detected, changes);
  }

  if (changes.length === 0) {
    notices.push('Everything detected is already described in the configuration; nothing was changed.');
    return { yaml: null, created: false, changes, notices, ruleSources: [], config: parseConfig(existingRaw) };
  }

  const yaml = document.toString({ lineWidth: 100 });
  return { yaml, created: false, changes, notices, ruleSources: [], config: parseConfig(yaml) };
}

/** Never overwrites: a value that differs is the user's decision to change, in the file. */
function pinMcpServer(document: Document, requested: string | null, changes: string[], notices: string[]): void {
  const requirementsNode = document.get('requirements');
  const current = isMap(requirementsNode) ? requirementsNode.get('mcpServer') : null;

  if (current == null) {
    if (requested === null) {
      notices.push(MCP_BINDING_NOTICE);
      return;
    }
    if (isMap(requirementsNode)) requirementsNode.set('mcpServer', requested);
    else document.set('requirements', document.createNode({ mcpServer: requested }));
    changes.push(pinnedChange(requested));
    return;
  }
  if (requested === null) return;

  if (current === requested) {
    notices.push(`requirements.mcpServer is already "${requested}"; --mcp-server changed nothing.`);
    return;
  }
  throw new AmbicodeError(
    'requirements-server-bound',
    'requirements.mcpServer is already bound to a different MCP server, so it was not changed.',
    {
      field: 'requirements.mcpServer',
      details: [
        `Bound: "${String(current)}". Requested: "${requested}".`,
        'Evidence from any server other than the bound one is refused, so the binding is not overwritten.',
        'To change it deliberately, edit requirements.mcpServer in .ambicode/config.yaml yourself.',
      ],
    },
  );
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
  const commands = projectNodeMap.get('commands') as YAMLMap | undefined;
  const checks = projectNodeMap.get('checks') as YAMLMap | undefined;
  if (commands === undefined || checks === undefined) return;

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
    commands.set(slot, candidate?.argv == null ? null : document.createNode({ argv: candidate.argv }));
    changes.push(
      candidate?.argv == null
        ? `Added a null "${slot}" command slot to project "${detected.id}".`
        : `Added a "${slot}" command to project "${detected.id}" (${candidate.notice}).`,
    );
    if (!checks.has(slot)) {
      const check = candidate?.argv == null ? null : checkFor(slot, detected);
      checks.set(slot, check === null ? null : document.createNode(check));
      if (candidate?.argv != null && check === null) notices.push(mappingNotice(slot, detected));
    }
  }
}

function projectNode(
  detected: DetectedProject,
  changes: string[],
  notices: string[],
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

  return {
    id: detected.id,
    root: detected.root,
    ecosystem: detected.ecosystem,
    packs: [...suggestedPacks(detected.ecosystem), ...detected.frameworkPacks],
    policyFiles: [],
    commands,
    checks,
  };
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

const HEADER_COMMENT = ` AMBICODE configuration. This file is yours to edit; init adds missing entries
 and never rewrites a value you have set.

 A null command is intentionally unavailable: its check is skipped with a
 notice rather than replaced by a guess. Commands are an executable plus
 arguments, never a shell string, and "{files}" must be an argument of its own.

 Run \`ambicode config\` to see the effective values, including the limits that
 are not written here.`;
