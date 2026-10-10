import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { AmbicodeConfig, SUPPORTED_SCHEMA_VERSION } from '#types/modules/config';
import { AmbicodeError, messageOf } from '#util/errors';
import { CONFIG_FILE } from '#types/defaults';
import type { FileSystem } from '#types/platform/ports';

export interface LoadedConfig {
  config: AmbicodeConfig;
  filePath: string;
  raw: string;
}

export async function loadConfig(fs: FileSystem, repositoryRoot: string): Promise<LoadedConfig> {
  const filePath = path.join(repositoryRoot, CONFIG_FILE);
  let raw: string;
  try {
    raw = await fs.readText(filePath);
  } catch (cause) {
    throw new AmbicodeError('config-missing', `No ${CONFIG_FILE} in this repository. Run the AMBICODE init skill first.`, { field: CONFIG_FILE, cause });
  }
  return { config: parseConfig(raw), filePath, raw };
}

export function parseConfig(raw: string): AmbicodeConfig {
  let document: unknown;
  try {
    document = parseYaml(raw);
  } catch (cause) {
    throw new AmbicodeError('config-invalid', `${CONFIG_FILE} is not valid YAML.`, { field: CONFIG_FILE, details: [messageOf(cause)] });
  }
  const declared = document !== null && typeof document === 'object' ? (document as Record<string, unknown>)['schemaVersion'] : undefined;
  if (typeof declared === 'number' && declared > SUPPORTED_SCHEMA_VERSION) {
    throw new AmbicodeError('config-schema-too-new', `${CONFIG_FILE} declares schemaVersion ${declared}; this AMBICODE release supports ${SUPPORTED_SCHEMA_VERSION}. Upgrade the plugin instead of editing the file.`, { field: 'schemaVersion' });
  }
  // Older files differ in shape, so field errors would only mislead; the remedy is one step.
  if (declared !== SUPPORTED_SCHEMA_VERSION) {
    throw new AmbicodeError('config-invalid', `${CONFIG_FILE} is schemaVersion ${String(declared)}, not ${SUPPORTED_SCHEMA_VERSION}: run /ambicode:init again.`, { field: 'schemaVersion' });
  }
  const parsed = AmbicodeConfig.safeParse(document);
  if (!parsed.success) {
    throw new AmbicodeError('config-invalid', `${CONFIG_FILE} is not a valid AMBICODE configuration.`, { field: CONFIG_FILE, details: describeIssues(parsed.error) });
  }
  validateCrossFieldRules(parsed.data);
  return parsed.data;
}

/** Reports the field and the expected shape, never the offending value. */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length === 0 ? '(root)' : issue.path.join('.');
    return `${where}: ${issue.message}`;
  });
}

function validateCrossFieldRules(config: AmbicodeConfig): void {
  const details: string[] = [];
  const seenIds = new Set<string>();

  for (const project of config.projects) {
    if (seenIds.has(project.id)) details.push(`projects: duplicate project id "${project.id}"`);
    seenIds.add(project.id);

    for (const reference of project.packs) {
      if (!/^builtin\/[a-z0-9]+(-[a-z0-9]+)*$/.test(reference)) {
        details.push(`projects.${project.id}.packs: "${reference}" must be "builtin/<pack-id>"; project-owned packs belong in policyFiles`);
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
