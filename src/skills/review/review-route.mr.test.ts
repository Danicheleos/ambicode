import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import { finding } from '#testing/fixtures/review-fixture';
import { openRouteView } from '#harness/engine/context';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { captureMrDiff } from '#modules/review/snapshot/mr-capture';
import { SESSION_A } from '#testing/fixtures/ids';
import { CHECK_TASK } from '#testing/fixtures/check-fixture';

const MR = 'https://gitlab.example.com/g/p/-/merge_requests/7';
const CHANGES = { changes: [{ old_path: 'src/orders.ts', new_path: 'src/orders.ts', diff: '@@ -1,2 +1,2 @@\n a\n-b\n+c\n' }] };
type Fixture = Awaited<ReturnType<typeof reviewRouteFixture>>;

async function toReadback(t: Fixture, findings = [finding({ id: 'f-1' }), finding({ id: 'f-2', risk: 'low', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 3 } })]) {
  const start = await t.start({ target: { branch: false, base: null, mr: MR } });
  assert.equal(start.position, 'mr-fetch');
  assert.match(start.text, /Parse the project path and merge-request iid from the URL/);
  const dir = await resolveTaskDir(t.fx.runtime, CHECK_TASK);
  await withLedgerLock(t.fx.runtime.fs, dir.root, () => new Date(), SESSION_A, async (ledger) => {
    const view = (await openRouteView(t.fx.runtime, t.fx.routes, CHECK_TASK, SESSION_A))!;
    const input = { hook_event_name: 'PostToolUse', session_id: SESSION_A, tool_name: 'mcp__gitlab__get_merge_request_changes', tool_response: { content: [{ type: 'text', text: JSON.stringify(CHANGES) }] } };
    await captureMrDiff(input as never, { runtime: t.fx.runtime, dir, ledger, routeId: view.routeId, mrUrl: MR });
  });
  assert.equal((await t.kinds('capture')).length, 1);
  assert.equal((await t.next()).position, 'estimate');
  assert.match((await t.hook('estimate', 'run')).text, /review --task ord-7 --mr /);
  await t.synthetic([], { stage: 'pending' });
  return t.synthetic(findings, { stage: 'recorded' });
}

describe('review route: --mr publication (decision C2)', () => {
  it('start, capture, estimate, review, readback, then the publish gate lists the findings and `all` delivers publish-run', async () => {
    const t = await reviewRouteFixture();
    try {
      const readback = await toReadback(t);
      assert.equal(readback.position, 'readback');
      const gate = await t.next();
      assert.equal(gate.position, 'publish');
      assert.match(gate.text, /Post which findings as merge-request comments\?/);
      assert.match(gate.text, /1\. src\/orders\.ts:2 — Consider seeding the reduce so an empty list returns zero\. \(high\/medium\)\n2\. src\/orders\.ts:3 — /);
      const run = await t.hook('publish', 'all');
      assert.equal(run.position, 'publish-run');
      assert.match(run.text, /Post exactly the findings the user selected/);
      assert.match(run.text, /1\. src\/orders\.ts:2/);
      assert.equal((await t.kinds('exit')).length, 0, 'the final message closes the route, not the delivery');
    } finally {
      await t.fx.dispose();
    }
  });

  it('a number list as free text also delivers publish-run; `none` ends the route without it', async () => {
    const t = await reviewRouteFixture();
    try {
      await toReadback(t);
      await t.next();
      assert.equal((await t.hook('publish', '1')).position, 'publish-run');
    } finally {
      await t.fx.dispose();
    }
    const none = await reviewRouteFixture();
    try {
      await toReadback(none);
      await none.next();
      await none.hook('publish', 'none');
      assert.equal((await none.kinds('exit')).at(-1)?.['reason'], 'done');
      assert.ok(!(await none.kinds('step')).some((entry) => entry['step'] === 'publish-run' && entry['status'] === 'delivered'));
    } finally {
      await none.fx.dispose();
    }
  });

  it('no findings ends the route at publish-list and asks nothing', async () => {
    const t = await reviewRouteFixture();
    try {
      await toReadback(t, []);
      const end = await t.next();
      assert.match(end.text, /no findings to publish/);
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
      assert.equal((await t.kinds('gate')).filter((entry) => entry['gate'] === 'publish').length, 0);
    } finally {
      await t.fx.dispose();
    }
  });
});
