import assert from 'node:assert/strict';
import test from 'node:test';
import { draftBytes } from './policy-plan-delivery.mjs';

test('draftBytes reads the delivered draft steps only', () => {
  const ledger = [
    { kind: 'step', step: 'ground', status: 'done', bytes: 5 },
    { kind: 'step', step: 'draft', status: 'delivered', bytes: 10917 },
    { kind: 'step', step: 'draft', status: 'done', bytes: 1 },
    { kind: 'step', step: 'draft', status: 'delivered', bytes: 800 },
  ].map((row) => JSON.stringify(row)).join('\n');
  assert.deepEqual(draftBytes(`${ledger}\n`), [10917, 800]);
});
