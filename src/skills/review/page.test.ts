import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { recordedResult } from './page.ts';

test('a recorded result that is not valid JSON reads as absent', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ambicode-page-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'result.json'), '{"reviewId": ');
  const entries = [{ id: 'e1', kind: 'review', stage: 'recorded', result: 'result.json' }];
  assert.equal(await recordedResult(nodeFileSystem, root, entries as never), null);
});
