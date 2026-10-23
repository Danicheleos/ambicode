import path from 'node:path';
import { CONFIG_FILE } from '#types/defaults';
import { parseConfig } from '#modules/config/load';
import { isAmbicodeError } from '#util/errors';
import { matchesGlob } from '#util/glob';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import { openRepository } from '#platform/git/open';
import { recordInit } from '#modules/evidence/init-entry';
import type { AmbicodeConfig } from '#types/modules/config';
import type { CliCommand } from '../../types/cli.ts';

/** Schema-valid but factually empty: the init scout's reports can describe a project the repository does not have. Warnings do not fail the command; `issues` stay the schema errors. */
function configWarnings(config: AmbicodeConfig, trackedFiles: readonly string[]): string[] {
  const files = trackedFiles.map(normalizeRelative);
  const identical = new Map<string, string[]>();
  for (const project of config.projects) {
    const commands = Object.entries(project.checks).filter(([, spec]) => spec.all !== null || spec.file !== null).sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify([normalizeRelative(project.root), commands]);
    if (commands.length > 0) identical.set(key, [...(identical.get(key) ?? []), project.id]);
  }
  const duplicates = [...identical.entries()].filter(([, ids]) => ids.length > 1).map(([key, ids]) => `warning: projects ${ids.map((id) => `"${id}"`).join(', ')}: same root ${config.projects.find((p) => p.id === ids[0])?.root ?? key} and identical checks, so each runs the same command; scope each project's commands`);
  return [...duplicates, ...config.projects.flatMap((project) => {
    const root = normalizeRelative(project.root);
    const inside = files.flatMap((file) => toProjectRelative(root, file) ?? []);
    const where = root === '' ? 'the repository' : root;
    const warnings = Object.values(project.checks).every((spec) => spec.all === null && spec.file === null) ? [`warning: project "${project.id}": no checks configured`] : [];
    for (const entry of project.paths) {
      const dir = normalizeRelative(entry);
      if (!inside.some((file) => file === dir || file.startsWith(`${dir}/`))) warnings.push(`warning: project "${project.id}": paths entry "${entry}" matches no tracked file under ${where}`);
    }
    for (const glob of project.include) {
      if (!inside.some((file) => matchesGlob(file, glob))) warnings.push(`warning: project "${project.id}": include entry "${glob}" matches no tracked file under ${where}`);
    }
    return warnings;
  })];
}

/** `scout` hands the init skill the exact settings for the Agent call; it never re-reads the YAML by eye. The zod schema is the one source of truth; this lists every issue at once so one corrective Write can fix them all. */
export const configValidateCommand: CliCommand = {
  name: 'config validate',
  summary: `Check ${CONFIG_FILE} against the schema.`,
  options: { values: ['task'], flags: ['json'] },
  run: async (runtime, args) => {
    const { git, repositoryRoot } = await openRepository(runtime);
    let issues: string[] = [];
    let warnings: string[] = [];
    let scout: { model: string; effort: string } | undefined;
    try {
      const config = parseConfig(await runtime.fs.readText(path.join(repositoryRoot, CONFIG_FILE)));
      scout = { model: config.skills.init.scout.model, effort: config.skills.init.scout.effort };
      warnings = configWarnings(config, await git.listFiles(null));
    } catch (error) {
      if (!isAmbicodeError(error) && !(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      issues = isAmbicodeError(error) ? (error.details.length > 0 ? error.details : [error.message]) : [`${CONFIG_FILE}: missing`];
    }
    await recordInit(runtime, args.value('task'), 'config validate', issues.length > 0 ? `${issues.length} problems` : warnings.length > 0 ? `ok, ${warnings.length} warnings` : 'ok');
    return { text: issues.length === 0 && warnings.length === 0 ? 'ok' : [...issues, ...warnings].join('\n'), data: { ok: issues.length === 0, issues, warnings, ...(scout && { scout }) }, exitCode: issues.length === 0 ? 0 : 1 };
  },
};
