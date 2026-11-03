import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { briefOf } from './brief.ts';
import type { HandlerInput } from '#types/harness';

const PLAN = `---
status: accepted
---
# Plan: discounts

Goal: a discount of 10% on orders over 100.
Requirement R1 (rate 10%) is carried by iteration 2.

## Decisions
- The rate is a constant in \`src/orders.ts\`.

## Iteration 1: guard
Return zero for an empty list.

## Iteration 2: rate
Apply the rate.

## Assumptions
- Prices are integers.

## Policies
- reuse: applied at src/orders.ts:3
`;

const brief = async (iteration: number | null, text = PLAN) => {
  const input = { args: { plan: 'plan.md', iteration }, dir: { repositoryRoot: '/repo' }, runtime: { fs: { readText: async () => text } } } as unknown as HandlerInput;
  return (await briefOf(input, [])).brief ?? '';
};

describe('briefOf delivers the plan frame with every iteration', () => {
  it('each iteration brief carries the header (goal, requirements, decisions) and the sections after the last iteration, not the frontmatter', async () => {
    for (const iteration of [1, 2]) {
      const text = await brief(iteration);
      assert.match(text, /^# Plan: discounts\n/);
      assert.match(text, /Requirement R1 \(rate 10%\) is carried by iteration 2/);
      assert.match(text, /## Decisions\n- The rate is a constant/);
      assert.match(text, new RegExp(`## Iteration ${iteration}: `));
      assert.match(text, /## Assumptions\n- Prices are integers\.\n\n## Policies\n- reuse: applied at src\/orders\.ts:3$/);
      assert.doesNotMatch(text, /status: accepted/);
    }
  });

  it('an iteration brief holds only its own iteration between the frame and the closing sections', async () => {
    const text = await brief(1);
    assert.match(text, /Return zero for an empty list/);
    assert.doesNotMatch(text, /Apply the rate/);
  });

  it('an unnamed start briefs the iterations in order with the frame once', async () => {
    const text = await brief(null);
    assert.equal(text.match(/# Plan: discounts/g)?.length, 1);
    assert.ok(text.indexOf('Return zero') < text.indexOf('Apply the rate') && text.indexOf('Apply the rate') < text.indexOf('## Assumptions'));
    assert.equal(text.match(/## Assumptions/g)?.length, 1);
  });

  it('a level-2 section between iterations reaches every brief, in the closing part', async () => {
    const policies = '## Policies\n- reuse: applied at src/orders.ts:3\n\n';
    const plan = PLAN.replace(policies.trimEnd() + '\n', '').replace('## Iteration 2: rate', `${policies}## Iteration 2: rate`);
    assert.ok(plan.indexOf('## Policies') < plan.indexOf('## Iteration 2') && plan.match(/## Policies/g)?.length === 1);
    for (const iteration of [1, 2, null]) {
      const text = await brief(iteration, plan);
      assert.match(text, /## Policies\n- reuse: applied at src\/orders\.ts:3/, `iteration ${iteration}`);
      assert.match(text, /## Assumptions\n- Prices are integers\./);
      assert.equal(text.match(/## Policies/g)?.length, 1);
    }
    assert.doesNotMatch(await brief(1, plan), /Apply the rate/);
  });

  it('a heading inside a code fence neither ends an iteration nor counts as a section', async () => {
    const plan = PLAN.replace('Return zero for an empty list.', 'Return zero for an empty list.\n```md\n## fake\n## Iteration 9: fake\n```\nThen run the tests.');
    const text = await brief(1, plan);
    assert.match(text, /## fake\n## Iteration 9: fake\n```\nThen run the tests\./);
    assert.equal(text.match(/## fake/g)?.length, 1);
    assert.doesNotMatch(text, /Apply the rate/);
  });

  it('a plan with CRLF line endings drops its frontmatter from the header', async () => {
    const text = await brief(1, PLAN.replaceAll('\n', '\r\n'));
    assert.doesNotMatch(text, /status: accepted|^---/);
    assert.match(text, /^# Plan: discounts/);
  });

  it('a plan without iteration headings is the one brief, as written', async () => {
    assert.equal(await brief(null, 'Just do it.\n'), 'Just do it.');
  });
});
