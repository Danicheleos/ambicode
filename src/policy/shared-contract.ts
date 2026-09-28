import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import { contentHash } from '../util/hash.ts';
import { promptsDirectory } from '../util/plugin-root.ts';

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
