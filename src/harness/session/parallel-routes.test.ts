import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STALE_ROUTE_MS, liveRouteOf } from './active-route.ts';
import { rm, writeFile } from 'node:fs/promises';
import { investigation } from '#testing/fixtures/owner-fixture';

const SESSION = '33333333-cccc-4ccc-8ccc-cccccccccccc';

/** Parallel subagents of one Claude session share its session id and start through the CLI; each drives its own task. */
describe('parallel routes in one session', () => {
  const exits = async (inv: Awaited<ReturnType<typeof investigation>>, task: string) => (await inv.fx.kinds(task, 'exit')).map((entry) => entry['reason']);

  it('a CLI start does not end, or wait on the ledger lock of, another live route of the session', async () => {
    const inv = await investigation();
    try {
      await inv.start({ task: 'a', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      const aDir = `${inv.fx.repo.root}/.ambicode/tasks/a`;
      // The first route is inside a slow step: a live process of another route holds its lock file for the whole step.
      const lock = `${aDir}/ledger.lock`;
      await writeFile(lock, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
      const started = Date.now();
      try {
        await inv.start({ task: 'b', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      } finally {
        await rm(lock, { force: true });
      }
      assert.ok(Date.now() - started < 3000, `start of b waited ${Date.now() - started} ms on the lock of a`);
      assert.deepEqual(await exits(inv, 'a'), []);
      assert.deepEqual(await exits(inv, 'b'), []);
    } finally {
      await inv.dispose();
    }
  });

  it('a route typed in the session still ends the session\'s earlier live routes', async () => {
    const inv = await investigation();
    try {
      await inv.start({ task: 'a', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      await inv.start({ task: 'b', session: SESSION, channel: 'hook', scratchpadDir: inv.scratchpad(SESSION) });
      assert.deepEqual(await exits(inv, 'a'), ['interrupted']);
    } finally {
      await inv.dispose();
    }
  });

  it('hook delivery drives no route of a session that has several, unless exactly one was typed there', async () => {
    const inv = await investigation();
    try {
      await inv.start({ task: 'a', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      await inv.start({ task: 'b', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      assert.equal(await liveRouteOf(inv.fx.runtime.fs, inv.fx.repo.root, SESSION, inv.fx.runtime.clock.now()), null);
      await inv.start({ task: 'c', session: SESSION, channel: 'hook', scratchpadDir: inv.scratchpad(SESSION) });
      // c's start (hook) ended a and b; a later CLI start by a subagent leaves c the main session's own route.
      await inv.start({ task: 'd', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      assert.equal((await liveRouteOf(inv.fx.runtime.fs, inv.fx.repo.root, SESSION, inv.fx.runtime.clock.now()))?.task, 'c');
    } finally {
      await inv.dispose();
    }
  });

  it('a step delivered to a subagent is not re-injected into the main session by a later prompt', async () => {
    const inv = await investigation();
    try {
      await inv.start({ task: 'a', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      await inv.start({ task: 'b', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      const prompt = await inv.hooked.event({ hook_event_name: 'UserPromptSubmit', prompt: 'carry on' }, SESSION);
      assert.doesNotMatch(JSON.stringify(prompt), /route/i);
    } finally {
      await inv.dispose();
    }
  });
  it('a live route idle past the stale bound does not silence the hooks, and the next start closes it', async () => {
    const inv = await investigation();
    try {
      const live = () => liveRouteOf(inv.fx.runtime.fs, inv.fx.repo.root, SESSION, inv.fx.runtime.clock.now());
      await inv.start({ task: 'a', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      await inv.start({ task: 'b', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      assert.equal(await live(), null, 'two fresh live routes: the hooks stay out of both');
      inv.fx.advanceClock(STALE_ROUTE_MS - 60_000);
      await inv.fx.engine.advance({ task: 'b', cause: 'route-next', scratchpadDir: inv.scratchpad(SESSION) });
      inv.fx.advanceClock(120_000);
      assert.equal((await live())?.task, 'b', 'a is past the bound, b was active inside it');
      await inv.start({ task: 'c', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      assert.deepEqual(await exits(inv, 'a'), ['interrupted'], 'a start closes the abandoned sibling');
      assert.deepEqual(await exits(inv, 'b'), [], 'a sibling inside the bound is parallel work and stays');
    } finally {
      await inv.dispose();
    }
  });

  it('a lone live route is never hidden by its age', async () => {
    const inv = await investigation();
    try {
      await inv.start({ task: 'a', session: SESSION, channel: 'cli', scratchpadDir: inv.scratchpad(SESSION) });
      inv.fx.advanceClock(10 * STALE_ROUTE_MS);
      assert.equal((await liveRouteOf(inv.fx.runtime.fs, inv.fx.repo.root, SESSION, inv.fx.runtime.clock.now()))?.task, 'a');
    } finally {
      await inv.dispose();
    }
  });
});
