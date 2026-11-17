// $0 check of the seed writer real-cases.mjs uses: the ledger line is a note entry the real ledger reader accepts, for the file beside it.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEntry } from '../../src/platform/ledger/kinds.ts';
import { contentHash } from '../../src/util/hash.ts';
import { seedFiles } from './task-seeds.mjs';

describe('seedFiles', () => {
  for (const kind of ['plan', 'investigation']) {
    it(`${kind}: the ledger line is a note entry the real reader accepts, with the hash of the file beside it`, () => {
      const files = seedFiles('some-slug', kind, 'The note text.');
      const lines = files['seed/tasks/some-slug/ledger.jsonl'].trim().split('\n');
      assert.equal(lines.length, 1);
      const parsed = parseEntry(JSON.parse(lines[0]));
      assert.ok(parsed.ok, JSON.stringify(parsed));
      assert.equal(parsed.entry.kind, 'note');
      assert.equal(parsed.entry.note, kind);
      assert.match(parsed.entry.path, new RegExp(`^\\.ambicode/tasks/some-slug/(plan|investigation_[0-9T-]+)\\.md$`));
      const text = files[`seed/${parsed.entry.path.replace(/^\.ambicode\//, '')}`];
      assert.equal(parsed.entry.contentHash, contentHash(text));
      assert.equal(text.startsWith('---\nstatus: accepted\n---\n'), kind === 'plan');
      assert.equal(Object.keys(files).length, 2);
    });
  }
});
