import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '../ports/filesystem.ts';
import { withLedgerLock } from './ledger-lock.ts';
import { appendLedger, LEDGER_FILE, MAX_ENTRY_BYTES, readLedger, readLedgerStrict, WARN_LEDGER_BYTES } from './ledger.ts';

const NOW = new Date('2026-10-02T12:00:00.000Z');
const A = 'a1b2c3d4';
const note = (id: string, extra: object = {}): string => JSON.stringify({ id, at: NOW.toISOString(), kind: 'note', note: 'notes', path: 'p', contentHash: 'sha256:x', ...extra });

async function inDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'ledger-'));
  try {
    await run(path.join(root, 'task', 'ORD-17'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const write = async (directory: string, lines: string[]): Promise<void> => {
  await nodeFileSystem.mkdirp(directory);
  await writeFile(path.join(directory, LEDGER_FILE), lines.join('\n'));
};

describe('the task ledger is append-only evidence', () => {
  it('02-A1/02-A2: numbers entries per writer, one JSON line each, and creates the directory', async () => {
    await inDirectory(async (directory) => {
      const first = await appendLedger(nodeFileSystem, directory, NOW, A, { kind: 'note', path: 'a.md' });
      const second = await appendLedger(nodeFileSystem, directory, NOW, A, { kind: 'review', status: 'complete' });
      const other = await appendLedger(nodeFileSystem, directory, NOW, 'ffffffff', { kind: 'note' });
      assert.deepEqual([first.entry.id, second.entry.id, other.entry.id], [`${A}-1`, `${A}-2`, 'ffffffff-1']);
      const lines = (await readFile(path.join(directory, LEDGER_FILE), 'utf8')).split('\n');
      assert.equal(lines.length, 4);
      assert.equal(lines[3], '');
      assert.deepEqual(JSON.parse(lines[0]!), { id: `${A}-1`, at: NOW.toISOString(), kind: 'note', path: 'a.md' });
    });
  });

  it('02-A1: a session id is lowercased and cut to 8 letters or digits; legacy ids never count', async () => {
    await inDirectory(async (directory) => {
      await write(directory, [note('L7'), note('L9')]);
      const entry = (await appendLedger(nodeFileSystem, directory, NOW, 'A1B2C3D4-0000-4000-8000-000000000000', { kind: 'note' })).entry;
      assert.equal(entry.id, `${A}-1`);
      await assert.rejects(appendLedger(nodeFileSystem, directory, NOW, '--', { kind: 'note' }), { code: 'internal' });
    });
  });

  it('02-A1: n is one more than the highest n of that writer, and a torn line does not reset it', async () => {
    await inDirectory(async (directory) => {
      await write(directory, [note(`${A}-4`), `{"id":"${A}-9","at":`, note('ffffffff-12'), '']);
      assert.equal((await appendLedger(nodeFileSystem, directory, NOW, A, { kind: 'note' })).entry.id, `${A}-5`);
    });
  });

  it('keeps earlier lines byte for byte when it appends, and an entry cannot choose its own id', async () => {
    await inDirectory(async (directory) => {
      await appendLedger(nodeFileSystem, directory, NOW, A, { kind: 'note' });
      const before = await readFile(path.join(directory, LEDGER_FILE), 'utf8');
      const second = await appendLedger(nodeFileSystem, directory, NOW, A, { kind: 'note', id: 'L1', at: 'never' });
      assert.ok((await readFile(path.join(directory, LEDGER_FILE), 'utf8')).startsWith(before));
      assert.deepEqual([second.entry.id, second.entry.at], [`${A}-2`, NOW.toISOString()]);
    });
  });

  it('02-A3: 16,384 bytes are accepted and 16,385 are refused with nothing written', async () => {
    await inDirectory(async (directory) => {
      const sized = async (bytes: number) => {
        const probe = JSON.stringify({ id: `${A}-1`, at: NOW.toISOString(), kind: 'note', pad: '' });
        return appendLedger(nodeFileSystem, directory, NOW, A, { kind: 'note', pad: 'x'.repeat(bytes - Buffer.byteLength(probe)) });
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
      const small = await appendLedger(nodeFileSystem, directory, NOW, A, { kind: 'note' });
      assert.equal(small.warning, null);
      await writeFile(path.join(directory, LEDGER_FILE), '\n'.repeat(WARN_LEDGER_BYTES - 20));
      const big = await appendLedger(nodeFileSystem, directory, NOW, A, { kind: 'note' });
      assert.ok(big.ledgerBytes >= WARN_LEDGER_BYTES);
      assert.match(big.warning ?? '', /--task ORD-17-2/);
    });
  });
});

const CORRUPTED: { label: string; lines: string[]; lenient: string[]; strict: 'ok' | number }[] = [
  { label: 'a torn last line', lines: [note('L1'), '{"id":"L2","at":'], lenient: ['L1'], strict: 2 },
  { label: 'a non-object line', lines: [note('L1'), '[1,2]', note('L2')], lenient: ['L1', 'L2'], strict: 2 },
  { label: 'a repeated id', lines: [note('L1'), note('L1', { path: 'other' })], lenient: ['L1'], strict: 2 },
  { label: 'a line without an id', lines: [note('L1'), '{"kind":"note"}'], lenient: ['L1'], strict: 2 },
  { label: 'a known kind that breaks its schema', lines: [note('L1'), note('L2', { note: 'bogus' })], lenient: ['L1'], strict: 2 },
  { label: 'an unknown kind', lines: [note('L1'), '{"id":"L2","at":"t","kind":"from-the-future"}', note('L3')], lenient: ['L1', 'L3'], strict: 'ok' },
  { label: 'a repeated id of an unknown kind', lines: ['{"id":"L1","at":"t","kind":"x"}', '{"id":"L1","at":"t","kind":"y"}'], lenient: [], strict: 2 },
];

describe('02-A5: appending goes through the ledger lock', () => {
  it('appendLedger takes the lock once and releases it, and the review and note writers call it with a writer id', async () => {
    await inDirectory(async (directory) => {
      const locks: string[] = [];
      const fs = { ...nodeFileSystem, createExclusive: async (file: string, contents: string) => (file.endsWith('ledger.lock') && locks.push(file), nodeFileSystem.createExclusive(file, contents)) };
      await appendLedger(fs, directory, NOW, A, { kind: 'note' });
      assert.equal(locks.length, 1);
      assert.equal(await nodeFileSystem.exists(path.join(directory, 'ledger.lock')), false);
      await assert.rejects(withLedgerLock(fs, directory, () => NOW, A, async () => appendLedger(fs, directory, NOW, A, { kind: 'note' })), { code: 'internal' });
      for (const caller of ['../cli/commands/note.ts', '../task/notes.ts', '../review/bundle.ts']) {
        const source = await readFile(new URL(caller, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /appendLedger\([^)]*now\(\), \{/, `${caller} must pass a writer`);
      }
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
      await write(directory, [note('L1'), JSON.stringify({ id: 'L2', at: 't', kind: 'review', reviewId: 'r', status: 'complete' }), '']);
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
      await appendLedger(nodeFileSystem, directory, NOW, A, { kind: 'from-the-future', extra: 1 });
      assert.deepEqual(await readLedger(nodeFileSystem, directory), []);
    });
  });
});
