import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { checksOff } from './config-checks-off.mjs';
import { diffOf } from './context.mjs';

describe('checksOff', () => {
  it('nulls every check of every project and keeps the rest of the config', () => {
    const text = 'schemaVersion: 5\nid: demo\nprojects:\n  - id: a\n    root: .\n    commands: { test: "make test" }\n    checks:\n      test: { all: "make test", file: "make test {file}" }\n      lint: { all: "ruff .", file: null }\n  - id: b\n    root: b\n';
    const out = parse(checksOff(text));
    assert.deepEqual(out.projects[0].checks, { test: null, lint: null });
    assert.equal(out.projects[1].checks, undefined);
    assert.deepEqual([out.id, out.projects[0].commands], ['demo', { test: 'make test' }]);
  });
});

describe('diffOf', () => {
  it('holds modified and untracked files, leaves gitignored ones out, and is null without a repository', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'diff-of-'));
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: dir });
    git('init', '-q');
    writeFileSync(path.join(dir, 'a.txt'), 'one\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    writeFileSync(path.join(dir, '.git', 'info', 'exclude'), '.ambicode/\n');
    writeFileSync(path.join(dir, 'a.txt'), 'two\n');
    mkdirSync(path.join(dir, 'sub'));
    writeFileSync(path.join(dir, 'sub', 'new.py'), 'class X: pass\n');
    mkdirSync(path.join(dir, '.ambicode'));
    writeFileSync(path.join(dir, '.ambicode', 'secret.md'), 'hidden\n');
    const diff = diffOf(dir);
    assert.match(diff, /\+\+\+ b\/a\.txt/);
    assert.match(diff, /\+\+\+ b\/sub\/new\.py/);
    assert.match(diff, /\+class X: pass/);
    assert.doesNotMatch(diff, /secret|hidden/);
    assert.equal(diffOf(mkdtempSync(path.join(tmpdir(), 'no-repo-'))), null);
  });
});
