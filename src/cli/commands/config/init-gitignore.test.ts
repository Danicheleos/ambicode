import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { writeGitignore } from '#modules/config/init/proposal';
import { TempRepo } from '#testing/fixtures/temp-repo';

async function apply(root: string, existing?: string) {
  const runtime = await createRuntime({ cwd: root });
  if (existing !== undefined) await runtime.fs.writeText(`${root}/.gitignore`, existing);
  return { added: await writeGitignore(runtime.fs, root), runtime };
}

describe('09-G5: the ignore lines are written with the config, on acceptance', () => {
  it('adds every ignore line to a fresh .gitignore', async () => {
    const repo = await TempRepo.create();
    try {
      const { added, runtime } = await apply(repo.root);
      const ignore = await runtime.fs.readText(`${repo.root}/.gitignore`);
      for (const line of ['.ambicode/index/', '.ambicode/reviews/', '.ambicode/task/', '.ambicode/notes/']) {
        assert.match(ignore, new RegExp(`^${line.replaceAll('.', '\\.')}$`, 'm'));
      }
      assert.equal(added.length, 4);
    } finally {
      await repo.dispose();
    }
  });

  it('preserves an existing .gitignore and adds only what is missing', async () => {
    const repo = await TempRepo.create();
    try {
      const { runtime } = await apply(repo.root, '# already here\nnode_modules/\n.ambicode/reviews/\n');
      const ignore = await runtime.fs.readText(`${repo.root}/.gitignore`);
      assert.match(ignore, /^# already here\nnode_modules\/\n\.ambicode\/reviews\/\n/);
      assert.match(ignore, /^\.ambicode\/notes\/$/m);
      assert.equal(ignore.split('\n').filter((line) => line.trim() === '.ambicode/reviews/').length, 1);
    } finally {
      await repo.dispose();
    }
  });

  it('the root-anchored spelling counts as present', async () => {
    const repo = await TempRepo.create();
    try {
      const all = '/.ambicode/index/\n/.ambicode/reviews/\n/.ambicode/notes/\n/.ambicode/task/\n';
      const { added, runtime } = await apply(repo.root, all);
      assert.deepEqual(added, []);
      assert.equal(await runtime.fs.readText(`${repo.root}/.gitignore`), all, 'nothing was appended');
    } finally {
      await repo.dispose();
    }
  });
});
