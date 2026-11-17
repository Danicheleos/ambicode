import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { SUPPORTED_SCHEMA_VERSION } from '../src/types/modules/config.ts';
import { materialize } from './materialize.mjs';
import { fixtureByName } from './definitions.mjs';

const IGNORE_LINES = ['.ambicode/'];

describe('fixtures materialize', { concurrency: 4 }, () => {
  for (const name of ['ts-off-by-one']) {
    it(`09-M4: --ambicode-init commits a config and the ignore lines (${name})`, async () => {
      const parent = await mkdtemp(path.join(tmpdir(), 'ambicode-materialize-'));
      const destination = path.join(parent, 'repo');
      try {
        await materialize(fixtureByName(name), destination, { ambicodeInit: true });
        const show = (...args) => execFileSync('git', ['show', ...args], { cwd: destination, encoding: 'utf8' });
        const commit = execFileSync('git', ['log', '--all', '--grep=configure ambicode', '-1', '--format=%H'], { cwd: destination, encoding: 'utf8' }).trim();
        const committed = show('--name-only', '--format=', commit);
        assert.match(committed, /^\.ambicode\/config\.yaml$/m);
        assert.match(committed, /^\.gitignore$/m);
        assert.match(show(`${commit}:.ambicode/config.yaml`), new RegExp(`schemaVersion: ${SUPPORTED_SCHEMA_VERSION}`));
        const ignored = show(`${commit}:.gitignore`).split('\n');
        for (const line of IGNORE_LINES) assert.ok(ignored.includes(line), line);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  }

  it('--stack-packs adds the packs the fixture declares to the config; a fixture that declares none refuses it', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'ambicode-materialize-'));
    try {
      const plain = path.join(parent, 'plain');
      const stacked = path.join(parent, 'stacked');
      await materialize(fixtureByName('ts-app-medium-plan'), plain, { ambicodeInit: true });
      await materialize(fixtureByName('ts-app-medium-plan'), stacked, { ambicodeInit: true, stackPacks: true });
      const packsOf = async (dir) => parseYaml(await readFile(path.join(dir, '.ambicode', 'config.yaml'), 'utf8')).projects[0].packs;
      const base = await packsOf(plain);
      assert.deepEqual((await packsOf(stacked)).slice(0, base.length), base);
      assert.deepEqual((await packsOf(stacked)).slice(base.length), fixtureByName('ts-app-medium-plan').stackPacks);
      assert.ok(fixtureByName('ts-app-medium-plan').stackPacks.every((ref) => ref.startsWith('builtin/')));
      await assert.rejects(materialize(fixtureByName('ts-off-by-one'), path.join(parent, 'none'), { ambicodeInit: true, stackPacks: true }), /declares no stackPacks/);
      await assert.rejects(materialize(fixtureByName('ts-app-medium-plan'), path.join(parent, 'noinit'), { stackPacks: true }), /need --ambicode-init/);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('a materialized repo is not repacked in the background: the eval harness lists the run dir once and fails when .git/objects changes', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'ambicode-materialize-'));
    const destination = path.join(parent, 'repo');
    try {
      await materialize(fixtureByName('ts-app-medium-plan'), destination);
      const objects = async () => (await readdir(path.join(destination, '.git', 'objects'))).sort().join(',');
      const before = await objects();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      assert.equal(await objects(), before);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
