import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { buildProposal, writeConfig } from '#modules/config/init/proposal';
import { TempRepo } from '#testing/fixtures/temp-repo';

async function apply(root: string) {
  const runtime = await createRuntime({ cwd: root });
  const proposal = await buildProposal(runtime, root, []);
  return { proposal, written: await writeConfig(runtime.fs, root, proposal, []), runtime };
}

describe('09-G5: the ignore lines are written with the config, on acceptance', () => {
  it('09-G5: adds every ignore line to a fresh .gitignore', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.commitAll('initial');
      const { proposal, written, runtime } = await apply(repo.root);
      assert.deepEqual(proposal.gitignore.present, []);
      const ignore = await runtime.fs.readText(`${repo.root}/.gitignore`);
      for (const line of ['.ambicode/index/', '.ambicode/metrics.jsonl', '.ambicode/reviews/', '.ambicode/task/', '.ambicode/notes/']) {
        assert.match(ignore, new RegExp(`^${line.replaceAll('.', '\\.')}$`, 'm'));
      }
      assert.deepEqual(written.gitignoreAdded, proposal.gitignore.missing);
    } finally {
      await repo.dispose();
    }
  });

  it('09-G5: preserves an existing .gitignore and adds only what is missing', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.write('.gitignore', '# already here\nnode_modules/\n.ambicode/reviews/\n');
      await repo.commitAll('initial');
      const { runtime } = await apply(repo.root);
      const ignore = await runtime.fs.readText(`${repo.root}/.gitignore`);
      assert.match(ignore, /^# already here\nnode_modules\/\n\.ambicode\/reviews\/\n/);
      assert.match(ignore, /^\.ambicode\/notes\/$/m);
      assert.equal(ignore.split('\n').filter((line) => line.trim() === '.ambicode/reviews/').length, 1);
    } finally {
      await repo.dispose();
    }
  });

  it('09-P2: the root-anchored spelling counts as present', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('src/app.ts', 'export const a = 1;\n');
      const all = '/.ambicode/index/\n/.ambicode/metrics.jsonl\n/.ambicode/reviews/\n/.ambicode/notes/\n/.ambicode/task/\n';
      await repo.write('.gitignore', all);
      await repo.commitAll('initial');
      const { proposal, written, runtime } = await apply(repo.root);
      assert.deepEqual(proposal.gitignore.missing, []);
      assert.deepEqual(written.gitignoreAdded, []);
      assert.equal(await runtime.fs.readText(`${repo.root}/.gitignore`), all, 'nothing was appended');
    } finally {
      await repo.dispose();
    }
  });
});
