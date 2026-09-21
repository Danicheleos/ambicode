import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { createRuntime } from '../composition/root.ts';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';
import { parseArgs } from './args.ts';
import { BUNDLE_OPTIONS, runBundle } from './commands/bundle.ts';
import { INIT_OPTIONS, runInit } from './commands/init.ts';
import { REVIEW_OPTIONS, runReview } from './commands/review.ts';
import type { Reviewer, ReviewerInvocation } from '../ports/reviewer.ts';
import { TempRepo } from '../testing/temp-repo.ts';

/** Records every write so a path created behind the port's back is visible. */
function recording(inner: FileSystem): { fs: FileSystem; writes: string[]; dirs: string[] } {
  const writes: string[] = [];
  const dirs: string[] = [];
  return {
    writes,
    dirs,
    fs: {
      ...inner,
      writeText: async (absolutePath, contents) => {
        writes.push(absolutePath);
        await inner.writeText(absolutePath, contents);
      },
      mkdirp: async (absolutePath) => {
        dirs.push(absolutePath);
        await inner.mkdirp(absolutePath);
      },
      temporaryDirectory: async (prefix) => {
        const created = await inner.temporaryDirectory(prefix);
        dirs.push(created);
        return created;
      },
    },
  };
}

/** Answers without a process, so the test observes only the writes. */
const emptyReviewer: Reviewer = {
  invoke: async (): Promise<ReviewerInvocation> => ({
    kind: 'ok',
    output: { findings: [], coverageNotes: [] },
    rawLength: 2,
    argv: ['claude', '--print'],
  }),
};

describe('U28 bundle writes only through the filesystem port', () => {
  it('creates the review directory, result and snapshot marker through the injected port', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.commitAll('initial');

      // The configuration comes from the real init command, so this test cannot
      // pass against a shape the product would reject.
      const setup = await createRuntime({ cwd: repo.root });
      await runInit(setup, parseArgs('init', [], INIT_OPTIONS));

      await repo.write('src/app.ts', 'export const a = 2;\n');

      const recorder = recording(nodeFileSystem);
      const runtime = await createRuntime({ cwd: repo.root, fs: recorder.fs });
      const output = await runBundle(runtime, parseArgs('bundle', [], BUNDLE_OPTIONS));

      // Every artifact the command reports must have been written through the
      // port, not through a direct node:fs call that the recorder cannot see.
      assert.ok(recorder.writes.includes(output.resultPath));
      assert.ok(recorder.writes.includes(path.join(output.reviewDirectory, 'snapshot-path.txt')));
      assert.ok(recorder.dirs.includes(output.reviewDirectory));
      assert.ok(recorder.dirs.includes(output.snapshotDirectory));

      // The manifest read is on the same port, so pluginVersion is not "unknown".
      assert.match(output.result.pluginVersion, /^\d/);

      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await repo.dispose();
    }
  });

  it('writes the review result, prompt and report through the injected port', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
      await repo.write('src/app.ts', 'export const a = 1;\n');
      await repo.commitAll('initial');

      const setup = await createRuntime({ cwd: repo.root });
      await runInit(setup, parseArgs('init', [], INIT_OPTIONS));
      await repo.write('src/app.ts', 'export const a = 2;\n');

      const recorder = recording(nodeFileSystem);
      const runtime = await createRuntime({ cwd: repo.root, fs: recorder.fs });
      const output = await runReview(runtime, parseArgs('review', [], REVIEW_OPTIONS), {
        reviewer: emptyReviewer,
      });

      for (const artifact of [
        output.resultPath,
        output.reportPath,
        path.join(output.reviewDirectory, 'reviewer-system-prompt.md'),
        path.join(output.reviewDirectory, 'reviewer-user-prompt.md'),
        path.join(output.reviewDirectory, 'snapshot-path.txt'),
      ]) {
        assert.ok(recorder.writes.includes(artifact), `${artifact} was not written through the port`);
      }
      assert.ok(recorder.dirs.includes(output.snapshotDirectory));

      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await repo.dispose();
    }
  });
});
