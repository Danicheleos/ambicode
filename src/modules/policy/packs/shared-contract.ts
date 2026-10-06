import path from 'node:path';
import { contentHash } from '#util/hash';
import { promptsDirectory } from '#util/plugin-root';
import type { FileSystem } from '#types/ports';

/** Read only via `readSharedOperatingContract`; reviewer-only rules belong in `reviewer-role.md`. */
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

/** The short form the session hooks deliver; `prepare` and the reviewer keep the full contract above. */
export const SESSION_CONTRACT_FILE = 'session-contract.md';
export const SESSION_CONTRACT_REFERENCE = `builtin/prompts/${SESSION_CONTRACT_FILE}`;

export async function readSessionContract(fs: FileSystem, pluginRoot: string): Promise<SharedOperatingContract> {
  const content = await fs.readText(path.join(promptsDirectory(pluginRoot), SESSION_CONTRACT_FILE));
  return { reference: SESSION_CONTRACT_REFERENCE, content, contentHash: contentHash(content) };
}
