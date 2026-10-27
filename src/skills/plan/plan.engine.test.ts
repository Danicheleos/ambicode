import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PLAN, PLAN_TASK, planFixture } from '#testing/fixtures/plan-fixture';

const lastPrint = async (plan: Awaited<ReturnType<typeof planFixture>>) => (await plan.prints()).at(-1)!;
const planFiles = async (plan: Awaited<ReturnType<typeof planFixture>>, prefix: string) =>
  (await readdir(path.join(plan.fx.repo.root, '.ambicode', 'tasks', PLAN_TASK))).filter((name) => name.startsWith(prefix));

describe('plan-shaped route: reaching the gate', () => {
  it('prints plan-accept with the marker and no object: Accept takes the file as it is', async () => {
    const plan = await planFixture();
    try {
      const gate = await plan.toGate();
      assert.equal(gate.position, 'plan-accept');
      const print = await lastPrint(plan);
      assert.equal(print['object'], undefined);
      assert.match(gate.text, new RegExp(`\\[ambicode gate plan-accept ${print.id}\\]`));
      assert.doesNotMatch(gate.text, /Object:/);
      assert.match(gate.text, /Revise \(3 left\): goes back to draft/);
      assert.match(gate.text, /Accept \(acts: only your own answer here counts\)/);
    } finally {
      await plan.dispose();
    }
  });
});

const answers = async (plan: Awaited<ReturnType<typeof planFixture>>, kind: string) => plan.fx.kinds(PLAN_TASK, kind);

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
      assert.doesNotMatch(await readFile(path.join(plan.fx.repo.root, '.ambicode', 'tasks', PLAN_TASK, 'plan.md'), 'utf8'), /status: accepted/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 0);
    } finally {
      await plan.dispose();
    }
  });
});

describe('S3 accept after the user edited the plan file', () => {
  it('accepts the file as it is with no new write or check and one plan note', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const printA = await lastPrint(plan);
      await plan.body('# Plan\n\n1. Different.\n');
      const [writes, checks] = [plan.state.steps, plan.state.checks];
      assert.equal((await plan.hook('plan-accept', 'Accept', printA.id)).position, 'complete');
      assert.equal(plan.state.checks, checks);
      assert.equal(plan.state.steps, writes);
      assert.equal((await planFiles(plan, 'plan.md')).length, 1);
      await assert.rejects(plan.accept(), { code: 'plan-not-accepted' });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 1);
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
      const limits = await plan.fx.kinds(PLAN_TASK, 'limit');
      assert.ok(limits.some((entry) => entry['which'] === 'repeat' && entry['step'] === 'plan-write'));
      const revises = (await plan.fx.kinds(PLAN_TASK, 'revise')).filter((entry) => entry['via'] === 'code');
      assert.equal(revises.length, 2);
      assert.equal(plan.state.checks, 3);
    } finally {
      await plan.dispose();
    }
  });
});

describe('S5 model revise vs human Revise', () => {
  it('Revise through the hook is a human cycle and resets the covered counters; a flag Revise is declined, never a revise', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      await plan.next({ answers: [{ gate: 'plan-accept', option: 'Revise' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, 0);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason'], 'acting-needs-human');
      await plan.hook('plan-accept', 'Revise', print.id);
      const human = (await plan.fx.kinds(PLAN_TASK, 'revise')).at(-1)!;
      assert.deepEqual([human['via'], human['from']], ['gate', 'draft']);
    } finally {
      await plan.dispose();
    }
  });
});

describe('onFail: record', () => {
  const recording = PLAN.replace('onFail: revise plan-write', 'onFail: record');

  it('keeps a recoverable failure on the ledger as a gap and goes on to the gate without returning to the model', async () => {
    const plan = await planFixture({ extra: { plan: recording } });
    try {
      plan.state.checkOk = false;
      const gate = await plan.toGate();
      assert.equal(gate.position, 'plan-accept');
      const check = (await plan.fx.kinds(PLAN_TASK, 'step')).filter((entry) => entry['step'] === 'plan-check');
      assert.deepEqual(check.map((entry) => [entry['status'], entry['recorded'] ?? entry['failed']]), [['failed', true], ['completed', true]]);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, 0);
      assert.equal(plan.state.checks, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('does not swallow an unrecoverable failure: it raises, as a step without onFail does', async () => {
    const plan = await planFixture({
      extra: { plan: recording },
      handlers: { 't.check': async () => ({ state: 'failed', code: 'script-failed', message: 'crashed', recoverable: false }) },
    });
    try {
      await assert.rejects(plan.toGate(), /crashed/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'step')).some((entry) => entry['recorded'] === true), false);
    } finally {
      await plan.dispose();
    }
  });
});
