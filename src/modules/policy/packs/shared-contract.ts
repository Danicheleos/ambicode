import path from 'node:path';
import { contentHash } from '#util/hash';
import { promptsDirectory } from '#util/plugin-root';
import type { FileSystem } from '#types/platform/ports';

interface SessionContract {
  reference: string;
  content: string;
  contentHash: string;
}

const SESSION_CONTRACT_FILE = 'session-contract.md';
const SESSION_CONTRACT_REFERENCE = `builtin/prompts/${SESSION_CONTRACT_FILE}`;

export async function readSessionContract(fs: FileSystem, pluginRoot: string): Promise<SessionContract> {
  const content = await fs.readText(path.join(promptsDirectory(pluginRoot), SESSION_CONTRACT_FILE));
  return { reference: SESSION_CONTRACT_REFERENCE, content, contentHash: contentHash(content) };
}
