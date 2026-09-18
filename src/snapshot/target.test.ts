import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TempRepo } from '../testing/temp-repo.ts';
import { resolveBranchTarget, resolveWorkingTarget } from './target.ts';

async function digestOf(file: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await readFile(file)).digest('hex');
  } catch {
    return null;
  }
}

test('U09 working target is the net of staged and unstaged edits plus untracked files', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('src/kept.ts', 'one\n');
  await repo.write('src/reverted.ts', 'original\n');
  await repo.write('src/unstaged.ts', 'before\n');
  await repo.commitAll('init');

  // Staged then undone in the working file: not part of the effective diff.
  await repo.write('src/reverted.ts', 'staged change\n');
  await repo.run(['git', 'add', 'src/reverted.ts']);
  await repo.write('src/reverted.ts', 'original\n');

  await repo.write('src/unstaged.ts', 'after\n');
  await repo.write('src/brand-new.ts', 'fresh\n');
  await repo.write('ignored.log', 'noise\n');
  await repo.write('.gitignore', '*.log\n');
  await repo.run(['git', 'add', '.gitignore']);

  const indexPath = path.join(repo.root, '.git', 'index');
  const indexBefore = await digestOf(indexPath);

  const resolution = await resolveWorkingTarget({ git: repo.git, repositoryRoot: repo.root });
  const paths = resolution.files.map((file) => file.newPath ?? file.oldPath).sort();

  assert.deepEqual(paths, ['.gitignore', 'src/brand-new.ts', 'src/unstaged.ts']);
  assert.equal(resolution.target.kind, 'working');
  assert.equal(resolution.postImageRevision, null);

  // The developer's staged state must survive the review untouched (doc 02).
  assert.equal(await digestOf(indexPath), indexBefore);
});

test('U09 an unmerged index blocks working review instead of producing a diff', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('conflict.txt', 'base\n');
  await repo.commitAll('init');
  await repo.makeUnmerged('conflict.txt');

  await assert.rejects(
    resolveWorkingTarget({ git: repo.git, repositoryRoot: repo.root }),
    (error: Error & { code?: string }) => error.code === 'unmerged-index',
  );
});

test('U09 a repository with no commits gets an actionable message, not a crash', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await assert.rejects(
    resolveWorkingTarget({ git: repo.git, repositoryRoot: repo.root }),
    (error: Error & { code?: string }) => error.code === 'no-head',
  );
});

test('U09 branch target uses the merge base and reports excluded dirty changes', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('base.ts', 'base\n');
  await repo.commitAll('init');
  await repo.run(['git', 'checkout', '-q', '-b', 'feature']);
  await repo.write('feature.ts', 'feature\n');
  await repo.commitAll('feature work');

  // The baseline moves on after the branch point; a merge-base comparison must
  // not report the baseline's own commit as part of the branch.
  await repo.run(['git', 'checkout', '-q', 'main']);
  await repo.write('unrelated.ts', 'unrelated\n');
  await repo.commitAll('baseline moved');
  await repo.run(['git', 'checkout', '-q', 'feature']);

  await repo.write('dirty.ts', 'uncommitted\n');

  const resolution = await resolveBranchTarget({
    git: repo.git,
    repositoryRoot: repo.root,
    baseRef: 'main',
  });

  assert.deepEqual(resolution.files.map((file) => file.newPath), ['feature.ts']);
  assert.equal(resolution.target.baseRef, 'main');
  assert.ok(resolution.target.notes.some((note) => note.includes('excluded from this review')));
});

test('U09 branch review without a baseline refuses rather than guessing a default branch', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());
  await repo.write('a.ts', 'a\n');
  await repo.commitAll('init');

  await assert.rejects(
    resolveBranchTarget({ git: repo.git, repositoryRoot: repo.root, baseRef: '' }),
    (error: Error & { code?: string }) => error.code === 'baseline-missing',
  );
  await assert.rejects(
    resolveBranchTarget({ git: repo.git, repositoryRoot: repo.root, baseRef: 'refs/heads/does-not-exist' }),
    (error: Error & { code?: string }) => error.code === 'baseline-unresolvable',
  );
});

test('U09 deleting a tracked file is a deletion in the working diff', async (t) => {
  const repo = await TempRepo.create();
  t.after(() => repo.dispose());

  await repo.write('gone.ts', 'content\n');
  await repo.commitAll('init');
  await rm(path.join(repo.root, 'gone.ts'));

  const resolution = await resolveWorkingTarget({ git: repo.git, repositoryRoot: repo.root });
  assert.equal(resolution.files.length, 1);
  assert.equal(resolution.files[0]?.changeKind, 'deleted');
  assert.equal(resolution.files[0]?.oldPath, 'gone.ts');
});
