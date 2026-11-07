import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { CHECK_CONFIG } from '#testing/fixtures/check-fixture';
import { appendLedger } from '#platform/ledger/ledger';
import { SESSION_A } from '#testing/fixtures/ids';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const PLAN = '.ambicode/tasks/ord-7/plan.md';
const DRAFT = '---\nstatus: draft\n---\n# Plan\n\n## Iteration 1\nGuard `total` in `src/orders.ts`.\n';
const TWO = '---\nstatus: accepted\n---\n# Plan\n\n## Iteration 1\nAdd the guard.\n\n## Iteration 2\nSeed the reduce.\n';
const SKIP = 'skip — verification incomplete';
const CONFIG = CHECK_CONFIG.split('\n').filter((line) => !/^\s+(e2e|lint):/.test(line)).join('\n');
const FAIL = 'FAIL src/orders.spec.ts\n  expected 0 received NaN\n';
const summary = async (t: Fixture): Promise<string> => {
  const text = await readFile(path.join(t.dir, 'summary.md'), 'utf8');
  return text.slice(text.indexOf('## Not verified'));
};
const stop = (t: Fixture) => t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad }, { repositoryRoot: t.fx.repo.root, where: '.' });

async function withTask(body: (t: Fixture) => Promise<void>, config?: string): Promise<void> {
  const t = await taskFixture({ ...(config === undefined ? {} : { config, askChecks: true }) });
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

/** The exit reason is a gap: summary.md ## Not verified names every exit that is not done, iterations-complete or interrupted. */
describe('task route: the exit is listed under Not verified', { concurrency: 4 }, () => {
  it('inconclusive: a headless session that stops mid-route', async () => {
    await withTask(async (t) => {
      await t.start({ headless: true });
      await t.edit();
      await stop(t);
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'inconclusive');
      assert.match(await summary(t), /- The route ended inconclusive: the headless session stopped at step change/);
    });
  });

  it('gate stop: stopping plan-unaccepted', async () => {
    await withTask(async (t) => {
      await t.fx.repo.write(PLAN, DRAFT);
      await appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), { kind: 'note', note: 'plan', path: PLAN, contentHash: 'sha256:0' });
      await t.start({ text: 'ord-7' });
      await t.hook('plan-unaccepted', 'stop');
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'blocked');
      assert.match(await summary(t), /- The route ended blocked: .*plan-unaccepted: stop/);
    });
  });

  it('blocked: a red last check lists the red key and the exit', async () => {
    await withTask(async (t) => {
      t.runner.outFor = (command) => (command.startsWith('jest') ? { exitCode: 1, stdout: FAIL } : null);
      await t.fx.repo.write(PLAN, TWO);
      await t.start({ plan: PLAN, text: 'fix `total` for an empty list iteration 2' });
      await t.edit();
      await t.check('green', { ran: 1, failed: 0 });
      await t.hook('review-offer', SKIP);
      await t.hook('checks-offer', 'run');
      await t.check('green', { ran: 1, failed: 0 });
      await t.hook('checks-again', 'report the gap');
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'blocked');
      const text = await summary(t);
      assert.match(text, /app\/unit: last run exited 1/);
      assert.match(text, /- The route ended blocked: .*last check \(app\/unit\) is red/);
    }, CONFIG);
  });

  it('done adds no exit line', async () => {
    await withTask(async (t) => {
      await t.start({});
      await t.fx.engine.stop('ord-7', 'done');
      assert.doesNotMatch(await readFile(path.join(t.dir, 'summary.md'), 'utf8'), /The route ended/);
    });
  });
});
