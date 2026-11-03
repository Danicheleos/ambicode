import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkCase, materialize, problemsOf, verdict } from './real-cases-check.mjs';

// A two-commit repository: the parent has a file and a file to remove, the change adds a route and a migration.
const repo = mkdtempSync(path.join(tmpdir(), 'real-check-repo-'));
const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { encoding: 'utf8' }).trim();
git('init', '-q');
mkdirSync(path.join(repo, 'src'));
mkdirSync(path.join(repo, '.claude'));
writeFileSync(path.join(repo, 'src', 'a.py'), 'x = 1\n');
writeFileSync(path.join(repo, '.claude', 'drop.md'), 'drop\n');
git('add', '-A');
git('commit', '-qm', 'parent');
const parent = git('rev-parse', 'HEAD');
writeFileSync(path.join(repo, 'src', 'a.py'), 'x = 1\ndef route():  \n    pass\n');
git('add', '-A');
git('commit', '-qm', 'change');
const commit = git('rev-parse', 'HEAD');

const graders = [
  { kind: 'diff', name: 'route-added', in: '^src/', pattern: 'def route' },
  { kind: 'file', name: 'route-in-file', file: 'src/a.py', pattern: 'def route' },
  { kind: 'file', name: 'drop-file-gone', file: '.claude/drop.md', pattern: 'drop', match: 'not_contains' },
  { kind: 'diff', name: 'no-trailing-space', in: '^src/', pattern: '[ \\t]+(?:\\n|$)', match: 'not_contains', guard: true },
  { kind: 'diff', name: 'no-print', in: '^src/', pattern: 'print\\(', match: 'not_contains', guard: true },
  { kind: 'llm', name: 'judge', rubric: 'PASS or FAIL' },
];

describe('real-cases-check: the $0 contract check of a cases file', () => {
  const real = { name: 'c', parent, commit, remove: ['.claude/drop.md'], graders };
  const { rows, files } = checkCase(real, repo);
  const row = (name) => rows.find((r) => r.name === name);

  it('measuring graders pass on the change and fail on the untouched parent; a guard that the change breaks is reported with its reference FAIL', () => {
    assert.deepEqual([row('route-added').reference, row('route-added').empty], [true, false]);
    assert.deepEqual([row('route-in-file').reference, row('route-in-file').empty], [true, false]);
    assert.deepEqual([row('no-print').reference, row('no-print').empty], [true, true]);
    assert.deepEqual([row('no-trailing-space').reference, row('no-trailing-space').empty], [false, true]);
    // drop-file-gone is a measuring grader that holds on the parent too: reported, as a grader that measures nothing.
    assert.deepEqual(problemsOf(rows).map((r) => r.name), ['drop-file-gone', 'no-trailing-space']);
  });

  it('files named in remove are gone from both workspaces, so a grader on them sees nothing; model graders are not run', () => {
    assert.deepEqual([row('drop-file-gone').reference, row('drop-file-gone').empty], [true, true]);
    assert.deepEqual([row('judge').reference, row('judge').empty], [null, null]);
    assert.deepEqual(files, { before: 1, after: 1 });
  });

  it('a measuring grader that already passes on the parent is a problem', () => {
    assert.deepEqual(problemsOf([{ name: 'm', kind: 'diff', guard: false, reference: true, empty: true }]).map((r) => r.name), ['m']);
  });

  it('materialize returns a scratch directory per call and verdict is null for trace graders', () => {
    const one = materialize(repo, commit);
    const two = materialize(repo, commit);
    assert.notEqual(one.dir, two.dir);
    assert.equal(verdict({ kind: 'trace' }, one.dir, ''), null);
    for (const d of [one.dir, two.dir]) rmSync(d, { recursive: true, force: true });
  });
});
