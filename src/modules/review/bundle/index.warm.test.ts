import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '#cli/args';
import { runReview } from '#cli/commands/review/review';
import { runCheckOnly } from '#modules/checks/run/check-command';
import { checkFixture, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { REVIEW_OPTIONS } from '#cli/types/commands';
import type { CheckDeps } from '#types/modules/checks';
import { SESSION_A } from '#testing/fixtures/ids';

const reviewer = { async invoke() { return { kind: 'ok', output: { findings: [], coverageNotes: [] }, rawLength: 2, argv: ['claude'] } as never; } };
const NEVER: CheckDeps['warm'] = () => new Promise(() => {});
const REJECTS: CheckDeps['warm'] = async () => { throw new Error('index down'); };

const withinMs = <T>(promise: Promise<T>, ms = 5_000): Promise<T> =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('did not return: the warm was awaited')), ms).unref())]);

describe('index warm is detached (07-G3)', () => {
  for (const [name, warm] of [['never resolves', NEVER], ['rejects', REJECTS]] as const) {
    it(`07-G3: check --only returns and the entry is written when warm ${name}`, async () => {
      const calls: string[] = [];
      const f = await checkFixture();
      try {
        await f.start();
        const outcome = await withinMs(runCheckOnly({ ...f.deps(SESSION_A), warm: async (...rest) => { calls.push('warm'); return warm!(...rest); } }, { task: CHECK_TASK, key: 'app/unit', only: ['src/a.spec.ts'], phase: 'red', approve: [], decline: [] }));
        assert.ok(outcome !== undefined);
        assert.equal((await f.fx.kinds(CHECK_TASK, 'check')).length, 1);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(calls, ['warm']);
      } finally {
        await f.fx.dispose();
      }
    });

    it(`07-G3: review --task on a routed task returns and writes the review entry when warm ${name}`, async () => {
      const calls: string[] = [];
      const t = await taskFixture();
      try {
        await t.start();
        await t.check('red', { ran: 1, failed: 1 });
        await t.edit();
        await t.check('green', { ran: 1, failed: 0 });
        await t.format();
        await t.hook('review-offer', 'run');
        const out = await withinMs(runReview(t.runtime, parseArgs('review', ['--task', CHECK_TASK], REVIEW_OPTIONS), { reviewer: reviewer as never, warm: async (...rest) => { calls.push('warm'); return warm!(...rest); } }));
        assert.equal(out.command, 'review');
        assert.equal((await t.kinds('review')).length, 1);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(calls, ['warm']);
      } finally {
        await t.fx.dispose();
      }
    });
  }
});
