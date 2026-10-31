import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { appendLedger, readLedger, readLedgerStrict } from './ledger.ts';
import { withLedgerLock } from './ledger-lock.ts';
import { LEDGER_FILE } from '#types/modules/evidence';

const NOW = () => new Date('2026-10-05T10:00:00.000Z');

async function inDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'ledger-lock-'));
  try {
    await mkdir(path.join(root, 'ORD-17'));
    await run(path.join(root, 'ORD-17'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function runChild(code: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (exit) => resolve({ code: exit, stderr }));
  });
}

const appender = (directory: string, count: number): string => `
  import { appendLedger } from ${JSON.stringify(new URL('./ledger.ts', import.meta.url).href)};
  import { nodeFileSystem } from ${JSON.stringify(new URL('../ports/filesystem.ts', import.meta.url).href)};
  for (let i = 0; i < ${count}; i += 1) await appendLedger(nodeFileSystem, ${JSON.stringify(directory)}, new Date(), { kind: 'note', i });
`;

async function ids(directory: string): Promise<number[]> {
  const found = new Set<string>();
  for (const line of (await readFile(path.join(directory, LEDGER_FILE), 'utf8')).trimEnd().split('\n')) {
    const { id } = JSON.parse(line) as { id: string };
    assert.ok(!found.has(id), `${id} appears twice`);
    found.add(id);
  }
  return [...found].map(Number);
}

const contiguous = (numbers: number[], length: number): void => {
  assert.deepEqual([...numbers].sort((a, b) => a - b), Array.from({ length }, (_, index) => index + 1));
};

describe('a lock on a task folder that is not there', () => {
  it('is task-unknown, names the existing tasks and creates nothing', async () => {
    await inDirectory(async (directory) => {
      const missing = path.join(path.dirname(directory), 'ORD-18');
      await appendLedger(nodeFileSystem, directory, NOW(), { kind: 'note' });
      await assert.rejects(withLedgerLock(nodeFileSystem, missing, NOW, async () => undefined), { code: 'task-unknown', details: ['Existing tasks, newest first: ORD-17.'] });
      assert.equal(await nodeFileSystem.exists(missing), false);
    });
  });
});

describe('a lock on a folder that has no ledger', () => {
  it('is task-unknown unless the caller starts the task', async () => {
    await inDirectory(async (directory) => {
      await assert.rejects(withLedgerLock(nodeFileSystem, directory, NOW, async () => undefined), { code: 'task-unknown' });
      assert.equal(await withLedgerLock(nodeFileSystem, directory, NOW, async () => 'ran', { creates: true }), 'ran');
    });
  });
});

describe('02-L1: one lock per task ledger', () => {
  it('two processes append whole lines with contiguous ids and never share one', async () => {
    await inDirectory(async (directory) => {
      const outcomes = await Promise.all([runChild(appender(directory, 200)), runChild(appender(directory, 200))]);
      assert.deepEqual(outcomes.map((outcome) => outcome.code), [0, 0], outcomes.map((outcome) => outcome.stderr).join());
      contiguous(await ids(directory), 400);
    });
  });

  it('50 concurrent calls in one process queue instead of competing for the file', async () => {
    await inDirectory(async (directory) => {
      await Promise.all(Array.from({ length: 50 }, () => appendLedger(nodeFileSystem, directory, NOW(), { kind: 'note' })));
      contiguous(await ids(directory), 50);
    });
  });
});

describe('02-L2/02-L3: a held lock, a stale lock and an unreadable lock', () => {
  const lockOf = (directory: string): string => path.join(directory, 'ledger.lock');
  const seed = async (directory: string, content: string): Promise<void> => {
    await nodeFileSystem.mkdirp(directory);
    await writeFile(lockOf(directory), content);
  };

  it('02-L2: a lock held by a live process times out with ledger-busy, and is left alone', async () => {
    await inDirectory(async (directory) => {
      await seed(directory, JSON.stringify({ pid: process.pid, acquiredAt: 'now' }));
      await assert.rejects(
        withLedgerLock(nodeFileSystem, directory, NOW, async () => 1, { timeoutMs: 120, creates: true }),
        (error: { code?: string; details?: string[] }) => error.code === 'ledger-busy' && /delete .*ledger\.lock/.test(error.details?.join(' ') ?? ''),
      );
      assert.equal(await nodeFileSystem.exists(lockOf(directory)), true);
    });
  });

  it('02-L3: a lock whose pid is not a live process is removed and acquisition retried', async () => {
    await inDirectory(async (directory) => {
      await seed(directory, JSON.stringify({ pid: 99_999_999, acquiredAt: 'then' }));
      assert.equal(await withLedgerLock(nodeFileSystem, directory, NOW, async () => 'ran', { alive: () => false, creates: true }), 'ran');
      assert.equal(await nodeFileSystem.exists(lockOf(directory)), false);
    });
  });

  it('02-L3: the pid of a process that has exited is dead to the default check', async () => {
    await inDirectory(async (directory) => {
      const child = spawn(process.execPath, ['-e', '']);
      const pid = child.pid!;
      await new Promise((resolve) => child.on('close', resolve));
      await seed(directory, JSON.stringify({ pid, acquiredAt: 'then' }));
      assert.equal((await appendLedger(nodeFileSystem, directory, NOW(), { kind: 'note' })).entry.id, '1');
    });
  });

  it('02-L3: a lock that stays unparsable is taken for a crashed writer\'s', async () => {
    await inDirectory(async (directory) => {
      await seed(directory, '{"pid":');
      assert.equal(await withLedgerLock(nodeFileSystem, directory, NOW, async () => 'ran', { unparsableMs: 60, creates: true }), 'ran');
    });
  });
});

describe('02-L4/02-L5: release and nesting', () => {
  it('02-L4: the lock is released when the body throws', async () => {
    await inDirectory(async (directory) => {
      await assert.rejects(withLedgerLock(nodeFileSystem, directory, NOW, async () => Promise.reject(new Error('boom')), { creates: true }), /boom/);
      assert.equal(await nodeFileSystem.exists(path.join(directory, 'ledger.lock')), false);
      assert.equal(await withLedgerLock(nodeFileSystem, directory, NOW, async () => 'again', { creates: true }), 'again');
    });
  });

  it('02-L5: a nested lock on the same ledger throws at once; the locked ledger appends and reads', async () => {
    await inDirectory(async (directory) => {
      await withLedgerLock(nodeFileSystem, directory, NOW, async (ledger) => {
        await assert.rejects(withLedgerLock(nodeFileSystem, directory, NOW, async () => 1, { creates: true }), { code: 'internal' });
        assert.equal((await ledger.append({ kind: 'exit', route: 'r-0', reason: 'done' })).id, '1');
        assert.equal((await ledger.read()).state, 'ok');
      }, { creates: true });
      assert.equal(await nodeFileSystem.exists(path.join(directory, 'ledger.lock')), false);
    });
  });
});

describe('02-L6: the lock is not route state', () => {
  it('a lock file beside the ledger changes nothing a reader returns', async () => {
    await inDirectory(async (directory) => {
      await appendLedger(nodeFileSystem, directory, NOW(), { kind: 'exit', route: 'r-0', reason: 'done' });
      const before = await readLedgerStrict(nodeFileSystem, directory);
      await writeFile(path.join(directory, 'ledger.lock'), JSON.stringify({ pid: process.pid, acquiredAt: 'now' }));
      assert.deepEqual(await readLedgerStrict(nodeFileSystem, directory), before);
      assert.equal((await readLedger(nodeFileSystem, directory)).length, 1);
    });
  });
});
