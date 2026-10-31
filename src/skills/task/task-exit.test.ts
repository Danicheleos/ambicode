import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { SESSION_A } from '#testing/fixtures/ids';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const PLAN = '.ambicode/tasks/ord-7/plan.md';
const TWO = '# Plan\n\n## Iteration 1\nAdd the guard.\n\n## Iteration 2\nSeed the reduce.\n';
const SKIP = 'skip — verification incomplete';

async function withTask(body: (t: Fixture) => Promise<void>): Promise<void> {
  const t = await taskFixture();
  try {
    await t.fx.repo.write(PLAN, TWO);
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

const stepFiles = (t: Fixture): Promise<string[]> => readdir(path.join(t.dir, 'steps')).catch(() => []);
const summary = (t: Fixture): Promise<string> => readFile(path.join(t.dir, 'summary.md'), 'utf8');

async function toOffer(t: Fixture): Promise<void> {
  await t.start({ plan: PLAN });
  await t.edit();
  await t.check('green', { ran: 1, failed: 0 });
}

describe('route exit: steps/ and summary.md', () => {
  it('a live route keeps no empty payload file and names the others <route>-<key>.md', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN });
      const names = await stepFiles(t);
      const route = (await t.kinds('route'))[0]!.id;
      assert.ok(names.includes(`${route}-brief.md`), names.join(', '));
      assert.equal(names.some((name) => name.startsWith('payload-') || name.endsWith('.txt')), false, names.join(', '));
      for (const name of names) assert.notEqual((await readFile(path.join(t.dir, 'steps', name), 'utf8')).trim(), '', `${name} is empty`);
    });
  });

  it('done: steps/ is gone and summary.md lists routes, iteration status and checks', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', SKIP);
      await t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad }, { repositoryRoot: t.fx.repo.root, where: '.' });
      assert.deepEqual(await stepFiles(t), []);
      const text = await summary(t);
      assert.match(text, /fix `total` for an empty list/);
      assert.match(text, new RegExp(PLAN.replace(/\./g, '\\.')));
      assert.match(text, /Iteration 1 of 2: done/);
      assert.match(text, /app\/unit/);
      assert.doesNotMatch(text, /independent review skipped/);
    });
  });

  it('the final message must state the skipped end checks; once it does it is saved as the result and shown in summary.md', async () => {
    await withTask(async (t) => {
      await toOffer(t);
      await t.hook('review-offer', SKIP);
      const stop = (message: string) => t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, last_assistant_message: message }, { repositoryRoot: t.fx.repo.root, where: '.' });
      const blocked = await stop('# Task report\n**Done**\n- src/a.ts:1 guard the empty list.\nChecks\n- app/unit: passed');
      assert.equal(blocked?.decision, 'block');
      assert.match(blocked?.reason ?? '', /- checks skipped: app\/typecheck — verification incomplete\n- Stopped during the end checks: check forbidden \(1\)$/);
      assert.equal((await t.kinds('exit')).length, 0, 'the route stays open until the corrected message');
      await stop('# Task report\n**Done**\n- src/a.ts:1 guard the empty list.\nNot verified\n- checks skipped: app/typecheck — verification incomplete\n- Stopped during the end checks: check forbidden (1)');
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
      const text = await summary(t);
      assert.match(text, /^- Iteration 1 of 2: done\n {2}> # Task report\n {2}> \*\*Done\*\*\n {2}> - src\/a\.ts:1 guard the empty list\./m);
      assert.equal(text.match(/checks skipped: app\/typecheck — verification incomplete/g)?.length, 2, 'once quoted from the message, once in Not verified');
    });
  });

  it('a route that already exited: the Stop hook saves the final message and summary.md shows it', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN });
      await t.fx.engine.stop('ord-7', 'done');
      const message = '# Task report\n**Done**\n- src/a.ts:1 guard the empty list.';
      await t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, last_assistant_message: message }, { repositoryRoot: t.fx.repo.root, where: '.' });
      assert.equal((await t.kinds('note')).filter((entry) => entry['note'] === 'result').length, 1);
      assert.match(await summary(t), /> - src\/a\.ts:1 guard the empty list\./);
    });
  });

  it('interrupted by a new start: steps/ holds only the new route and the summary says interrupted', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN });
      const first = (await t.kinds('route'))[0]!.id;
      await t.start({ plan: PLAN });
      const names = await stepFiles(t);
      assert.equal(names.some((name) => name.startsWith(`${first}-`)), false, names.join(', '));
      const text = await summary(t);
      assert.match(text, /interrupted/);
      assert.match(text, /Iteration 1 of 2: interrupted/);
    });
  });

  it('a route stopped by the user leaves no steps/ and a summary', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN });
      await t.fx.engine.stop('ord-7', 'blocked', 'user stopped');
      assert.deepEqual(await stepFiles(t), []);
      assert.match(await summary(t), /blocked/);
    });
  });
});
