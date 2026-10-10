import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { taskSlugFor } from '#modules/review/bundle/review-name';
import { resolveFrom, taskDirFor } from './task-dir.ts';

async function inRepo(run: (root: string) => Promise<void>): Promise<void> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'task-dir-')));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const bad = { code: 'bad-argument', field: 'from' };

describe('02-D1: the task directory', () => {
  it('names every path of a task in one place', () => {
    const dir = taskDirFor('/repo', 'ORD-17', 'app');
    assert.deepEqual(dir, {
      slug: 'ORD-17',
      root: '/repo/.ambicode/tasks/ORD-17',
      repositoryRoot: '/repo',
      where: 'app',
      ledger: '/repo/.ambicode/tasks/ORD-17/ledger.jsonl',
      steps: '/repo/.ambicode/tasks/ORD-17/steps',
      planBody: '/repo/.ambicode/tasks/ORD-17/steps/plan-body.md',
      requirements: '/repo/.ambicode/tasks/ORD-17/requirements',
      workers: '/repo/.ambicode/tasks/ORD-17/workers',
      stopCheck: '/repo/.ambicode/tasks/ORD-17/stop-check.md',
      answerBlocked: '/repo/.ambicode/tasks/ORD-17/answer-blocked.md',
    });
    assert.equal(taskDirFor('/repo', 'x').where, '.');
    assert.equal(taskDirFor('/repo', 'ORD-17', '.', 'review').root, '/repo/.ambicode/reviews/ORD-17');
  });
});

describe('02-D2: a slug names one directory', () => {
  it('refuses an empty slug and one with a separator or ..', () => {
    for (const slug of ['', '.', 'a/b', 'a\\b', '..', 'a..b', '../x']) {
      assert.throws(() => taskDirFor('/repo', slug), { code: 'bad-argument', field: 'task' }, slug);
    }
  });

  it('keeps the slug sanitizer: a request that sanitizes to nothing has no slug, and traversal is flattened', () => {
    assert.equal(taskSlugFor({ requirementIds: [], task: '///' }), null);
    assert.equal(taskSlugFor({ requirementIds: [], task: '../../src/evil' }), 'src-evil');
  });
});

describe('02-D3: --from names this task\'s plan body and nothing else', () => {
  const setup = async (root: string, slug = 'T') => {
    const dir = taskDirFor(root, slug);
    await mkdir(dir.steps, { recursive: true });
    await writeFile(dir.planBody, '# plan\n');
    return dir;
  };

  it('accepts the relative path, and the absolute path of the same file', async () => {
    await inRepo(async (root) => {
      const dir = await setup(root);
      assert.equal(await resolveFrom(nodeFileSystem, dir, 'steps/plan-body.md'), dir.planBody);
      assert.equal(await resolveFrom(nodeFileSystem, dir, dir.planBody), dir.planBody);
    });
  });

  it('refuses another task, a traversal, another file, an absolute path elsewhere and a missing file', async () => {
    await inRepo(async (root) => {
      const dir = await setup(root);
      const other = await setup(root, 'U');
      await writeFile(path.join(dir.steps, 'other.md'), 'x');
      for (const from of ['../U/steps/plan-body.md', '../../../../etc/passwd', 'steps/other.md', other.planBody, '/etc/passwd', 'steps/../steps/../ledger.jsonl']) {
        await assert.rejects(resolveFrom(nodeFileSystem, dir, from), bad, from);
      }
      await rm(dir.planBody);
      await assert.rejects(resolveFrom(nodeFileSystem, dir, 'steps/plan-body.md'), bad);
    });
  });

  it('refuses a symbolic link, by either path', async () => {
    await inRepo(async (root) => {
      const dir = await setup(root);
      const real = path.join(root, 'secret.md');
      await writeFile(real, 'secret');
      await rm(dir.planBody);
      await symlink(real, dir.planBody);
      await assert.rejects(resolveFrom(nodeFileSystem, dir, 'steps/plan-body.md'), bad);
      await assert.rejects(resolveFrom(nodeFileSystem, dir, dir.planBody), bad);
    });
  });
});
