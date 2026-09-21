import path from 'node:path';
import { z } from 'zod';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import type { IdSource } from '../ports/ids.ts';

/**
 * A per-review publication lease, so a second process cannot publish the same
 * review while the first is already doing so (doc 03 P1.7 correction A). The
 * in-memory session lock in `SessionStore` only serializes within one process;
 * the same saved review directory can be opened by `ambicode view` twice.
 *
 * The lease is one file, created with the filesystem's atomic exclusive
 * create so two processes racing to acquire it can never both succeed. It
 * holds only identifiers useful for a diagnostic — never a secret, a
 * capability or a session id.
 *
 * v1 favors safety over convenience: there is no automatic reclaim. An
 * age-based reclaim let two reclaimers both read the same old lease, then
 * each remove whatever the other had just written and acquire on top of it —
 * two processes publishing the same review at once, which is exactly what
 * this file exists to prevent. A held or unreadable lease now always refuses,
 * with a diagnostic that names the manual recovery path instead.
 */

export const LEASE_FILE = 'publication.lock';

export const PublicationLease = z.strictObject({
  tool: z.literal('ambicode'),
  reviewId: z.string().min(1),
  submissionId: z.string().min(1),
  pid: z.number().int().nonnegative(),
  acquiredAt: z.string().min(1),
  /**
   * An unpredictable value minted fresh for this one acquisition (doc 03 P1.7
   * correction A). It is not a secret and proves nothing to anyone else; it
   * exists only so this process's own `release()` can tell its own lease
   * apart from a replacement that appeared after a human's manual recovery,
   * and refuse to remove anything else.
   */
  token: z.string().min(1),
});
export type PublicationLease = z.infer<typeof PublicationLease>;

export type LeaseResult =
  | { kind: 'acquired'; release: () => Promise<void> }
  | { kind: 'held'; message: string };

export interface AcquireLeaseOptions {
  fs: FileSystem;
  clock: Clock;
  ids: IdSource;
  reviewDirectory: string;
  reviewId: string;
  submissionId: string;
  /** The current process's pid, for the diagnostic; never used as a secret and never treated as proof of ownership. */
  pid: number;
}

/**
 * Acquires the lease, or reports who holds it. Never deletes or steals a
 * lease merely because acquiring again would be convenient, and never on any
 * age heuristic: a held or unreadable lease always refuses. The only way past
 * a confirmed-abandoned lease is the manual recovery path named in the
 * refusal message.
 */
export async function acquirePublicationLease(options: AcquireLeaseOptions): Promise<LeaseResult> {
  const lockPath = path.join(options.reviewDirectory, LEASE_FILE);
  // Minted fresh per attempt: even a caller that retries after a failed
  // acquisition gets a token nobody else could have predicted or already
  // written down (doc 03 P1.7 correction A).
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
      // Reads the lease back and only removes it when the token this
      // acquisition minted is still the one on disk. A lease this process did
      // not create — including one a human wrote during manual abandoned-lease
      // recovery after this process's own lease went stale — never matches,
      // so this call leaves it alone (doc 03 P1.7 correction A: "never let one
      // process remove a lease created by another process"). An unreadable
      // file is treated the same way: not provably this process's own, so it
      // is left for manual inspection rather than guessed away.
      const current = await readLease(fs, lockPath);
      if (current === null || current.token !== token) return;
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

/**
 * Never mentions process liveness as a reason to reclaim: a pid can be reused
 * by an unrelated process, so its mere presence or absence proves nothing
 * (doc 03 P1.7 correction A). Recovery is a human decision, stated as one.
 */
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
