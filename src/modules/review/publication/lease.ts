import path from 'node:path';
import { z } from 'zod';
import type { Clock, FileSystem, IdSource } from '#types/platform/ports';

/**
 * Per-review publication lease: one file made with atomic exclusive create, so two
 * processes never both publish. It holds diagnostic ids only, never a secret. No
 * automatic reclaim: two reclaimers of one stale lease could delete each other's.
 */

export const LEASE_FILE = 'publication.lock';

const PublicationLease = z.strictObject({
  tool: z.literal('ambicode'),
  reviewId: z.string().min(1),
  submissionId: z.string().min(1),
  pid: z.number().int().nonnegative(),
  acquiredAt: z.string().min(1),
  /**
   * Minted per acquisition so `release()` removes only its own lease, never a
   * replacement written after manual recovery. Not a secret.
   */
  token: z.string().min(1),
});
type PublicationLease = z.infer<typeof PublicationLease>;

type LeaseResult =
  | { kind: 'acquired'; release: () => Promise<void> }
  | { kind: 'held'; message: string };

interface AcquireLeaseOptions {
  fs: FileSystem;
  clock: Clock;
  ids: IdSource;
  reviewDirectory: string;
  reviewId: string;
  submissionId: string;
  pid: number;
}

export async function acquirePublicationLease(options: AcquireLeaseOptions): Promise<LeaseResult> {
  const lockPath = path.join(options.reviewDirectory, LEASE_FILE);
  const token = options.ids.capability();
  const lease: PublicationLease = {
    tool: 'ambicode',
    reviewId: options.reviewId,
    submissionId: options.submissionId,
    pid: options.pid,
    acquiredAt: options.clock.now().toISOString(),
    token,
  };
  const body = `${JSON.stringify(lease, null, 2)}\n`;

  if (await options.fs.createExclusive(lockPath, body)) {
    return acquired(options.fs, lockPath, token);
  }

  const existing = await readLease(options.fs, lockPath);
  return { kind: 'held', message: describeHeld(existing, lockPath) };
}

function acquired(fs: FileSystem, lockPath: string, token: string): LeaseResult {
  return {
    kind: 'acquired',
    release: async () => {
      const current = await readLease(fs, lockPath);
      if (current === null || current.token !== token) return;
      try {
        await fs.remove(lockPath);
      } catch {
        // Already gone at release time.
      }
    },
  };
}

async function readLease(fs: FileSystem, lockPath: string): Promise<PublicationLease | null> {
  try {
    if (!(await fs.exists(lockPath))) return null;
    const parsed = PublicationLease.safeParse(JSON.parse(await fs.readText(lockPath)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function describeHeld(existing: PublicationLease | null, lockPath: string): string {
  const recovery =
    'This lease is never reclaimed automatically, and a pid alone does not prove that process is gone — ' +
    'pids are reused. Once you have independently confirmed the process that created it is no longer ' +
    `running (not merely that its pid is free), remove ${lockPath} yourself and try again.`;
  if (existing === null) {
    return (
      `Another process appears to be publishing this review already (the lock at ${lockPath} could not be ` +
      `read for detail). Nothing was sent. ${recovery}`
    );
  }
  return (
    `Another process is already publishing this review: submission ${existing.submissionId}, ` +
    `pid ${existing.pid}, started ${existing.acquiredAt}. Nothing was sent. ${recovery}`
  );
}
