import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendLedger } from '#platform/ledger/ledger';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { continuedTask } from './engine.ts';

describe('continuedTask', () => {
  it('names the task for `iteration N of <slug>`, takes the latest accepted plan for a bare `iteration N`, and ignores other requests', async () => {
    const t = await taskFixture();
    try {
      const plan = async (slug: string, at: Date) => {
        const dir = await resolveTaskDir(t.fx.runtime, slug);
        await appendLedger(t.fx.runtime.fs, dir.root, at, 'test-writer', { kind: 'note', note: 'plan', path: `.ambicode/task/${slug}/plan.md`, contentHash: 'sha256:0' });
      };
      assert.equal(await continuedTask(t.fx.runtime, 'iteration 1'), null, 'no plan yet');
      await plan('older-plan', new Date('2026-10-01T00:00:00Z'));
      await plan('newer-plan', new Date('2026-10-02T00:00:00Z'));
      assert.equal(await continuedTask(t.fx.runtime, 'iteration 1'), 'newer-plan');
      assert.equal(await continuedTask(t.fx.runtime, 'Iteration 2 of older-plan'), 'older-plan');
      assert.equal(await continuedTask(t.fx.runtime, 'fix the iteration count'), null);
    } finally {
      await t.fx.dispose();
    }
  });
});
