import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '../composition/root.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { parseArgs } from './args.ts';
import { renderConfig, runConfig } from './commands/config.ts';
import { INIT_OPTIONS, renderInit, runInit } from './commands/init.ts';

describe('03c-P1: init writes, keeps and refreshes the search profile', () => {
  it('dry-run prints it, init writes it, re-init keeps an edit, --refresh-profile replaces it; config prints it', async () => {
    const repo = await TempRepo.create();
    try {
      for (let i = 0; i < 6; i += 1) await repo.write(`src/m${i}.ts`, `export function f${i}() {}\n`);
      await repo.commitAll('initial');
      const runtime = await createRuntime({ cwd: repo.root });
      const configPath = `${repo.root}/.ambicode/config.yaml`;

      const dry = await runInit(runtime, parseArgs('init', ['--dry-run'], INIT_OPTIONS));
      assert.equal(dry.written, false);
      assert.deepEqual(dry.projects[0]?.profile?.sources, ['ts']);
      assert.match(renderInit(dry), /sources {7}ts/);

      await runInit(runtime, parseArgs('init', [], INIT_OPTIONS));
      const written = await runtime.fs.readText(configPath);
      assert.match(written, /exportOnly: true/);

      await runtime.fs.writeText(configPath, written.replace('exportOnly: true', 'exportOnly: false'));
      const kept = await runInit(runtime, parseArgs('init', [], INIT_OPTIONS));
      assert.equal(kept.projects[0]?.profile?.exportOnly, false, "the user's edit survives");
      assert.ok(!kept.changes.some((change) => change.includes('search profile')));

      const refreshed = await runInit(runtime, parseArgs('init', ['--refresh-profile'], INIT_OPTIONS));
      assert.equal(refreshed.projects[0]?.profile?.exportOnly, true);
      assert.ok(refreshed.changes.some((change) => change.startsWith('Replaced the search profile')));
      assert.match(renderConfig(await runConfig(runtime)), /exportOnly {4}true/);
    } finally {
      await repo.dispose();
    }
  });
});
