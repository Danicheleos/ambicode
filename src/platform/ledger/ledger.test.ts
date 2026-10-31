import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { withLedgerLock } from './ledger-lock.ts';
import { appendLedger, MAX_ENTRY_BYTES, readLedger, readLedgerStrict, WARN_LEDGER_BYTES } from './ledger.ts';
import { SRC_ROOT } from '#testing/paths';
import { LEDGER_FILE } from '#types/modules/evidence';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const note = (id: string, extra: object = {}): string => JSON.stringify({ id, at: NOW.toISOString(), kind: 'note', note: 'notes', path: 'p', contentHash: 'sha256:x', ...extra });

async function inDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'ledger-'));
  try {
    const directory = path.join(root, 'task', 'ORD-17');
    await nodeFileSystem.mkdirp(directory);
    await run(directory);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const write = async (directory: string, lines: string[]): Promise<void> => {
  await nodeFileSystem.mkdirp(directory);
  await writeFile(path.join(directory, LEDGER_FILE), lines.join('\n'));
};

describe('the task ledger is append-only evidence', () => {
  it('02-A1/02-A2: numbers entries 1, 2, 3 in order, one JSON line each', async () => {
    await inDirectory(async (directory) => {
      const first = await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note', path: 'a.md' });
      const second = await appendLedger(nodeFileSystem, directory, NOW, { kind: 'review', status: 'complete' });
      const third = await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' });
      assert.deepEqual([first.entry.id, second.entry.id, third.entry.id], ['1', '2', '3']);
      const lines = (await readFile(path.join(directory, LEDGER_FILE), 'utf8')).split('\n');
      assert.equal(lines.length, 4);
      assert.equal(lines[3], '');
      assert.deepEqual(JSON.parse(lines[0]!), { id: '1', at: NOW.toISOString(), kind: 'note', path: 'a.md' });
    });
  });

  it('02-A1: the next id is one more than the highest numeric id, and a torn line does not reset it', async () => {
    await inDirectory(async (directory) => {
      await write(directory, [note('4'), '{"id":"9","at":', note('12'), '']);
      assert.equal((await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' })).entry.id, '13');
    });
  });

  it('02-A1: an id that is not a plain count (the old L<n> and writer-prefixed forms) is not a valid entry and never counts', async () => {
    await inDirectory(async (directory) => {
      await write(directory, [note('L7'), note('a1b2c3d4-9'), note('02'), note('0'), note('3')]);
      assert.deepEqual((await readLedger(nodeFileSystem, directory)).map((entry) => entry.id), ['3']);
      assert.equal((await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' })).entry.id, '4');
    });
  });

  it('keeps earlier lines byte for byte when it appends, and an entry cannot choose its own id', async () => {
    await inDirectory(async (directory) => {
      await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' });
      const before = await readFile(path.join(directory, LEDGER_FILE), 'utf8');
      const second = await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note', id: '99', at: 'never' });
      assert.ok((await readFile(path.join(directory, LEDGER_FILE), 'utf8')).startsWith(before));
      assert.deepEqual([second.entry.id, second.entry.at], ['2', NOW.toISOString()]);
    });
  });

  it('02-A3: 16,384 bytes are accepted and 16,385 are refused with nothing written', async () => {
    await inDirectory(async (directory) => {
      const sized = async (bytes: number) => {
        const probe = JSON.stringify({ id: '1', at: NOW.toISOString(), kind: 'note', pad: '' });
        return appendLedger(nodeFileSystem, directory, NOW, { kind: 'note', pad: 'x'.repeat(bytes - Buffer.byteLength(probe)) });
      };
      await assert.rejects(sized(MAX_ENTRY_BYTES + 1), { code: 'ledger-entry-too-large' });
      assert.deepEqual(await readLedger(nodeFileSystem, directory), []);
      const accepted = await sized(MAX_ENTRY_BYTES);
      assert.equal(Buffer.byteLength(JSON.stringify(accepted.entry)), MAX_ENTRY_BYTES);
      assert.equal(accepted.ledgerBytes, MAX_ENTRY_BYTES + 1);
    });
  });

  it('02-A4: the result carries a warning naming a separate task from 1 MiB on, and the append still succeeds', async () => {
    await inDirectory(async (directory) => {
      const small = await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' });
      assert.equal(small.warning, null);
      await writeFile(path.join(directory, LEDGER_FILE), '\n'.repeat(WARN_LEDGER_BYTES - 20));
      const big = await appendLedger(nodeFileSystem, directory, NOW, { kind: 'note' });
      assert.ok(big.ledgerBytes >= WARN_LEDGER_BYTES);
      assert.match(big.warning ?? '', /--task ORD-17-2/);
    });
  });
});

const CORRUPTED: { label: string; lines: string[]; lenient: string[]; strict: 'ok' | number }[] = [
  { label: 'a torn last line', lines: [note('1'), '{"id":"2","at":'], lenient: ['1'], strict: 2 },
  { label: 'a non-object line', lines: [note('1'), '[1,2]', note('2')], lenient: ['1', '2'], strict: 2 },
  { label: 'a repeated id', lines: [note('1'), note('1', { path: 'other' })], lenient: ['1'], strict: 2 },
  { label: 'a line without an id', lines: [note('1'), '{"kind":"note"}'], lenient: ['1'], strict: 2 },
  { label: 'a known kind that breaks its schema', lines: [note('1'), note('2', { note: 'bogus' })], lenient: ['1'], strict: 2 },
  { label: 'an unknown kind', lines: [note('1'), '{"id":"2","at":"t","kind":"from-the-future"}', note('3')], lenient: ['1', '3'], strict: 'ok' },
  { label: 'a repeated id of an unknown kind', lines: ['{"id":"1","at":"t","kind":"x"}', '{"id":"1","at":"t","kind":"y"}'], lenient: [], strict: 2 },
];

describe('02-A5: appending goes through the ledger lock', () => {
  it('appendLedger takes the lock once and releases it, and the review and note writers append through it', async () => {
    await inDirectory(async (directory) => {
      const locks: string[] = [];
      const fs = { ...nodeFileSystem, createExclusive: async (file: string, contents: string) => (file.endsWith('ledger.lock') && locks.push(file), nodeFileSystem.createExclusive(file, contents)) };
      await appendLedger(fs, directory, NOW, { kind: 'note' });
      assert.equal(locks.length, 1);
      assert.equal(await nodeFileSystem.exists(path.join(directory, 'ledger.lock')), false);
      await assert.rejects(withLedgerLock(fs, directory, () => NOW, async () => appendLedger(fs, directory, NOW, { kind: 'note' })), { code: 'internal' });
    });
  });
});

describe('the lenient and the strict reader', () => {
  for (const { label, lines, lenient, strict } of CORRUPTED) {
    it(`02-K3/02-K4: ${label}`, async () => {
      await inDirectory(async (directory) => {
        await write(directory, [...lines, '']);
        assert.deepEqual((await readLedger(nodeFileSystem, directory)).map((entry) => entry.id), lenient);
        const read = await readLedgerStrict(nodeFileSystem, directory);
        if (strict === 'ok') {
          assert.equal(read.state, 'ok');
          assert.deepEqual(read.state === 'ok' ? read.entries.map((entry) => entry.id) : null, lenient);
        } else {
          assert.equal(read.state, 'unreadable');
          assert.equal(read.state === 'unreadable' ? read.line : null, strict);
        }
      });
    });
  }

  it('02-K4: no ledger is absent, a legacy-only ledger is ok, and an unreadable path is unreadable', async () => {
    await inDirectory(async (directory) => {
      assert.deepEqual(await readLedgerStrict(nodeFileSystem, directory), { state: 'absent' });
      assert.deepEqual(await readLedger(nodeFileSystem, directory), []);
      await write(directory, [note('1'), JSON.stringify({ id: '2', at: 't', kind: 'review', reviewId: 'r', status: 'complete' }), '']);
      const read = await readLedgerStrict(nodeFileSystem, directory);
      assert.equal(read.state === 'ok' ? read.entries.length : -1, 2);
      await rm(path.join(directory, LEDGER_FILE));
      await nodeFileSystem.mkdirp(path.join(directory, LEDGER_FILE));
      assert.equal((await readLedgerStrict(nodeFileSystem, directory)).state, 'unreadable');
    });
  });

  it('02-K3: reads a task with no ledger as empty, and drops a kind it does not know', async () => {
    await inDirectory(async (directory) => {
      assert.deepEqual(await readLedger(nodeFileSystem, directory), []);
      await appendLedger(nodeFileSystem, directory, NOW, { kind: 'from-the-future', extra: 1 });
      assert.deepEqual(await readLedger(nodeFileSystem, directory), []);
    });
  });
});
