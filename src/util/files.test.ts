import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { writeUniqueFile } from './files.ts';

const memoryFs = (taken: string[]) => {
  const files = new Set(taken);
  return { files, createExclusive: async (file: string) => (files.has(file) ? false : (files.add(file), true)) };
};

describe('writeUniqueFile', () => {
  it('suffixes -2, -3 … after a taken name', async () => {
    const fs = memoryFs(['a.json', 'a-2.json']);
    assert.equal(await writeUniqueFile(fs, 'a', '.json', '{}'), 'a-3.json');
  });

  it('uses the next free name after any taken ones', async () => {
    assert.equal(await writeUniqueFile(memoryFs(['a.md', 'a-2.md', 'a-3.md']), 'a', '.md', ''), 'a-4.md');
  });
});
