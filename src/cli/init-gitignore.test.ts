import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '../composition/root.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { parseArgs } from './args.ts';
import { INIT_OPTIONS, runInit } from './commands/init.ts';

describe('init keeps optional notes out of the product repository history', () => {
  it('adds .ambicode/reviews/ and .ambicode/notes/ to a fresh .gitignore', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.commitAll('initial');
      const runtime = await createRuntime({ cwd: repo.root });

      const output = await runInit(runtime, parseArgs('init', [], INIT_OPTIONS));

      const ignore = await runtime.fs.readText(`${repo.root}/.gitignore`);
      assert.match(ignore, /^\.ambicode\/reviews\/$/m);
      assert.match(ignore, /^\.ambicode\/notes\/$/m);
      assert.ok(output.notices.some((notice) => notice.includes('.ambicode/notes/')));
    } finally {
      await repo.dispose();
    }
  });

  it('preserves an existing .gitignore and adds only what is missing', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.write('.gitignore', '# already here\nnode_modules/\n.ambicode/reviews/\n');
      await repo.commitAll('initial');
      const runtime = await createRuntime({ cwd: repo.root });

      await runInit(runtime, parseArgs('init', [], INIT_OPTIONS));

      const ignore = await runtime.fs.readText(`${repo.root}/.gitignore`);
      assert.match(ignore, /^# already here$/m);
      assert.match(ignore, /^node_modules\/$/m);
      assert.match(ignore, /^\.ambicode\/notes\/$/m);
      assert.equal(ignore.split('\n').filter((line) => line.trim() === '.ambicode/reviews/').length, 1);
    } finally {
      await repo.dispose();
    }
  });

  it('recognises the root-anchored spelling of an entry it would otherwise add', async () => {
    // `/.ambicode/reviews/` and `.ambicode/reviews/` are one rule to git: a
    // pattern with a slash in it is already relative to the .gitignore.
    const repo = await TempRepo.create();
    try {
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.write('.gitignore', '/.ambicode/reviews/\n/.ambicode/notes/\n/.ambicode/task/\n');
      await repo.commitAll('initial');
      const runtime = await createRuntime({ cwd: repo.root });

      const output = await runInit(runtime, parseArgs('init', [], INIT_OPTIONS));

      const ignore = await runtime.fs.readText(`${repo.root}/.gitignore`);
      assert.equal(
        ignore,
        '/.ambicode/reviews/\n/.ambicode/notes/\n/.ambicode/task/\n',
        'nothing was appended',
      );
      assert.ok(!output.notices.some((notice) => notice.includes('.gitignore')));
    } finally {
      await repo.dispose();
    }
  });
});
