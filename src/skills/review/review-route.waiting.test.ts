import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '#util/args';
import { runReview, REVIEW_OPTIONS } from '#cli/commands/review/review';
import { CHECK_TASK } from '#testing/fixtures/check-fixture';
import { PROPOSED, reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import type { StartChannel } from '#types/harness';

type Fixture = Awaited<ReturnType<typeof reviewRouteFixture>>;

const GATE = 'review-checks';
const RERUN = /review --task ord-7`/;

async function withReview(body: (t: Fixture) => Promise<void>, options: Parameters<typeof reviewRouteFixture>[0] = {}): Promise<void> {
  const t = await reviewRouteFixture(options);
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

const toRun = async (t: Fixture, start: Parameters<Fixture['start']>[0] = {}): Promise<void> => {
  await t.start(start);
  await t.hook('estimate', 'run');
};
const gates = async (t: Fixture) => (await t.kinds('gate')).filter((entry) => entry['gate'] === GATE);


describe('review route: waiting checks are one explicit question (08-W1 … 08-W4)', () => {
  it('08-W1: waiting checks raise one review-checks question by review-run naming every key; with, without and no review are offered, without by default', async () => {
    await withReview(async (t) => {
      await toRun(t);
      const raised = await t.synthetic([], { waiting: ['app/e2e', 'app/unit'] });
      assert.equal(raised.position, 'review-run');
      assert.deepEqual((await gates(t)).map((entry) => [entry['raisedBy'], (entry['values'] as { key: string[] }).key]), [['review-run', ['app/e2e', 'app/unit']]]);
      assert.match(raised.text, /Checks waiting: app\/e2e, app\/unit\. The reviewer has not run yet\./);
      assert.match(raised.text, /Options:\n {2}- with \(acts[^\n]*goes back to review-run\)\n {2}- without \(default if nobody answers[^\n]*\)\n {2}- no review\n/);
      assert.doesNotMatch(raised.text, /\$raisedBy/);
    });
  });

  for (const option of ['with', 'without']) {
    it(`08-W2: a bound ${option} revises review-run once and delivers one review command; the next result goes to readback and nothing is asked again`, async () => {
      await withReview(async (t) => {
        await toRun(t);
        await t.synthetic([], { waiting: ['app/e2e', 'app/unit'] });
        const rerun = await t.hook(GATE, option);
        assert.equal(rerun.position, 'review-run');
        assert.match(rerun.text, RERUN);
        assert.doesNotMatch(rerun.text, /--approve/);
        assert.deepEqual((await t.kinds('revise')).map((entry) => [entry['from'], entry['reason']]), [['review-run', `${GATE}: ${option}`]]);
        assert.equal((await gates(t)).length, 1);
      });
    });
  }

  it('08-W3: no review re-runs nothing and goes on to readback', async () => {
    await withReview(async (t) => {
      await toRun(t);
      await t.synthetic([], { waiting: ['app/e2e'] });
      const after = await t.hook(GATE, 'no review');
      assert.equal(after.position, 'readback');
      assert.deepEqual(await t.kinds('revise'), []);
    });
  });

  it('08-W3: an unanswered question takes without as never-asked: nothing re-runs, no loop', async () => {
    await withReview(async (t) => {
      await toRun(t);
      await t.synthetic([], { waiting: ['app/e2e'] });
      for (let turn = 0; turn < 4; turn += 1) await t.next();
      assert.deepEqual((await t.kinds('default-taken')).map((entry) => [entry['gate'], entry['answer'], entry['via']]), [[GATE, 'without', 'never-asked']]);
      assert.equal((await t.kinds('revise')).length, 0);
      assert.equal((await t.kinds('review')).length, 1);
    });
  });

  it('08-W3: a re-run whose review still waits asks again; each re-run needs its own answer', async () => {
    await withReview(async (t) => {
      await toRun(t);
      await t.synthetic([], { waiting: ['app/e2e'] });
      await t.hook(GATE, 'without');
      const again = await t.synthetic([], { waiting: ['app/unit'] });
      assert.equal(again.position, 'review-run');
      assert.deepEqual((await gates(t)).map((entry) => (entry['values'] as { key: string[] }).key), [['app/e2e'], ['app/unit']]);
      assert.equal((await t.kinds('revise')).length, 1);
    });
  });

  it('08-W4: a model --answer review-checks=with is declined acting-needs-human and re-runs nothing', async () => {
    await withReview(async (t) => {
      await toRun(t);
      await t.synthetic([], { waiting: ['app/e2e'] });
      await t.next({ answers: [{ gate: GATE, option: 'with' }] });
      assert.deepEqual((await t.kinds('declined')).map((entry) => [entry['gate'], entry['reason']]), [[GATE, 'acting-needs-human']]);
      assert.deepEqual(await t.kinds('revise'), []);
    });
  });

  for (const channel of ['hook', 'cli'] as StartChannel[]) {
    it(`08-W4/S14: a model-typed review --approve on a ${channel} start is declined acting-needs-human, the check stays waiting and no reviewer runs`, async () => {
      await withReview(async (t) => {
        await toRun(t, { channel });
        const run = (...extra: string[]) => runReview(t.runtime, parseArgs('review', ['--task', CHECK_TASK, ...extra], REVIEW_OPTIONS));
        await run();
        await run('--approve', 'app/lint');
        assert.equal(t.runner.calls.length, 0, 'the proposed check never ran');
        assert.deepEqual((await t.kinds('declined')).map((entry) => [entry['gate'], entry['via'], entry['reason'], entry['key']]), [[GATE, 'flag', 'acting-needs-human', 'app/lint']]);
        assert.deepEqual((await t.kinds('review')).map((entry) => entry['waiting']), [['app/lint'], ['app/lint']]);
      }, { pack: PROPOSED });
    });
  }

  it('08-W4/S14: headless takes without at once: the review runs once without the check, and a typed --approve is recorded as declined and never runs it', async () => {
    await withReview(async (t) => {
      assert.equal((await t.start({ headless: true, answers: [{ gate: 'estimate', option: 'run' }] })).position, 'review-run');
      const run = (...extra: string[]) => runReview(t.runtime, parseArgs('review', ['--task', CHECK_TASK, ...extra], REVIEW_OPTIONS));
      await run();
      assert.deepEqual((await t.kinds('default-taken')).map((entry) => [entry['gate'], entry['answer'], entry['via']]), [[GATE, 'without', 'headless']]);
      await run('--approve', 'app/lint');
      assert.deepEqual((await t.kinds('review')).map((entry) => entry['waiting']), [['app/lint'], []], 'the second run reviews without the declined check');
      assert.equal(t.runner.calls.length, 0, 'the proposed check never ran');
      assert.deepEqual((await t.kinds('declined')).map((entry) => [entry['gate'], entry['via'], entry['reason'], entry['key']]), [[GATE, 'flag', 'acting-needs-human', 'app/lint']]);
    }, { pack: PROPOSED });
  });

  it('08-W4: an honoured with runs the check once', async () => {
    await withReview(async (t) => {
      await toRun(t);
      const run = () => runReview(t.runtime, parseArgs('review', ['--task', CHECK_TASK], REVIEW_OPTIONS));
      await run();
      await t.hook(GATE, 'with');
      await run();
      assert.deepEqual((await t.kinds('review')).map((entry) => entry['waiting']), [['app/lint'], []]);
      assert.ok(t.runner.calls.length > 0, 'the approved check ran');
    }, { pack: PROPOSED });
  });
});
