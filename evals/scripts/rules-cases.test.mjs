import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixtureByName } from '../../fixtures/definitions.mjs';
import { CASES } from './cases.mjs';
import { stagedRow } from './rules-cases.mjs';

const rules = CASES.filter((c) => c.tags.includes('rules'));
const has = (pattern, text) => new RegExp(pattern).test(text);
const row = (activity, ids, extra = '') => `{"id":"1","route":"r","kind":"policy","stage":"before-work","packs":[],"rules":${ids.length},"bytes":900,"activity":"${activity}","ids":${JSON.stringify(ids)}${extra}}\n`;
const patternOf = (grader) => new RegExp(/pattern: '(.*)'/.exec(rules.find((c) => c.name === 'plan-policy-staged').graders.find((g) => g.name === grader).text)[1].replace(/''/g, "'"));

test('two rules cases, each with a result grader and a steps grader', () => {
  assert.deepEqual(rules.map((c) => c.name).sort(), ['plan-policy-staged', 'rules-draft-sources']);
  for (const c of rules) assert.ok(c.graders.length >= 2, c.name);
});

test('stagedRow matches the id only in a policy row of that activity', () => {
  const ledger = row('review', ['common-errors/outbound-timeouts', 'common-code/naming']) + row('task', ['common-verification/test-behavior']);
  assert.ok(has(stagedRow('review', 'common-errors/outbound-timeouts'), ledger));
  assert.ok(!has(stagedRow('review', 'common-verification/test-behavior'), ledger), 'an id of another activity row does not count');
  assert.ok(!has(stagedRow('review', 'common-errors/outbound'), ledger), 'a prefix of an id does not count');
});

test('the citation graders accept one line per rule id and reject a second line for the same id', () => {
  const cites = patternOf('plan-cites-its-rules');
  assert.ok(cites.test('common-design/scope: applied at src/a.ts:4'));
  assert.ok(cites.test('common-design/need: not applicable: no new surface'));
  assert.ok(!cites.test('common-design/scope: stay within the request'));
  const once = patternOf('plan-cites-each-rule-once');
  assert.ok(!once.test('common-design/scope: applied at a.ts:1, b.ts:2\ncommon-design/need: not applicable: x\n'));
  assert.ok(once.test('common-design/scope: applied at a.ts:1\ncommon-design/need: not applicable: x\ncommon-design/scope: applied at b.ts:2\n'));
});

test('the fixture of the case exists and holds a service to plan against', () => {
  assert.ok(fixtureByName('policy-ledgerly').steps[0].write['src/services/payments.ts'] !== undefined);
  assert.ok(fixtureByName('policy-contributing').steps[0].write['CONTRIBUTING.md'].includes('withTimeout'));
  assert.equal(fixtureByName('rules-kinds-ledgerly'), null);
});
