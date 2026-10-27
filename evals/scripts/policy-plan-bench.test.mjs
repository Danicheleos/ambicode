import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aggregatePlans, changesPaths, runPlans, scorePlan } from './policy-plan-bench.mjs';

const plans = JSON.parse(readFileSync(new URL('../../bench/policy-plan/plans.json', import.meta.url), 'utf8'));

test('changesPaths: every Changes marker form the plan skill produced, new files kept, other sections ignored', () => {
  const plan = [
    '## Iteration 1: a', '*Goal*: touches `src/not/a/change.js:1` in prose', '*Changes*:',
    '- `src/a/one.js:3-9` add x', '- src/a/two.js:4 add y', '- new: `src/a/three.js` z', '*Checks*: `src/a/skip.js:1`',
    '## Iteration 2: b', '- *Goal*: g', '- *Changes*:', '  - `internal/b/flow.go:10-23` — v', '  - `internal/b/flow_test.go` (new) — t', '- *Checks*: go test',
    '## Iteration 3: c', 'Changes:', '1. src/c/four.js — w', '',
  ].join('\n');
  assert.deepEqual(changesPaths(plan), ['src/a/one.js', 'src/a/two.js', 'src/a/three.js', 'internal/b/flow.go', 'internal/b/flow_test.go', 'src/c/four.js']);
  assert.deepEqual(changesPaths('no changes section here: `src/x.js:1`'), []);
});

test('scorePlan: missed and extra against truth', () => {
  const score = scorePlan({ delivered: ['a', 'x'], truth: ['a', 'b', 'c'] });
  assert.deepEqual(score.missed, ['b', 'c']);
  assert.deepEqual(score.extra, ['x']);
});

test('aggregatePlans: a plan without Changes paths is counted and left out of every average', () => {
  const row = { changes: 2, deliveredN: 4, truthN: 4, missedN: 0, extraN: 0, bytes: 100 };
  const total = aggregatePlans([row, { ...row, deliveredN: 6, bytes: 300 }, { ...row, changes: 0, deliveredN: 99 }]);
  assert.equal(total.plans, 3);
  assert.equal(total.noChanges, 1);
  assert.equal(total.delivered, 5);
  assert.equal(total.deliveredMax, 6);
  assert.equal(total.bytes, 200);
});

test('bench data: every collected plan has Changes paths and map paths (the first extractor lost 11 of 84)', () => {
  assert.ok(plans.length >= 84);
  assert.deepEqual(plans.filter((plan) => plan.changes.length === 0).map((plan) => plan.id), []);
  assert.deepEqual(plans.filter((plan) => plan.mapPaths.length === 0).map((plan) => plan.id), []);
});

test('runPlans shipped: the plan stage delivers every rule the Changes paths resolve, for every collected plan', { timeout: 120000 }, async () => {
  const rows = await runPlans('shipped');
  assert.equal(rows.length, plans.length);
  assert.deepEqual(rows.filter((row) => row.missedN > 0).map((row) => row.id), []);
  assert.ok(rows.every((row) => row.bytes > 0));
});
