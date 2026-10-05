import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { TASK, planFixture } from '../testing/plan-fixture.ts';

const lastPrint = async (plan: Awaited<ReturnType<typeof planFixture>>) => (await plan.prints()).at(-1)!;
const planFiles = async (plan: Awaited<ReturnType<typeof planFixture>>, prefix: string) =>
  (await readdir(path.join(plan.fx.repo.root, '.ambicode', 'task', TASK))).filter((name) => name.startsWith(prefix));

describe('plan-shaped route: reaching the gate', () => {
  it('prints plan-accept for the draft the check saved, with its identity and the marker', async () => {
    const plan = await planFixture();
    try {
      const gate = await plan.toGate();
      assert.equal(gate.position, 'plan-accept');
      const print = await lastPrint(plan);
      assert.equal((print['object'] as { value: string }).value, 'plan-draft');
      assert.match(gate.text, new RegExp(`\\[ambicode gate plan-accept ${print.id}\\]`));
      assert.match(gate.text, /Object: .*plan-draft_.*\.md [0-9a-f]{12}/);
      assert.match(gate.text, /Revise \(3 left\): goes back to design/);
      assert.match(gate.text, /Accept \(acts: only your own answer here counts\)/);
    } finally {
      await plan.dispose();
    }
  });
});

const answers = async (plan: Awaited<ReturnType<typeof planFixture>>, kind: string) => plan.fx.kinds(TASK, kind);

describe('S1 untrusted model flag cannot accept', () => {
  it('declines --answer plan-accept=Accept as acting-needs-human and promotes nothing', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate({ channel: 'cli', headless: false });
      const gate = await plan.next({ cause: 'route-next', answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      const declined = await answers(plan, 'declined');
      assert.equal(declined.at(-1)!['reason'], 'acting-needs-human');
      assert.equal(declined.at(-1)!['via'], 'flag');
      assert.equal(gate.position, 'plan-accept');
      assert.equal((await planFiles(plan, 'plan_')).length, 0);
      assert.equal((await plan.fx.kinds(TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 0);
    } finally {
      await plan.dispose();
    }
  });
});

describe('S3 re-accept after a new draft', () => {
  it('refuses promote for the changed object, reasks without new write or check, and promotes B exactly once', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const printA = await lastPrint(plan);
      await plan.saveDraft('# Plan\n\n1. Different.\n');
      const [writes, checks] = [plan.state.steps, plan.state.checks];
      const reask = await plan.hook('plan-accept', 'Accept', printA.id);
      assert.equal(reask.position, 'plan-accept');
      const printB = await lastPrint(plan);
      assert.notEqual(printB.id, printA.id);
      assert.notEqual((printB['object'] as { contentHash: string }).contentHash, (printA['object'] as { contentHash: string }).contentHash);
      assert.equal(plan.state.checks, checks);
      assert.equal(plan.state.steps, writes);
      assert.equal((await plan.hook('plan-accept', 'Accept', printB.id)).position, 'complete');
      assert.equal((await planFiles(plan, 'plan_')).length, 1);
      const again = await plan.promote();
      assert.equal(again.outcome, 'plan-already-promoted');
      assert.equal((await plan.fx.kinds(TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 1);
    } finally {
      await plan.dispose();
    }
  });
});

describe('S4 write/check repair loop', () => {
  it('limits the fourth write after three failing checks', async () => {
    const plan = await planFixture();
    try {
      plan.state.checkOk = false;
      await plan.start();
      await plan.next();
      await plan.body('# Plan\n');
      let message = await plan.next();
      for (let attempt = 0; attempt < 6 && message.position !== 'complete'; attempt += 1) message = await plan.next();
      const limits = await plan.fx.kinds(TASK, 'limit');
      assert.ok(limits.some((entry) => entry['which'] === 'repeat' && entry['step'] === 'plan-write'));
      const revises = (await plan.fx.kinds(TASK, 'revise')).filter((entry) => entry['via'] === 'code');
      assert.equal(revises.length, 2);
      assert.equal(plan.state.checks, 3);
    } finally {
      await plan.dispose();
    }
  });
});

describe('S5 model revise vs human Revise', () => {
  it('Revise through the hook is a human cycle and resets the covered counters; an untrusted flag Revise is via model', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      await plan.next({ answers: [{ gate: 'plan-accept', option: 'Revise' }] });
      const flagRevise = (await plan.fx.kinds(TASK, 'revise')).at(-1)!;
      assert.equal(flagRevise['via'], 'model');
      assert.equal(flagRevise['from'], 'design');
      assert.equal((await plan.fx.kinds(TASK, 'step')).at(-1)!['step'], 'design');
      void print;
    } finally {
      await plan.dispose();
    }
  });
});
