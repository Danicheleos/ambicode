import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultHandlers } from '#harness/engine/handlers';
import { checkFixture, COMMAND_PACK, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { REPO_ROOT } from '#testing/paths';
import { SESSION_A } from '#testing/fixtures/ids';

const PROPOSE_UNIT = COMMAND_PACK.replace('{ command: unit, action: run', '{ command: unit, action: propose');

async function investigate() {
  const [yaml, read] = await Promise.all(['routes/investigate/investigate.yaml', 'routes/investigate/read.md'].map((file) => readFile(path.join(REPO_ROOT, file), 'utf8')));
  const t = await checkFixture({ routes: { investigate: yaml! }, handlers: defaultHandlers(), step: { 'routes/investigate/read.md': read!, 'routes/investigate/fetch.md': 'Fetch.' }, pack: PROPOSE_UNIT });
  await t.fx.repo.write('src/orders.ts', 'export const total = 1;\n');
  await t.fx.repo.commitAll('orders');
  const message = await t.fx.engine.start({ skill: 'investigate', text: 'why does `total` return 1', requirements: [], task: CHECK_TASK, cwd: t.fx.repo.root, session: SESSION_A, channel: 'hook', scratchpadDir: t.fx.scratchpad });
  return { ...t, message };
}

describe('investigate diagnostics (07-I1)', () => {
  it('07-I1: the shipped read step names the red-phase check command and says decline means do not run, inconclusive', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'routes', 'investigate', 'read.md'), 'utf8');
    assert.match(text, /check --task \{task\} <projectId>\/<checkId> --only <spec> --phase red/);
    assert.match(text, /don't run — inconclusive/);
  });

  it('07-I1: the shipped route reaches read, and an unauthorized propose check raises the gate that defaults to decline', async () => {
    const { fx, check, runner, message } = await investigate();
    try {
      assert.equal(message.position, 'read');
      assert.deepEqual(await check({ key: 'app/unit' }), { outcome: 'waiting', gate: 'check-only-unauthorized', key: 'app/unit' });
      const [print] = await fx.kinds(CHECK_TASK, 'gate');
      assert.equal(print?.['raisedBy'], 'read');
      assert.deepEqual(print?.['values'], { key: ['app/unit'], files: ['src/a.spec.ts'] });
      assert.equal(fx.routes.gate('check-only-unauthorized')?.default, 'decline');
      assert.deepEqual(runner.calls, []);
    } finally {
      await fx.dispose();
    }
  });

  it('07-I1: a bound hook approval revises read through $raisedBy, then the exact authorized check runs', async () => {
    const { fx, check, runner } = await investigate();
    try {
      await check({ key: 'app/unit' });
      const [print] = await fx.kinds(CHECK_TASK, 'gate');
      const after = await fx.engine.advance({ task: CHECK_TASK, session: SESSION_A, cause: 'gate-hook', answers: [{ gate: 'check-only-unauthorized', option: 'approve', instance: print!.id }], scratchpadDir: fx.scratchpad });
      assert.equal(after.position, 'read');
      assert.deepEqual((await fx.kinds(CHECK_TASK, 'revise')).map((entry) => entry['from']), ['read']);
      assert.equal((await check({ key: 'app/unit' })).outcome, 'ran');
      assert.deepEqual(runner.calls, [['jest', 'src/a.spec.ts']]);
      assert.equal((await fx.kinds(CHECK_TASK, 'check')).length, 1);
    } finally {
      await fx.dispose();
    }
  });

  it('07-I1: a bound approval covers its key only; another propose key still waits', async () => {
    const { fx, check, runner } = await investigate();
    try {
      await check({ key: 'app/unit' });
      const [print] = await fx.kinds(CHECK_TASK, 'gate');
      await fx.engine.advance({ task: CHECK_TASK, session: SESSION_A, cause: 'gate-hook', answers: [{ gate: 'check-only-unauthorized', option: 'approve', instance: print!.id }], scratchpadDir: fx.scratchpad });
      assert.equal((await check({ key: 'app/e2e' })).outcome, 'waiting');
      assert.deepEqual(runner.calls, []);
    } finally {
      await fx.dispose();
    }
  });

  it('07-I1: a model-typed --approve is declined with acting-needs-human and nothing runs', async () => {
    const { fx, check, runner } = await investigate();
    try {
      await check({ key: 'app/unit' });
      assert.equal((await check({ key: 'app/unit', approve: ['app/unit'] })).outcome, 'waiting');
      const [declined] = await fx.kinds(CHECK_TASK, 'declined');
      assert.deepEqual([declined?.['gate'], declined?.['reason'], declined?.['via'], declined?.['answer']], ['check-only-unauthorized', 'acting-needs-human', 'flag', 'approve']);
      assert.deepEqual(runner.calls, []);
      assert.equal((await fx.kinds(CHECK_TASK, 'check')).length, 0);
    } finally {
      await fx.dispose();
    }
  });
});
