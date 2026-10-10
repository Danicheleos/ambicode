import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';

// 12,000 lines rewritten whole: past the model-input limit, so the estimate refuses before the reviewer.
const lines = (tag: string): string => Array.from({ length: 12000 }, (_, i) => `${tag} line ${i} with some padding text\n`).join('');

async function withRefused(body: (t: Awaited<ReturnType<typeof reviewRouteFixture>>) => Promise<void>): Promise<void> {
  const t = await reviewRouteFixture({ dirty: false });
  try {
    await t.fx.repo.write('big.txt', lines('old'));
    await t.fx.repo.commitAll('big');
    await t.fx.repo.write('big.txt', lines('new'));
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

describe('review route: an estimate the engine refuses', () => {
  it('headless: the route ends blocked with the refusal, and no review command is delivered', async () => {
    await withRefused(async (t) => {
      const started = await t.start({ headless: true, answers: [{ gate: 'estimate', option: 'run' }] });
      assert.equal(started.position, 'complete');
      assert.match(started.text, /ended: blocked \(input-too-large:/);
      const exits = await t.kinds('exit');
      assert.deepEqual(exits.map((entry) => entry['reason']), ['blocked']);
      assert.match(String(exits[0]!['detail']), /^input-too-large:/);
      assert.equal((await t.kinds('gate')).length, 0);
      assert.equal((await t.kinds('step')).some((entry) => entry['step'] === 'review-run' && entry['status'] === 'delivered'), false);
    });
  });

  it('interactive: the refusal is still shown at the gate, where the user can narrow or skip', async () => {
    await withRefused(async (t) => {
      const started = await t.start();
      assert.equal(started.position, 'estimate');
      assert.match(String((await t.kinds('gate'))[0]!['question']), /refused before the reviewer: input-too-large/);
      assert.deepEqual((await t.kinds('exit')).length, 0);
    });
  });
});
