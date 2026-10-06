import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConsent } from './consent.ts';
import { TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';

const notes = (plan: PlanFixture, note: string) => plan.fx.kinds(TASK, 'note').then((rows) => rows.filter((row) => row['note'] === note));
const printOf = async (plan: PlanFixture) => (await plan.prints()).at(-1)!;
const drain = async (plan: PlanFixture, limit = 6) => {
  let message = await plan.next();
  for (let turn = 0; turn < limit && message.position !== 'complete'; turn += 1) message = await plan.next();
  return message;
};

describe('S1 untrusted headless start', () => {
  it('declines the acting preanswer, takes the default, promotes nothing', async () => {
    const plan = await planFixture();
    try {
      await plan.start({ channel: 'cli', headless: true, answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      const declined = await plan.fx.kinds(TASK, 'declined');
      assert.equal(declined[0]!['reason'], 'acting-needs-human');
      assert.equal((await plan.fx.kinds(TASK, 'preanswer')).length, 0);
      await plan.body('# Plan\n');
      await drain(plan);
      assert.equal((await notes(plan, 'plan')).length, 0);
      const taken = await plan.fx.kinds(TASK, 'default-taken');
      assert.equal(taken[0]!['answer'], 'Reject');
    } finally {
      await plan.dispose();
    }
  });
});

describe('S2 trusted preanswer', () => {
  it('converts at the reached instance and object hash, then promotes', async () => {
    const plan = await planFixture();
    try {
      await plan.start({ channel: 'hook', answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      await plan.next();
      await plan.body('# Plan\n\n1. Go.\n');
      const done = await plan.next();
      assert.equal(done.position, 'complete');
      const acceptance = (await plan.fx.kinds(TASK, 'acceptance'))[0]!;
      const print = await printOf(plan);
      assert.equal(acceptance['via'], 'prompt');
      assert.equal(acceptance['trusted'], true);
      assert.equal(acceptance['instance'], print.id);
      assert.deepEqual(acceptance['object'], print['object']);
      assert.equal((await notes(plan, 'plan')).length, 1);
    } finally {
      await plan.dispose();
    }
  });
});

describe('S12 late bound answer', () => {
  it('supersedes a never-asked default and applies onAnswer; the answered instance is used', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const first = await printOf(plan);
      await plan.next();
      await plan.next();
      const defaulted = await plan.next();
      assert.equal((await plan.fx.kinds(TASK, 'default-taken')).at(-1)!['via'], 'never-asked');
      assert.ok(defaulted.position);
      const message = await plan.hook('plan-accept', 'Revise', first.id);
      const acceptance = (await plan.fx.kinds(TASK, 'acceptance')).at(-1)!;
      assert.equal(acceptance['instance'], first.id);
      assert.equal(message.position, 'design');
    } finally {
      await plan.dispose();
    }
  });
});

describe('S13 instance binding', () => {
  it('answering an old instance after a new draft refuses promote and reprints for the new draft', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const instanceA = await printOf(plan);
      await plan.saveDraft('# Plan\n\n1. B.\n');
      const reprint = await plan.hook('plan-accept', 'Accept', instanceA.id);
      assert.equal(reprint.position, 'plan-accept');
      assert.equal((await notes(plan, 'plan')).length, 0);
      const instanceB = await printOf(plan);
      assert.notEqual(instanceB.id, instanceA.id);
    } finally {
      await plan.dispose();
    }
  });

  it('an unknown instance, a logical-id mismatch and a foreign chain are unbound and change nothing', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const print = await printOf(plan);
      await plan.hook('plan-accept', 'Accept', 'aaaaaaaa-99');
      const last = await plan.hook('budget-exhausted', 'Accept', print.id);
      const unbound = (await plan.fx.kinds(TASK, 'declined')).filter((entry) => entry['unbound'] === true);
      assert.deepEqual(unbound.map((entry) => entry['reason']), ['unknown-instance', 'wrong-gate']);
      assert.equal((await notes(plan, 'plan')).length, 0);
      assert.equal(last.position, 'plan-accept');
    } finally {
      await plan.dispose();
    }
  });
});

describe('S13 marker-less answer', () => {
  it('an answer without an instance is unbound and the gate is reprinted with a retry notice', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      const message = await plan.hook('plan-accept', 'Accept', undefined);
      assert.equal((await plan.fx.kinds(TASK, 'declined')).at(-1)!['reason'], 'no-instance');
      assert.match(message.text, /carried no usable marker/);
    } finally {
      await plan.dispose();
    }
  });
});

describe('S14 trusted headless', () => {
  it('without a trusted preanswer a model Accept is declined and the default stands', async () => {
    const plan = await planFixture();
    try {
      await plan.start({ channel: 'hook', headless: true });
      await plan.body('# Plan\n');
      await plan.next({ answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      await drain(plan);
      assert.equal((await plan.fx.kinds(TASK, 'declined'))[0]!['reason'], 'acting-needs-human');
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });

  it('with a trusted preanswer the answer is honoured and nothing is asked again', async () => {
    const plan = await planFixture();
    try {
      await plan.start({ channel: 'hook', headless: true, answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      await plan.body('# Plan\n');
      await drain(plan);
      assert.equal((await notes(plan, 'plan')).length, 1);
      assert.equal((await plan.fx.kinds(TASK, 'default-taken')).length, 0);
    } finally {
      await plan.dispose();
    }
  });
});

describe('evaluateConsent binding', () => {
  const print = { id: 'p1', kind: 'gate', gate: 'g', values: { key: ['k1'] } } as never;
  const accept = (extra: object) => ({ id: 'a1', kind: 'acceptance', gate: 'g', answer: 'Accept', via: 'hook', instance: 'p1', ...extra }) as never;

  it('requires the bound print to carry the exact key (03-G11)', () => {
    const base = { window: [accept({})], chain: [print], gate: 'g', acting: ['Accept'] };
    assert.equal(evaluateConsent({ ...base, binding: { key: 'k1' } }).state, 'honoured');
    assert.equal(evaluateConsent({ ...base, binding: { key: 'k2' } }).state, 'refused');
  });

  it('requires the accepted set to equal the binding set', () => {
    const base = { window: [accept({ set: ['a', 'b'] })], chain: [print], gate: 'g', acting: ['Accept'] };
    assert.equal(evaluateConsent({ ...base, binding: { set: ['b', 'a'] } }).state, 'honoured');
    assert.equal(evaluateConsent({ ...base, binding: { set: ['a'] } }).state, 'refused');
  });
});
