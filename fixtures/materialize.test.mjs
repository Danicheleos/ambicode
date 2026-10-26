import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { checkContext } from '../src/modules/context/context.ts';
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

  for (const name of ['ts-app-medium', 'ts-feature-boundary', 'ts-app-medium-refund-bug', 'ts-app-medium-plan']) {
    it(`--context leaves a valid, uncommitted .ambicode/context (${name})`, async () => {
      const parent = await mkdtemp(path.join(tmpdir(), 'ambicode-materialize-'));
      const destination = path.join(parent, 'repo');
      try {
        await materialize(fixtureByName(name), destination, { ambicodeInit: true, context: true });
        const cli = path.join(import.meta.dirname, '..', 'scripts', 'ambicode.mjs');
        const listing = execFileSync(process.execPath, [cli, 'context', 'list'], { cwd: destination, encoding: 'utf8' });
        assert.match(listing, /^\.ambicode\/context\/overview\.md /m);
        assert.match(listing, /^\.ambicode\/context\/modules\/.+\.md /m);
        assert.doesNotMatch(listing, /no context/);
        const root = path.join(destination, '.ambicode', 'context');
        const files = new Map();
        for (const file of await readdir(root, { recursive: true })) {
          if (file.endsWith('.md')) files.set(file.split(path.sep).join('/'), await readFile(path.join(root, file), 'utf8'));
        }
        assert.deepEqual(checkContext(files, { maxTotalTokens: 24000, maxFileTokens: 2500, maxIndexTokens: 5000 }), []);
        const git = (...args) => execFileSync('git', args, { cwd: destination, encoding: 'utf8' });
        assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
        assert.doesNotMatch(git('ls-files'), /\.ambicode\/context/);
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  }
});
