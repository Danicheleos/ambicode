import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { MAX_SNAPSHOT_FILE_BYTES } from '../config/defaults.ts';
import { createRuntime } from '../composition/root.ts';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { parseArgs } from './args.ts';
import { INIT_OPTIONS, runInit } from './commands/init.ts';
import { PREPARE_OPTIONS, renderPrepare, runPrepare } from './commands/prepare.ts';
import { statusPaths } from '../snapshot/preflight.ts';

const BIG = 'x'.repeat(MAX_SNAPSHOT_FILE_BYTES + 1);
const BIG_BYTES = MAX_SNAPSHOT_FILE_BYTES + 1;

async function prepared(repo: TempRepo, argv: string[] = [], fs: FileSystem = nodeFileSystem) {
  const runtime = await createRuntime({ cwd: repo.root, fs });
  return await runPrepare(runtime, parseArgs('prepare', ['--activity', 'review', ...argv], PREPARE_OPTIONS));
}

/** One committed, initialised repository; the config itself is left untracked, as init leaves it. */
async function withRepo(run: (repo: TempRepo) => Promise<void>): Promise<void> {
  const repo = await TempRepo.create();
  try {
    await repo.write('src/app.ts', 'export const a = 1;\n');
    await repo.write('src/committed-big.json', BIG);
    await repo.write('src/doomed-big.json', BIG);
    await repo.commitAll('initial');
    const runtime = await createRuntime({ cwd: repo.root });
    await runInit(runtime, parseArgs('init', [], INIT_OPTIONS));
    await run(repo);
  } finally {
    await repo.dispose();
  }
}

function sizeNotices(notices: readonly string[] | undefined): string[] {
  return (notices ?? []).filter((notice) => notice.includes('per-file snapshot ceiling'));
}

describe('prepare warns about files the review snapshot would refuse', () => {
  it('names a positional path over the ceiling with its byte count and the --exclude line the refusal gives', async () => {
    await withRepo(async (repo) => {
      const run = await prepared(repo, ['src/committed-big.json']);
      const [notice, ...rest] = sizeNotices(run.data.notices);
      assert.deepEqual(rest, [], 'one notice per run');
      assert.ok(notice !== undefined, 'expected a size notice');
      assert.match(notice, new RegExp(`src/committed-big\\.json is ${BIG_BYTES} bytes, above the ${MAX_SNAPSHOT_FILE_BYTES}-byte per-file snapshot ceiling\\.`));
      assert.match(notice, /^ {2}--exclude "src\/committed-big\.json"$/m);
      assert.match(renderPrepare(run), /src\/committed-big\.json is 262145 bytes/);
    });
  });

  it('checks the working-tree changed paths in one notice, and skips small, unchanged, deleted and at-ceiling files', async () => {
    await withRepo(async (repo) => {
      await repo.write('src/new-big.json', BIG);
      await repo.write('src/other-big.txt', BIG);
      await repo.write('src/at-ceiling.txt', 'y'.repeat(MAX_SNAPSHOT_FILE_BYTES));
      await repo.write('src/small.ts', 'export const b = 2;\n');
      await rm(path.join(repo.root, 'src/doomed-big.json'));

      const run = await prepared(repo);
      const notices = sizeNotices(run.data.notices);
      assert.equal(notices.length, 1, notices.join('\n---\n'));
      const [notice] = notices;
      assert.ok(notice !== undefined);
      assert.match(notice, /src\/new-big\.json is 262145 bytes/);
      assert.match(notice, /src\/other-big\.txt is 262145 bytes/);
      assert.match(notice, /^ {2}--exclude "src\/new-big\.json"$/m);
      assert.match(notice, /^ {2}--exclude "src\/other-big\.txt"$/m);
      assert.doesNotMatch(notice, /committed-big|doomed-big|at-ceiling|small\.ts/);
    });
  });

  it('does not flag a path that review.excludePaths already leaves out', async () => {
    await withRepo(async (repo) => {
      const configPath = path.join(repo.root, '.ambicode', 'config.yaml');
      const config = await readFile(configPath, 'utf8');
      const excluded = config.replace(/excludePaths: \[\]/, 'excludePaths:\n    - "generated/**"');
      assert.notEqual(excluded, config, 'the fixture must actually configure an exclusion');
      await writeFile(configPath, excluded, 'utf8');
      await repo.write('generated/table.json', BIG);

      const notices = sizeNotices((await prepared(repo, ['generated/table.json'])).data.notices);
      assert.deepEqual(notices, []);

      await repo.write('src/kept-big.json', BIG);
      const [notice] = sizeNotices((await prepared(repo, ['generated/table.json'])).data.notices);
      assert.ok(notice !== undefined);
      assert.match(notice, /src\/kept-big\.json/);
      assert.doesNotMatch(notice, /generated\/table\.json/);
    });
  });

  it('adds no notice when nothing is over the ceiling, and writes nothing while checking', async () => {
    await withRepo(async (repo) => {
      assert.deepEqual(sizeNotices((await prepared(repo, ['src/app.ts'])).data.notices), []);

      await repo.write('src/new-big.json', BIG);
      const writes: string[] = [];
      const fs: FileSystem = {
        ...nodeFileSystem,
        writeText: async (absolutePath, contents) => {
          writes.push(absolutePath);
          await nodeFileSystem.writeText(absolutePath, contents);
        },
        mkdirp: async (absolutePath) => {
          writes.push(absolutePath);
          await nodeFileSystem.mkdirp(absolutePath);
        },
      };
      const run = await prepared(repo, [], fs);
      assert.equal(sizeNotices(run.data.notices).length, 1);
      assert.deepEqual(writes, []);
    });
  });

  it('reads a renamed file by its new name only, and never treats the rename origin as a change', async () => {
    await withRepo(async (repo) => {
      await repo.run(['git', 'mv', 'src/committed-big.json', 'src/renamed-big.json']);
      const [notice] = sizeNotices((await prepared(repo)).data.notices);
      assert.ok(notice !== undefined);
      assert.match(notice, /^src\/renamed-big\.json is 262145 bytes/m);
      assert.doesNotMatch(notice, /committed-big/);
    });
  });
});

describe('statusPaths', () => {
  it('lists the current name of each record and skips the origin that follows a rename or copy', () => {
    assert.deepEqual(statusPaths(' M a.ts\0R  new.ts\0old.ts\0?? b c.ts\0C  copy.ts\0source.ts\0 D gone.ts\0'), [
      'a.ts',
      'new.ts',
      'b c.ts',
      'copy.ts',
      'gone.ts',
    ]);
    assert.deepEqual(statusPaths(''), []);
  });
});
