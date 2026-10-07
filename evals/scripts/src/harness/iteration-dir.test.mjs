import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { reserveIteration } from './iteration-dir.mjs';

describe('iteration-dir', () => {
  it('reserves the next numbered iteration of a named type, so a second call gets a new one', () => {
    const outputs = mkdtempSync(path.join(tmpdir(), 'iteration-dir-'));
    try {
      const now = new Date('2026-01-02T03:04:05Z');
      const first = reserveIteration('triggers', 'sonnet-5-5', { now, outputs });
      assert.equal(first, path.join(outputs, 'triggers', '2026-01-02', '01_0304_sonnet-5-5'));
      assert.ok(existsSync(path.join(first, 'results')));
      assert.equal(path.basename(reserveIteration('triggers', 'sonnet-5-5', { now, outputs })), '02_0304_sonnet-5-5');
      assert.throws(() => reserveIteration('Triggers', 'x', { now, outputs }), /usage/);
    } finally {
      rmSync(outputs, { recursive: true, force: true });
    }
  });
});
