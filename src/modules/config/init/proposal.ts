import path from 'node:path';
import { AmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { GITIGNORE_ENTRIES } from '#types/defaults';
import { SUPPORTED_SCHEMA_VERSION } from '#types/modules/config';
import { parseConfigWithNotices } from '../load.ts';
import type { FileSystem } from '#types/platform/ports';

export const DRAFT_FILE = '.ambicode/config.draft.yaml';
/** The model's config YAML exactly as `init propose` received it; `init.propose` validates it, so a bad field returns to `detect`. */
export const PROPOSAL_FILE = 'proposal.yaml';

/** The YAML a model proposes (a ```yaml fence around it is tolerated), read through the config schema. Returns the text to save. */
export function parseDraft(text: string): string {
  const body = /```ya?ml\s*\n([\s\S]*?)```/.exec(text)?.[1] ?? text;
  try {
    const { config } = parseConfigWithNotices(body);
    if (config.schemaVersion === SUPPORTED_SCHEMA_VERSION) return body;
    throw new AmbicodeError('config-invalid', `schemaVersion must be ${SUPPORTED_SCHEMA_VERSION}.`);
  } catch (error) {
    if (!(error instanceof AmbicodeError)) throw error;
    throw new AmbicodeError('init-proposal-invalid', [error.message, ...(error.details ?? [])].join(' '), { details: ['Fix the YAML and run `init propose` again.'] });
  }
}

/** Saves the draft Apply will write, exactly; its hash is what the answer is pinned to. */
export async function saveDraft(fs: FileSystem, repositoryRoot: string, yaml: string): Promise<string> {
  const file = path.join(repositoryRoot, DRAFT_FILE);
  await fs.mkdirp(path.dirname(file));
  await fs.writeText(file, yaml);
  return contentHash(yaml);
}

/** `.gitignore` lines `init --apply` adds; `/x/` and `x/` are one rule to git. */
export async function writeGitignore(fs: FileSystem, repositoryRoot: string): Promise<string[]> {
  const file = path.join(repositoryRoot, '.gitignore');
  const existing = await fs.readText(file).catch(() => '');
  const anchored = (entry: string): string => entry.replace(/^\//, '');
  const lines = new Set(existing.split('\n').map((line) => anchored(line.trim())));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !lines.has(anchored(entry)));
  if (missing.length > 0) await fs.writeText(file, `${existing}${existing === '' || existing.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`);
  return missing;
}
