import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { taskFixture, ORDERS } from '#testing/fixtures/task-fixture';
import { SESSION_A } from '#testing/fixtures/ids';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const PLAN = '.ambicode/tasks/ord-7/plan.md';
const TWO = '# Plan\n\n## Iteration 1\nAdd the guard.\n\n## Iteration 2\nSeed the reduce.\n';
const SKIP = 'skip — verification incomplete';
const TEXT = 'fix `total` for an empty list';

async function withTask(body: (t: Fixture) => Promise<void>, plan = TWO): Promise<void> {
  const t = await taskFixture();
  try {
    await t.fx.repo.write(PLAN, plan);
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

const routes = async (t: Fixture) => t.kinds('route');
const iterationOf = async (t: Fixture, route: number): Promise<unknown> => {
  const id = (await routes(t))[route]!.id;
  return (await t.kinds('step')).find((entry) => entry['step'] === 'start' && entry['route'] === id)?.['iteration'];
};
const gates = async (t: Fixture): Promise<unknown[]> => (await t.kinds('gate')).map((entry) => entry['gate']);
const stop = (t: Fixture) => t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad }, { repositoryRoot: t.fx.repo.root, where: '.' });

describe('task route: the iteration loop', () => {
  it('no iteration in the request: every iteration runs, the review runs unasked, and no gate separates them', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      await t.edit();
      assert.equal((await t.check('green', { ran: 1, failed: 0 })).position, 'review-agent', 'iteration 1: the review starts with no review-offer');
      const second = await t.review([]);
      assert.equal(second.position, 'change', 'iteration 2 opens in the same call');
      assert.match(await t.work(), /iteration 2 of 2 · plan: \.ambicode\/tasks\/ord-7\/plan\.md\n\n## Iteration 2\nSeed the reduce\./);
      assert.equal((await routes(t)).length, 2);
      assert.deepEqual((await t.kinds('exit')).map((entry) => [entry['route'], entry['reason']]), [[(await routes(t))[0]!.id, 'done']]);
      await t.fx.repo.write('src/orders.ts', ORDERS.replace('a + b)', 'a + b, 1)'));
      assert.equal((await t.check('green', { ran: 1, failed: 0 })).position, 'review-agent');
      assert.equal((await t.review([])).position, 'write');
      assert.equal((await t.kinds('review')).filter((entry) => entry['stage'] === 'recorded').length, 2);
      assert.deepEqual(await gates(t), [], 'no review-offer, no next-offer');
      assert.equal((await t.kinds('step')).filter((entry) => entry['step'] === 'write' && entry['status'] === 'delivered').length, 1);
      assert.deepEqual([await iterationOf(t, 0), await iterationOf(t, 1)], [1, 2]);
      await stop(t);
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']), ['done', 'done']);
    });
  });

  it('`iteration 2` in the request: only iteration 2, the review is offered, and declining it ends the task', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      const offer = await t.check('green', { ran: 1, failed: 0 });
      assert.equal(offer.position, 'review-offer');
      assert.equal((await t.hook('review-offer', SKIP)).position, 'write');
      await stop(t);
      assert.equal((await routes(t)).length, 1);
      assert.equal(await iterationOf(t, 0), 2);
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    });
  });

  it('`iteration 1` of two: iteration 1 only, the declined review ends the task and no second route opens', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `iteration 1 ${TEXT}` });
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      assert.equal((await t.hook('review-offer', SKIP)).position, 'write');
      await stop(t);
      assert.equal((await routes(t)).length, 1);
      assert.deepEqual(await gates(t), ['review-offer']);
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    });
  });

  it('a later start with no iteration picks the first one not done', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 1` });
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      await t.hook('review-offer', SKIP);
      await stop(t);
      await t.start({ plan: PLAN, text: TEXT });
      assert.equal(await iterationOf(t, 1), 2);
    });
  });

  it('a red check in iteration 1 keeps the route at change: no second route', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      await t.edit();
      assert.equal((await t.check('red', { ran: 1, failed: 1 })).position, 'change');
      assert.equal((await routes(t)).length, 1);
    });
  });

  it('a red change released by the check limit ends the loop: no second route', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      await t.edit();
      await t.check('red', { ran: 1, failed: 1 });
      await t.append({ kind: 'limit', which: 'check', step: 'change', phase: 'green', count: 5 });
      let message = await t.next();
      for (let round = 0; round < 4 && message.position === 'review-agent'; round += 1) message = await t.review([]);
      assert.equal((await routes(t)).length, 1);
    });
  });

  it('a red last check released by the limit ends the route blocked, and the next start redoes that iteration', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      await t.edit();
      await t.check('red', { ran: 1, failed: 1 });
      await t.append({ kind: 'limit', which: 'check', step: 'change', phase: 'green', count: 5 });
      let message = await t.next();
      for (let round = 0; round < 4 && message.position === 'review-agent'; round += 1) message = await t.review([]);
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']), ['blocked']);
      await t.start({ plan: PLAN, text: TEXT });
      assert.deepEqual([await iterationOf(t, 0), await iterationOf(t, 1)], [1, 1]);
    });
  });

  it('a route that ends blocked does not continue to iteration 2', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      await t.edit();
      await t.check('red', { ran: 1, failed: 1 });
      await t.fx.engine.stop('ord-7', 'blocked', 'fix limit spent');
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']), ['blocked']);
      assert.equal((await routes(t)).length, 1);
    });
  });

  it('a route interrupted mid-change is not an iteration done: the restart redoes the same iteration', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN });
      await t.start({ plan: PLAN });
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']), ['interrupted']);
      assert.deepEqual([await iterationOf(t, 0), await iterationOf(t, 1)], [1, 1]);
    });
  });

  it('the last iteration of a plan ends at the one write, with no second route', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      assert.equal((await t.review([])).position, 'write');
      assert.equal((await routes(t)).length, 1);
    }, '# Plan\n\n## Iteration 1\nAdd the guard.\n');
  });
});
