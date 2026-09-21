import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import { contentHash } from '../util/hash.ts';
import { promptsDirectory } from '../util/plugin-root.ts';

/**
 * The one canonical shared operating contract (doc 04 P2.4 correction A4):
 * read from exactly this location by exactly this function, so `ambicode
 * prepare` (for investigate/plan/task) and the isolated reviewer's prompt
 * composition (`src/review/prompt.ts`) never each locate and read it
 * independently. It is workflow-neutral — evidence, untrusted content, and
 * policy-authority handling that applies to every activity — with anything
 * reviewer-specific (finding/output rules) kept in `reviewer-role.md`
 * (correction A5).
 */
export const SHARED_OPERATING_CONTRACT_FILE = 'shared-operating-contract.md';
export const SHARED_OPERATING_CONTRACT_REFERENCE = `builtin/prompts/${SHARED_OPERATING_CONTRACT_FILE}`;

export interface SharedOperatingContract {
  reference: string;
  content: string;
  contentHash: string;
}

export async function readSharedOperatingContract(
  fs: FileSystem,
  pluginRoot: string,
): Promise<SharedOperatingContract> {
  const absolutePath = path.join(promptsDirectory(pluginRoot), SHARED_OPERATING_CONTRACT_FILE);
  const content = await fs.readText(absolutePath);
  return { reference: SHARED_OPERATING_CONTRACT_REFERENCE, content, contentHash: contentHash(content) };
}
