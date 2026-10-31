import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { CHECK_CONFIG } from '#testing/fixtures/check-fixture';
import { gapsOf } from '#modules/evidence/report/report';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const PLAN = '.ambicode/tasks/ord-7/plan.md';
const TWO = '# Plan\n\n## Iteration 1\nAdd the guard.\n\n## Iteration 2\nSeed the reduce.\n';
const TEXT = 'fix `total` for an empty list';
const SKIP = 'skip — verification incomplete';
const REPORT_GAP = 'report the gap';
/** unit has both forms, typecheck only `all`: the shapes the end step must tell apart. e2e (propose) and lint (forbid) are left out of this fixture. */
const CONFIG = CHECK_CONFIG.split('\n').filter((line) => !/^\s+(e2e|lint):/.test(line)).join('\n');
const NO_CHECKS = CONFIG.replace(/^(\s+)(unit|typecheck|format):.*$/gm, '$1$2: null');
const FAIL = 'FAIL src/orders.spec.ts\n  expected 0 received NaN\n';

async function withTask(body: (t: Fixture) => Promise<void>, options: Parameters<typeof taskFixture>[0] = { config: CONFIG, askChecks: true }): Promise<void> {
  const t = await taskFixture(options);
  try {
    await t.fx.repo.write(PLAN, TWO);
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

/** The check commands that ran, format left out: the end step's own runs. */
const ran = (t: Fixture): string[] => t.runner.calls.map((call) => call.join(' ')).filter((call) => !call.startsWith('fmt')).sort();
const scopeRuns = async (t: Fixture) => (await t.kinds('check')).filter((entry) => entry['route'] !== undefined && entry['ms'] !== 3);
const gateNames = async (t: Fixture): Promise<unknown[]> => (await t.kinds('gate')).map((entry) => entry['gate']);
const green = (t: Fixture) => t.check('green', { ran: 1, failed: 0 });

describe('task route: the end-of-run checks', { concurrency: 4 }, () => {
  it('auto mode: no check runs of its own; after the one review each runnable key runs once, on the files the task changed, no question asked', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT.replace(' iteration 1', '') });
      await t.edit();
      assert.equal((await green(t)).position, 'review-agent');
      assert.deepEqual(ran(t), [], 'the implementer ran no check of the route');
      assert.equal((await t.review([])).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'", 'tsc --noEmit'], 'unit by file on the changed file; typecheck has no file form, so its all form, once');
      assert.deepEqual((await scopeRuns(t)).map((entry) => [entry['key'], entry['phase'], entry['exit']]).sort(), [['app/typecheck', 'green', 0], ['app/unit', 'green', 0]]);
      assert.ok(!(await gateNames(t)).includes('check-only-unauthorized'), 'the auto run is the consent for the all form');
      assert.deepEqual(gapsOf(await t.ledger()).filter((gap) => /skipped|not run/.test(gap)), []);
    });
  });

  it('a named iteration runs the file-scoped checks with no question; a key without a file form is offered by name, and skipping it names it in the gap', async () => {
    const FILE_ONLY = CONFIG.replace(/^\s+typecheck:.*\n/m, '');
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      assert.equal((await green(t)).position, 'review-offer');
      assert.equal((await t.hook('review-offer', SKIP)).position, 'write', 'no full key: no checks question at all');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"]);
      assert.deepEqual(await gateNames(t), ['review-offer']);
      assert.ok(!gapsOf(await t.ledger()).some((gap) => /checks skipped/.test(gap)));
    }, { config: FILE_ONLY, askChecks: true });
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      await green(t);
      const offer = await t.hook('review-offer', SKIP);
      assert.equal(offer.position, 'checks-offer');
      assert.match(offer.text, /app\/typecheck/, 'the question names the full key it would run');
      assert.doesNotMatch(offer.text, /app\/unit/);
      assert.equal((await t.hook('checks-offer', SKIP)).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"], 'the scoped key ran without being asked, the full key did not');
      assert.ok(gapsOf(await t.ledger()).includes('checks skipped: app/typecheck — verification incomplete'), gapsOf(await t.ledger()).join('\n'));
    });
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      await green(t);
      await t.hook('review-offer', SKIP);
      assert.equal((await t.hook('checks-offer', 'run')).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'", 'tsc --noEmit']);
      assert.ok(!gapsOf(await t.ledger()).some((gap) => /checks skipped/.test(gap)));
    });
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      await green(t);
      await t.hook('review-offer', SKIP);
      assert.ok(!(await gateNames(t)).includes('checks-offer'), 'no runnable check: nothing to offer');
    }, { config: NO_CHECKS, askChecks: true });
  });

  it('headless asks nothing and starts no reviewer: no review-offer or checks-offer entry, the review gap derived from the route mode, the end checks run', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT.replace(' iteration 1', ''), headless: true });
      await t.edit();
      assert.equal((await green(t)).position, 'write');
      assert.deepEqual(await gateNames(t), []);
      assert.equal((await t.kinds('review')).length, 0);
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'", 'tsc --noEmit']);
      assert.deepEqual(gapsOf(await t.ledger()), [], 'a skipped review is no gap line');
    });
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2`, headless: true });
      await t.edit();
      assert.equal((await green(t)).position, 'write', 'a named iteration in a headless run is not offered anything either');
      assert.deepEqual(await gateNames(t), []);
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'", 'tsc --noEmit'], 'the full key follows the headless auto rule: it runs, unasked');
    });
  });

  it('with no runnable check the end step does nothing, and the report adds no gap line for it', async () => {
    await withTask(async (t) => {
      await t.start({ text: TEXT.replace(' iteration 1', ''), headless: true });
      await t.edit();
      assert.equal((await t.next({ cause: 'route-next' })).position, 'write');
      assert.deepEqual(ran(t), []);
      assert.deepEqual(gapsOf(await t.ledger()), []);
    }, { config: NO_CHECKS, askChecks: true });
  });

  it('a red end check goes back to the implementer once on its own, with the output; only the red key runs again; a still-red key is asked about and headless takes the default', async () => {
    await withTask(async (t) => {
      t.runner.outFor = (command) => (command.startsWith('jest') ? { exitCode: 1, stdout: FAIL } : null);
      await t.start({ text: TEXT.replace(' iteration 1', ''), headless: true });
      await t.edit();
      const fix = await green(t);
      assert.equal(fix.position, 'fix');
      const work = await t.work('fix');
      assert.match(work, /app\/unit/);
      assert.match(work, /expected 0 received NaN/);
      assert.doesNotMatch(work, /app\/typecheck/, 'a green key is not part of the fix');
      const after = await green(t);
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'", "jest 'src/orders.ts'", 'tsc --noEmit'], 'the second run is the red key alone');
      assert.deepEqual(await gateNames(t), ['checks-again'], 'a second round is a question; headless takes the default without asking');
      assert.equal((await t.kinds('default-taken'))[0]?.['answer'], REPORT_GAP);
      assert.ok(gapsOf(await t.ledger()).some((gap) => /^app\/unit: last run exited 1.*expected 0 received NaN/s.test(gap)), gapsOf(await t.ledger()).join('\n'));
      assert.doesNotMatch(after.text, /^$/);
    });
  });

  it('a second red round needs the user: fix goes back to the implementer, report the gap goes on to the report with the red key as a gap', async () => {
    const toSecondRound = async (t: Fixture) => {
      t.runner.outFor = (command) => (command.startsWith('jest') ? { exitCode: 1, stdout: FAIL } : null);
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      await green(t);
      await t.hook('review-offer', SKIP);
      assert.equal((await t.hook('checks-offer', 'run')).position, 'fix');
      return green(t);
    };
    await withTask(async (t) => {
      const asked = await toSecondRound(t);
      assert.equal(asked.position, 'scope-checks');
      assert.deepEqual(await gateNames(t), ['review-offer', 'checks-offer', 'checks-again']);
      t.runner.outFor = null;
      t.runner.out = { exitCode: 0, stdout: '' };
      assert.equal((await t.hook('checks-again', 'fix')).position, 'fix', 'the user chose another round');
      assert.equal((await green(t)).position, 'write');
      assert.deepEqual(ran(t).filter((call) => call.startsWith('jest')), ["jest 'src/orders.ts'", "jest 'src/orders.ts'", "jest 'src/orders.ts'"]);
      assert.ok(!gapsOf(await t.ledger()).some((gap) => /^app\/unit/.test(gap)), 'a later green pass of the key closes the gap');
    });
    await withTask(async (t) => {
      await toSecondRound(t);
      await t.hook('checks-again', REPORT_GAP);
      assert.ok(gapsOf(await t.ledger()).some((gap) => /^app\/unit: last run exited 1/.test(gap)), 'never reported as clean');
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'blocked');
    });
  });

  it('the work brief tells the implementer a check without a file form is the end step\'s, and never to run it directly', async () => {
    await withTask(async (t) => {
      await t.start({ text: `${TEXT} iteration 1` });
      const work = await t.work();
      assert.match(work, /typecheck \(no file form: left to the end step, never run it\)/);
      assert.match(work, /unit \(--file runs freely, all needs approval\)/);
    });
  });
});
