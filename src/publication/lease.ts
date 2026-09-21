import path from 'node:path';
import { z } from 'zod';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';

/**
 * A per-review publication lease, so a second process cannot publish the same
 * review while the first is already doing so (doc 03 P1.7 correction C). The
 * in-memory session lock in `SessionStore` only serializes within one process;
 * the same saved review directory can be opened by `ambicode view` twice.
 *
 * The lease is one file, created with the filesystem's atomic exclusive
 * create so two processes racing to acquire it can never both succeed. It
 * holds only identifiers useful for a diagnostic — never a secret, a
 * capability or a session id.
 */

export const LEASE_FILE = 'publication.lock';

/**
 * Well past any single publication run's realistic duration: `glab`'s own
 * timeout is 60s per request, and a run sends comments one at a time. A lease
 * older than this is treated as abandoned rather than held by a still-running
 * attempt (doc 03 P1.7 correction C, "handle abandoned leases conservatively").
 */
export const LEASE_STALE_MS = 10 * 60 * 1000;

export const PublicationLease = z.strictObject({
  tool: z.literal('ambicode'),
  reviewId: z.string().min(1),
  submissionId: z.string().min(1),
  pid: z.number().int().nonnegative(),
  acquiredAt: z.string().min(1),
});
export type PublicationLease = z.infer<typeof PublicationLease>;

export type LeaseResult =
  | { kind: 'acquired'; release: () => Promise<void> }
  | { kind: 'held'; message: string };

export interface AcquireLeaseOptions {
  fs: FileSystem;
  clock: Clock;
  reviewDirectory: string;
  reviewId: string;
  submissionId: string;
  /** The current process's pid, for the diagnostic; never used as a secret. */
  pid: number;
}

/**
 * Acquires the lease, or reports who holds it. Never deletes or steals a
 * lease merely because acquiring again would be convenient: a held lease is
 * reclaimed only when its own ownership marker and its age both prove it is
 * abandoned, not on any other heuristic.
 */
export async function acquirePublicationLease(options: AcquireLeaseOptions): Promise<LeaseResult> {
  const lockPath = path.join(options.reviewDirectory, LEASE_FILE);
  const lease: PublicationLease = {
    tool: 'ambicode',
    reviewId: options.reviewId,
    submissionId: options.submissionId,
    pid: options.pid,
    acquiredAt: options.clock.now().toISOString(),
  };
  const body = `${JSON.stringify(lease, null, 2)}\n`;

  if (await options.fs.createExclusive(lockPath, body)) {
    return acquired(options.fs, lockPath);
  }

  const existing = await readLease(options.fs, lockPath);
  if (existing !== null) {
    const age = options.clock.now().getTime() - Date.parse(existing.acquiredAt);
    if (Number.isFinite(age) && age > LEASE_STALE_MS && existing.reviewId === options.reviewId) {
      try {
        await options.fs.remove(lockPath);
      } catch {
        // A removal race with whoever else is reclaiming it; the retry below
        // decides what actually happened, not this attempt.
      }
      if (await options.fs.createExclusive(lockPath, body)) {
        return acquired(options.fs, lockPath);
      }
    }
  }

  return { kind: 'held', message: describeHeld(existing, lockPath) };
}

function acquired(fs: FileSystem, lockPath: string): LeaseResult {
  return {
    kind: 'acquired',
    release: async () => {
      try {
        await fs.remove(lockPath);
      } catch {
        // Already gone at release time; nothing further for this attempt to do.
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
  if (existing === null) {
    return `Another process appears to be publishing this review already (the lock at ${lockPath} could not be read for detail). Nothing was sent. If no such process is actually running, remove that file and try again.`;
  }
  return (
    `Another process is already publishing this review: submission ${existing.submissionId}, ` +
    `pid ${existing.pid}, started ${existing.acquiredAt}. Nothing was sent. Wait for it to finish; ` +
    `if that process is no longer running, the lease is reclaimed automatically after it has aged past ` +
    `${Math.round(LEASE_STALE_MS / 1000)}s, or you may remove ${lockPath} yourself.`
  );
}
