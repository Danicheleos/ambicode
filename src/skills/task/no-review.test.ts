import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { runRouteStart } from '#cli/commands/route/route';
import { ROUTE_START_OPTIONS } from '#types/cli';
import { parseArgs } from '#util/args';
import { gapsOf } from '#modules/evidence/report/report';
import { CHECK_TASK, checkFixture } from '#testing/fixtures/check-fixture';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const UNNAMED = 'fix `total` for an empty list';
const NAMED = `${UNNAMED} iteration 1`;
const GAP = 'review skipped (--no-review)';

async function withTask(body: (t: Fixture) => Promise<void>): Promise<void> {
  const t = await taskFixture();
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

const skipped = async (t: Fixture): Promise<unknown[]> => (await t.kinds('step')).filter((entry) => entry['status'] === 'skipped').map((entry) => entry['step']);

describe('task --no-review', () => {
  it('by default the change is reviewed, unasked when no iteration is named and offered when one is', async () => {
    await withTask(async (t) => {
      await t.start({ text: UNNAMED });
      await t.edit();
      assert.equal((await t.check('green', null)).position, 'review-agent');
    });
    await withTask(async (t) => {
      await t.start({ text: NAMED });
      await t.edit();
      assert.equal((await t.check('green', null)).position, 'review-offer');
      assert.doesNotMatch(JSON.stringify(gapsOf(await t.ledger())), /review skipped/);
    });
  });

  it('with the flag no review runs and no fix round opens, whether or not an iteration is named, and the report lists the gap', async () => {
    for (const text of [UNNAMED, NAMED]) {
      await withTask(async (t) => {
        await t.start({ text, noReview: true });
        await t.edit();
        let after = await t.check('green', null);
        // A named iteration still asks about the full checks, which is not the review.
        if (after.position === 'checks-offer') after = await t.hook('checks-offer', 'skip — verification incomplete');
        assert.equal(after.position, 'write', text);
        assert.equal((await t.kinds('review')).length, 0);
        assert.ok(!(await t.kinds('gate')).some((entry) => entry['gate'] === 'review-offer'), 'the review is not offered');
        const left = await skipped(t);
        for (const step of ['review-offer', 'brief', 'review-agent', 'review-record', 'review-run', 'fix']) assert.ok(left.includes(step), `${step} skipped: ${left.join(' ')}`);
        assert.ok(gapsOf(await t.ledger()).includes(GAP), gapsOf(await t.ledger()).join('|'));
        assert.match(await t.work('write'), /review skipped \(--no-review\)/);
      });
    }
  });

  it('with the flag and a named iteration the end checks still run: only the review steps are skipped', async () => {
    await withTask(async (t) => {
      await t.start({ text: NAMED, noReview: true });
      await t.edit();
      let after = await t.check('green', null);
      if (after.position === 'checks-offer') after = await t.hook('checks-offer', 'skip — verification incomplete');
      assert.equal(after.position, 'write');
      assert.ok(!(await skipped(t)).includes('scope-checks'), 'scope-checks is not skipped');
      assert.ok((await t.kinds('step')).some((entry) => entry['step'] === 'scope-checks' && entry['status'] === 'completed'), 'scope-checks ran');
    });
  });

  it('route start --no-review reaches the route entry; a start without it records nothing', async () => {
    await withTask(async (t) => {
      await runRouteStart(t.fx.runtime, parseArgs('route start', ['task', '--task', CHECK_TASK, '--no-review', UNNAMED], ROUTE_START_OPTIONS));
      const head = (await t.kinds('route')).at(-1)!;
      assert.equal((head['args'] as { noReview?: boolean }).noReview, true);
    });
    await withTask(async (t) => {
      await t.start({ text: UNNAMED });
      assert.equal('noReview' in ((await t.kinds('route')).at(-1)!['args'] as object), false);
    });
  });

  it('a route other than task refuses the flag instead of ignoring it', async () => {
    const t = await checkFixture();
    try {
      await assert.rejects(t.start('cli', false, { noReview: true }), { code: 'bad-argument' });
    } finally {
      await t.fx.dispose();
    }
  });
});
