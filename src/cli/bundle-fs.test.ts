import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import { createRuntime } from '../composition/root.ts';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';
import { parseArgs } from './args.ts';
import { BUNDLE_OPTIONS, runBundle } from './commands/bundle.ts';
import { initConfig } from '../testing/init-config.ts';
import { REVIEW_OPTIONS, runReview } from './commands/review.ts';
import type { Reviewer, ReviewerInvocation } from '../ports/reviewer.ts';
import { TempRepo } from '../testing/temp-repo.ts';

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

      const setup = await createRuntime({ cwd: repo.root });
      await initConfig(setup);

      await repo.write('src/app.ts', 'export const a = 2;\n');

      const recorder = recording(nodeFileSystem);
      const runtime = await createRuntime({ cwd: repo.root, fs: recorder.fs });
      const output = await runBundle(runtime, parseArgs('bundle', [], BUNDLE_OPTIONS));

      assert.ok(recorder.writes.includes(output.resultPath));
      assert.ok(recorder.writes.includes(path.join(output.reviewDirectory, 'snapshot-path.txt')));
      assert.ok(recorder.dirs.includes(output.reviewDirectory));
      assert.ok(recorder.dirs.includes(output.snapshotDirectory));

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
      await initConfig(setup);
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

describe('U09 --exclude narrows a review the limits would otherwise refuse', () => {
  async function repoWithOversizedFile(): Promise<TempRepo> {
    const repo = await TempRepo.create();
    await repo.write('package.json', '{"name":"app","version":"1.0.0"}\n');
    await repo.write('src/app.ts', 'export const a = 1;\n');
    const setup = await createRuntime({ cwd: repo.root });
    await initConfig(setup);
    await repo.commitAll('initial');
    await repo.write('src/app.ts', 'export const a = 2;\n');
    await repo.write('assets/i18n/cs.json', `{"k":"${'x'.repeat(300_000)}"}\n`);
    return repo;
  }

  it('reviews the rest of the change and reports what it did not cover', async () => {
    const repo = await repoWithOversizedFile();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      const output = await runBundle(
        runtime,
        parseArgs('bundle', ['--exclude', 'assets/i18n/**'], BUNDLE_OPTIONS),
      );

      const reviewed = output.result.changedFiles.filter((file) => file.included);
      assert.deepEqual(reviewed.map((file) => file.newPath), ['src/app.ts']);
      const left = output.result.changedFiles.find((file) => file.newPath === 'assets/i18n/cs.json');
      assert.equal(left?.included, false);
      assert.match(left?.exclusionReason ?? '', /pattern/);
      assert.ok(
        output.result.omissions.some(
          (line) => line.includes('narrowed on request') && line.includes('assets/i18n/**'),
        ),
        `the narrowing must be stated once, as coverage; got ${JSON.stringify(output.result.omissions)}`,
      );
      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await repo.dispose();
    }
  });

  it('refuses when the patterns leave no change to review', async () => {
    const repo = await repoWithOversizedFile();
    try {
      const runtime = await createRuntime({ cwd: repo.root });
      await assert.rejects(
        () => runBundle(runtime, parseArgs('bundle', ['--exclude', '**'], BUNDLE_OPTIONS)),
        (error: Error & { code: string; details: string[] }) => {
          assert.equal(error.code, 'nothing-to-review');
          assert.ok(error.details.some((detail) => detail.includes('**')));
          return true;
        },
      );
    } finally {
      await repo.dispose();
    }
  });
});

describe('U09 the reviewed set is bounded on both sides, and never empty', () => {
  async function repo(): Promise<TempRepo> {
    const created = await TempRepo.create();
    await created.write('package.json', '{"name":"app","version":"1.0.0"}\n');
    await created.write('src/app.ts', 'export const a = 1;\n');
    await created.write('web/page.ts', 'export const p = 1;\n');
    const setup = await createRuntime({ cwd: created.root });
    await initConfig(setup);
    await created.commitAll('initial');
    return created;
  }

  it('refuses a clean tree instead of reviewing nothing (F2)', async () => {
    const created = await repo();
    try {
      const runtime = await createRuntime({ cwd: created.root });
      await assert.rejects(
        () => runBundle(runtime, parseArgs('bundle', [], BUNDLE_OPTIONS)),
        (error: Error & { code: string; details: string[] }) => {
          assert.equal(error.code, 'nothing-to-review');
          assert.ok(error.details.some((line) => /no changed file|nothing changed/i.test(line)));
          return true;
        },
      );
    } finally {
      await created.dispose();
    }
  });

  it('narrows the review to --only and reports the rest as uncovered (F3)', async () => {
    const created = await repo();
    try {
      await created.write('src/app.ts', 'export const a = 2;\n');
      await created.write('web/page.ts', 'export const p = 2;\n');

      const runtime = await createRuntime({ cwd: created.root });
      const output = await runBundle(
        runtime,
        parseArgs('bundle', ['--only', 'src/**'], BUNDLE_OPTIONS),
      );

      const reviewed = output.result.changedFiles.filter((file) => file.included);
      assert.deepEqual(reviewed.map((file) => file.newPath), ['src/app.ts']);
      const left = output.result.changedFiles.find((file) => file.newPath === 'web/page.ts');
      assert.equal(left?.included, false);
      assert.ok(
        output.result.omissions.some((line) => line.includes('narrowed on request') && line.includes('src/**')),
        `the narrowing must be stated as coverage; got ${JSON.stringify(output.result.omissions)}`,
      );
      await nodeFileSystem.remove(output.snapshotDirectory);
    } finally {
      await created.dispose();
    }
  });

  it('refuses when --only matches nothing in the change (F3)', async () => {
    const created = await repo();
    try {
      await created.write('src/app.ts', 'export const a = 2;\n');
      const runtime = await createRuntime({ cwd: created.root });
      await assert.rejects(
        () => runBundle(runtime, parseArgs('bundle', ['--only', 'nowhere/**'], BUNDLE_OPTIONS)),
        (error: Error & { code: string }) => {
          assert.equal(error.code, 'nothing-to-review');
          return true;
        },
      );
    } finally {
      await created.dispose();
    }
  });
});
