import path from 'node:path';
import { CONFIG_DIR, CONFIG_FILE, IGNORE_ENTRIES } from '../../config/defaults.ts';
import { detectBaseline, detectProjects } from '../../config/detect.ts';
import { planInit } from '../../config/init.ts';
import { openRepository, type Runtime } from '../../composition/root.ts';
import type { FileSystem } from '../../ports/filesystem.ts';
import type { ParsedArgs } from '../args.ts';
import { navigationFor, type NavigationGuidance } from '../../code-intelligence/navigation.ts';

export const INIT_OPTIONS = { values: ['mcp-server'], flags: ['json', 'dry-run'] } as const;

export interface InitOutput {
  command: 'init';
  configPath: string;
  created: boolean;
  written: boolean;
  changes: string[];
  notices: string[];
  /**
   * Rule files detected by existence only: migration candidates for `/ambicode:rules`, never
   * rules init has understood. The runtime reads policy only from YAML packs.
   */
  ruleSources: string[];
  projects: { id: string; root: string; ecosystem: string; configured: string[]; missing: string[]; navigation: NavigationGuidance }[];
}

/**
 * First run writes a configuration the user owns; later runs propose additions only. Runs no
 * project script and installs nothing, so it is safe on a freshly cloned repository.
 */
export async function runInit(runtime: Runtime, args: ParsedArgs): Promise<InitOutput> {
  const { fs } = runtime;
  const { git, repositoryRoot } = await openRepository(runtime);

  const detected = await detectProjects(fs, repositoryRoot);
  const baseline = await detectBaseline(repositoryRoot, () => git.originHead());
  const plan = await planInit({
    fs,
    repositoryRoot,
    detected,
    baseline: baseline.baseline,
    baselineNotice: baseline.notice,
    mcpServer: args.value('mcp-server'),
  });

  const configPath = path.join(repositoryRoot, CONFIG_FILE);
  const dryRun = args.flag('dry-run');
  let written = false;

  if (plan.yaml !== null && !dryRun) {
    await fs.mkdirp(path.join(repositoryRoot, CONFIG_DIR));
    await fs.writeText(configPath, plan.yaml);
    written = true;
    await addIgnoreEntries(fs, repositoryRoot, plan.notices);
  }

  return {
    command: 'init',
    configPath,
    created: plan.created,
    written,
    changes: plan.changes,
    notices: plan.notices,
    ruleSources: plan.ruleSources,
    projects: plan.config.projects.map((project) => ({
      id: project.id,
      root: project.root,
      ecosystem: project.ecosystem,
      navigation: navigationFor(project.ecosystem),
      configured: Object.entries(project.checks)
        .filter(([, check]) => check !== null)
        .map(([id]) => id)
        .sort(),
      missing: Object.entries(project.checks)
        .filter(([, check]) => check === null)
        .map(([id]) => id)
        .sort(),
    })),
  };
}

async function addIgnoreEntries(fs: FileSystem, repositoryRoot: string, notices: string[]): Promise<void> {
  const ignorePath = path.join(repositoryRoot, '.gitignore');
  let existing = '';
  try {
    existing = await fs.readText(ignorePath);
  } catch {
    existing = '';
  }
  // A pattern containing a slash is already anchored, so `/x/` and `x/` are the same rule to git.
  const anchored = (entry: string): string => entry.replace(/^\//, '');
  const lines = new Set(existing.split('\n').map((line) => anchored(line.trim())));
  const missing = IGNORE_ENTRIES.filter((entry) => !lines.has(anchored(entry)));
  if (missing.length === 0) return;

  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  await fs.writeText(ignorePath, `${existing}${separator}${missing.join('\n')}\n`);
  notices.push(`Added ${missing.join(', ')} to .gitignore so review artifacts are not committed.`);
}

export function renderInit(output: InitOutput): string {
  const lines: string[] = [];
  if (!output.written && !output.created && output.changes.length === 0) {
    lines.push(`Checked ${output.configPath}: nothing to change.`);
  } else {
    lines.push(output.created ? `Created ${output.configPath}` : `Updated ${output.configPath}`);
    if (!output.written) lines.push('(dry run: nothing was written)');
  }

  for (const project of output.projects) {
    lines.push('');
    lines.push(`${project.id}  [${project.ecosystem}]  root: ${project.root}`);
    lines.push(`  checks configured: ${project.configured.join(', ') || '(none)'}`);
    lines.push(`  checks missing:    ${project.missing.join(', ') || '(none)'}`);
    lines.push(`  code intelligence: ${project.navigation.plugin} (session-observed; optional setup below)`);
    lines.push(...project.navigation.setupCommands.map((command) => `    ${command}`));
  }

  if (output.ruleSources.length > 0) {
    lines.push('', 'Rule sources to migrate (none was read):');
    for (const source of output.ruleSources) lines.push(`  - ${source}`);
    lines.push('  Run /ambicode:rules to turn the rules these state into scoped YAML packs.');
  }

  if (output.changes.length > 0) {
    lines.push('', 'Changes:');
    for (const change of output.changes) lines.push(`  - ${change}`);
  }
  if (output.notices.length > 0) {
    lines.push('', 'Notices:');
    for (const notice of output.notices) lines.push(`  - ${notice.split('\n').join('\n    ')}`);
  }
  return lines.join('\n');
}
