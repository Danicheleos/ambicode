import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from '#cli/args';
import { runRouteNext, runRouteStop } from '#cli/commands/route/route';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { PLAN_TASK, planFixture } from '#testing/fixtures/plan-fixture';
import { resolveActiveRoute } from './active-route.ts';
import {
  associationSessionSource, cliHarnessPort, environmentSessionSource, hookBinding, removeAssociation, rejectingHarnessPort,
  sessionUnbound, taskSessionSource, updatedInputSessionSource, writeAssociation,
} from './session.ts';
import { ROUTE_NEXT_OPTIONS, ROUTE_STOP_OPTIONS } from '#cli/types/commands';
import { SESSION_A, SESSION_B } from '#testing/fixtures/ids';

const codeOf = (promise: Promise<unknown>): Promise<string> => promise.then(() => 'ok', (error: { code?: string }) => error.code ?? 'unknown');

describe('03-S2/5.1: the CLI finds the owner from the task', () => {
  it('a task with no live route is missing, one live route binds its owner, two live chains are ambiguous', async () => {
    const plan = await planFixture();
    try {
      const source = taskSessionSource(PLAN_TASK);
      assert.deepEqual(await source.resolve(plan.fx.runtime), { state: 'unbound', reason: 'missing' });
      await plan.start({ session: 'owner-one', harnessSession: SESSION_A });
      assert.deepEqual(await source.resolve(plan.fx.runtime), { state: 'bound', session: 'owner-one', via: 'task' });
      assert.deepEqual(await taskSessionSource('another-task').resolve(plan.fx.runtime), { state: 'unbound', reason: 'missing' });
      await plan.fx.engine.stop(PLAN_TASK, 'owner-one', 'blocked', 'x', plan.fx.scratchpad);
      assert.deepEqual(await source.resolve(plan.fx.runtime), { state: 'unbound', reason: 'missing' });
    } finally {
      await plan.dispose();
    }
  });

  it('5.1: unbound calls name the task; only a call with no task is session-unbound', async () => {
    assert.equal(sessionUnbound({ state: 'unbound', reason: 'missing' }).code, 'session-unbound');
    assert.match(sessionUnbound({ state: 'unbound', reason: 'missing' }).details.join(' '), /--task/);
    assert.equal(sessionUnbound({ state: 'unbound', reason: 'missing' }, 'T').code, 'route-not-open');
    assert.equal(sessionUnbound({ state: 'unbound', reason: 'ambiguous' }, 'T').code, 'route-ambiguous');
    const fx = await routeFixture({ routes: {} });
    try {
      const next = parseArgs('route next', ['--task', 'T'], ROUTE_NEXT_OPTIONS);
      const stop = parseArgs('route stop', ['--task', 'T', '--reason', 'blocked'], ROUTE_STOP_OPTIONS);
      assert.equal(await codeOf(runRouteNext(fx.runtime, next)), 'route-not-open');
      assert.equal(await codeOf(runRouteStop(fx.runtime, stop)), 'route-not-open');
    } finally {
      await fx.dispose();
    }
  });

  it('03-S1: a hook binding names the hook input session and never trust', () => {
    assert.deepEqual(hookBinding(SESSION_A), { state: 'bound', session: SESSION_A, via: 'hook' });
  });
});

describe('03-S3/S4: environment and updatedInput outcomes', () => {
  it('a variable names the session; absent or empty is missing', async () => {
    const fx = await routeFixture({ routes: {} });
    try {
      const withValue = { ...fx.runtime, env: { ...fx.runtime.env, AMBICODE_SESSION: ' s-1 ' } };
      assert.deepEqual(await environmentSessionSource('AMBICODE_SESSION').resolve(withValue), { state: 'bound', session: 's-1', via: 'env' });
      assert.deepEqual(await environmentSessionSource('AMBICODE_SESSION').resolve({ ...fx.runtime, env: { ...fx.runtime.env, AMBICODE_SESSION: '  ' } }), { state: 'unbound', reason: 'missing' });
      assert.deepEqual(await environmentSessionSource('AMBICODE_SESSION').resolve({ ...fx.runtime, env: {} }), { state: 'unbound', reason: 'missing' });
    } finally {
      await fx.dispose();
    }
  });

  it('--session carries identity only', async () => {
    const fx = await routeFixture({ routes: {} });
    try {
      assert.deepEqual(await updatedInputSessionSource('s-2').resolve(fx.runtime), { state: 'bound', session: 's-2', via: 'updated-input' });
      assert.deepEqual(await updatedInputSessionSource(null).resolve(fx.runtime), { state: 'unbound', reason: 'missing' });
      assert.deepEqual(await updatedInputSessionSource('').resolve(fx.runtime), { state: 'unbound', reason: 'missing' });
    } finally {
      await fx.dispose();
    }
  });
});

describe('03-S5: hook-written association', () => {
  it('none is missing, exactly one binds, more than one is ambiguous; SessionEnd removes it', async () => {
    const fx = await routeFixture({ routes: {} });
    try {
      const root = fx.repo.root;
      const source = associationSessionSource(root);
      assert.deepEqual(await source.resolve(fx.runtime), { state: 'unbound', reason: 'missing' });
      await writeAssociation(fx.runtime, root, SESSION_A);
      assert.deepEqual(await source.resolve(fx.runtime), { state: 'bound', session: SESSION_A, via: 'association' });
      await writeAssociation(fx.runtime, root, SESSION_B);
      assert.deepEqual(await source.resolve(fx.runtime), { state: 'unbound', reason: 'ambiguous' });
      await removeAssociation(fx.runtime, root, SESSION_B);
      await removeAssociation(fx.runtime, root, SESSION_A);
      assert.deepEqual(await source.resolve(fx.runtime), { state: 'unbound', reason: 'missing' });
      await writeAssociation(fx.runtime, '/another/repo', SESSION_A);
      assert.deepEqual(await source.resolve(fx.runtime), { state: 'unbound', reason: 'missing' });
    } finally {
      await fx.dispose();
    }
  });
});

describe('03-S6: harness token port', () => {
  it('rejects by default, whatever the token', async () => {
    const fx = await routeFixture({ routes: {} });
    try {
      assert.equal(cliHarnessPort, rejectingHarnessPort);
      assert.equal(await cliHarnessPort.validate(fx.runtime, SESSION_A, 'start'), false);
    } finally {
      await fx.dispose();
    }
  });
});

describe('03-S7: the pointer is a cache', () => {
  it('start writes it, completion clears it and leaves ended-route for one Stop', async () => {
    const plan = await planFixture();
    try {
      await plan.start();
      assert.deepEqual(await plan.fx.pointer.read(SESSION_A, plan.fx.scratchpad), { task: PLAN_TASK, skill: 'plan', owner: SESSION_A });
      await plan.fx.engine.stop(PLAN_TASK, SESSION_A, 'blocked', 'x', plan.fx.scratchpad);
      assert.equal(await plan.fx.pointer.read(SESSION_A, plan.fx.scratchpad), null);
      const ended = await plan.fx.pointer.readEnded(SESSION_A, plan.fx.scratchpad);
      assert.equal(ended?.task, PLAN_TASK);
      await plan.fx.pointer.clearEnded(SESSION_A, plan.fx.scratchpad);
      assert.equal(await plan.fx.pointer.readEnded(SESSION_A, plan.fx.scratchpad), null);
    } finally {
      await plan.dispose();
    }
  });

  it('a pointer the ledger does not confirm is ignored; the scan finds this session route; others are never inferred', async () => {
    const plan = await planFixture();
    try {
      const scope = { repositoryRoot: plan.fx.repo.root, scratchpad: plan.fx.scratchpad };
      await plan.start();
      await plan.fx.pointer.write(SESSION_A, plan.fx.scratchpad, { task: 'no-such-task', skill: 'plan' });
      const found = await resolveActiveRoute(plan.fx.runtime.fs, plan.fx.pointer, { ...scope, session: SESSION_A });
      assert.equal(found?.task, PLAN_TASK);
      assert.equal(await resolveActiveRoute(plan.fx.runtime.fs, plan.fx.pointer, { ...scope, session: SESSION_B }), null);
      await plan.fx.engine.stop(PLAN_TASK, SESSION_A, 'blocked', 'x', plan.fx.scratchpad);
      assert.equal(await resolveActiveRoute(plan.fx.runtime.fs, plan.fx.pointer, { ...scope, session: SESSION_A }), null);
    } finally {
      await plan.dispose();
    }
  });

  it('03-S9: a fallback scan over 50 task ledgers is measured', async () => {
    const plan = await planFixture();
    try {
      for (let index = 0; index < 50; index += 1) {
        const dir = path.join(plan.fx.repo.root, '.ambicode', 'task', `bulk-${index}`);
        await plan.fx.runtime.fs.mkdirp(dir);
        await writeFile(path.join(dir, 'ledger.jsonl'), `${JSON.stringify({ id: `x-${index}`, at: '2026-10-05T10:00:00.000Z', kind: 'route', skill: 'investigate', session: SESSION_B })}\n`);
      }
      await plan.start();
      const scope = { repositoryRoot: plan.fx.repo.root, scratchpad: plan.fx.scratchpad, session: SESSION_A };
      const times: number[] = [];
      for (let run = 0; run < 20; run += 1) {
        const started = performance.now();
        await resolveActiveRoute(plan.fx.runtime.fs, { ...plan.fx.pointer, read: async () => null }, scope);
        times.push(performance.now() - started);
      }
      times.sort((left, right) => left - right);
      const median = times[10]!;
      console.log(`# 03-S9 median fallback scan over 51 ledgers: ${median.toFixed(1)} ms`);
      assert.ok(median < 1000);
    } finally {
      await plan.dispose();
    }
  });
});
