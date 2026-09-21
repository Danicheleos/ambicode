import path from 'node:path';
import { CONFIG_DIR, CONFIG_FILE, IGNORE_ENTRIES } from '../../config/defaults.ts';
import { detectBaseline, detectProjects } from '../../config/detect.ts';
import { planInit } from '../../config/init.ts';
import { openRepository, type Runtime } from '../../composition/root.ts';
import type { FileSystem } from '../../ports/filesystem.ts';
import type { ParsedArgs } from '../args.ts';
import { navigationFor, type NavigationGuidance } from '../../code-intelligence/navigation.ts';

export const INIT_OPTIONS = { flags: ['json', 'dry-run'] } as const;

export interface InitOutput {
  command: 'init';
  configPath: string;
  created: boolean;
  written: boolean;
  changes: string[];
  notices: string[];
  projects: { id: string; root: string; ecosystem: string; configured: string[]; missing: string[]; navigation: NavigationGuidance }[];
}

/**
 * First run writes a configuration the user owns; every later run proposes
 * additions only. Nothing here executes a project script or installs anything,
 * so init is safe to run on a repository you have just cloned (doc 05).
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
    projects: plan.config.projects.map((project) => ({
      id: project.id,
      root: project.root,
      ecosystem: project.ecosystem,
      navigation: navigationFor(project.ecosystem),
      // "Show configured and missing checks" (P1.2 item 2): a slot that is null
      // is stated as missing rather than left for the reader to infer.
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

/** Keeps review artifacts out of the product's history, without rewriting the file. */
async function addIgnoreEntries(fs: FileSystem, repositoryRoot: string, notices: string[]): Promise<void> {
  const ignorePath = path.join(repositoryRoot, '.gitignore');
  let existing = '';
  try {
    existing = await fs.readText(ignorePath);
  } catch {
    existing = '';
  }
  const lines = new Set(existing.split('\n').map((line) => line.trim()));
  const missing = IGNORE_ENTRIES.filter((entry) => !lines.has(entry));
  if (missing.length === 0) return;

  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  await fs.writeText(ignorePath, `${existing}${separator}${missing.join('\n')}\n`);
  notices.push(`Added ${missing.join(', ')} to .gitignore so review artifacts are not committed.`);
}

export function renderInit(output: InitOutput): string {
  const lines: string[] = [];
  lines.push(output.created ? `Created ${output.configPath}` : `Updated ${output.configPath}`);
  if (!output.written) lines.push('(nothing was written)');

  for (const project of output.projects) {
    lines.push('');
    lines.push(`${project.id}  [${project.ecosystem}]  root: ${project.root}`);
    lines.push(`  checks configured: ${project.configured.join(', ') || '(none)'}`);
    lines.push(`  checks missing:    ${project.missing.join(', ') || '(none)'}`);
    lines.push(`  code intelligence: ${project.navigation.plugin} (session-observed; optional setup below)`);
    lines.push(...project.navigation.setupCommands.map((command) => `    ${command}`));
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
