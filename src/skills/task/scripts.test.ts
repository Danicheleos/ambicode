import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REPO_ROOT } from '#testing/paths';

describe('task scripts (C7)', () => {
  it('inventory flags a defect brief and prints no payload', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ambicode-inventory-'));
    try {
      const git = (...args: string[]): void => { assert.equal(spawnSync('git', args, { cwd: root }).status, 0); };
      git('init', '-q');
      await mkdir(path.join(root, 'src'), { recursive: true });
      await writeFile(path.join(root, 'src', 'a.ts'), 'export function computeTotal() {}\ncomputeTotal();\n');
      await writeFile(path.join(root, 'src', 'b.ts'), 'import { computeTotal } from "./a";\ncomputeTotalOther();\n');
      git('add', '.');
      const taskDir = path.join(root, '.ambicode', 'task', 't');
      await mkdir(taskDir, { recursive: true });
      const out = spawnSync(process.execPath, [path.join(REPO_ROOT, 'skills', 'task', 'scripts', 'inventory.mjs')], {
        input: JSON.stringify({ repositoryRoot: root, taskDir, args: { text: 'Defect: `computeTotal` drops the last line' } }), encoding: 'utf8',
      });
      assert.equal(out.status, 0, out.stderr);
      const result = JSON.parse(out.stdout) as { payload: string | null; record: { defectBrief?: boolean } };
      assert.equal(result.payload, null, 'no callers grep');
      assert.equal(result.record.defectBrief, true);
      const plain = spawnSync(process.execPath, [path.join(REPO_ROOT, 'skills', 'task', 'scripts', 'inventory.mjs')], { input: JSON.stringify({ repositoryRoot: root, taskDir, args: { text: 'Add a field' } }), encoding: 'utf8' });
      assert.deepEqual(JSON.parse(plain.stdout).record, {});
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
