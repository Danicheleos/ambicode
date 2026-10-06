import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { systemIds } from '#platform/ports/ids';
import { FakeClock } from '#testing/fixtures/page-harness';
import { acquirePublicationLease, LEASE_FILE } from './lease.ts';

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ambicode-lease-test-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('P1.7 correction A: per-review publication lease', () => {
  it('acquires an unclaimed lease and releases it', async () => {
    await withDirectory(async (directory) => {
      const clock = new FakeClock();
      const lease = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        ids: systemIds,
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
        ids: systemIds,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-1',
        pid: 111,
      });
      assert.equal(first.kind, 'acquired');

      const second = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        ids: systemIds,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-2',
        pid: 222,
      });
      assert.equal(second.kind, 'held');
      if (second.kind === 'held') {
        assert.match(second.message, /submission s-1/);
        assert.match(second.message, /pid 111/);
        assert.match(second.message, /never reclaimed automatically/);
        assert.match(second.message, /remove .* yourself/);
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
          ids: systemIds,
          reviewDirectory: directory,
          reviewId: 'r-1',
          submissionId,
          pid,
        });
        if (lease.kind === 'held') return false;
        try {
          writes += 1;
          return true;
        } finally {
          await lease.release();
        }
      };

      const [a, b] = await Promise.all([attempt('s-a', 1), attempt('s-b', 2)]);
      assert.equal(writes, 1);
      assert.equal([a, b].filter(Boolean).length, 1);
    });
  });

  it('never reclaims a lease automatically, however old it is', async () => {
    await withDirectory(async (directory) => {
      const clock = new FakeClock();
      const first = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        ids: systemIds,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-1',
        pid: 111,
      });
      assert.equal(first.kind, 'acquired');

      clock.advance(365 * 24 * 60 * 60 * 1000);
      const stillHeld = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        ids: systemIds,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-2',
        pid: 222,
      });
      assert.equal(stillHeld.kind, 'held');

      if (first.kind === 'acquired') await first.release();
    });
  });

  it('two independent recovery attempts on a manually-cleared lease never both succeed', async () => {
    await withDirectory(async (directory) => {
      const clock = new FakeClock();
      const abandoned = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        ids: systemIds,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-0',
        pid: 111,
      });
      assert.equal(abandoned.kind, 'acquired');

      await rm(path.join(directory, LEASE_FILE), { force: true });

      const attempt = async (submissionId: string, pid: number) =>
        acquirePublicationLease({
          fs: nodeFileSystem,
          clock,
          ids: systemIds,
          reviewDirectory: directory,
          reviewId: 'r-1',
          submissionId,
          pid,
        });

      const [a, b] = await Promise.all([attempt('s-a', 222), attempt('s-b', 333)]);
      const acquiredCount = [a, b].filter((result) => result.kind === 'acquired').length;
      assert.equal(acquiredCount, 1, 'exactly one recovery attempt must acquire the replacement lease');
      assert.equal([a, b].filter((result) => result.kind === 'held').length, 1);

      for (const result of [a, b]) if (result.kind === 'acquired') await result.release();
    });
  });

  it('an old holder releasing after a replacement exists never removes the replacement', async () => {
    await withDirectory(async (directory) => {
      const clock = new FakeClock();
      const original = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        ids: systemIds,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-original',
        pid: 111,
      });
      assert.equal(original.kind, 'acquired');

      await rm(path.join(directory, LEASE_FILE), { force: true });

      const replacement = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        ids: systemIds,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-replacement',
        pid: 222,
      });
      assert.equal(replacement.kind, 'acquired');

      if (original.kind === 'acquired') await original.release();

      const lockPath = path.join(directory, LEASE_FILE);
      assert.ok(await nodeFileSystem.exists(lockPath), 'the replacement lease must still exist');
      const onDisk = JSON.parse(await readFile(lockPath, 'utf8')) as { submissionId: string };
      assert.equal(onDisk.submissionId, 's-replacement');

      if (replacement.kind === 'acquired') await replacement.release();
      assert.ok(!(await nodeFileSystem.exists(lockPath)));
    });
  });

  it('release leaves an unreadable lease file alone rather than guessing it away', async () => {
    await withDirectory(async (directory) => {
      const clock = new FakeClock();
      const lease = await acquirePublicationLease({
        fs: nodeFileSystem,
        clock,
        ids: systemIds,
        reviewDirectory: directory,
        reviewId: 'r-1',
        submissionId: 's-1',
        pid: 111,
      });
      assert.equal(lease.kind, 'acquired');

      const lockPath = path.join(directory, LEASE_FILE);
      await writeFile(lockPath, 'not json', 'utf8');

      if (lease.kind === 'acquired') await lease.release();
      assert.ok(await nodeFileSystem.exists(lockPath), 'an unreadable file at the lease path is left in place');
    });
  });
});
