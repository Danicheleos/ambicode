import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '../ports/filesystem.ts';
import { appendLedger, LEDGER_FILE, readLedger } from './ledger.ts';

const NOW = new Date('2026-10-02T12:00:00.000Z');

async function inDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'ledger-'));
  try {
    await run(path.join(root, 'task', 'ORD-17'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('the task ledger is append-only evidence', () => {
  it('numbers entries in order, one JSON line each, and creates the directory', async () => {
    await inDirectory(async (directory) => {
      const first = await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note', path: 'a.md' });
      const second = await appendLedger(nodeFileSystem, directory, NOW, { kind: 'review', status: 'complete' });
      assert.deepEqual([first.id, second.id], ['L1', 'L2']);
      const lines = (await readFile(path.join(directory, LEDGER_FILE), 'utf8')).trimEnd().split('\n');
      assert.equal(lines.length, 2);
      assert.deepEqual(JSON.parse(lines[0]!), { id: 'L1', at: NOW.toISOString(), kind: 'note', path: 'a.md' });
    });
  });

  it('keeps earlier lines byte for byte when it appends', async () => {
    await inDirectory(async (directory) => {
      await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' });
      const before = await readFile(path.join(directory, LEDGER_FILE), 'utf8');
      await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' });
      assert.ok((await readFile(path.join(directory, LEDGER_FILE), 'utf8')).startsWith(before));
    });
  });

  it('skips a torn line and a foreign shape, and never reuses an id because of it', async () => {
    await inDirectory(async (directory) => {
      await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' });
      const file = path.join(directory, LEDGER_FILE);
      await writeFile(file, `${await readFile(file, 'utf8')}{"id":"L2","at":\n[1,2]\n{"id":3,"kind":"x"}\n`);
      assert.deepEqual((await readLedger(nodeFileSystem, directory)).map((entry) => entry.id), ['L1']);
      const next = await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' });
      assert.equal(next.id, 'L2');
    });
  });

  it('reads a task with no ledger as empty, not as an error', async () => {
    await inDirectory(async (directory) => {
      assert.deepEqual(await readLedger(nodeFileSystem, directory), []);
    });
  });

  it('keeps entries of a kind it does not know', async () => {
    await inDirectory(async (directory) => {
      await appendLedger(nodeFileSystem, directory, NOW, { kind: 'from-the-future', extra: 1 });
      assert.equal((await readLedger(nodeFileSystem, directory))[0]?.extra, 1);
    });
  });
});
