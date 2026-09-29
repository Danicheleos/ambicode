import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '../composition/root.ts';
import { isAmbicodeError } from '../util/errors.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { parseArgs } from './args.ts';
import { INIT_OPTIONS, renderInit, runInit } from './commands/init.ts';

async function init(repo: TempRepo, argv: string[]) {
  const runtime = await createRuntime({ cwd: repo.root });
  return await runInit(runtime, parseArgs('init', argv, INIT_OPTIONS));
}

async function withRepo(run: (repo: TempRepo, configPath: string) => Promise<void>): Promise<void> {
  const repo = await TempRepo.create();
  try {
    await repo.write('src/app.ts', 'export const a = 1;\n');
    await repo.commitAll('initial');
    await run(repo, path.join(repo.root, '.ambicode', 'config.yaml'));
  } finally {
    await repo.dispose();
  }
}

describe('ambicode init --mcp-server', () => {
  it('is a declared value option, so the parser accepts it and rejects it without a value', () => {
    assert.equal(parseArgs('init', ['--mcp-server', 'atlassian'], INIT_OPTIONS).value('mcp-server'), 'atlassian');
    assert.throws(() => parseArgs('init', ['--mcp-server'], INIT_OPTIONS), (error) => {
      assert.ok(isAmbicodeError(error));
      assert.equal(error.code, 'bad-argument');
      return true;
    });
  });

  it('binds the server on the first run and on a later run, showing the change in both outputs', async () => {
    await withRepo(async (repo, configPath) => {
      const first = await init(repo, ['--mcp-server', 'atlassian']);
      assert.match(await readFile(configPath, 'utf8'), /mcpServer: atlassian/);
      assert.ok(first.changes.includes('Set "requirements.mcpServer: atlassian".'));
      assert.match(renderInit(first), /Set "requirements\.mcpServer: atlassian"\./);

      const again = await init(repo, ['--mcp-server', 'atlassian']);
      assert.equal(again.written, false);
      assert.deepEqual(again.changes, []);
      assert.match(renderInit(again), /requirements\.mcpServer is already "atlassian"/);
      assert.match(JSON.stringify(again), /requirements\.mcpServer is already \\"atlassian\\"/);
    });
  });

  it('with --dry-run reports the binding and writes nothing', async () => {
    await withRepo(async (repo, configPath) => {
      await init(repo, []);
      const before = await readFile(configPath, 'utf8');

      const dry = await init(repo, ['--mcp-server', 'atlassian', '--dry-run']);
      assert.equal(dry.written, false);
      assert.ok(dry.changes.includes('Set "requirements.mcpServer: atlassian".'));
      assert.match(renderInit(dry), /dry run: nothing was written/);
      assert.equal(await readFile(configPath, 'utf8'), before);
    });
  });

  it('refuses a different server than the bound one and leaves the file as it was', async () => {
    await withRepo(async (repo, configPath) => {
      await init(repo, ['--mcp-server', 'atlassian']);
      const before = await readFile(configPath, 'utf8');

      await assert.rejects(init(repo, ['--mcp-server', 'other']), (error: unknown) => {
        assert.ok(isAmbicodeError(error));
        assert.equal(error.code, 'requirements-server-bound');
        return true;
      });
      assert.equal(await readFile(configPath, 'utf8'), before);
    });
  });
});
