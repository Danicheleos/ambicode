import path from 'node:path';
import { contentHash } from '#util/hash';
import type { FileSystem, IdSource } from '#types/ports';
import { HOOK_STATE_DIR_NAME, type DeliveryKey } from '../types/session.ts';

/**
 * Per-session hook delivery state, never written into the product repository:
 * it lives in the session scratchpad or an owned temporary directory, keyed by
 * a hash of the session id so the directory name carries no session content.
 */

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

function markerPath(baseDir: string, key: DeliveryKey): string {
  const identity = contentHash(
    `${key.epoch}::${key.agentKey}::${key.kind}::${key.subject}::${key.contentHash}`,
  ).replace(/[^a-z0-9]/gi, '');
  return path.join(baseDir, DELIVERED_DIR, key.epoch.replace(/[^a-z0-9]/gi, '').slice(0, 40), identity);
}

/**
 * Keyed by (epoch, agent, kind, subject, content hash): a changed content hash
 * or another path is a different marker and is delivered again. Returns true
 * when this call recorded the delivery, false when it was already recorded.
 */
export async function deliverOnce(fs: FileSystem, baseDir: string, key: DeliveryKey): Promise<boolean> {
  const target = markerPath(baseDir, key);
  if (await fs.exists(target)) return false;
  await fs.mkdirp(path.dirname(target));
  await fs.writeText(target, '');
  return true;
}

const STOP_DIR = 'stop';
const stopFile = (baseDir: string, routeId: string): string => path.join(baseDir, STOP_DIR, routeId.replace(/[^A-Za-z0-9_-]/g, '_'));

/** The ledger entry count the previous Stop saw for a route; 0 before any (03-K2). */
export async function readStopCursor(fs: FileSystem, baseDir: string, routeId: string): Promise<number> {
  try {
    const value = Number((await fs.readText(stopFile(baseDir, routeId))).trim());
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export async function writeStopCursor(fs: FileSystem, baseDir: string, routeId: string, count: number): Promise<void> {
  await fs.mkdirp(path.join(baseDir, STOP_DIR));
  await fs.writeText(stopFile(baseDir, routeId), String(count));
}

const ENDED_DIR = 'ended';
const endedFile = (fs: FileSystem, sessionId: string): string =>
  path.join(fs.temporaryRoot(), HOOK_STATE_DIR_NAME, ENDED_DIR, contentHash(sessionId).replace(/[^a-z0-9]/gi, '').slice(0, 40));

/** Outlives `cleanupSessionState`: a later session uses it to tell that a route's Claude session is gone. */
export async function markSessionEnded(fs: FileSystem, sessionId: string): Promise<void> {
  const file = endedFile(fs, sessionId);
  await fs.mkdirp(path.dirname(file));
  await fs.writeText(file, '');
}

export const clearSessionEnded = (fs: FileSystem, sessionId: string): Promise<void> => fs.remove(endedFile(fs, sessionId));

export const sessionEnded = (fs: FileSystem, sessionId: string): Promise<boolean> => fs.exists(endedFile(fs, sessionId));

/** One directory read: lets a hook skip the repository scan when no session has ended. */
export async function anySessionEnded(fs: FileSystem): Promise<boolean> {
  return (await fs.readdir(path.dirname(endedFile(fs, ''))).catch(() => [])).length > 0;
}
