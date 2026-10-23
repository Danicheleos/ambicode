import { stopRoute } from '#testing/fixtures/route-fixture';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderSummary } from '#modules/evidence/report/summary';
import { taskFixture } from '#testing/fixtures/task-fixture';

describe('07-R1 guard: a denied headless guard ask in the task route', () => {
  it('07-R1 guard: route stop blocked with permission-denied detail exits blocked, the summary says why, and records no check', async () => {
    const t = await taskFixture();
    try {
      const first = await t.start({ headless: true });
      assert.equal(first.position, 'change');
      await stopRoute(t.fx, 'ord-7', 'aaaaaaaa-1111-4111-8111-111111111111', 'blocked', 'permission-denied: npx jest src/a.spec.ts');
      const [exit] = await t.kinds('exit');
      assert.equal(exit?.['reason'], 'blocked');
      assert.equal(exit?.['detail'], 'permission-denied: npx jest src/a.spec.ts');
      assert.equal((await t.kinds('check')).length, 0, 'no check entry is fabricated');
      const summary = await renderSummary('ord-7', await t.ledger(), async () => null);
      assert.match(summary, /blocked \(permission-denied: npx jest src\/a\.spec\.ts\)/);
      assert.doesNotMatch(summary, /passed|Checks:/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('07-R1 guard: after the stop the route is closed, so a later route next appends no check and no further step', async () => {
    const t = await taskFixture();
    try {
      await t.start({ headless: true });
      await stopRoute(t.fx, 'ord-7', 'aaaaaaaa-1111-4111-8111-111111111111', 'blocked', 'permission-denied: npx jest');
      const before = (await t.ledger()).length;
      await assert.rejects(t.next());
      assert.equal((await t.ledger()).length, before);
      assert.equal((await t.kinds('check')).length, 0);
    } finally {
      await t.fx.dispose();
    }
  });
});
