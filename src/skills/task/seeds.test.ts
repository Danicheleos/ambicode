import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { planFixture } from '#testing/fixtures/plan-fixture';
import { appendLedger } from '#platform/ledger/ledger';

const PLAN = '.ambicode/tasks/ord-7/plan.md';
const NOTE = '.ambicode/tasks/ord-9/investigation_2026-10-01T10-00.md';
const NEWER = '.ambicode/tasks/ord-9/investigation_2026-10-02T10-00.md';

describe('the task map is seeded from the iteration brief', () => {
  it('a planned task started by its key alone maps the files its brief cites', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, '---\nstatus: accepted\n---\n# Plan\n\n## Iteration 1\nGuard `total` in `src/orders.ts`.\n');
      await appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), { kind: 'note', note: 'plan', path: PLAN, contentHash: 'sha256:0' });
      await t.start({ text: 'ord-7' });
      const map = (await t.kinds('map')).at(-1);
      assert.ok(Number(map?.['candidates']) > 0, `candidates ${String(map?.['candidates'])}`);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('a plan the task runs must say status: accepted', () => {
  it('a plan.md back at status: draft stops the start and says how to run it anyway', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(PLAN, '---\nstatus: draft\n---\n# Plan\n\n## Iteration 1\nGuard `total`.\n');
      await appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), { kind: 'note', note: 'plan', path: PLAN, contentHash: 'sha256:0' });
      await assert.rejects(t.start({ text: 'ord-7' }), /not status: accepted.*--plan/);
      assert.equal((await t.kinds('map')).length, 0);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('an investigation named by path reaches the plan and the task', () => {
  it('a task folder in the request attaches that task\'s latest investigation to the task brief', async () => {
    const t = await taskFixture();
    try {
      await t.fx.repo.write(NOTE, 'Old finding.\n');
      await t.fx.repo.write(NEWER, 'The total lives in `src/orders.ts`.\n');
      await t.start({ text: 'add totals, see .ambicode/tasks/ord-9' });
      assert.match(await t.work(), new RegExp(`Investigation: ${NEWER.replaceAll('.', '\\.')}`));
    } finally {
      await t.fx.dispose();
    }
  });

  it('the plan route has a map, and an investigation path stays in the request text for the model to read', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.fx.repo.write(NOTE, 'The limit lives in `src/orders/limit.ts`.\n');
      const first = await plan.start({ text: `add totals, see ${NOTE}` });
      assert.doesNotMatch(first.text, /Investigation:/);
      assert.match(first.text, /## map/);
      assert.equal((await plan.fx.kinds('ORD-17', 'map')).length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('a path outside .ambicode/tasks is not read', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.fx.repo.write('notes/investigation_x.md', 'secret\n');
      const first = await plan.start({ text: 'add totals, see notes/investigation_x.md' });
      assert.doesNotMatch(first.text, /Investigation:/);
    } finally {
      await plan.dispose();
    }
  });
});
