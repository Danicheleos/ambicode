import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { taskFixture, ORDERS } from '#testing/fixtures/task-fixture';
import { SESSION_A } from '#testing/fixtures/ids';
import { doneIterations } from '#modules/evidence/task/iterations';

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
const entriesOf = (t: Fixture) => t.ledger();
const gates = async (t: Fixture): Promise<unknown[]> => (await t.kinds('gate')).map((entry) => entry['gate']);
const stop = (t: Fixture) => t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad }, { repositoryRoot: t.fx.repo.root, where: '.' });

describe('task route: the iteration loop', { concurrency: 4 }, () => {
  it('no iteration in the request: one route briefs every iteration in order, one review follows, and the run ends done for all of them', async () => {
    await withTask(async (t) => {
      const started = await t.start({ plan: PLAN, text: TEXT });
      assert.match(started.text.split('\n')[0]!, /· iteration 1-2\/2 · step change/);
      const work = await t.work();
      assert.match(work, /iterations 1-2 of 2\n\n## Iteration 1\nAdd the guard\.\n\n## Iteration 2\nSeed the reduce\./);
      await t.edit();
      assert.equal((await t.check('green', { ran: 1, failed: 0 })).position, 'review-agent', 'the one review starts with no review-offer');
      assert.equal((await t.review([])).position, 'write');
      assert.equal((await routes(t)).length, 1, 'no second route');
      assert.equal((await t.kinds('review')).filter((entry) => entry['stage'] === 'recorded').length, 1);
      assert.deepEqual(await gates(t), [], 'no review-offer, no next-offer');
      assert.deepEqual([...doneIterations(await entriesOf(t))], []);
      await stop(t);
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']), ['done']);
      assert.deepEqual([...doneIterations(await entriesOf(t))], [1, 2], 'a done exit marks every covered iteration');
      await t.start({ plan: PLAN, text: TEXT });
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']).at(-1), 'iterations-complete');
    });
  });

  it('headless with no iteration in the request: one route covers every iteration, and no review runs', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT, headless: true });
      await t.edit();
      const after = await t.check('green', { ran: 1, failed: 0 });
      assert.notEqual(after.position, 'review-agent');
      assert.match(after.text.split('\n')[0]!, /· iteration 1-2\/2 · step /, 'the header names the range');
      assert.equal((await t.kinds('review')).length, 0);
      assert.equal((await routes(t)).length, 1);
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
      assert.deepEqual(await gates(t), ['review-offer', 'checks-offer']);
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
      assert.match(await t.work(), /iteration 2 of 2/);
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

  it('a route stopped blocked after its change is not done: the next start redoes from iteration 1', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      await t.edit();
      await t.fx.engine.stop('ord-7', 'blocked', 'stopped');
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']), ['blocked']);
      await t.start({ plan: PLAN, text: TEXT });
      assert.deepEqual([await iterationOf(t, 0), await iterationOf(t, 1)], [1, 1]);
    });
  });

  it('a route that ends blocked marks no iteration done', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      await t.edit();
      await t.check('red', { ran: 1, failed: 1 });
      await t.fx.engine.stop('ord-7', 'blocked', 'fix limit spent');
      assert.deepEqual((await t.kinds('exit')).map((entry) => entry['reason']), ['blocked']);
      assert.equal((await routes(t)).length, 1);
      assert.deepEqual([...doneIterations(await entriesOf(t))], []);
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
  it('an unnamed start skips an iteration already done: the brief holds the others in order, and a done exit marks them all', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      await t.hook('review-offer', SKIP);
      await stop(t);
      await t.start({ plan: PLAN, text: TEXT });
      const work = await t.work();
      assert.match(work, /iterations 1-3 of 3/);
      assert.match(work, /## Iteration 1\nAdd the guard\.\n\n## Iteration 3\nWire it\./);
      assert.doesNotMatch(work, /## Iteration 2/);
    }, `${TWO}\n## Iteration 3\nWire it.\n`);
  });

  it('the change step of an unnamed route allows 2 checks per phase for each covered iteration; a named one keeps 5', async () => {
    const THREE = `${TWO}\n## Iteration 3\nWire it.\n`;
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      t.runner.out = { exitCode: 1, stdout: 'Tests: 1 failed\n' };
      for (let run = 0; run < 6; run += 1) assert.equal((await t.runCheck({ phase: 'green' })).outcome, 'ran');
      await assert.rejects(t.runCheck({ phase: 'green' }), /6 green checks already ran/);
    }, THREE);
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      t.runner.out = { exitCode: 1, stdout: 'Tests: 1 failed\n' };
      for (let run = 0; run < 5; run += 1) assert.equal((await t.runCheck({ phase: 'green' })).outcome, 'ran');
      await assert.rejects(t.runCheck({ phase: 'green' }), /5 green checks already ran/);
    }, THREE);
  });

  it('a route started after one that was interrupted keeps its baseline: the work it left is not "already changed"', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT });
      await t.edit();
      await t.start({ plan: PLAN, text: TEXT });
      const baselines = await t.kinds('baseline');
      assert.equal(baselines.length, 2);
      assert.deepEqual(baselines[1]!['dirty'], baselines[0]!['dirty']);
      assert.equal(baselines[1]!['tree'], baselines[0]!['tree']);
      assert.deepEqual((baselines[1]!['dirty'] as unknown[]), [], 'the interrupted route edited after its baseline, so the edit is not in it');
    });
  });

  it('a route started after one that finished takes a fresh baseline: the finished work is already changed', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 1` });
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      await t.hook('review-offer', SKIP);
      await stop(t);
      await t.start({ plan: PLAN, text: TEXT });
      const baselines = await t.kinds('baseline');
      assert.deepEqual((baselines[1]!['dirty'] as { path: string }[]).map((entry) => entry.path), ['src/orders.ts']);
    });
  });

});
