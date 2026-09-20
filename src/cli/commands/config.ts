import { MAX_SNAPSHOT_FILE_BYTES, MAX_SNAPSHOT_TOTAL_BYTES } from '../../config/defaults.ts';
import type { AmbicodeConfig } from '../../contracts/config.ts';
import { openWorkspace, type Runtime } from '../../composition/root.ts';

export const CONFIG_OPTIONS = { flags: ['json'] } as const;

export interface ConfigOutput {
  command: 'config';
  configPath: string;
  repositoryRoot: string;
  baseline: string;
  review: AmbicodeConfig['review'];
  checks: AmbicodeConfig['checks'];
  page: AmbicodeConfig['page'];
  /** Limits that are not written into the file, so nobody has to guess them. */
  internalLimits: { snapshotFileBytes: number; snapshotTotalBytes: number };
  projects: {
    id: string;
    root: string;
    ecosystem: string;
    packs: string[];
    commands: { id: string; argv: string[] | null }[];
    checks: { id: string; command: string | null; adapter: string | null; selector: string }[];
  }[];
}

/** The effective values, so a guide never has to repeat a number (doc 05). */
export async function runConfig(runtime: Runtime): Promise<ConfigOutput> {
  const workspace = await openWorkspace(runtime);
  const config = workspace.config;

  return {
    command: 'config',
    configPath: workspace.configPath,
    repositoryRoot: workspace.repositoryRoot,
    baseline: config.baseline,
    review: config.review,
    checks: config.checks,
    page: config.page,
    internalLimits: {
      snapshotFileBytes: MAX_SNAPSHOT_FILE_BYTES,
      snapshotTotalBytes: MAX_SNAPSHOT_TOTAL_BYTES,
    },
    projects: config.projects.map((project) => ({
      id: project.id,
      root: project.root,
      ecosystem: project.ecosystem,
      packs: project.packs,
      commands: Object.entries(project.commands)
        .map(([id, command]) => ({ id, argv: command?.argv ?? null }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      checks: Object.entries(project.checks)
        .map(([id, check]) => ({
          id,
          command: check?.command ?? null,
          adapter: check?.adapter ?? null,
          selector: check?.selector?.kind ?? (check === null ? 'unconfigured' : 'none'),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    })),
  };
}

export function renderConfig(output: ConfigOutput): string {
  const lines = [
    `configuration: ${output.configPath}`,
    `repository:    ${output.repositoryRoot}`,
    `baseline:      ${output.baseline === '' ? '(none recorded — branch review needs --base)' : output.baseline}`,
    '',
    'review limits',
    `  model               ${output.review.model}`,
    `  timeoutSeconds      ${output.review.timeoutSeconds}`,
    `  maxFindings         ${output.review.maxFindings}`,
    `  maxChangedFiles     ${output.review.maxChangedFiles}`,
    `  maxChangedLines     ${output.review.maxChangedLines}`,
    `  maxContextBytes     ${output.review.maxContextBytes}  (the patch and the mirrored files together)`,
    '',
    'check limits',
    `  timeoutSeconds        ${output.checks.timeoutSeconds}`,
    `  maxSelectedTestFiles  ${output.checks.maxSelectedTestFiles}`,
    '',
    'not configurable',
    `  snapshot file bytes   ${output.internalLimits.snapshotFileBytes}`,
    `  snapshot total bytes  ${output.internalLimits.snapshotTotalBytes}`,
  ];

  for (const project of output.projects) {
    lines.push('', `project ${project.id}  [${project.ecosystem}]  root: ${project.root}`);
    lines.push(`  packs: ${project.packs.join(', ') || '(none)'}`);
    for (const command of project.commands) {
      lines.push(`  command ${command.id}: ${command.argv === null ? 'null (intentionally unavailable)' : command.argv.join(' ')}`);
    }
    for (const check of project.checks) {
      lines.push(
        check.command === null
          ? `  check ${check.id}: null (skipped with a notice)`
          : `  check ${check.id}: ${check.command} via ${check.adapter}, selector ${check.selector}`,
      );
    }
  }
  return lines.join('\n');
}
