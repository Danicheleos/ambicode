import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { appendLedger } from '#platform/ledger/ledger';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '#util/args';
import { taskNameFor } from '#modules/evidence/task/task-dir';
import { ROUTE_START_OPTIONS } from '#types/cli';
import { ROUTE_NEXT_OPTIONS, runRouteNext, runRouteStart } from './route.ts';

async function inRepo(run: (repo: TempRepo) => Promise<void>): Promise<void> {
  const repo = await TempRepo.create();
  try {
    await repo.write('package.json', '{}\n');
    await repo.commitAll('initial');
    await run(repo);
  } finally {
    await repo.dispose();
  }
}

const next = async (repo: TempRepo, task: string) => {
  const runtime = await createRuntime({ cwd: repo.root });
  return runRouteNext(runtime, parseArgs('route next', ['--task', task], ROUTE_NEXT_OPTIONS)).then(() => null, (error: { code?: string; details?: string[] }) => error);
};

describe('--task names a task that exists', () => {
  it('route next on an unknown task fails task-unknown and creates no folder', async () => {
    await inRepo(async (repo) => {
      const error = await next(repo, 'ORD-17-3');
      assert.equal(error?.code, 'task-unknown');
      assert.equal(await createRuntime({ cwd: repo.root }).then((runtime) => runtime.fs.exists(path.join(repo.root, '.ambicode/tasks/ORD-17-3'))), false);
    });
  });

  it('lists the newest existing tasks, at most 5, and never suggests starting the unknown one', async () => {
    await inRepo(async (repo) => {
      const runtime = await createRuntime({ cwd: repo.root });
      for (let n = 1; n <= 6; n += 1) {
        const dir = path.join(repo.root, '.ambicode/tasks', `ORD-${n}`);
        await runtime.fs.mkdirp(dir);
        await appendLedger(runtime.fs, dir, new Date(), 'aaaaaaaa', { kind: 'init', what: 'seed', outcome: 'ok' });
        await runtime.fs.setTimes(path.join(dir, 'ledger.jsonl'), new Date(Date.UTC(2026, 9, n)));
      }
      const error = await next(repo, 'ghost');
      assert.deepEqual(error?.details, ['Existing tasks, newest first: ORD-6, ORD-5, ORD-4, ORD-3, ORD-2.']);
      assert.doesNotMatch(JSON.stringify(error), /route start/);
    });
  });
});

describe('a task is a folder with a ledger', () => {
  it('a route start that fails validation leaves no folder', async () => {
    await inRepo(async (repo) => {
      const runtime = await createRuntime({ cwd: repo.root });
      await assert.rejects(runRouteStart(runtime, parseArgs('route start', ['task', 'ORD-17 add totals'], ROUTE_START_OPTIONS)), { code: 'config-missing' });
      assert.equal(await runtime.fs.exists(path.join(repo.root, '.ambicode/tasks/ord-17')), false);
    });
  });

  it('an empty folder is task-unknown for route next, not a task to resume', async () => {
    await inRepo(async (repo) => {
      const runtime = await createRuntime({ cwd: repo.root });
      await runtime.fs.mkdirp(path.join(repo.root, '.ambicode/tasks/ord-17'));
      assert.equal((await next(repo, 'ord-17'))?.code, 'task-unknown');
      assert.equal(await taskNameFor(runtime, 'task', 'ord-17 add totals'), 'ord-17-add-totals');
      assert.equal(await taskNameFor(runtime, 'task', 'ord-17'), 'ord-17');
    });
  });

  it('a folder with a ledger is resumed by its slug', async () => {
    await inRepo(async (repo) => {
      const runtime = await createRuntime({ cwd: repo.root });
      const dir = path.join(repo.root, '.ambicode/tasks/ord-17');
      await runtime.fs.mkdirp(dir);
      await appendLedger(runtime.fs, dir, new Date(), 'aaaaaaaa', { kind: 'init', what: 'seed', outcome: 'ok' });
      assert.equal(await taskNameFor(runtime, 'task', 'ord-17 add totals'), 'ord-17');
    });
  });
});
