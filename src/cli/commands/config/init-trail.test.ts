import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { readLedger } from '#platform/ledger/ledger';
import { initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '#util/args';
import { initRecordCommand } from '../init/record.ts';
import { configPacksCommand } from './packs.ts';
import { configValidateCommand } from './validate.ts';

async function inRepo(run: (repo: TempRepo, runtime: Awaited<ReturnType<typeof createRuntime>>) => Promise<void>): Promise<void> {
  const repo = await TempRepo.create();
  try {
    await repo.write('package.json', '{}\n');
    await repo.commitAll('initial');
    const runtime = await createRuntime({ cwd: repo.root });
    await initConfig(runtime);
    await run(repo, runtime);
  } finally {
    await repo.dispose();
  }
}

describe('init commands leave a trail only when given --task', () => {
  it('config validate --task init appends one init entry; without --task nothing is written', async () => {
    await inRepo(async (repo, runtime) => {
      const dir = path.join(repo.root, '.ambicode/tasks/init');
      await configValidateCommand.run(runtime, parseArgs('config validate', [], configValidateCommand.options));
      assert.equal(await runtime.fs.exists(dir), false);
      await configValidateCommand.run(runtime, parseArgs('config validate', ['--task', 'init'], configValidateCommand.options));
      const entries = await readLedger(runtime.fs, dir);
      assert.deepEqual(entries.map((entry) => [entry.kind, entry['what'], entry['outcome']]), [['init', 'config validate', 'ok']]);
    });
  });

  it('config packs --task init appends one entry with the files written', async () => {
    await inRepo(async (repo, runtime) => {
      await configPacksCommand.run(runtime, parseArgs('config packs', ['--task', 'init'], configPacksCommand.options));
      const entries = await readLedger(runtime.fs, path.join(repo.root, '.ambicode/tasks/init'));
      assert.equal(entries.length, 1);
      assert.match(String(entries[0]?.['outcome']), /^\d+ pack files written, \d+ skipped$/);
    });
  });

  it('init record --task init appends the scaffold outcome as an init entry and needs all three options', async () => {
    await inRepo(async (repo, runtime) => {
      const run = (argv: string[]) => initRecordCommand.run(runtime, parseArgs('init record', argv, initRecordCommand.options));
      await assert.rejects(run(['--task', 'init', '--what', 'scaffold']), { code: 'bad-argument', field: 'outcome' });
      await run(['--task', 'init', '--what', 'scaffold', '--outcome', '4 created, gitignore added']);
      const entries = await readLedger(runtime.fs, path.join(repo.root, '.ambicode/tasks/init'));
      assert.deepEqual(entries.map((entry) => [entry.kind, entry['what'], entry['outcome']]), [['init', 'scaffold', '4 created, gitignore added']]);
    });
  });
});
