import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { buildProposal, writeConfig } from '#modules/config/init/proposal';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '../../args.ts';
import { renderConfig, runConfig } from './config.ts';
import { renderInit, runInit, INIT_OPTIONS } from './init.ts';

describe('03c-P1: init proposes, writes, keeps and refreshes the search profile', () => {
  it('the dry run prints it, the writer writes it, an edit survives, --refresh-profile replaces it; config prints it', async () => {
    const repo = await TempRepo.create();
    try {
      for (let i = 0; i < 6; i += 1) await repo.write(`src/m${i}.ts`, `export function f${i}() {}\n`);
      await repo.commitAll('initial');
      const runtime = await createRuntime({ cwd: repo.root });
      const configPath = `${repo.root}/.ambicode/config.yaml`;

      const dry = await runInit(runtime, parseArgs('init', ['--dry-run'], INIT_OPTIONS));
      assert.ok(dry.mode === 'dry-run');
      assert.equal(await runtime.fs.exists(configPath), false);
      assert.deepEqual(dry.projects[0]?.profile?.sources, ['ts']);
      assert.match(renderInit(dry), /sources {7}ts/);

      await writeConfig(runtime.fs, repo.root, await buildProposal(runtime, repo.root, []), []);
      const written = await runtime.fs.readText(configPath);
      assert.match(written, /exportOnly: true/);

      await runtime.fs.writeText(configPath, written.replace('exportOnly: true', 'exportOnly: false'));
      const kept = await buildProposal(runtime, repo.root, []);
      assert.equal(kept.projects[0]?.profile?.exportOnly, false, "the user's edit survives");
      assert.ok(!kept.changes.some((change) => change.includes('search profile')));

      const refreshed = await buildProposal(runtime, repo.root, [], { refreshProfile: true });
      assert.equal(refreshed.projects[0]?.profile?.exportOnly, true);
      assert.ok(refreshed.changes.some((change) => change.startsWith('Replaced the search profile')));
      await writeConfig(runtime.fs, repo.root, refreshed, []);
      assert.match(renderConfig(await runConfig(runtime)), /exportOnly {4}true/);
    } finally {
      await repo.dispose();
    }
  });
});
