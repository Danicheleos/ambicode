import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { taskSlugFor } from '#modules/review/bundle/review-name';
import { taskDirFor } from './task-dir.ts';

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
      plan: '/repo/.ambicode/tasks/ORD-17/plan.md',
      requirements: '/repo/.ambicode/tasks/ORD-17/requirements',
      workers: '/repo/.ambicode/tasks/ORD-17/workers',
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
