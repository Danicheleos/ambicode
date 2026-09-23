import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '../composition/root.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { parseArgs } from './args.ts';
import { INIT_OPTIONS, runInit } from './commands/init.ts';

/**
 * P2.1: `.ambicode/notes/` is local, gitignored state (doc 02, "Storage and
 * ownership"), exactly like `.ambicode/reviews/`. Init must cover both so an
 * investigation note never lands in the product repository's history by
 * accident, and must never clobber a `.gitignore` the user already owns.
 */
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
      // Not duplicated: the pre-existing entry appears exactly once.
      assert.equal(ignore.split('\n').filter((line) => line.trim() === '.ambicode/reviews/').length, 1);
    } finally {
      await repo.dispose();
    }
  });

  it('recognises the root-anchored spelling of an entry it would otherwise add', async () => {
    // `/.ambicode/reviews/` and `.ambicode/reviews/` are one rule to git: a
    // pattern with a slash in it is already relative to the .gitignore's own
    // directory. Comparing the literal text made `init` append a second
    // spelling of an entry that was already in force — every time it ran.
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
