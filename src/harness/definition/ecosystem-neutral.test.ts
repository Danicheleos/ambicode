import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT } from '#testing/paths';

const NAMES = ['typescript', 'javascript', 'python', 'angular', 'react', 'prettier', 'black', 'ruff', 'pyright', 'eslint', 'jest', 'pytest'];
const WORD = new RegExp(`(?<![A-Za-z0-9_])(${NAMES.join('|')})(?![A-Za-z0-9_])`, 'i');

async function filesUnder(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await filesUnder(full)));
    else if (!entry.name.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

describe('09-M2: ecosystem neutrality', () => {
  it('09-M2: route code, routes and the map name no language or tool', async () => {
    const files = [...(await filesUnder(path.join(REPO_ROOT, 'src', 'harness'))), path.join(REPO_ROOT, 'src', 'skills', 'common.ts'), ...(await filesUnder(path.join(REPO_ROOT, 'routes'))), path.join(REPO_ROOT, 'src', 'modules', 'search', 'map.ts')];
    assert.ok(files.some((file) => file.endsWith(path.join('routes', 'task', 'red.md'))), 'step texts are scanned');
    const hits: string[] = [];
    for (const file of files) {
      const lines = (await readFile(file, 'utf8')).split('\n');
      lines.forEach((line, index) => {
        const match = WORD.exec(line);
        if (match !== null) hits.push(`${path.relative(REPO_ROOT, file)}:${index + 1}: ${match[1]}`);
      });
    }
    assert.deepEqual(hits, []);
  });
});
