import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import type { IdSource } from '../ports/ids.ts';
import { contentHash } from '../util/hash.ts';

/**
 * Per-session hook delivery state, never written into the product repository:
 * it lives in the session scratchpad or an owned temporary directory, keyed by
 * a hash of the session id so the directory name carries no session content.
 */

const HOOK_STATE_DIR_NAME = 'ambicode-hook-state';
const EPOCH_FILE = 'epoch';
const DELIVERED_DIR = 'delivered';

export function hookStateBaseDir(fs: FileSystem, sessionId: string, scratchpadDir?: string): string {
  if (scratchpadDir !== undefined) return path.join(scratchpadDir, HOOK_STATE_DIR_NAME);
  const sessionKey = contentHash(sessionId).replace(/[^a-z0-9]/gi, '').slice(0, 40);
  return path.join(fs.temporaryRoot(), HOOK_STATE_DIR_NAME, sessionKey);
}

/** Delivery markers are scoped under this value, so a new epoch invalidates all of them. */
export async function currentEpoch(fs: FileSystem, ids: IdSource, baseDir: string): Promise<string> {
  const file = path.join(baseDir, EPOCH_FILE);
  try {
    const existing = (await fs.readText(file)).trim();
    if (existing !== '') return existing;
  } catch {
    // No epoch recorded yet; fall through to create one.
  }
  const fresh = ids.capability();
  await fs.mkdirp(baseDir);
  await fs.writeText(file, fresh);
  return fresh;
}

export async function resetEpoch(fs: FileSystem, ids: IdSource, baseDir: string): Promise<void> {
  await fs.mkdirp(baseDir);
  await fs.remove(path.join(baseDir, DELIVERED_DIR));
  await fs.writeText(path.join(baseDir, EPOCH_FILE), ids.capability());
}

export async function cleanupSessionState(fs: FileSystem, baseDir: string): Promise<void> {
  await fs.remove(baseDir);
}

export interface DeliveryKey {
  epoch: string;
  agentKey: string;
  kind: 'edit-reminder' | 'shared-contract';
  subject: string;
  contentHash: string;
}

function markerPath(baseDir: string, key: DeliveryKey): string {
  const identity = contentHash(
    `${key.epoch}::${key.agentKey}::${key.kind}::${key.subject}::${key.contentHash}`,
  ).replace(/[^a-z0-9]/gi, '');
  return path.join(baseDir, DELIVERED_DIR, key.epoch.replace(/[^a-z0-9]/gi, '').slice(0, 40), identity);
}

/**
 * Keyed by (epoch, agent, kind, subject, content hash): a changed content hash
 * or another path is a different marker and is delivered again.
 */
export async function alreadyDelivered(fs: FileSystem, baseDir: string, key: DeliveryKey): Promise<boolean> {
  return fs.exists(markerPath(baseDir, key));
}

export async function markDelivered(fs: FileSystem, baseDir: string, key: DeliveryKey): Promise<void> {
  const target = markerPath(baseDir, key);
  await fs.mkdirp(path.dirname(target));
  await fs.writeText(target, '');
}
