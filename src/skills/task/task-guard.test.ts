import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildChain } from '#harness/engine/fold';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { buildReport } from '#modules/evidence/report/report';

describe('07-R1 guard: a denied headless guard ask in the task route', () => {
  it('07-R1 guard: route stop blocked with permission-denied detail exits blocked, leads the report, and records no check', async () => {
    const t = await taskFixture();
    try {
      const red = await t.start({ headless: true });
      assert.equal(red.position, 'red');
      await t.fx.engine.stop('ord-7', 'aaaaaaaa-1111-4111-8111-111111111111', 'blocked', 'permission-denied: npx jest src/a.spec.ts', t.fx.scratchpad);
      const [exit] = await t.kinds('exit');
      assert.equal(exit?.['reason'], 'blocked');
      assert.equal(exit?.['detail'], 'permission-denied: npx jest src/a.spec.ts');
      assert.equal((await t.kinds('check')).length, 0, 'no check entry is fabricated');
      const ledger = await t.ledger();
      const report = buildReport(buildChain(ledger, ledger.find((entry) => entry.kind === 'route')!).entries);
      assert.equal(report.status, 'ended: blocked (permission-denied: npx jest src/a.spec.ts)');
      assert.match(report.text, /Checks: none recorded/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('07-R1 guard: after the stop the route is closed, so a later route next appends no check and no further step', async () => {
    const t = await taskFixture();
    try {
      await t.start({ headless: true });
      await t.fx.engine.stop('ord-7', 'aaaaaaaa-1111-4111-8111-111111111111', 'blocked', 'permission-denied: npx jest', t.fx.scratchpad);
      const before = (await t.ledger()).length;
      await assert.rejects(t.next());
      assert.equal((await t.ledger()).length, before);
      assert.equal((await t.kinds('check')).length, 0);
    } finally {
      await t.fx.dispose();
    }
  });
});
