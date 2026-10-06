import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { AmbicodeError } from '#util/errors';
import { appendLocked, readLedgerStrict } from './ledger.ts';
import type { LockedLedger } from '#types/modules/evidence';
import type { FileSystem } from '#types/platform/ports';

interface LockOptions {
  /** Whether a process is running; `process.kill(pid, 0)` unless a test says otherwise. */
  alive?: (pid: number) => boolean;
  timeoutMs?: number;
  /** How long a lock file that does not parse is waited on before it is taken as a crashed writer's. */
  unparsableMs?: number;
}

const LOCK_FILE = 'ledger.lock';
const heldHere = new AsyncLocalStorage<ReadonlySet<string>>();
const queues = new Map<string, Promise<void>>();

const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

/**
 * One lock per task ledger: calls in this process queue on a promise chain, other processes compete for `ledger.lock`.
 * The lock coordinates writers and is not route state (02-L6). When a crashed holder's lock is stale and two waiters
 * both see it, both may take it; that race is accepted (02-D7).
 */
export async function withLedgerLock<T>(
  fs: FileSystem,
  taskDirectory: string,
  now: () => Date,
  writer: string,
  body: (ledger: LockedLedger) => Promise<T>,
  options: LockOptions = {},
): Promise<T> {
  // Keyed by the real path: two spellings of one directory are one lock, not two that wait on each other.
  await fs.mkdirp(taskDirectory);
  const lockFile = path.join(await fs.realpath(taskDirectory), LOCK_FILE);
  const outer = heldHere.getStore() ?? new Set<string>();
  if (outer.has(lockFile)) {
    throw new AmbicodeError('internal', `The ledger lock of ${taskDirectory} is already held by this call; append through the locked ledger instead of locking again.`);
  }

  const previous = queues.get(lockFile) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => mine);
  queues.set(lockFile, tail);
  await previous;
  try {
    await acquire(fs, lockFile, now, options);
    try {
      return await heldHere.run(new Set([...outer, lockFile]), () =>
        body({
          append: (entry) => appendLocked(fs, taskDirectory, now(), writer, entry),
          read: () => readLedgerStrict(fs, taskDirectory),
        }),
      );
    } finally {
      // A lock that cannot be removed is reclaimed as stale once this process is gone; it must not hide body's outcome.
      await fs.remove(lockFile).catch(() => undefined);
    }
  } finally {
    release();
    if (queues.get(lockFile) === tail) queues.delete(lockFile);
  }
}

async function acquire(fs: FileSystem, lockFile: string, now: () => Date, options: LockOptions): Promise<void> {
  const { alive = processAlive, timeoutMs = 5_000, unparsableMs = 1_000 } = options;
  const started = Date.now();
  let unparsableSince: number | null = null;
  for (;;) {
    if (await fs.createExclusive(lockFile, JSON.stringify({ pid: process.pid, acquiredAt: now().toISOString() }))) return;
    let holder: unknown = null;
    try {
      holder = JSON.parse(await fs.readText(lockFile));
    } catch (error) {
      // Released between the two calls: take it at once.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
    }
    const pid = (holder as { pid?: unknown } | null)?.pid;
    if (typeof pid === 'number') {
      unparsableSince = null;
      if (!alive(pid)) {
        await fs.remove(lockFile);
        continue;
      }
    } else {
      unparsableSince ??= Date.now();
      if (Date.now() - unparsableSince >= unparsableMs) {
        await fs.remove(lockFile);
        unparsableSince = null;
        continue;
      }
    }
    if (Date.now() - started >= timeoutMs) {
      throw new AmbicodeError('ledger-busy', `Another process holds ${lockFile}; waited ${timeoutMs} ms.`, {
        details: [`Retry the command. If it keeps failing, make sure no ambicode process is running, then delete ${lockFile}.`],
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40));
  }
}
