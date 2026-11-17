import assert from 'node:assert/strict';
import test from 'node:test';
import { benchRepo, summarize } from './policy-bench.mjs';

test('summarize: mean and max per activity, in the order review, task, plan', () => {
  const rows = [
    { activity: 'plan', rules: 4, bytes: 100 }, { activity: 'plan', rules: 6, bytes: 300 },
    { activity: 'task', rules: 2, bytes: 50 }, { activity: 'review', rules: 8, bytes: 900 },
  ];
  assert.deepEqual(summarize(rows).map((row) => [row.activity, row.rules, row.rulesMax, row.bytes, row.bytesMax]), [['review', 8, 8, 900, 900], ['task', 2, 2, 50, 50], ['plan', 5, 6, 200, 300]]);
});

test('the bench repository has no default', () => {
  assert.throws(() => benchRepo({}), /NAV_BENCH is required/);
  assert.equal(benchRepo({ NAV_BENCH: '/x/y' }), '/x/y');
});
