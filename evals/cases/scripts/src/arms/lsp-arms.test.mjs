import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildArms, LSP_SERVERS, localizeCases, withTsconfig } from './lsp-arms.mjs';

const SCAFFOLD = ['#!/bin/sh', 'set -e', 'REPO="$PWD/repo"', 'mkdir -p "$REPO/src"', 'echo "export const a = 1;" > "$REPO/src/a.ts"', 'git -C "$REPO" init -q', 'git -C "$REPO" add -A', 'git -C "$REPO" -c user.name=t -c user.email=t@x commit -qm s', ''].join('\n');

describe('lsp-arms', () => {
  let root;
  let casesDir;
  let dist;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'lsp-arms-'));
    casesDir = path.join(root, 'cases');
    for (const id of ['be-1', 'fe-2', 'be-1-review-9-abc']) {
      mkdirSync(path.join(casesDir, id), { recursive: true });
      writeFileSync(path.join(casesDir, id, 'scaffold.sh'), SCAFFOLD);
      writeFileSync(path.join(casesDir, id, 'prompt.md'), id);
      writeFileSync(path.join(casesDir, id, 'truth.json'), JSON.stringify({ root: 'src' }));
    }
    dist = path.join(root, 'dist');
    mkdirSync(path.join(dist, '.claude-plugin'), { recursive: true });
    writeFileSync(path.join(dist, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'ambicode', version: '9.9.9' }));
    mkdirSync(path.join(root, 'benchmarks'));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('takes the localize cases only, since review cases replay a reviewer the LSP arms do not change', () => {
    assert.deepEqual(localizeCases(casesDir), ['be-1', 'fe-2']);
    mkdirSync(path.join(casesDir, '.cases.lock'), { recursive: true });
    try {
      assert.deepEqual(localizeCases(casesDir), ['be-1', 'fe-2'], 'the cases lock directory is not a case');
    } finally {
      rmSync(path.join(casesDir, '.cases.lock'), { recursive: true });
    }
  });

  it('gives both arms the same language server and the same cases, and leaves the packaged plugin untouched', () => {
    const out = path.join(root, 'out');
    const { arms } = buildArms({ out, casesDir, dist, benchmarks: path.join(root, 'benchmarks') });
    const manifest = (arm) => JSON.parse(readFileSync(path.join(arm, '.claude-plugin', 'plugin.json'), 'utf8'));
    const [control, ambicode] = arms;
    assert.deepEqual(manifest(control).lspServers, LSP_SERVERS);
    assert.deepEqual(manifest(ambicode), { name: 'ambicode', version: '9.9.9', lspServers: LSP_SERVERS });
    assert.equal(JSON.parse(readFileSync(path.join(dist, '.claude-plugin', 'plugin.json'), 'utf8')).lspServers, undefined);
    for (const arm of arms) {
      assert.ok(lstatSync(path.join(arm, 'evals', 'benchmarks')).isSymbolicLink());
      assert.ok(!lstatSync(path.join(arm, 'evals', 'cases', 'common', 'core', 'cases', 'be-1')).isSymbolicLink(), 'the harness refuses symlinks under --eval-dir');
      assert.equal(readFileSync(path.join(arm, 'evals', 'cases', 'common', 'core', 'cases', 'fe-2', 'prompt.md'), 'utf8'), 'fe-2');
    }
  });

  it('commits a root tsconfig with the snapshot, so the tree starts clean and the server loads one project', () => {
    const work = mkdtempSync(path.join(root, 'run-'));
    writeFileSync(path.join(work, 'scaffold.sh'), withTsconfig(SCAFFOLD, 'main'));
    execFileSync('sh', ['scaffold.sh'], { cwd: work });
    const repo = path.join(work, 'repo');
    const tsconfig = JSON.parse(readFileSync(path.join(repo, 'tsconfig.json'), 'utf8'));
    assert.deepEqual(tsconfig.include, ['**/*.ts']);
    assert.equal(tsconfig.compilerOptions.baseUrl, 'main', 'imports like "state/x" resolve from the code root');
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }), '');
    assert.throws(() => withTsconfig('#!/bin/sh\n', 'src'), /no "git -C "\$REPO" init -q" line/);
  });
});
