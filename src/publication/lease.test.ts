import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '../ports/filesystem.ts';
import { FakeClock } from '../testing/page-harness.ts';
import { acquirePublicationLease, LEASE_FILE, LEASE_STALE_MS } from './lease.ts';

/**
 * P1.7 correction C. The in-memory session lock only serializes within one
 * process; these tests use the real filesystem so the atomic create-exclusive
 * primitive is genuinely exercised, and drive two independent acquisitions
 * against the same on-disk review directory the way two separate
 * `ambicode view` processes would.
 */

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-lease-test-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('P1.7 correction C: per-review publication lease', () => {
  it('acquires an unclaimed lease and releases it', async () => {
    await withDirectory(async (directory) => {
      const clock = new FakeClock();
      const lease = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-1',
        pid: 111,
      });
      assert.equal(lease.kind, 'acquired');
      assert.ok(await nodeFileSystem.exists(path.join(directory, LEASE_FILE)));
      if (lease.kind === 'acquired') await lease.release();
      assert.ok(!(await nodeFileSystem.exists(path.join(directory, LEASE_FILE))));
    });
  });

  it('refuses a second acquisition while the first is held, with an actionable diagnostic', async () => {
    await withDirectory(async (directory) => {
      const clock = new FakeClock();
      const first = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-1',
        pid: 111,
      });
      assert.equal(first.kind, 'acquired');

      const second = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-2',
        pid: 222,
      });
      assert.equal(second.kind, 'held');
      if (second.kind === 'held') {
        assert.match(second.message, /submission s-1/);
        assert.match(second.message, /pid 111/);
        // No secret, capability or session id ever appears in the diagnostic.
        assert.ok(!/capability|session|token|secret/i.test(second.message));
      }

      if (first.kind === 'acquired') await first.release();
    });
  });

  it('proves only one of two concurrent attempts reaches a stand-in write', async () => {
    await withDirectory(async (directory) => {
      const clock = new FakeClock();
      let writes = 0;

      const attempt = async (submissionId: string, pid: number): Promise<boolean> => {
        const lease = await acquirePublicationLease({
          fs: nodeFileSystem,
          clock,
          reviewDirectory: directory,
          reviewId: 'r-1',
          submissionId,
          pid,
        });
        if (lease.kind === 'held') return false;
        try {
          writes += 1; // Stands in for the call that would reach the provider.
          return true;
        } finally {
          await lease.release();
        }
      };

      // Two independent "processes" racing for the same review directory.
      const [a, b] = await Promise.all([attempt('s-a', 1), attempt('s-b', 2)]);
      assert.equal(writes, 1);
      assert.equal([a, b].filter(Boolean).length, 1);
    });
  });

  it('never reclaims a lease that is merely inconvenient, only one old enough to be abandoned', async () => {
    await withDirectory(async (directory) => {
      const clock = new FakeClock();
      const first = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-1',
        pid: 111,
      });
      assert.equal(first.kind, 'acquired');

      // Still fresh: held, not reclaimed.
      clock.advance(LEASE_STALE_MS - 1000);
      const stillHeld = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-2',
        pid: 222,
      });
      assert.equal(stillHeld.kind, 'held');

      // Old enough to be abandoned: reclaimed automatically.
      clock.advance(2000);
      const reclaimed = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-3',
        pid: 333,
      });
      assert.equal(reclaimed.kind, 'acquired');
      if (reclaimed.kind === 'acquired') await reclaimed.release();
    });
  });
});
