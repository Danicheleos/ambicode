import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { parseArgs } from '#util/args';
import { reviewPageCommand } from './page.ts';

describe('review page', () => {
  it('refuses a task with no recorded review instead of serving an empty page', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('a.txt', 'a\n');
      await repo.commitAll('base');
      const runtime = await createRuntime({ cwd: repo.root, http: { listen: async () => assert.fail('no listener for a task without a review'), call: async () => assert.fail('no call for a task without a review') } });
      await assert.rejects(reviewPageCommand.run(runtime, parseArgs('review page', ['--task', 'ord-7'], reviewPageCommand.options)), { code: 'review-unreadable' });
    } finally {
      await repo.dispose();
    }
  });
});
