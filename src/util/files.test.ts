import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNIQUE_FILE_LIMIT, writeUniqueFile } from './files.ts';

const memoryFs = (taken: string[]) => {
  const files = new Set(taken);
  return { files, createExclusive: async (file: string) => (files.has(file) ? false : (files.add(file), true)) };
};

describe('writeUniqueFile', () => {
  it('suffixes -2, -3 … after a taken name', async () => {
    const fs = memoryFs(['a.json', 'a-2.json']);
    assert.equal(await writeUniqueFile(fs, 'a', '.json', '{}'), 'a-3.json');
  });

  it('returns null once every suffix up to the limit is taken', async () => {
    const taken = ['a.md', ...Array.from({ length: UNIQUE_FILE_LIMIT - 1 }, (_, index) => `a-${index + 2}.md`)];
    assert.equal(await writeUniqueFile(memoryFs(taken), 'a', '.md', ''), null);
  });
});
