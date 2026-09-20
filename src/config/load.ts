import type { FileSystem } from '../ports/filesystem.ts';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { AmbicodeConfig, SUPPORTED_SCHEMA_VERSION } from '../contracts/config.ts';
import { AmbicodeError } from '../util/errors.ts';
import { normalizeRelative } from '../util/paths.ts';
import { CONFIG_FILE } from './defaults.ts';

export interface LoadedConfig {
  config: AmbicodeConfig;
  /** Absolute path of the file the configuration came from. */
  filePath: string;
  raw: string;
}

export async function loadConfig(fs: FileSystem, repositoryRoot: string): Promise<LoadedConfig> {
  const filePath = path.join(repositoryRoot, CONFIG_FILE);
  let raw: string;
  try {
    raw = await fs.readText(filePath);
  } catch (cause) {
    throw new AmbicodeError(
      'config-missing',
      `No ${CONFIG_FILE} in this repository. Run the AMBICODE init skill first.`,
      { field: CONFIG_FILE, cause },
    );
  }
  return { config: parseConfig(raw), filePath, raw };
}

export function parseConfig(raw: string): AmbicodeConfig {
  let document: unknown;
  try {
    document = parseYaml(raw);
  } catch (cause) {
    throw new AmbicodeError('config-unparsable', `${CONFIG_FILE} is not valid YAML.`, {
      field: CONFIG_FILE,
      details: [cause instanceof Error ? cause.message : String(cause)],
    });
  }
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new AmbicodeError('config-invalid', `${CONFIG_FILE} must contain a YAML mapping.`, {
      field: CONFIG_FILE,
    });
  }

  // Before field validation, so a future file yields an upgrade instruction
  // rather than a list of mismatched fields (doc 05).
  const declared = (document as Record<string, unknown>)['schemaVersion'];
  if (typeof declared === 'number' && declared > SUPPORTED_SCHEMA_VERSION) {
    throw new AmbicodeError(
      'config-schema-too-new',
      `${CONFIG_FILE} declares schemaVersion ${declared}; this AMBICODE release supports ${SUPPORTED_SCHEMA_VERSION}. Upgrade the plugin instead of editing the file.`,
      { field: 'schemaVersion' },
    );
  }

  const parsed = AmbicodeConfig.safeParse(document);
  if (!parsed.success) {
    throw new AmbicodeError('config-invalid', `${CONFIG_FILE} is not a valid AMBICODE configuration.`, {
      field: CONFIG_FILE,
      details: describeIssues(parsed.error),
    });
  }
  validateCrossFieldRules(parsed.data);
  return parsed.data;
}

/** Reports the field and the expected shape, never the offending value (doc 05). */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length === 0 ? '(root)' : issue.path.join('.');
    return `${where}: ${issue.message}`;
  });
}

function validateCrossFieldRules(config: AmbicodeConfig): void {
  const details: string[] = [];
  const seenIds = new Set<string>();
  const seenRoots = new Set<string>();

  for (const project of config.projects) {
    if (seenIds.has(project.id)) details.push(`projects: duplicate project id "${project.id}"`);
    seenIds.add(project.id);

    const root = normalizeRelative(project.root);
    if (seenRoots.has(root)) {
      details.push(`projects.${project.id}.root: duplicate root; each project needs a distinct root`);
    }
    seenRoots.add(root);

    for (const [checkId, check] of Object.entries(project.checks)) {
      if (check === null) continue;
      // A missing command ID is a configuration error; a null command is an
      // intentionally unavailable command (doc 05).
      if (!Object.hasOwn(project.commands, check.command)) {
        details.push(
          `projects.${project.id}.checks.${checkId}.command: "${check.command}" is not declared in projects.${project.id}.commands`,
        );
      }
      if (check.selector?.kind === 'command' && !Object.hasOwn(project.commands, check.selector.command)) {
        details.push(
          `projects.${project.id}.checks.${checkId}.selector.command: "${check.selector.command}" is not declared in projects.${project.id}.commands`,
        );
      }
    }

    for (const [commandId, command] of Object.entries(project.commands)) {
      if (command === null) continue;
      details.push(...validateArgv(`projects.${project.id}.commands.${commandId}.argv`, command.argv));
      if (command.cwd !== undefined && normalizeRelative(command.cwd).startsWith('..')) {
        details.push(`projects.${project.id}.commands.${commandId}.cwd: must stay inside the project root`);
      }
    }

    for (const reference of project.packs) {
      if (!/^builtin\/[a-z0-9]+(-[a-z0-9]+)*$/.test(reference)) {
        details.push(
          `projects.${project.id}.packs: "${reference}" must be "builtin/<pack-id>"; project-owned packs belong in policyFiles`,
        );
      }
    }
  }

  if (details.length > 0) {
    throw new AmbicodeError('config-invalid', `${CONFIG_FILE} has inconsistent entries.`, {
      field: CONFIG_FILE,
      details,
    });
  }
}

/**
 * `{files}` must occupy a whole argument. Anything that only makes sense to a
 * shell is rejected rather than partially interpreted (doc 05).
 */
export function validateArgv(field: string, argv: readonly string[]): string[] {
  const details: string[] = [];
  let filesPlaceholders = 0;

  argv.forEach((argument, index) => {
    if (argument === '{files}') {
      filesPlaceholders += 1;
      return;
    }
    const placeholders = argument.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
    for (const placeholder of placeholders) {
      details.push(
        placeholder === '{files}'
          ? `${field}[${index}]: "{files}" must be the entire argument, not embedded in "${argument}"`
          : `${field}[${index}]: unsupported placeholder ${placeholder}`,
      );
    }
  });

  if (filesPlaceholders > 1) {
    details.push(`${field}: "{files}" may appear at most once`);
  }

  const executable = argv[0];
  if (executable !== undefined && /[;&|<>$`\n]/.test(executable)) {
    details.push(
      `${field}[0]: the first entry is an executable path, not a shell expression; split the arguments instead`,
    );
  }
  return details;
}
