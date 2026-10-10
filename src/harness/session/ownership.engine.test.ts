import { stopRoute } from '#testing/fixtures/route-fixture';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { PLAN_TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { SRC_ROOT } from '#testing/paths';
import { SESSION_A, SESSION_B } from '#testing/fixtures/ids';

const run = promisify(execFile);
const code = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
};
const startAs = (plan: PlanFixture, session: string, input: object = {}) => plan.start({ session, ...input });
const INV = `skill: inv
version: 3
exits: [done, blocked, human, inconclusive, superseded]
revisable: []
steps:
  - id: read
    actor: model
    instruction: "Read."
`;

describe('S11 plan ownership', () => {
  it('03-O1: another session starting the live plan route, same or different args, is route-busy', async () => {
    const plan = await planFixture();
    try {
      await startAs(plan, SESSION_A);
      assert.equal(await code(startAs(plan, SESSION_B)), 'route-busy');
      assert.equal(await code(startAs(plan, SESSION_B, { text: 'something else' })), 'route-busy');
    } finally {
      await plan.dispose();
    }
  });

  it('60 idle minutes change nothing', async () => {
    const plan = await planFixture();
    try {
      await startAs(plan, SESSION_A);
      plan.fx.advanceClock(61 * 60_000);
      assert.equal(await code(startAs(plan, SESSION_B)), 'route-busy');
      assert.equal(await code(plan.next()), 'ok');
    } finally {
      await plan.dispose();
    }
  });

  it('03-O2/03-O5: --adopt moves ownership: the old owner next, note save --from and promote refuse route-taken-over', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      await startAs(plan, SESSION_B, { adopt: true });
      assert.equal(await code(plan.next()), 'route-taken-over');
      assert.equal(await code(plan.saveDraft('# Plan\n\n1. A.\n', SESSION_A)), 'route-taken-over');
      assert.equal(await code(plan.promote(SESSION_A)), 'route-taken-over');
      assert.equal(await code(plan.fx.engine.advance({ task: PLAN_TASK, session: SESSION_B, cause: 'route-next', scratchpadDir: plan.fx.scratchpad })), 'ok');
    } finally {
      await plan.dispose();
    }
  });

  it('03-O2/03-O5: --fresh supersedes the owner and the old owner is taken over', async () => {
    const plan = await planFixture();
    try {
      await startAs(plan, SESSION_A);
      await startAs(plan, SESSION_B, { fresh: true });
      const exits = await plan.fx.kinds(PLAN_TASK, 'exit');
      assert.deepEqual(exits.map((entry) => entry['reason']), ['superseded']);
      assert.ok(['route-taken-over', 'route-not-open'].includes(await code(plan.next())));
    } finally {
      await plan.dispose();
    }
  });

  it('03-O2: an exited route permits a plain start by another session', async () => {
    const plan = await planFixture();
    try {
      await startAs(plan, SESSION_A);
      await stopRoute(plan.fx, PLAN_TASK, SESSION_A, 'blocked', 'test');
      assert.equal(await code(startAs(plan, SESSION_B)), 'ok');
    } finally {
      await plan.dispose();
    }
  });
});

describe('S11 non-owning routes', () => {
  it('the same args from another session resume the chain; different args open a separate chain', async () => {
    const plan = await planFixture({ extra: { inv: INV } });
    try {
      const input = { skill: 'inv', text: 'where is x' };
      await startAs(plan, SESSION_A, input);
      await startAs(plan, SESSION_B, input);
      const routes = await plan.fx.kinds(PLAN_TASK, 'route');
      assert.equal(routes[1]!['resumes'], routes[0]!['id']);
      await startAs(plan, SESSION_B, { skill: 'inv', text: 'where is y' });
      const after = await plan.fx.kinds(PLAN_TASK, 'route');
      assert.equal(after.at(-1)!['resumes'], undefined);
    } finally {
      await plan.dispose();
    }
  });
});

describe('simultaneous claimants as child processes', () => {
  it('exactly one of two concurrent plan starts wins; the other is route-busy', async () => {
    const plan = await planFixture();
    try {
      const child = path.join(SRC_ROOT, 'testing', 'fixtures', 'route-child.ts');
      const spawn = async (session: string) => JSON.parse((await run(process.execPath, [child, JSON.stringify({ root: plan.fx.repo.root, session })])).stdout.trim().split('\n').at(-1)!) as { ok: boolean; code?: string };
      const results = await Promise.all([spawn(SESSION_A), spawn(SESSION_B)]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(results.find((result) => !result.ok)!.code, 'route-busy');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'route')).length, 1);
    } finally {
      await plan.dispose();
    }
  });
});
