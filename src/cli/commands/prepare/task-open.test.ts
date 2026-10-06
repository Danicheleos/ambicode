import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '../../args.ts';
import { initConfig } from '#testing/fixtures/init-config';
import { renderPrepare, runPrepare } from './prepare.ts';
import { runNoteSave } from '../route/note.ts';
import { PREPARE_OPTIONS } from '#types/cli';
import { NOTE_SAVE_OPTIONS } from '../../types/commands.ts';

const ORD = 'https://example.atlassian.net/browse/ORD-17';

async function inRepo(run: (repo: TempRepo) => Promise<void>): Promise<void> {
  const repo = await TempRepo.create();
  try {
    await repo.write('src/app.ts', 'export const a = 1;\n');
    await repo.commitAll('initial');
    await initConfig(await createRuntime({ cwd: repo.root }));
    await run(repo);
  } finally {
    await repo.dispose();
  }
}

async function prepare(repo: TempRepo, argv: string[]) {
  const runtime = await createRuntime({ cwd: repo.root });
  return runPrepare(runtime, parseArgs('prepare', ['--activity', 'investigate', ...argv], PREPARE_OPTIONS));
}

async function evidenceFor(repo: TempRepo, ids: [string, string][]): Promise<string> {
  await repo.write(
    'evidence.json',
    JSON.stringify({
      mcpServer: null,
      sources: ids.map(([id, url]) => ({ id, url, title: id, retrievedAt: '2026-09-20T09:00:00.000Z', content: `Text of ${id}.`, status: 'retrieved', retrievedVia: 'mcp__atlassian__getJiraIssue' })),
      conflicts: [],
    }),
  );
  return path.join(repo.root, 'evidence.json');
}

describe('prepare --task-open names the task directory once', () => {
  it('prints no task unless asked, so existing output is unchanged', async () => {
    await inRepo(async (repo) => {
      assert.equal((await prepare(repo, [])).data.task, undefined);
    });
  });

  it('mints the same slug in the compact and the verbose shape, from a ticket key or from words', async () => {
    await inRepo(async (repo) => {
      const compact = await prepare(repo, ['--task-open', 'ORD-17 which files would this touch?']);
      const verbose = await prepare(repo, ['--task-open', 'ORD-17 which files would this touch?', '--verbose']);
      assert.deepEqual(compact.data.task, { slug: 'ORD-17', directory: '.ambicode/task/ORD-17', existing: false });
      assert.deepEqual(verbose.data.task, compact.data.task);
      const words = await prepare(repo, ['--task-open', 'How does the order total validation work?']);
      assert.equal(words.data.task?.slug, 'order-total-validation-work');
      assert.match(renderPrepare(verbose), /task:\s+ORD-17 \(\.ambicode\/task\/ORD-17\)/);
    });
  });

  it('lets a requirement id win over the text, in the order the caller gave the URLs', async () => {
    await inRepo(async (repo) => {
      const page = 'https://example.atlassian.net/wiki/spaces/ENG/pages/42/Orders';
      const evidence = await evidenceFor(repo, [['ENG-orders', page], ['ORD-17', ORD]]);
      const run = await prepare(repo, ['--task-open', 'something else entirely', '--requirement', ORD, '--requirement', page, '--evidence', evidence]);
      assert.equal(run.data.task?.slug, 'ORD-17');
    });
  });

  it('is the slug a later skill passes to note save, and says when the directory already holds work', async () => {
    await inRepo(async (repo) => {
      const first = await prepare(repo, ['--task-open', 'ORD-17']);
      const slug = first.data.task!.slug;
      const runtime = await createRuntime({ cwd: repo.root, stdin: { read: async () => 'a finding' } });
      const saved = await runNoteSave(runtime, parseArgs('note save', ['--task', slug, '--kind', 'investigation'], NOTE_SAVE_OPTIONS));
      assert.ok(saved.path.startsWith(`${first.data.task!.directory}/`), saved.path);
      const again = await prepare(repo, ['--task-open', 'ORD-17 plan it']);
      assert.equal(again.data.task?.existing, true);
      assert.equal(again.data.task?.slug, slug);
    });
  });

  it('refuses an empty request instead of inventing a name', async () => {
    await inRepo(async (repo) => {
      await assert.rejects(prepare(repo, ['--task-open', '   ']), /--task-open/);
    });
  });

  it('writes nothing: opening a name does not create the directory', async () => {
    await inRepo(async (repo) => {
      await prepare(repo, ['--task-open', 'ORD-99']);
      assert.equal(await nodeFileSystem.exists(path.join(repo.root, '.ambicode/task/ORD-99')), false);
    });
  });
});
