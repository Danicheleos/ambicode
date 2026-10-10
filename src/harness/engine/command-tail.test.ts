import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runCommandTail } from './engine.ts';
import { insideEngine } from './engine.ts';
import { hookBinding } from '../session/session.ts';
import { PLAN_TASK, planFixture } from '#testing/fixtures/plan-fixture';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { REPO_ROOT } from '#testing/paths';
import type { Engine } from '#types/harness';
import { SESSION_A } from '#testing/fixtures/ids';

const run = promisify(execFile);

function counting(engine: Engine): { engine: Engine; calls: string[] } {
  const calls: string[] = [];
  return { calls, engine: { ...engine, advance: (input) => (calls.push(input.cause), engine.advance(input)) } };
}

describe('command tail', () => {
  it('03-T1: a bound session advances once per wrapper invocation, with the wrapper as the cause', async () => {
    const plan = await planFixture();
    try {
      await plan.start();
      const { engine, calls } = counting(plan.fx.engine);
      const message = await runCommandTail({ engine }, { task: PLAN_TASK, cause: 'note save', session: hookBinding(SESSION_A), scratchpadDir: plan.fx.scratchpad });
      assert.deepEqual(calls, ['note save']);
      assert.ok(message !== null);
    } finally {
      await plan.dispose();
    }
  });

  it('03-T1: no open route for the session on the slug means nothing happens', async () => {
    const plan = await planFixture();
    try {
      await plan.start();
      const { engine, calls } = counting(plan.fx.engine);
      assert.equal(await runCommandTail({ engine }, { task: PLAN_TASK, cause: 'note save', session: hookBinding('cccccccc-3333-4333-8333-333333333333') }), null);
      assert.equal(await runCommandTail({ engine }, { task: 'no-such-task', cause: 'note save', session: hookBinding(SESSION_A) }), null);
      assert.equal(calls.length, 2);
    } finally {
      await plan.dispose();
    }
  });

  it('03-T1/5.1: an ambiguous task keeps the write, advances nothing and warns on stderr naming the task', async () => {
    const plan = await planFixture();
    try {
      await plan.start();
      const { engine, calls } = counting(plan.fx.engine);
      const warnings: string[] = [];
      const before = await plan.fx.ledger(PLAN_TASK);
      const message = await runCommandTail({ engine, warn: (line) => warnings.push(line) }, { task: PLAN_TASK, cause: 'note save', session: { state: 'unbound', reason: 'ambiguous' } });
      assert.equal(message, null);
      assert.deepEqual(calls, []);
      assert.match(warnings.join('\n'), /Task ORD-17 has more than one live route/);
      assert.match(warnings.join('\n'), /--fresh/);
      assert.deepEqual(await plan.fx.ledger(PLAN_TASK), before);
    } finally {
      await plan.dispose();
    }
  });

  it('03-T1: an unbound call on a task with no route is silent', async () => {
    const fx = await routeFixture({ routes: {} });
    try {
      const warnings: string[] = [];
      assert.equal(await runCommandTail({ engine: fx.engine, warn: (line) => warnings.push(line) }, { task: 'none', cause: 'note save', session: { state: 'unbound', reason: 'missing' } }), null);
      assert.deepEqual(warnings, []);
    } finally {
      await fx.dispose();
    }
  });

  it('03-T3: a tail started from inside a handler throws and the flag is only set inside the engine', async () => {
    assert.equal(insideEngine(), false);
    let nested: unknown = null;
    let flag = false;
    const plan = await planFixture({
      handlers: {
        't.step': async ({ ledger }) => {
          flag = insideEngine();
          nested = await runCommandTail({ engine: plan0!.fx.engine }, { task: PLAN_TASK, cause: 'note save', session: hookBinding(SESSION_A) }).catch((error: unknown) => error);
          await ledger.append({ kind: 'policy', stage: 'before-report', packs: [], rules: 0, omitted: 0, bytes: 1 });
          return { state: 'ok', payload: null };
        },
      },
    });
    const plan0: typeof plan | null = plan;
    try {
      await plan.start();
      await plan.next();
      assert.equal(flag, true);
      assert.match((nested as Error).message, /must not call a command tail/);
      assert.equal(insideEngine(), false);
    } finally {
      await plan.dispose();
    }
  });

  it('03-T4: a failed command writes nothing and advances nothing', async () => {
    const plan = await planFixture();
    try {
      await plan.start();
      const before = await plan.fx.ledger(PLAN_TASK);
      await assert.rejects(plan.saveDraft('   \n'));
      assert.deepEqual(await plan.fx.ledger(PLAN_TASK), before);
    } finally {
      await plan.dispose();
    }
  });
});

describe('03-T8: --json prints one document', () => {
  it('every read command with --json writes exactly one JSON document to stdout', async () => {
    const fx = await routeFixture({ routes: {} });
    try {
      const commands = [['version'], ['report', '--task', 'none']];
      for (const argv of commands) {
        const script = `import('${REPO_ROOT}/src/cli/main.ts').then((module) => module.main(${JSON.stringify([...argv, '--json'])})).then((code) => { process.exitCode = code; })`;
        const { stdout } = await run(process.execPath, ['-e', script], { cwd: fx.repo.root }).catch((error: { stdout: string }) => ({ stdout: error.stdout }));
        assert.doesNotThrow(() => JSON.parse(stdout), `${argv.join(' ')} prints one document: ${stdout.slice(0, 80)}`);
      }
    } finally {
      await fx.dispose();
    }
  });
});
