import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REPO_ROOT } from '#testing/paths';

const SCAFFOLD = path.join(REPO_ROOT, 'skills', 'init', 'scripts', 'scaffold.mjs');
const run = (root: string) => spawnSync(process.execPath, [SCAFFOLD, '--root', root], { encoding: 'utf8' });

async function repo(t: { after(fn: () => unknown): void }, name: string): Promise<string> {
  const base = await mkdtemp(path.join(tmpdir(), 'ambicode-scaffold-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, name);
  await mkdir(root);
  execFileSync('git', ['init', '-q', root]);
  return root;
}

describe('init scaffold', () => {
  it('creates the folders, the config with a kebab id and the ignore line, then reports everything as existing', async (t) => {
    const root = await repo(t, 'My Repo_2');
    const first = run(root);
    assert.equal(first.status, 0, first.stderr);
    const out = JSON.parse(first.stdout);
    assert.deepEqual(out.created, ['.ambicode/tasks', '.ambicode/reviews', '.ambicode/context', '.ambicode/config.yaml']);
    assert.equal(out.gitignore, 'created');
    assert.equal(out.configExisted, false);
    assert.match(await readFile(path.join(root, '.ambicode/config.yaml'), 'utf8'), /^id: my-repo-2$/m);
    const second = JSON.parse(run(root).stdout);
    assert.deepEqual(second.created, []);
    assert.equal(second.existing.length, 3);
    assert.equal(second.configExisted, true);
    assert.equal(second.gitignore, 'present');
  });

  it('appends the ignore line to an existing .gitignore and keeps an edited config', async (t) => {
    const root = await repo(t, 'app');
    await writeFile(path.join(root, '.gitignore'), 'node_modules');
    assert.equal(JSON.parse(run(root).stdout).gitignore, 'added');
    assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), 'node_modules\n.ambicode/\n');
    await writeFile(path.join(root, '.ambicode/config.yaml'), 'mine\n');
    run(root);
    assert.equal(await readFile(path.join(root, '.ambicode/config.yaml'), 'utf8'), 'mine\n');
  });

  it('exits 2 with a JSON error outside a git root', async (t) => {
    const root = await repo(t, 'app');
    const sub = path.join(root, 'sub');
    await mkdir(sub);
    const result = run(sub);
    assert.equal(result.status, 2);
    assert.match(JSON.parse(result.stdout).error, /git root/);
    assert.equal(run(path.dirname(root)).status, 2);
  });
});
