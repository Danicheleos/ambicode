import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { trackSweep } from './sweep-events.mjs';

describe('sweep events: runs are counted from the sandboxes the harness creates and removes', () => {
  it('reports start and end of each run, ignores sandboxes left from before, and writes the events file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sweep-events-'));
    const file = path.join(root, 'events.jsonl');
    const lines = [];
    try {
      mkdirSync(path.join(root, 'e-old'));
      const tracker = trackSweep({ total: 2, roots: [root], file, log: (line) => lines.push(line) });
      mkdirSync(path.join(root, 'e-one'));
      tracker.tick();
      rmSync(path.join(root, 'e-one'), { recursive: true });
      mkdirSync(path.join(root, 'e-two'));
      tracker.tick();
      rmSync(path.join(root, 'e-two'), { recursive: true });
      tracker.finish(0);
      const events = readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      assert.deepEqual(events.map((event) => event.event), ['start', 'run-start', 'run-end', 'run-start', 'run-end', 'end']);
      assert.equal(events.at(-1).ended, 2);
      assert.match(lines.at(-2), /2\/2 done, 0 running/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
