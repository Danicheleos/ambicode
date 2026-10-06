import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { A, B, TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { SRC_ROOT } from '#testing/paths';

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
budget: { modelSteps: 4 }
exits: [done, blocked, human, inconclusive, superseded, budget]
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
      await startAs(plan, A);
      assert.equal(await code(startAs(plan, B)), 'route-busy');
      assert.equal(await code(startAs(plan, B, { text: 'something else' })), 'route-busy');
    } finally {
      await plan.dispose();
    }
  });

  it('60 idle minutes change nothing', async () => {
    const plan = await planFixture();
    try {
      await startAs(plan, A);
      plan.fx.advanceClock(61 * 60_000);
      assert.equal(await code(startAs(plan, B)), 'route-busy');
      assert.equal(await code(plan.next()), 'ok');
    } finally {
      await plan.dispose();
    }
  });

  it('03-O2/03-O5: --adopt moves ownership: the old owner next, note save --from and promote refuse route-taken-over', async () => {
    const plan = await planFixture();
    try {
      await plan.toGate();
      await startAs(plan, B, { adopt: true });
      assert.equal(await code(plan.next()), 'route-taken-over');
      assert.equal(await code(plan.saveDraft('# Plan\n\n1. A.\n', A)), 'route-taken-over');
      assert.equal(await code(plan.promote(A)), 'route-taken-over');
      assert.equal(await code(plan.fx.engine.advance({ task: TASK, session: B, cause: 'route-next', scratchpadDir: plan.fx.scratchpad })), 'ok');
    } finally {
      await plan.dispose();
    }
  });

  it('03-O2/03-O5: --fresh supersedes the owner and the old owner is taken over', async () => {
    const plan = await planFixture();
    try {
      await startAs(plan, A);
      await startAs(plan, B, { fresh: true });
      const exits = await plan.fx.kinds(TASK, 'exit');
      assert.deepEqual(exits.map((entry) => entry['reason']), ['superseded']);
      assert.ok(['route-taken-over', 'route-not-open'].includes(await code(plan.next())));
    } finally {
      await plan.dispose();
    }
  });

  it('03-O2: an exited route permits a plain start by another session', async () => {
    const plan = await planFixture();
    try {
      await startAs(plan, A);
      await plan.fx.engine.stop(TASK, A, 'blocked', 'test', plan.fx.scratchpad);
      assert.equal(await code(startAs(plan, B)), 'ok');
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
      await startAs(plan, A, input);
      await startAs(plan, B, input);
      const routes = await plan.fx.kinds(TASK, 'route');
      assert.equal(routes[1]!['resumes'], routes[0]!['id']);
      await startAs(plan, B, { skill: 'inv', text: 'where is y' });
      const after = await plan.fx.kinds(TASK, 'route');
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
      const results = await Promise.all([spawn(A), spawn(B)]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal(results.find((result) => !result.ok)!.code, 'route-busy');
      assert.equal((await plan.fx.kinds(TASK, 'route')).length, 1);
    } finally {
      await plan.dispose();
    }
  });
});
