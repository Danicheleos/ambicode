import path from 'node:path';
import { contentHash } from '#util/hash';
import type { FileSystem } from '#types/platform/ports';
import { HOOK_STATE_DIR_NAME } from '#types/platform/claude';

/**
 * Per-session hook state, never written into the product repository: it lives in the session scratchpad or an owned
 * temporary directory, keyed by a hash of the session id so the directory name carries no session content.
 */

const DELIVERED_DIR = 'delivered';

export function hookStateBaseDir(fs: FileSystem, sessionId: string, scratchpadDir?: string): string {
  if (scratchpadDir !== undefined) return path.join(scratchpadDir, HOOK_STATE_DIR_NAME);
  const sessionKey = contentHash(sessionId).replace(/[^a-z0-9]/gi, '').slice(0, 40);
  return path.join(fs.temporaryRoot(), HOOK_STATE_DIR_NAME, sessionKey);
}

export async function cleanupSessionState(fs: FileSystem, baseDir: string): Promise<void> {
  await fs.remove(baseDir);
}

/**
 * One marker file per delivery kind holds the last value delivered (contract content, route step position, route whose
 * exit a Stop has seen), so no epoch id and no marker tree is kept. Only the latest value counts: a step position
 * delivered, left and reached again is delivered again. True when this call recorded a new value.
 */
export async function deliverOnce(fs: FileSystem, baseDir: string, kind: string, value: string): Promise<boolean> {
  const target = path.join(baseDir, DELIVERED_DIR, kind.replace(/[^A-Za-z0-9_-]/g, '_'));
  if ((await fs.readText(target).catch(() => null)) === value) return false;
  await fs.mkdirp(path.dirname(target));
  await fs.writeText(target, value);
  return true;
}

/** A compaction or a new start invalidates earlier deliveries: the contract and the active step are delivered again once. */
export async function resetDelivered(fs: FileSystem, baseDir: string): Promise<void> {
  await fs.remove(path.join(baseDir, DELIVERED_DIR));
}
