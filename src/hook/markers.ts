import path from 'node:path';
import type { FileSystem } from '../ports/filesystem.ts';
import type { IdSource } from '../ports/ids.ts';
import { contentHash } from '../util/hash.ts';

/**
 * Per-session edit-reminder delivery state (doc 04 P2.4 correction H). Never
 * written into the product repository (correction G9): it lives in the
 * host-provided per-session scratchpad when one is available, and in a
 * safe, owned temporary directory otherwise (correction H2) — keyed by a
 * hash of the session id, never the id itself, so the directory name
 * carries no session content.
 */

const HOOK_STATE_DIR_NAME = 'ambicode-hook-state';
const EPOCH_FILE = 'epoch';
const DELIVERED_DIR = 'delivered';

export function hookStateBaseDir(fs: FileSystem, sessionId: string, scratchpadDir?: string): string {
  if (scratchpadDir !== undefined) return path.join(scratchpadDir, HOOK_STATE_DIR_NAME);
  const sessionKey = contentHash(sessionId).replace(/[^a-z0-9]/gi, '').slice(0, 40);
  return path.join(fs.temporaryRoot(), HOOK_STATE_DIR_NAME, sessionKey);
}

/**
 * The current context epoch, creating one on first use. Delivery markers are
 * scoped under this value, so resetting it (see `resetEpoch`) makes every
 * previously-delivered marker irrelevant without deleting anything itself —
 * `resetEpoch` still clears the marker directory to avoid unbounded growth
 * across a long session's many compactions.
 */
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

/**
 * Resets delivery on startup/resume/clear/fork and after compaction (doc 04
 * P2.4 correction H3): a fresh epoch value makes every marker recorded under
 * the previous one irrelevant, and removing the marker directory keeps a
 * long-running session's owned state bounded.
 */
export async function resetEpoch(fs: FileSystem, ids: IdSource, baseDir: string): Promise<void> {
  await fs.mkdirp(baseDir);
  await fs.remove(path.join(baseDir, DELIVERED_DIR));
  await fs.writeText(path.join(baseDir, EPOCH_FILE), ids.capability());
}

/** Cleans up all owned state for this session (doc 04 P2.4 correction H3, "clean owned state on session end"). */
export async function cleanupSessionState(fs: FileSystem, baseDir: string): Promise<void> {
  await fs.remove(baseDir);
}

export interface ReminderKey {
  epoch: string;
  /** `agent_id`, or a fixed sentinel for the main thread (correction H1). */
  agentKey: string;
  normalizedPath: string;
  qualifiedRuleId: string;
  ruleContentHash: string;
}

function markerPath(baseDir: string, key: ReminderKey): string {
  const identity = contentHash(
    `${key.epoch}::${key.agentKey}::${key.normalizedPath}::${key.qualifiedRuleId}::${key.ruleContentHash}`,
  ).replace(/[^a-z0-9]/gi, '');
  return path.join(baseDir, DELIVERED_DIR, key.epoch.replace(/[^a-z0-9]/gi, '').slice(0, 40), identity);
}

/**
 * `true` if this exact (epoch, agent, path, rule, rule-content-hash) tuple
 * was already delivered — the same rule on the same path in one epoch is
 * delivered once (correction H5); a changed rule content hash is a
 * different marker and is delivered again without waiting for a new session
 * (correction H4); the same rule on another path is a different marker too
 * (correction H6).
 */
export async function alreadyDelivered(fs: FileSystem, baseDir: string, key: ReminderKey): Promise<boolean> {
  return fs.exists(markerPath(baseDir, key));
}

export async function markDelivered(fs: FileSystem, baseDir: string, key: ReminderKey): Promise<void> {
  const target = markerPath(baseDir, key);
  await fs.mkdirp(path.dirname(target));
  await fs.writeText(target, '');
}
