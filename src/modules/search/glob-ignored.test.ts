import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { dropIgnoredGlobResults } from './glob-ignored.ts';

const root = path.resolve('/work/repo');
const response = (filenames: string[]) => ({ filenames, durationMs: 3, numFiles: filenames.length, truncated: false, totalMatches: filenames.length, countIsComplete: true });
const projects = [{ root: '.', ignored: ['node_modules/', 'dist/out.js'] }];

describe('dropIgnoredGlobResults', () => {
  it('drops ignored directories when cwd is above the repository, keeping every other field', () => {
    const out = dropIgnoredGlobResults(response(['repo/tests/page.test.js', 'repo/node_modules/x/b.test.js', 'repo/node_modules/y/c.test.js']), { cwd: '/work', repositoryRoot: root, projects, pattern: '**/*.test.js' });
    assert.deepEqual(out, { filenames: ['repo/tests/page.test.js'], durationMs: 3, numFiles: 1, truncated: false, totalMatches: 1, countIsComplete: true });
  });

  it('works with cwd at the repository root and with absolute paths', () => {
    const rel = dropIgnoredGlobResults(response(['src/a.js', 'node_modules/x/b.js']), { cwd: root, repositoryRoot: root, projects });
    assert.deepEqual(rel?.filenames, ['src/a.js']);
    const abs = dropIgnoredGlobResults(response(['/work/repo/src/a.js', '/work/repo/node_modules/x.js']), { cwd: '/work', repositoryRoot: root, projects, searchPath: '/work/repo' });
    assert.deepEqual(abs?.filenames, ['/work/repo/src/a.js']);
  });

  it('keeps results of an entry the call targets', () => {
    assert.equal(dropIgnoredGlobResults(response(['node_modules/x/b.js']), { cwd: root, repositoryRoot: root, projects, pattern: 'node_modules/**/*.js' }), null);
    assert.equal(dropIgnoredGlobResults(response(['node_modules/x/b.js']), { cwd: root, repositoryRoot: root, projects, searchPath: '/work/repo/node_modules' }), null);
  });

  it('matches a file entry exactly and a directory entry by prefix only', () => {
    const out = dropIgnoredGlobResults(response(['dist/out.js', 'dist/out.js.map', 'node_modules_extra/a.js', 'node_modules/a.js']), { cwd: root, repositoryRoot: root, projects });
    assert.deepEqual(out?.filenames, ['dist/out.js.map', 'node_modules_extra/a.js']);
  });

  it('returns null when nothing is removed', () => {
    assert.equal(dropIgnoredGlobResults(response(['src/a.js']), { cwd: root, repositoryRoot: root, projects }), null);
    assert.equal(dropIgnoredGlobResults(response(['node_modules/a.js']), { cwd: root, repositoryRoot: root, projects: [{ root: '.', ignored: [] }] }), null);
  });

  it('applies each project entries relative to its own root, the longest root owning a path', () => {
    const two = [{ root: '.', ignored: ['dist/'] }, { root: 'packages/web', ignored: ['node_modules/'] }];
    const out = dropIgnoredGlobResults(response(['packages/web/node_modules/x.js', 'packages/web/src/a.js', 'dist/b.js', 'node_modules/c.js']), { cwd: root, repositoryRoot: root, projects: two });
    assert.deepEqual(out?.filenames, ['packages/web/src/a.js', 'node_modules/c.js']);
  });

  it('keeps results under no project', () => {
    const only = [{ root: 'packages/web', ignored: ['node_modules/'] }];
    assert.equal(dropIgnoredGlobResults(response(['node_modules/a.js']), { cwd: root, repositoryRoot: root, projects: only }), null);
  });
});
