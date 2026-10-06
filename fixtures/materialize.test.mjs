import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { materialize } from './materialize.mjs';
import { fixtureByName } from './definitions.mjs';

const IGNORE_LINES = ['.ambicode/index/', '.ambicode/metrics.jsonl', '.ambicode/reviews/', '.ambicode/task/', '.ambicode/notes/'];

describe('fixtures materialize', () => {
  for (const name of ['ts-staged-unstaged', 'ts-branch-divergence']) {
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
        assert.match(show(`${commit}:.ambicode/config.yaml`), /schemaVersion: 3/);
        const ignored = show(`${commit}:.gitignore`).split('\n');
        for (const line of IGNORE_LINES) assert.ok(ignored.includes(line), line);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  }
});
