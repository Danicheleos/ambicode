import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { openRouteView } from '#harness/engine/context';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { captureRequirement } from '#modules/requirements/capture/capture';
import { jira, mcp } from '#testing/fixtures/requirements-session';
import { SESSION_A } from '#testing/fixtures/ids';
import { gapsOf } from '#modules/evidence/report/report';
import { PLAN_TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';

const GOOD = '# Plan\n\n- *Changes*: `src/orders/limit.ts:1` `orderLimit`\n';
type Kind = 'claim-wrong' | 'requirement-uncovered' | 'requirement-altered' | 'caller-missed' | 'assumption-premise' | 'order';
const defect = (kind: Kind, where = '## Iteration 1', evidence = 'src/specs/orders.md:3 is the spec the plan says is absent', fix = 'Cite the spec.') => ({ kind, where, evidence, fix });
const answer = (...defects: ReturnType<typeof defect>[]): string => `\`\`\`json\n${JSON.stringify({ defects })}\n\`\`\``;

const claimsAnswer = (...claims: { n: number; verdict: 'holds' | 'wrong' | 'not-checked'; evidence: string }[]): string => `\`\`\`json\n${JSON.stringify({ defects: [], claims })}\n\`\`\``;

const shipped = (): Promise<PlanFixture> => planFixture({ shipped: true });
const lastPrint = async (plan: PlanFixture) => (await plan.prints()).at(-1)!;
const revises = async (plan: PlanFixture) => (await plan.fx.kinds(PLAN_TASK, 'revise')).filter((entry) => entry['from'] === 'draft');
const gaps = async (plan: PlanFixture): Promise<string> => gapsOf(await plan.fx.ledger(PLAN_TASK)).join('\n');
const workOf = (plan: PlanFixture): Promise<string> => readFile(path.join(plan.fx.repo.root, '.ambicode', 'tasks', PLAN_TASK, 'steps', 'work-critic.md'), 'utf8');
/** The model's call: write the body, then `route next` runs plan-check, the critic stand-in and the critic record. */
async function draftThrough(plan: PlanFixture) {
  await plan.body(GOOD);
  return plan.next();
}

describe('the plan critic', { concurrency: 4 }, () => {
  it('the critic step launches the subagent on a work file naming the plan, the answer path and the request', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      await plan.body(GOOD);
      const critic = await plan.nextRaw();
      assert.equal(critic.position, 'critic');
      assert.match(critic.text, /ambicode:plan-critic/);
      const work = await workOf(plan);
      assert.match(work, /answer: .*[\\/]steps[\\/]critic-answer\.json/);
      assert.match(work, /plan\.md/);
      assert.ok(work.split('\n').includes(`root: ${await realpath(plan.fx.repo.root)}`), 'the root is the raw path, not shell-quoted');
      assert.match(work, /## request\nadd a limit/);
    } finally {
      await plan.dispose();
    }
  });

  it('a typed prose request reaches the critic whole', async () => {
    const plan = await shipped();
    try {
      await plan.start({ text: 'add a limit to the order list' });
      await plan.body(GOOD);
      await plan.nextRaw();
      assert.match(await workOf(plan), /## request\nadd a limit to the order list\n/);
    } finally {
      await plan.dispose();
    }
  });

  it('a ticket the task already holds beside the typed request stays behind the pointer: the envelope section carries it, the request line points there', async () => {
    const plan = await shipped();
    try {
      await plan.start({ text: 'add a limit to the order list' });
      const dir = await resolveTaskDir(plan.fx.runtime, PLAN_TASK);
      await withLedgerLock(plan.fx.runtime.fs, dir.root, () => new Date(), async (ledger) => {
        const view = (await openRouteView(plan.fx.runtime, plan.fx.routes, PLAN_TASK, SESSION_A))!;
        await captureRequirement(
          { hook_event_name: 'PostToolUse', session_id: SESSION_A, tool_name: 'mcp__atlassian__getJiraIssue', tool_response: mcp(jira('ORD-17')), tool_input: { issueIdOrKey: 'ORD-17' } } as never,
          { runtime: plan.fx.runtime, dir, ledger, view, asked: [PLAN_TASK] },
        );
      });
      await plan.start({ text: 'add a limit to the order list' });
      await plan.body(GOOD);
      await plan.nextRaw();
      const work = await workOf(plan);
      assert.match(work, /## request\nThe ticket as typed is the `request` source under `## envelope` below\./);
      assert.match(work, /## envelope\nRead \S+ \(\d+ bytes\)/);
    } finally {
      await plan.dispose();
    }
  });

  it('interactive: a claim-wrong defect sends the plan back to draft once, with the defect under ## Critic defects; a second report does not send it back and is listed at the gate and in Not verified after Accept', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      plan.state.critic.push(answer(defect('claim-wrong')), answer(defect('claim-wrong')));
      const back = await draftThrough(plan);
      assert.equal(back.position, 'draft');
      assert.match(back.text, /## Critic defects\nclaim-wrong ## Iteration 1: src\/specs\/orders\.md:3 is the spec the plan says is absent.*Cite the spec\./);
      assert.equal((await revises(plan)).length, 1);

      const gate = await draftThrough(plan);
      assert.equal(gate.position, 'plan-accept');
      assert.equal((await revises(plan)).length, 1, 'one send-back only');
      assert.match(String((await lastPrint(plan))['details']), /1 critic defect[\s\S]*plan critic: claim-wrong ## Iteration 1: src\/specs\/orders\.md:3/);

      await plan.hook('plan-accept', 'Accept', (await lastPrint(plan)).id);
      assert.match(await gaps(plan), /^plan critic: claim-wrong ## Iteration 1: src\/specs\/orders\.md:3 is the spec the plan says is absent$/m);
    } finally {
      await plan.dispose();
    }
  });

  it('a claims row with verdict wrong and no defects sends an interactive first draft back with one claim-wrong line naming the claim\'s plan.md line; holds rows send nothing', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      await plan.body(`${GOOD}The only limit check is orderLimit.\nNo test beside it.\n`);
      plan.state.critic.push(claimsAnswer({ n: 1, verdict: 'wrong', evidence: 'src/cart.ts:9 checks the limit too' }, { n: 2, verdict: 'holds', evidence: 'Glob src/orders/*.test.ts found none' }));
      const back = await plan.next();
      assert.equal(back.position, 'draft');
      assert.equal(back.text.split('claim-wrong').length - 1, 1);
      assert.match(back.text, /## Critic defects\nclaim-wrong plan\.md:4: src\/cart\.ts:9 checks the limit too.*Correct the statement or back it with the search and its hits/);
      assert.equal((await revises(plan)).length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('a listed claim the critic wrote no row for is not checked: rows for 1 and 2 of 3 leave claim 3 listed with `no row from the critic`; an answer without claims leaves all of them', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      await plan.body(`${GOOD}The only limit check is orderLimit.\nNo test beside it.\nNo other caller of orderLimit.\n`);
      plan.state.critic.push(claimsAnswer({ n: 1, verdict: 'holds', evidence: 'Grep found one' }, { n: 2, verdict: 'holds', evidence: 'Glob found none' }));
      assert.equal((await plan.next()).position, 'plan-accept');
      const details = String((await lastPrint(plan))['details']);
      assert.match(details, /1 claim not checked:\nplan critic: claim not checked plan\.md:6: no row from the critic$/m);
      assert.doesNotMatch(details, /plan\.md:[45]: no row/);
      const none = await shipped();
      try {
        await none.start();
        await none.body(`${GOOD}The only limit check is orderLimit.\nNo test beside it.\n`);
        none.state.critic.push(answer());
        assert.equal((await none.next()).position, 'plan-accept');
        assert.match(await gaps(none), /^plan critic: claim not checked plan\.md:4: no row from the critic\nplan critic: claim not checked plan\.md:5: no row from the critic$/m);
      } finally {
        await none.dispose();
      }
    } finally {
      await plan.dispose();
    }
  });

  it('one malformed claim row is a not-checked line beside the valid rows and defects, which still send the draft back', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      await plan.body(`${GOOD}The only limit check is orderLimit.\nNo test beside it.\nNo other caller of orderLimit.\n`);
      plan.state.critic.push(JSON.stringify({
        defects: [defect('caller-missed', '## Iteration 1', 'src/cart.ts:9 calls orderLimit')],
        claims: [{ n: 1, verdict: 'wrong', evidence: 'src/cart.ts:9 checks the limit too' }, { n: '2', verdict: 'not checked', evidence: '' }, { n: 3, verdict: 'holds', evidence: 'Grep found one' }],
      }));
      const back = await plan.next();
      assert.equal(back.position, 'draft');
      assert.match(back.text, /claim-wrong plan\.md:4: src\/cart\.ts:9 checks the limit too/);
      assert.match(back.text, /caller-missed ## Iteration 1: src\/cart\.ts:9 calls orderLimit/);
      assert.match(await gaps(plan), /^plan critic: claim not checked plan\.md:5: malformed row: .+$/m);
      assert.doesNotMatch(await gaps(plan), /no valid answer/);
    } finally {
      await plan.dispose();
    }
  });

  it('a row naming no listed claim is ignored and counted as unknownRows; of two rows for one claim the first wins', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      await plan.body(`${GOOD}The only limit check is orderLimit.\nNo test beside it.\n`);
      plan.state.critic.push(claimsAnswer({ n: 1, verdict: 'holds', evidence: 'Grep found one' }, { n: 1, verdict: 'wrong', evidence: 'second row for one' }, { n: 2, verdict: 'holds', evidence: 'Glob found none' }, { n: 9, verdict: 'wrong', evidence: 'no such claim' }));
      assert.equal((await plan.next()).position, 'plan-accept');
      assert.equal((await revises(plan)).length, 0);
      assert.match(await gaps(plan), /^plan critic: critic row #9 names no listed claim$/m);
      assert.doesNotMatch(await gaps(plan), /claim-wrong|second row|no such claim/);
      const worker = (await plan.fx.kinds(PLAN_TASK, 'worker')).find((entry) => entry['worker'] === 'plan-critic')!;
      assert.equal((worker['summary'] as { unknownRows: number }).unknownRows, 1);
      assert.deepEqual((worker['summary'] as { defects: unknown[] }).defects, []);
    } finally {
      await plan.dispose();
    }
  });

  it('a not-checked row is listed at plan-accept and in Not verified, and sends nothing back; an answer without claims still parses', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      await plan.body(`${GOOD}The only limit check is orderLimit.\n`);
      plan.state.critic.push(claimsAnswer({ n: 1, verdict: 'not-checked', evidence: 'ran out of calls' }), answer());
      assert.equal((await plan.next()).position, 'plan-accept');
      assert.equal((await revises(plan)).length, 0);
      assert.match(String((await lastPrint(plan))['details']), /\n1 claim not checked:\nplan critic: claim not checked plan\.md:4: ran out of calls/);
      assert.doesNotMatch(String((await lastPrint(plan))['details']), /critic defect/);
      assert.match(await gaps(plan), /^plan critic: claim not checked plan\.md:4: ran out of calls$/m);
      const again = await shipped();
      try {
        await again.start();
        await again.body(GOOD);
        again.state.critic.push(answer(defect('order')));
        assert.equal((await again.next()).position, 'plan-accept');
        assert.match(await gaps(again), /^plan critic: order /m);
      } finally {
        await again.dispose();
      }
    } finally {
      await plan.dispose();
    }
  });

  it('headless with --answer plan-accept=Accept: the defects are recorded and listed in Not verified, nothing is sent back', async () => {
    const plan = await shipped();
    try {
      await plan.start({ headless: true, answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      plan.state.critic.push(answer(defect('claim-wrong'), defect('requirement-uncovered', '## Requirements, bullet 1', 'src/orders/limit.ts:2 still returns the total', 'Add it to Iteration 1.')));
      await draftThrough(plan);
      assert.equal((await revises(plan)).length, 0);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 1);
      const listed = await gaps(plan);
      assert.match(listed, /^plan critic: claim-wrong ## Iteration 1:/m);
      assert.match(listed, /^plan critic: requirement-uncovered ## Requirements, bullet 1: src\/orders\/limit\.ts:2 still returns the total$/m);
    } finally {
      await plan.dispose();
    }
  });

  for (const kind of ['requirement-uncovered', 'requirement-altered'] as const) {
    it(`interactive: a ${kind} defect alone sends the plan back to draft once, with the defect under ## Critic defects`, async () => {
      const plan = await shipped();
      try {
        await plan.start();
        plan.state.critic.push(answer(defect(kind, '## Requirements, bullet 1', 'src/orders/limit.ts:2 still returns the total', 'Add it to Iteration 1.')));
        const back = await draftThrough(plan);
        assert.equal(back.position, 'draft');
        assert.match(back.text, new RegExp(`## Critic defects\\n${kind} ## Requirements, bullet 1: src/orders/limit\\.ts:2 still returns the total.*Add it to Iteration 1\\.`));
        assert.equal((await revises(plan)).length, 1);
      } finally {
        await plan.dispose();
      }
    });
  }

  it('headless: nothing is shown or asked; the defect reaches the chat once, in Not verified, with no critic-defects header', async () => {
    const plan = await shipped();
    try {
      await plan.start({ headless: true, answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      plan.state.critic.push(answer(defect('claim-wrong')));
      const out = await draftThrough(plan);
      assert.equal(out.position, 'complete');
      assert.doesNotMatch(out.text, /critic defects?:/);
      assert.equal(out.text.split('plan critic: claim-wrong').length - 1, 1);
      assert.match(await gaps(plan), /^plan critic: claim-wrong /m);
    } finally {
      await plan.dispose();
    }
  });

  it('interactive with only caller-missed: no send-back, the defect is listed', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      plan.state.critic.push(answer(defect('caller-missed', '## Iteration 1', 'src/cart.ts:9 calls orderLimit')));
      assert.equal((await draftThrough(plan)).position, 'plan-accept');
      assert.equal((await revises(plan)).length, 0);
      assert.match(await gaps(plan), /^plan critic: caller-missed ## Iteration 1: src\/cart\.ts:9 calls orderLimit$/m);
    } finally {
      await plan.dispose();
    }
  });

  it('no answer file or an answer that is not valid: no send-back, and Not verified says the critic gave no valid answer, with why', async () => {
    for (const written of [null, 'looks fine to me', JSON.stringify({ defects: [{ kind: 'nonsense', where: 'x', evidence: 'y', fix: 'z' }] })]) {
      const plan = await shipped();
      try {
        await plan.start();
        plan.state.critic.push(written);
        assert.equal((await draftThrough(plan)).position, 'plan-accept');
        assert.equal((await revises(plan)).length, 0);
        assert.match(await gaps(plan), /^plan critic: no valid answer: .+$/m, String(written));
        assert.match(String((await lastPrint(plan))['details']), /plan critic: no valid answer/);
      } finally {
        await plan.dispose();
      }
    }
  });

  it('an empty defect list leaves no critic line at the gate or in Not verified', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      plan.state.critic.push(answer());
      assert.equal((await draftThrough(plan)).position, 'plan-accept');
      assert.doesNotMatch(await gaps(plan), /plan critic/);
      assert.doesNotMatch(String((await lastPrint(plan))['details']), /critic/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).filter((entry) => entry['worker'] === 'plan-critic').length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('interactive after a human Revise: the draft was already revised once, so critic defects do not send it back', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      assert.equal((await draftThrough(plan)).position, 'plan-accept');
      await plan.hook('plan-accept', 'Revise', (await lastPrint(plan)).id);
      plan.state.critic.push(answer(defect('claim-wrong')));
      const again = await draftThrough(plan);
      assert.equal(again.position, 'plan-accept');
      assert.deepEqual((await revises(plan)).map((entry) => entry['via']), ['gate']);
      assert.match(await gaps(plan), /^plan critic: claim-wrong/m);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'limit')).length, 0);
    } finally {
      await plan.dispose();
    }
  });
});
