import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addedByFile, applyDiffGraders, gradeOne, removedByFile } from './diff-graders.mjs';

const head = (file) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,5 +1,5 @@\n ctx\n`;
const edit = (file, removed, added) => head(file) + [...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join('\n') + '\n ctx\n';
const create = (file, ...lines) => `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`;

describe('diff graders: file headers', () => {
  it('a removed line `-- x` (a SQL comment) is a line of its file, not a file header', () => {
    const diff = edit('db/a.sql', ['-- x', 'select 1;'], ['select 2;']) + edit('db/b.sql', ['drop'], []);
    assert.deepEqual(removedByFile(diff), { 'db/a.sql': '-- x\nselect 1;', 'db/b.sql': 'drop' });
    assert.deepEqual(Object.keys(addedByFile(diff)), ['db/a.sql', 'db/b.sql']);
  });
  it('an added line `++ x` is a line of its file, not a file header', () => {
    const diff = edit('a.txt', ['old'], ['++ x', 'new']);
    assert.deepEqual(addedByFile(diff), { 'a.txt': '++ x\nnew' });
  });
  it('real headers still open a file: edit, new file, deleted file', () => {
    const deleted = 'diff --git a/gone.py b/gone.py\ndeleted file mode 100644\n--- a/gone.py\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n-b\n';
    const diff = edit('e.py', ['o'], ['n']) + create('n.py', 'x') + deleted;
    assert.deepEqual(addedByFile(diff), { 'e.py': 'n', 'n.py': 'x' });
    assert.deepEqual(removedByFile(diff), { 'e.py': 'o', 'gone.py': 'a\nb' });
  });
});

describe('diff graders: keptIf.in and the selection re-added in its file', () => {
  const base = { name: 'k', pattern: 'NEVER', in: '^src/', keptIf: { added: 'deliver\\(', removed: 'Env\\.test' } };
  const delivers = create('src/t.py', 'deliver()');
  const gone = edit('src/repo.py', ['if e in (Env.local, Env.test):'], ['return x']);
  it('removed lines are read only in the files keptIf.in names; elsewhere they are ignored', () => {
    const other = edit('src/other.py', ['# Env.test'], []);
    assert.equal(gradeOne(base, delivers + other).passed, false, 'without keptIf.in the pooled removed lines fail it');
    assert.equal(gradeOne({ ...base, keptIf: { ...base.keptIf, in: '^src/repo\\.py$' } }, delivers + other).passed, true);
    assert.equal(gradeOne({ ...base, keptIf: { ...base.keptIf, in: '^src/repo\\.py$' } }, delivers + gone).passed, false);
  });
  it('a removed line the same file adds back (widened) is not a removal; added in another file does not count', () => {
    const keptIf = { ...base.keptIf, in: '^src/repo\\.py$' };
    const widened = edit('src/repo.py', ['if e in (Env.local, Env.test):'], ['if e in (Env.local, Env.test, Env.dev):']);
    assert.equal(gradeOne({ ...base, keptIf }, delivers + widened).passed, true);
    assert.equal(gradeOne({ ...base, keptIf }, delivers + gone + create('src/elsewhere.py', 'Env.test')).passed, false);
  });
  it('keptIf.in defaults to the grader\'s in', () => {
    assert.equal(gradeOne({ ...base, in: '^src/repo\\.py$' }, delivers + gone).passed, false);
  });
});

describe('diff graders: perFile', () => {
  const g = { name: 'p', pattern: '^(?=[\\s\\S]*@task)(?=[\\s\\S]*deliver\\()', in: '^src/', perFile: true };
  it('the pattern must match the added lines of one file, not the pool of all files', () => {
    assert.equal(gradeOne(g, create('src/a.py', '@task') + create('src/b.py', 'deliver()')).passed, false);
    assert.equal(gradeOne({ ...g, perFile: undefined }, create('src/a.py', '@task') + create('src/b.py', 'deliver()')).passed, true);
    assert.equal(gradeOne(g, create('src/a.py', '@task', 'deliver()')).passed, true);
    assert.equal(gradeOne(g, '').passed, false);
  });
  it('without perFile or keptIf the verdict and explanation are what they were', () => {
    const plain = { name: 'n', pattern: 'x', in: '^src/', weight: 2 };
    assert.deepEqual(gradeOne(plain, create('src/a.py', 'x')), { name: 'n', passed: true, weight: 2, explanation: 'matched x in files ^src/', withOnly: false, scored: true, posthoc: true });
    assert.equal(gradeOne({ name: 'n', pattern: 'x' }, '').explanation, 'no match for x');
    const run = applyDiffGraders({ graders: [] }, [plain], create('src/a.py', 'y'));
    assert.equal(run.score, 0);
  });
});
